use anchor_lang::prelude::*;

// balance info for (user, tokenId)
#[account]
#[derive(Default)]
pub struct SplitterInfo {
    pub owner: Pubkey,
    //lamports needed for rent?
    pub initial_lamports: u64,
    pub total_users: u64,
    pub total_shares: u64,
}