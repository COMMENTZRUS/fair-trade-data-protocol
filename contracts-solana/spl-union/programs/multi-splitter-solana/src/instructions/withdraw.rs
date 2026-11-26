use crate::errors::MultiSplitterErrors;
use crate::state::balance_info::*;
use crate::state::splitter_info::*;
use crate::state::token_stats::*;
use super::available_allotment_at;

use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::StateWithExtensions,
    state::Account as Token2022Account,
};

// amount 0 means withdraw ALL

pub fn withdraw<'info>(ctx: Context<'_, '_, 'info, 'info, Withdraw<'info>>, token_index: u8, amount: u64) -> Result<()> {
    let i = token_index as usize;
    let splitter_info = &ctx.accounts.splitter_info;

    if i >= splitter_info.split_mints.len() {
        return err!(MultiSplitterErrors::InvalidTokenIndex);
    }

    // Read token balance as shares
    let token_account_data = ctx.accounts.user_token_account.try_borrow_data()?;
    let token_account = StateWithExtensions::<Token2022Account>::unpack(&token_account_data)?;

    require_keys_eq!(
        token_account.base.mint,
        splitter_info.mint,
        MultiSplitterErrors::MintMismatch
    );
    require_keys_eq!(
        token_account.base.owner,
        ctx.accounts.user.key(),
        MultiSplitterErrors::TokenAccountOwnerMismatch
    );

    let shares = token_account.base.amount;
    let split_mint = splitter_info.split_mints[i];

    // Get current balance for this split token
    let (balance, initial) = if split_mint == Pubkey::default() {
        (splitter_info.get_lamports(), splitter_info.initial_lamports)
    } else {
        // SPL: verify splitter ATA mint & authority match (split_mint, splitter_info) before reading balance
        let splitter_ata = &ctx.remaining_accounts[0];
        let vault_data = splitter_ata.try_borrow_data()?;
        let vault_mint = Pubkey::try_from(&vault_data[0..32]).unwrap();
        let vault_owner = Pubkey::try_from(&vault_data[32..64]).unwrap();
        require_keys_eq!(vault_mint, split_mint, MultiSplitterErrors::MintMismatch);
        require_keys_eq!(vault_owner, splitter_info.key(), MultiSplitterErrors::TokenAccountOwnerMismatch);
        let bal = u64::from_le_bytes(vault_data[64..72].try_into().unwrap());
        drop(vault_data);
        (bal, 0u64)
    };

    let available = available_allotment_at(
        i,
        shares,
        balance,
        initial,
        splitter_info.total_shares,
        &ctx.accounts.token_stats,
        &ctx.accounts.balance_info,
    );

    if amount > available {
        return err!(MultiSplitterErrors::InsufficientBalance);
    }
    let to_withdraw = if amount == 0 { available } else { amount };

    // Need to drop borrow before mutating
    drop(token_account_data);

    if split_mint == Pubkey::default() {
        // SOL: direct lamport transfer
        let from_pubkey = ctx.accounts.splitter_info.to_account_info();
        let to_pubkey = ctx.accounts.user.to_account_info();
        **from_pubkey.try_borrow_mut_lamports()? -= to_withdraw;
        **to_pubkey.try_borrow_mut_lamports()? += to_withdraw;
    } else {
        // SPL: CPI token::transfer from splitter ATA to user's ATA, signed by splitter PDA
        // remaining_accounts: [splitter_ata (mut), user_split_ata (mut), token_program]
        let splitter_ata = ctx.remaining_accounts[0].clone();
        let user_ata = ctx.remaining_accounts[1].clone();
        let token_program = ctx.remaining_accounts[2].clone();

        // Verify recipient ATA belongs to `user` and holds `split_mint`
        {
            let user_ata_data = user_ata.try_borrow_data()?;
            let user_ata_mint = Pubkey::try_from(&user_ata_data[0..32]).unwrap();
            let user_ata_owner = Pubkey::try_from(&user_ata_data[32..64]).unwrap();
            require_keys_eq!(user_ata_mint, split_mint, MultiSplitterErrors::MintMismatch);
            require_keys_eq!(user_ata_owner, ctx.accounts.user.key(), MultiSplitterErrors::TokenAccountOwnerMismatch);
        }

        let mint_key = splitter_info.mint;
        let bump = ctx.bumps.splitter_info;
        let signer_seeds: &[&[u8]] = &[b"splitter", mint_key.as_ref(), &[bump]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                token_program,
                anchor_spl::token::Transfer {
                    from: splitter_ata,
                    to: user_ata,
                    authority: ctx.accounts.splitter_info.to_account_info(),
                },
                &[signer_seeds],
            ),
            to_withdraw,
        )?;
    }

    ctx.accounts.balance_info.withdrawn[i] += to_withdraw;
    ctx.accounts.token_stats.total_withdrawn[i] += to_withdraw;

    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub signer: Signer<'info>,
    #[account(mut)]
    pub user: SystemAccount<'info>,
    /// CHECK: The share token mint; used for PDA derivation
    pub mint: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"splitter", mint.key().as_ref()],
        bump,
    )]
    pub splitter_info: Account<'info, SplitterInfo>,
    /// CHECK: The user's SPL Token-2022 token account; verified in handler
    pub user_token_account: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [splitter_info.key().as_ref(), user_token_account.key().as_ref(), b"SOL"],
        bump
    )]
    pub balance_info: Account<'info, BalanceInfo>,
    #[account(
        mut,
        seeds = [splitter_info.key().as_ref(), b"SOL"],
        bump
    )]
    pub token_stats: Account<'info, TokenStats>,
}
