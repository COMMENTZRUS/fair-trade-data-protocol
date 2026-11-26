use anchor_lang::prelude::*;

// Global stats for all split tokens (parallel arrays indexed by token position)
#[account]
#[derive(Default)]
pub struct TokenStats {
    pub last_recorded_total_received: Vec<u64>,
    pub total_withdrawn: Vec<u64>,
    pub last_recorded_rps: Vec<f64>,
}

impl TokenStats {
    pub fn space(num_tokens: usize) -> usize {
        8 + (4 + 8 * num_tokens) * 3
    }
}
