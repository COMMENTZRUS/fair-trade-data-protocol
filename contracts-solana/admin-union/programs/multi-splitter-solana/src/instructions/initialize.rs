use anchor_lang::prelude::*;
use crate::state::splitter_info::*;
use crate::state::token_stats::*;

pub fn initialize(ctx: Context<InitSplitter>, _splitter_id: String) -> Result<()> {
    msg!("Greetings from: {:?}", ctx.program_id);
    ctx.accounts.splitter_info.owner = ctx.accounts.signer.key();
    ctx.accounts.splitter_info.initial_lamports = ctx.accounts.splitter_info.get_lamports();
    ctx.accounts.splitter_info.total_users = 0;
    ctx.accounts.splitter_info.total_shares = 0;
    ctx.accounts.sol_token_stats.last_recorded_rps = 0u128;
    ctx.accounts.sol_token_stats.last_recorded_total_received = 0;
    ctx.accounts.sol_token_stats.total_withdrawn = 0;
    
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(splitter_id : String)]
pub struct InitSplitter<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
    init,
    seeds = [splitter_id.as_bytes(), signer.key().as_ref()],
    bump,
    payer = signer,
    space = 3*64 + 32
  )]
    pub splitter_info: Account<'info, SplitterInfo>,

    //create SOL token splitter record
    #[account(
    init,
    seeds = [splitter_info.key().as_ref(), "SOL".as_bytes()],
    bump,
    payer = signer,
    space = 3*64
  )]
    pub sol_token_stats: Account<'info, TokenStats>,
    pub system_program: Program<'info, System>,
}
