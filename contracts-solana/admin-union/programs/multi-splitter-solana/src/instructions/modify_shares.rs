use crate::state::balance_info::*;
use crate::state::splitter_info::*;
use crate::state::token_stats::*;
use crate::state::user_info::*;
use anchor_lang::prelude::*;

pub const RPS_PRECISION: u128 = 1_000_000_000_000_000_000;

pub fn total_received<'info>(splitter_info: &Account<'info, SplitterInfo>, token_stats: &TokenStats) -> u64 {
    splitter_info
        .get_lamports()
        .saturating_add(token_stats.total_withdrawn)
        .saturating_sub(splitter_info.initial_lamports)
}

pub fn unaccounted_tokens<'info>(splitter_info: &Account<'info, SplitterInfo>, token_stats: &TokenStats) -> u64 {
    total_received(splitter_info, token_stats).saturating_sub(token_stats.last_recorded_total_received)
}

pub fn rps<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    token_stats: &TokenStats,
) -> u128 {
    if splitter_info.total_shares == 0 {
        return token_stats.last_recorded_rps;
    }
    let unaccounted = unaccounted_tokens(splitter_info, token_stats) as u128;
    let unaccounted_rps = unaccounted
        .saturating_mul(RPS_PRECISION)
        / (splitter_info.total_shares as u128);
    token_stats.last_recorded_rps.saturating_add(unaccounted_rps)
}

pub fn unrecorded_allotment<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    user_info: &UserInfo,
    token_stats: &TokenStats,
    balance_info: &BalanceInfo,
) -> u64 {
    if splitter_info.total_shares == 0 || user_info.shares == 0 {
        return 0;
    }
    let delta_rps = rps(splitter_info, token_stats).saturating_sub(balance_info.rps_at_last_share_change);
    let earned = (user_info.shares as u128)
        .saturating_mul(delta_rps)
        / RPS_PRECISION;
    u64::try_from(earned).unwrap_or(u64::MAX)
}

pub fn total_allotment<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    user_info: &UserInfo,
    token_stats: &TokenStats,
    balance_info: &BalanceInfo,
) -> u64 {
    balance_info
        .accrual
        .saturating_add(unrecorded_allotment(splitter_info, user_info, token_stats, balance_info))
}

pub fn available_allotment<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    user_info: &UserInfo,
    token_stats: &TokenStats,
    balance_info: &BalanceInfo,
) -> u64 {
    total_allotment(splitter_info, user_info, token_stats, balance_info).saturating_sub(balance_info.withdrawn)
}

pub fn save_rps<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    token_stats: &mut TokenStats,
) {
    if splitter_info.total_shares == 0 {
        return;
    }
    let unaccounted = unaccounted_tokens(splitter_info, token_stats);
    if unaccounted == 0 {
        return;
    }
    let delta_rps = (unaccounted as u128)
        .saturating_mul(RPS_PRECISION)
        / (splitter_info.total_shares as u128);
    if delta_rps == 0 {
        return;
    }
    token_stats.last_recorded_total_received = token_stats
        .last_recorded_total_received
        .saturating_add(unaccounted);
    token_stats.last_recorded_rps = token_stats.last_recorded_rps.saturating_add(delta_rps);
}

pub fn save_accrual<'info>(
    splitter_info: &Account<'info, SplitterInfo>,
    user_info: &UserInfo,
    token_stats: &TokenStats,
    balance_info: &mut BalanceInfo,
) {
    balance_info.accrual = balance_info
        .accrual
        .saturating_add(unrecorded_allotment(splitter_info, user_info, token_stats, balance_info));
    balance_info.rps_at_last_share_change = rps(splitter_info, token_stats);
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
