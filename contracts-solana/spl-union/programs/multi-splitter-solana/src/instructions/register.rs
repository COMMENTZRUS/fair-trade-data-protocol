use anchor_lang::prelude::*;
use crate::state::balance_info::*;
use crate::state::splitter_info::*;

pub fn register(ctx: Context<Register>, _token_account: Pubkey) -> Result<()> {
    let bal = &mut ctx.accounts.balance_info;
    // Initialize Vecs if newly created (init_if_needed leaves them empty)
    if bal.accrual.is_empty() {
        let n = ctx.accounts.splitter_info.split_mints.len();
        bal.accrual = vec![0u64; n];
        bal.withdrawn = vec![0u64; n];
        bal.rps_at_last_share_change = vec![0u128; n];
    }
    msg!("Registered balance_info {}", bal.key());
    Ok(())
}

#[derive(Accounts)]
#[instruction(token_account: Pubkey)]
pub struct Register<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub splitter_info: Account<'info, SplitterInfo>,

    #[account(
        init_if_needed,
        seeds = [splitter_info.key().as_ref(), token_account.as_ref(), b"SOL"],
        bump,
        payer = payer,
        space = BalanceInfo::space(splitter_info.split_mints.len()),
    )]
    pub balance_info: Account<'info, BalanceInfo>,

    pub system_program: Program<'info, System>,
}
