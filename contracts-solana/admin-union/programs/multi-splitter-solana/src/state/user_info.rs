use anchor_lang::prelude::*;

// share info for (user)
#[account]
#[derive(Default)]
pub struct UserInfo {
    pub shares: u64,
}
