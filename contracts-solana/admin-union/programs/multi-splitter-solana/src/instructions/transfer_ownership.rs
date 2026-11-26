use anchor_lang::prelude::*;

use crate::state::SplitterInfo;

pub fn transfer_ownership (
    ctx: Context<TransferOwnership>,
    new_owner: Pubkey,
) -> Result<()> {
    ctx.accounts.splitter_info.owner = new_owner;
    Ok(())
}

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct TransferOwnership<'info> {
    pub signer: Signer<'info>,
    // onlyOwner
    #[account(mut, constraint = splitter_info.owner == signer.key())]
    pub splitter_info: Account<'info, SplitterInfo>
}
