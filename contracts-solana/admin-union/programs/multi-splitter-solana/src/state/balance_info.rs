use anchor_lang::prelude::*;

// balance info for (user, tokenId)
#[account]
#[derive(Default)]
pub struct BalanceInfo {
    pub accrual: u64,
    pub withdrawn: u64,
    pub rps_at_last_share_change: f64,
}