use anchor_lang::{prelude::*, system_program, Discriminator};
use anchor_spl::{
    token_2022::spl_token_2022::{
        extension::{
            transfer_hook::TransferHookAccount, BaseStateWithExtensions, StateWithExtensions,
        },
        state::Account as Token2022Account,
    },
    token_interface::{Mint, TokenAccount},
};
use borsh::BorshSerialize;
use spl_transfer_hook_interface::error::TransferHookError;

use crate::state::balance_info::*;
use crate::state::splitter_info::*;
use crate::state::token_stats::*;

use super::{save_accrual_at, save_rps_at};

fn check_token_account_is_transferring(account_data: &[u8]) -> Result<()> {
    let token_account = StateWithExtensions::<Token2022Account>::unpack(account_data)?;
    let extension = token_account.get_extension::<TransferHookAccount>()?;
    if bool::from(extension.transferring) {
        Ok(())
    } else {
        Err(Into::<ProgramError>::into(
            TransferHookError::ProgramCalledOutsideOfTransfer,
        ))?
    }
}

/// Read the token amount from raw account data at offset 64 (works for both SPL Token and Token-2022).
fn read_token_balance(account_info: &AccountInfo) -> Result<u64> {
    let data = account_info.try_borrow_data()?;
    if data.len() < 72 {
        return Err(ProgramError::InvalidAccountData.into());
    }
    Ok(u64::from_le_bytes(data[64..72].try_into().unwrap()))
}

/// Create and initialize a BalanceInfo PDA if it doesn't exist yet.
/// Uses the vault PDA (system-owned, holding SOL) as the payer.
/// Writes properly Borsh-serialized Vec fields (not just zeros).
fn create_balance_info_if_needed<'info>(
    balance_info_account: &AccountInfo<'info>,
    splitter_key: &Pubkey,
    token_account_key: &Pubkey,
    vault_account: &AccountInfo<'info>,
    system_program_account: &AccountInfo<'info>,
    program_id: &Pubkey,
    num_tokens: usize,
) -> Result<()> {
    if !balance_info_account.data_is_empty() {
        return Ok(());
    }

    let space = BalanceInfo::space(num_tokens) as u64;
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(space as usize);

    // Derive bumps for PDA signing
    let (_, vault_bump) = Pubkey::find_program_address(
        &[b"vault", splitter_key.as_ref()],
        program_id,
    );
    let (_, bal_bump) = Pubkey::find_program_address(
        &[splitter_key.as_ref(), token_account_key.as_ref(), b"SOL"],
        program_id,
    );

    let vault_seeds: &[&[u8]] = &[b"vault", splitter_key.as_ref(), &[vault_bump]];
    let bal_seeds: &[&[u8]] = &[splitter_key.as_ref(), token_account_key.as_ref(), b"SOL", &[bal_bump]];

    system_program::create_account(
        CpiContext::new(
            system_program_account.clone(),
            system_program::CreateAccount {
                from: vault_account.clone(),
                to: balance_info_account.clone(),
            },
        )
        .with_signer(&[vault_seeds, bal_seeds]),
        lamports,
        space,
        program_id,
    )?;

    // Write Anchor discriminator + properly serialized default BalanceInfo with Vec headers
    let default_bal = BalanceInfo {
        accrual: vec![0u64; num_tokens],
        withdrawn: vec![0u64; num_tokens],
        rps_at_last_share_change: vec![0.0f64; num_tokens],
    };
    let mut data = balance_info_account.try_borrow_mut_data()?;
    data[..8].copy_from_slice(&BalanceInfo::DISCRIMINATOR);
    let serialized = default_bal.try_to_vec()?;
    data[8..8 + serialized.len()].copy_from_slice(&serialized);

    Ok(())
}

