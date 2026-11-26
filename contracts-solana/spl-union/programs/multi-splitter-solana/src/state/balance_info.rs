use anchor_lang::prelude::*;

// Per-user balance info for all split tokens (parallel arrays indexed by token position, RPS scaled by 1e18)
#[account]
#[derive(Default)]
pub struct BalanceInfo {
    pub accrual: Vec<u64>,
    pub withdrawn: Vec<u64>,
    pub rps_at_last_share_change: Vec<u128>,
}

impl BalanceInfo {
    pub fn space(num_tokens: usize) -> usize {
        8 + (4 + 8 * num_tokens) * 2 + (4 + 16 * num_tokens)
    }
}
