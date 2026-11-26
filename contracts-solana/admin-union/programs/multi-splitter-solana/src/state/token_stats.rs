use anchor_lang::prelude::*;

// stats for (tokenId)
#[account]
#[derive(Default)]
pub struct TokenStats {
    pub last_recorded_total_received: u64,
    pub total_withdrawn: u64,
    pub last_recorded_rps: f64,
}

