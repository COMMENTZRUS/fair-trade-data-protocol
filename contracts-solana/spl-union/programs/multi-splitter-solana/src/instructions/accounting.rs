use crate::state::balance_info::*;
use crate::state::token_stats::*;

// All functions are index-aware: `i` is the position in the parallel arrays.
// `balance` = current balance (splitter_info.get_lamports() for SOL, splitter ATA balance for SPL).
// `initial` = initial balance at splitter creation (initial_lamports for SOL, 0 for SPL).

fn total_received_at(i: usize, balance: u64, initial: u64, token_stats: &TokenStats) -> u64 {
    balance + token_stats.total_withdrawn[i] - initial
}

fn unaccounted_at(i: usize, balance: u64, initial: u64, token_stats: &TokenStats) -> u64 {
    total_received_at(i, balance, initial, token_stats) - token_stats.last_recorded_total_received[i]
}

fn rps_at(i: usize, balance: u64, initial: u64, total_shares: u64, token_stats: &TokenStats) -> f64 {
    if total_shares == 0 {
        return token_stats.last_recorded_rps[i];
    }
    let unaccounted = unaccounted_at(i, balance, initial, token_stats);
    token_stats.last_recorded_rps[i] + (unaccounted as f64) / (total_shares as f64)
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
    let unrecorded = ((shares as f64) * (current_rps - balance_info.rps_at_last_share_change[i])) as u64;
    let total = balance_info.accrual[i] + unrecorded;
    total - balance_info.withdrawn[i]
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
    token_stats.last_recorded_total_received[i] += unaccounted;
    token_stats.last_recorded_rps[i] += (unaccounted as f64) / (total_shares as f64);
}

/// Call AFTER save_rps_at for the same index — uses last_recorded_rps[i] as current RPS.
pub fn save_accrual_at(
    i: usize,
    shares: u64,
    token_stats: &TokenStats,
    balance_info: &mut BalanceInfo,
) {
    let current_rps = token_stats.last_recorded_rps[i];
    let unrecorded = ((shares as f64) * (current_rps - balance_info.rps_at_last_share_change[i])) as u64;
    balance_info.accrual[i] += unrecorded;
    balance_info.rps_at_last_share_change[i] = current_rps;
}
