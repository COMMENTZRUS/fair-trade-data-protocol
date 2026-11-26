#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use instructions::*;
use spl_discriminator::SplDiscriminate;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

pub mod errors;
pub mod instructions;
pub mod state;

declare_id!("5L2JmoDTzvb16VfBeNozP8jZBUjQUaA4JB4FzrmqTpLy");

#[program]
pub mod multi_splitter_solana {

    use super::*;

    pub fn initialize(ctx: Context<InitSplitter>, split_mints: Vec<Pubkey>) -> Result<()> {
        instructions::initialize(ctx, split_mints)
    }

    pub fn register(ctx: Context<Register>, user: Pubkey) -> Result<()> {
        instructions::register(ctx, user)
    }

    // amount 0 means withdraw ALL
    pub fn withdraw<'info>(ctx: Context<'_, '_, 'info, 'info, Withdraw<'info>>, token_index: u8, amount: u64) -> Result<()> {
        instructions::withdraw(ctx, token_index, amount)
    }

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        instructions::initialize_extra_account_meta_list(ctx)
    }

    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn transfer_hook<'info>(ctx: Context<'_, '_, 'info, 'info, TransferHookCtx<'info>>, amount: u64) -> Result<()> {
        instructions::transfer_hook(ctx, amount)
    }
}
