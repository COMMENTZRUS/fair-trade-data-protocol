use anchor_lang::prelude::*;
use crate::state::splitter_info::*;
use crate::state::token_stats::*;
use crate::state::user_info::*;
use crate::state::balance_info::*;

use super::save_accrual;
use super::save_rps;


pub fn add_user(ctx: Context<AddUser>, _user: Pubkey, shares: u64) -> Result<()> {
    ctx.accounts.sol_balance_info.accrual = 0;
    ctx.accounts.sol_balance_info.withdrawn = 0;
    save_rps(&ctx.accounts.splitter_info, &mut ctx.accounts.sol_token_stats);
    save_accrual(&ctx.accounts.splitter_info, &ctx.accounts.user_info, &ctx.accounts.sol_token_stats, &mut ctx.accounts.sol_balance_info);
    ctx.accounts.splitter_info.total_users += 1;
    ctx.accounts.splitter_info.total_shares += shares;
    ctx.accounts.user_info.shares = shares;
    Ok(())
}

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct AddUser<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    // onlyOwner
    #[account(mut, constraint = splitter_info.owner == signer.key())]
    pub splitter_info: Account<'info, SplitterInfo>,
    //create SOL token splitter record
    #[account(
            init,
            seeds = [splitter_info.key().as_ref(), user.key().as_ref()],
            bump,
            payer = signer,
            space = 64
          )]
    pub user_info: Account<'info, UserInfo>,
    #[account(
        init,
        seeds = [splitter_info.key().as_ref(), user.key().as_ref(), "SOL".as_bytes()],
        bump,
        payer = signer,
        space = 3*64
      )]
    pub sol_balance_info: Account<'info, BalanceInfo>,
    #[account(
        mut,
        seeds = [splitter_info.key().as_ref(), "SOL".as_bytes()],
        bump
    )]
    pub sol_token_stats: Account<'info, TokenStats>,
    pub system_program: Program<'info, System>
}