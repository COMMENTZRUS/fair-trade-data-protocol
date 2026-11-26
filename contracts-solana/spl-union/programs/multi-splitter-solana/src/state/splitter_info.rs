use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct SplitterInfo {
    pub mint: Pubkey,
    pub initial_lamports: u64,
    pub total_shares: u64,
    pub split_mints: Vec<Pubkey>, // tokens being split; Pubkey::default() = SOL
}

impl SplitterInfo {
    pub fn space(num_tokens: usize) -> usize {
        8 + 32 + 8 + 8 + (4 + 32 * num_tokens)
    }
}
