use crate::state::balance_info::*;
use crate::state::token_stats::*;

pub const RPS_PRECISION: u128 = 1_000_000_000_000_000_000;

// All functions are index-aware: `i` is the position in the parallel arrays.
// Fixed-point u128 RPS (scaled by 1e18) prevents float precision drift across large SPL supplies.

fn total_received_at(i: usize, balance: u64, initial: u64, token_stats: &TokenStats) -> u64 {
    balance
        .saturating_add(token_stats.total_withdrawn[i])
        .saturating_sub(initial)
}

fn unaccounted_at(i: usize, balance: u64, initial: u64, token_stats: &TokenStats) -> u64 {
    total_received_at(i, balance, initial, token_stats).saturating_sub(token_stats.last_recorded_total_received[i])
}

fn rps_at(i: usize, balance: u64, initial: u64, total_shares: u64, token_stats: &TokenStats) -> u128 {
    if total_shares == 0 {
        return token_stats.last_recorded_rps[i];
    }
    let unaccounted = unaccounted_at(i, balance, initial, token_stats) as u128;
    let delta_rps = unaccounted.saturating_mul(RPS_PRECISION) / (total_shares as u128);
    token_stats.last_recorded_rps[i].saturating_add(delta_rps)
}

pub fn available_allotment_at(
    i: usize,
    shares: u64,
    balance: u64,
    initial: u64,
    total_shares: u64,
    token_stats: &TokenStats,
    balance_info: &BalanceInfo,
) -> u64 {
    let current_rps = rps_at(i, balance, initial, total_shares, token_stats);
    let rps_diff = current_rps.saturating_sub(balance_info.rps_at_last_share_change[i]);
    let unrecorded_u128 = (shares as u128).saturating_mul(rps_diff) / RPS_PRECISION;
    let unrecorded = u64::try_from(unrecorded_u128).unwrap_or(u64::MAX);
    let total = balance_info.accrual[i].saturating_add(unrecorded);
    total.saturating_sub(balance_info.withdrawn[i])
}

pub fn save_rps_at(
    i: usize,
    balance: u64,
    initial: u64,
    total_shares: u64,
    token_stats: &mut TokenStats,
) {
    if total_shares == 0 {
        return;
    }
    let unaccounted = unaccounted_at(i, balance, initial, token_stats);
    if unaccounted == 0 {
        return;
    }
    let delta_rps = (unaccounted as u128).saturating_mul(RPS_PRECISION) / (total_shares as u128);
    if delta_rps == 0 {
        return;
    }
    token_stats.last_recorded_total_received[i] = token_stats.last_recorded_total_received[i].saturating_add(unaccounted);
    token_stats.last_recorded_rps[i] = token_stats.last_recorded_rps[i].saturating_add(delta_rps);
}

/// Call AFTER save_rps_at for the same index — uses last_recorded_rps[i] as current RPS.
pub fn save_accrual_at(
    i: usize,
    shares: u64,
    token_stats: &TokenStats,
    balance_info: &mut BalanceInfo,
) {
    let current_rps = token_stats.last_recorded_rps[i];
    let rps_diff = current_rps.saturating_sub(balance_info.rps_at_last_share_change[i]);
    let unrecorded_u128 = (shares as u128).saturating_mul(rps_diff) / RPS_PRECISION;
    let unrecorded = u64::try_from(unrecorded_u128).unwrap_or(u64::MAX);
    balance_info.accrual[i] = balance_info.accrual[i].saturating_add(unrecorded);
    balance_info.rps_at_last_share_change[i] = current_rps;
}