pub fn transfer_hook<'info>(ctx: Context<'_, '_, 'info, 'info, TransferHookCtx<'info>>, amount: u64) -> Result<()> {
    check_token_account_is_transferring(
        &ctx.accounts.source_token.to_account_info().try_borrow_data()?,
    )?;
    check_token_account_is_transferring(
        &ctx.accounts
            .destination_token
            .to_account_info()
            .try_borrow_data()?,
    )?;

    // remaining_accounts layout (resolved by Token-2022 from ExtraAccountMetaList):
    // [0] = splitter_info       (index 5)
    // [1] = token_stats         (index 6)
    // [2] = source_balance_info (index 7)
    // [3] = dest_balance_info   (index 8)
    // [4] = vault               (index 9)
    // [5] = system_program      (index 10)
    // [6..] = SPL splitter ATAs  (index 11+, one per non-SOL split token, read-only)
    if ctx.remaining_accounts.len() < 6 {
        return Err(ProgramError::NotEnoughAccountKeys.into());
    }

    // Extract owners for self-transfer check
    let source_owner = ctx.accounts.owner.key();
    let dest_account_info = ctx.accounts.destination_token.to_account_info();
    let dest_data = dest_account_info.try_borrow_data()?;
    let dest_owner = Pubkey::try_from(&dest_data[32..64]).unwrap();

    // Self-transfer: no-op
    if source_owner == dest_owner {
        return Ok(());
    }

    // Compute old shares from post-transfer token balances
    // The hook fires AFTER the transfer, so:
    //   source_old = source.amount + amount  (source lost `amount`)
    //   dest_old   = dest.amount - amount    (dest gained `amount`)
    let source_token_info = ctx.accounts.source_token.to_account_info();
    let source_data = source_token_info.try_borrow_data()?;
    let source_token_account = StateWithExtensions::<Token2022Account>::unpack(&source_data)?;
    let source_old_shares = source_token_account.base.amount.checked_add(amount).unwrap();

    let dest_token_account = StateWithExtensions::<Token2022Account>::unpack(&dest_data)?;
    let dest_old_shares = dest_token_account.base.amount.checked_sub(amount).unwrap();

    drop(source_data);
    drop(dest_data);

    // Peek at splitter_info to get num_tokens before auto-creating BalanceInfo
    let splitter_info_temp = Account::<SplitterInfo>::try_from(&ctx.remaining_accounts[0])?;
    let num_tokens = splitter_info_temp.split_mints.len();
    drop(splitter_info_temp);

    // Auto-create BalanceInfo PDAs if they don't exist (funded by vault)
    let splitter_key = ctx.remaining_accounts[0].key();
    let source_token_key = ctx.accounts.source_token.key();
    let dest_token_key = ctx.accounts.destination_token.key();
    create_balance_info_if_needed(
        &ctx.remaining_accounts[2],
        &splitter_key,
        &source_token_key,
        &ctx.remaining_accounts[4],
        &ctx.remaining_accounts[5],
        ctx.program_id,
        num_tokens,
    )?;
    create_balance_info_if_needed(
        &ctx.remaining_accounts[3],
        &splitter_key,
        &dest_token_key,
        &ctx.remaining_accounts[4],
        &ctx.remaining_accounts[5],
        ctx.program_id,
        num_tokens,
    )?;

    // Deserialize remaining_accounts (Token-2022 already verified these match ExtraAccountMetaList)
    let splitter_info = Account::<SplitterInfo>::try_from(&ctx.remaining_accounts[0])?;
    let mut token_stats = Account::<TokenStats>::try_from(&ctx.remaining_accounts[1])?;
    let mut source_balance = Account::<BalanceInfo>::try_from(&ctx.remaining_accounts[2])?;
    let mut dest_balance = Account::<BalanceInfo>::try_from(&ctx.remaining_accounts[3])?;

    // Loop over all split tokens: save_rps then save_accrual for both source and dest
    let mut spl_ata_offset: usize = 6; // SPL splitter ATAs start at remaining_accounts[6]
    for i in 0..num_tokens {
        let (balance, initial) = if splitter_info.split_mints[i] == Pubkey::default() {
            // SOL: balance from splitter_info lamports
            (splitter_info.get_lamports(), splitter_info.initial_lamports)
        } else {
            // SPL: balance from splitter ATA at remaining_accounts[spl_ata_offset]
            let bal = read_token_balance(&ctx.remaining_accounts[spl_ata_offset])?;
            spl_ata_offset += 1;
            (bal, 0u64)
        };

        save_rps_at(i, balance, initial, splitter_info.total_shares, &mut token_stats);
        save_accrual_at(i, source_old_shares, &token_stats, &mut source_balance);
        save_accrual_at(i, dest_old_shares, &token_stats, &mut dest_balance);
    }

    // Serialize back
    token_stats.exit(ctx.program_id)?;
    source_balance.exit(ctx.program_id)?;
    dest_balance.exit(ctx.program_id)?;

    Ok(())
}

#[derive(Accounts)]
pub struct TransferHookCtx<'info> {
    #[account(
        token::mint = mint,
        token::authority = owner,
    )]
    pub source_token: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::mint = mint,
    )]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: The source token account owner/delegate
    pub owner: UncheckedAccount<'info>,

    /// CHECK: The extra account meta list PDA
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
}
