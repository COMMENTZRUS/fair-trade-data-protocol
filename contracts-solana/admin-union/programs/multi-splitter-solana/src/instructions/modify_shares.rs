use crate::state::balance_info::*;
use crate::state::splitter_info::*;
use crate::state::token_stats::*;
use crate::state::user_info::*;
use anchor_lang::prelude::*;

pub fn total_received<'info>(splitter_info: &Account<'info, SplitterInfo>, token_stats: &TokenStats) -> u64 {
    return splitter_info.get_lamports() + token_stats.total_withdrawn - splitter_info.initial_lamports;
}

pub fn unaccounted_tokens<'info>(splitter_info: &Account<'info, SplitterInfo>, token_stats: &TokenStats) -> u64 {
    return total_received(splitter_info, token_stats) - token_stats.last_recorded_total_received;
}

pub fn rps<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    token_stats: &TokenStats,
) -> f64 {
    if splitter_info.total_shares == 0 {
        return token_stats.last_recorded_rps;
    }
    let unaccounted_rps :f64 = (unaccounted_tokens(splitter_info, token_stats) as f64) / (splitter_info.total_shares as f64);
    return token_stats.last_recorded_rps + unaccounted_rps;
}


pub fn unrecorded_allotment<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    user_info: &UserInfo,
    token_stats: &TokenStats,
    balance_info: &BalanceInfo,
) -> u64 {
    return ((user_info.shares as f64)
        * (rps(splitter_info, token_stats) - balance_info.rps_at_last_share_change))
        as u64;
}

pub fn total_allotment<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    user_info: &UserInfo,
    token_stats: &TokenStats,
    balance_info: &BalanceInfo,
) -> u64 {
    return balance_info.accrual + unrecorded_allotment(splitter_info, user_info, token_stats, balance_info)
}

pub fn available_allotment<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    user_info: &UserInfo,
    token_stats: &TokenStats,
    balance_info: &BalanceInfo,
) -> u64 {
    return total_allotment(splitter_info, user_info, token_stats, balance_info) - balance_info.withdrawn
}

pub fn save_rps<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    token_stats: &mut TokenStats,
) {
    if splitter_info.total_shares == 0 {
        return;
    }
    let unaccounted : u64 = unaccounted_tokens(splitter_info, token_stats);
    //msg!("unaccounted {}", unaccounted);
    //msg!("token_stats.last_recorded_total_received {}", token_stats.last_recorded_total_received);

    if unaccounted == 0 {
        return
    }
    token_stats.last_recorded_total_received += unaccounted;
    //msg!("token_stats.last_recorded_total_received {}", token_stats.last_recorded_total_received);
    token_stats.last_recorded_rps += (unaccounted as f64) / (splitter_info.total_shares as f64);
}

pub fn save_accrual<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    user_info: &UserInfo,
    token_stats: &TokenStats,
    balance_info: &mut BalanceInfo,

) {
    balance_info.accrual += unrecorded_allotment(splitter_info, user_info, token_stats, balance_info);
    balance_info.rps_at_last_share_change = rps(splitter_info, token_stats)
}

/*
    shares = 0 && increase = false WIPES ALL shares
    shares = 0 && increase = true is NOOP
*/

pub fn modify_shares(
    ctx:  Context<ModifyShares>,
    _shareholder: Pubkey,
    shares: u64
) -> Result<()> {
    save_rps(&ctx.accounts.splitter_info, &mut ctx.accounts.sol_token_stats);
    save_accrual(&ctx.accounts.splitter_info, &ctx.accounts.user_info, &ctx.accounts.sol_token_stats, &mut ctx.accounts.sol_balance_info);
    if ctx.accounts.user_info.shares == 0 && shares != 0 {
        ctx.accounts.splitter_info.total_users += 1;
    } else if ctx.accounts.user_info.shares != 0 && shares == 0 {
        ctx.accounts.splitter_info.total_users -= 1;
    }
    if shares > ctx.accounts.user_info.shares {
        // add shares
        ctx.accounts.splitter_info.total_shares += shares - ctx.accounts.user_info.shares;
    } else {
        ctx.accounts.splitter_info.total_shares -= ctx.accounts.user_info.shares - shares;
    }
    ctx.accounts.user_info.shares = shares;
    Ok(())
}

#[derive(Accounts)]
#[instruction(shareholder: Pubkey)]
pub struct ModifyShares<'info> {
    pub signer: Signer<'info>,
    // onlyOwner
    #[account(mut, constraint = splitter_info.owner == signer.key())]
    pub splitter_info: Account<'info, SplitterInfo>,
    #[account(
            mut,
            seeds = [splitter_info.key().as_ref(), shareholder.key().as_ref()],
            bump
          )]
    pub user_info: Account<'info, UserInfo>,
    #[account(
        mut,
        seeds = [splitter_info.key().as_ref(), shareholder.key().as_ref(), "SOL".as_bytes()],
        bump
      )]
    pub sol_balance_info: Account<'info, BalanceInfo>,
    #[account(
        mut,
        seeds = [splitter_info.key().as_ref(), "SOL".as_bytes()],
        bump
    )]
    pub sol_token_stats: Account<'info, TokenStats>,
}
