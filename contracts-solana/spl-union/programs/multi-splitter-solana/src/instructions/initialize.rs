use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use crate::state::splitter_info::*;
use crate::state::token_stats::*;

pub fn initialize(ctx: Context<InitSplitter>, split_mints: Vec<Pubkey>) -> Result<()> {
    let n = split_mints.len();
    ctx.accounts.splitter_info.mint = ctx.accounts.mint.key();
    ctx.accounts.splitter_info.initial_lamports = ctx.accounts.splitter_info.get_lamports();
    ctx.accounts.splitter_info.total_shares = ctx.accounts.mint.supply;
    ctx.accounts.splitter_info.split_mints = split_mints;

    ctx.accounts.token_stats.last_recorded_total_received = vec![0u64; n];
    ctx.accounts.token_stats.total_withdrawn = vec![0u64; n];
    ctx.accounts.token_stats.last_recorded_rps = vec![0u128; n];
    Ok(())
}

#[derive(Accounts)]
#[instruction(split_mints: Vec<Pubkey>)]
pub struct InitSplitter<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        seeds = [b"splitter", mint.key().as_ref()],
        bump,
        payer = signer,
        space = SplitterInfo::space(split_mints.len())
    )]
    pub splitter_info: Account<'info, SplitterInfo>,

    #[account(
        init,
        seeds = [splitter_info.key().as_ref(), b"SOL"],
        bump,
        payer = signer,
        space = TokenStats::space(split_mints.len())
    )]
    pub token_stats: Account<'info, TokenStats>,
    pub system_program: Program<'info, System>,
}
