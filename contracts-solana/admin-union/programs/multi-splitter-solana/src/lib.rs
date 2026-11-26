use anchor_lang::prelude::*;
use instructions::*;

pub mod errors;
pub mod instructions;
pub mod state;

declare_id!("AufGGM2SdGnPgu1cVLZWwwjKM7BUWosFiEmQ6jYBNnWm");

#[program]
pub mod multi_splitter_solana {

    use super::*;

    pub fn initialize(ctx: Context<InitSplitter>, splitter_id: String) -> Result<()> {
        instructions::initialize(ctx, splitter_id)
    }

    pub fn add_user(ctx: Context<AddUser>, user: Pubkey, shares: u64) -> Result<()> {
        instructions::add_user(ctx, user, shares)
    }

    pub fn modify_shares(
        ctx: Context<ModifyShares>,
        user: Pubkey,
        shares: u64) -> Result<()> {
        instructions::modify_shares(ctx, user, shares)
    }

    // amount 0 means withdraw ALL

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw(ctx, amount)
    }

    pub fn transfer_ownership (
        ctx: Context<TransferOwnership>,
        new_owner: Pubkey,
    ) -> Result<()> {
        instructions::transfer_ownership(ctx, new_owner)
    }
}
