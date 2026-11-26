use crate::errors::MultiSplitterErrors;
use crate::state::balance_info::*;
use crate::state::splitter_info::*;
use crate::state::token_stats::*;
use crate::state::user_info::*;
use crate::available_allotment;

use anchor_lang::prelude::*;

// amount 0 means withdraw ALL

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let balance: u64 = available_allotment(
        &ctx.accounts.splitter_info,
        &ctx.accounts.user_info,
        &ctx.accounts.sol_token_stats,
        &ctx.accounts.sol_balance_info,
    );

    if amount > balance {
        return err!(MultiSplitterErrors::InsufficientBalance);
    }
    let to_withdraw: u64;
    if amount == 0 {
        to_withdraw = balance
    } else {
        to_withdraw = amount
    }

    let from_pubkey = ctx.accounts.splitter_info.to_account_info();
    let to_pubkey = ctx.accounts.user.to_account_info();
    **from_pubkey.try_borrow_mut_lamports()? -= to_withdraw;
    **to_pubkey.try_borrow_mut_lamports()? += to_withdraw;
    ctx.accounts.sol_balance_info.withdrawn += to_withdraw;
    ctx.accounts.sol_token_stats.total_withdrawn += to_withdraw;

    Ok(())
}

#[derive(Accounts)]
#[instruction()]
pub struct Withdraw<'info> {
    pub signer: Signer<'info>,
    #[account(mut)]
    pub user: SystemAccount<'info>,
    #[account(mut)]
    pub splitter_info: Account<'info, SplitterInfo>,
    //create SOL token splitter record
    #[account(
            mut,
            seeds = [splitter_info.key().as_ref(), user.key().as_ref()],
            bump,
          )]
    pub user_info: Account<'info, UserInfo>,
    #[account(
        mut,
        seeds = [splitter_info.key().as_ref(), user.key().as_ref(), "SOL".as_bytes()],
        bump
      )]
    pub sol_balance_info: Account<'info, BalanceInfo>,
    #[account(
        mut,
        seeds = [splitter_info.key().as_ref(), "SOL".as_bytes()],
        bump
    )]
    pub sol_token_stats: Account<'info, TokenStats>
}
