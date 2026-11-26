use anchor_lang::{prelude::*, system_program};
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::state::splitter_info::*;

pub fn initialize_extra_account_meta_list(
    ctx: Context<InitializeExtraAccountMetaList>,
) -> Result<()> {
    let splitter_info = &ctx.accounts.splitter_info;

    // Extra accounts resolved by Token-2022 before invoking our hook:
    // [0..4] = source_token, mint, dest_token, owner, extra_account_meta_list
    // [5]    = splitter_info PDA: seeds = ["splitter", mint]
    // [6]    = token_stats PDA: seeds = [splitter_info, "SOL"]
    // [7]    = source_balance_info PDA: seeds = [splitter_info, source_token, "SOL"]
    // [8]    = dest_balance_info PDA: seeds = [splitter_info, dest_token, "SOL"]
    // [9]    = vault PDA: seeds = ["vault", splitter_info]
    // [10]   = system_program
    // [11..] = SPL splitter ATAs (one per non-SOL split token, literal pubkeys)
    let mut account_metas: Vec<ExtraAccountMeta> = vec![
        // [5] splitter_info: seeds = ["splitter", mint] on this program
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: b"splitter".to_vec(),
                },
                Seed::AccountKey { index: 1 }, // mint
            ],
            false,
            true,
        )?,
        // [6] token_stats: seeds = [splitter_info, "SOL"] on this program
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::AccountKey { index: 5 }, // splitter_info
                Seed::Literal {
                    bytes: b"SOL".to_vec(),
                },
            ],
            false,
            true,
        )?,
        // [7] source_balance_info: seeds = [splitter_info, source_token, "SOL"] on this program
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::AccountKey { index: 5 }, // splitter_info
                Seed::AccountKey { index: 0 }, // source_token
                Seed::Literal {
                    bytes: b"SOL".to_vec(),
                },
            ],
            false,
            true,
        )?,
        // [8] dest_balance_info: seeds = [splitter_info, dest_token, "SOL"] on this program
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::AccountKey { index: 5 }, // splitter_info
                Seed::AccountKey { index: 2 }, // dest_token
                Seed::Literal {
                    bytes: b"SOL".to_vec(),
                },
            ],
            false,
            true,
        )?,
        // [9] vault PDA: seeds = ["vault", splitter_info] — system-owned, holds SOL for auto-creating BalanceInfo
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: b"vault".to_vec(),
                },
                Seed::AccountKey { index: 5 }, // splitter_info
            ],
            false,
            true,
        )?,
        // [10] system_program — needed for create_account CPI
        ExtraAccountMeta::new_with_pubkey(&system_program::ID, false, false)?,
    ];

    // [11..] Add splitter ATAs for each non-SOL split token (literal pubkeys, read-only)
    let splitter_info_pda = splitter_info.key();
    let ata_program_id = anchor_spl::associated_token::ID;
    let token_program_id = anchor_spl::token::ID; // assumes regular SPL Token for split tokens
    for split_mint in &splitter_info.split_mints {
        if *split_mint != Pubkey::default() {
            let (ata, _) = Pubkey::find_program_address(
                &[splitter_info_pda.as_ref(), token_program_id.as_ref(), split_mint.as_ref()],
                &ata_program_id,
            );
            account_metas.push(ExtraAccountMeta::new_with_pubkey(&ata, false, false)?);
        }
    }

    let account_size = ExtraAccountMetaList::size_of(account_metas.len())? as u64;
    let lamports = Rent::get()?.minimum_balance(account_size as usize);

    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[
        b"extra-account-metas",
        mint_key.as_ref(),
        &[ctx.bumps.extra_account_meta_list],
    ];

    system_program::create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.extra_account_meta_list.to_account_info(),
            },
        )
        .with_signer(&[signer_seeds]),
        lamports,
        account_size,
        ctx.program_id,
    )?;

    ExtraAccountMetaList::init::<ExecuteInstruction>(
        &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
        &account_metas,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: This account's data is a buffer of TLV data
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    pub splitter_info: Account<'info, SplitterInfo>,

    pub system_program: Program<'info, System>,
}
