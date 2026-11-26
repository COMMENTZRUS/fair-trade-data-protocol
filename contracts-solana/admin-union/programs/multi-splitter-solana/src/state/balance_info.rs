use anchor_lang::prelude::*;

// balance info for (user, tokenId) — fixed-point RPS scaled by 1e18 (u128)
#[account]
#[derive(Default)]
pub struct BalanceInfo {
    pub accrual: u64,
    pub withdrawn: u64,
    pub rps_at_last_share_change: u128,
}
