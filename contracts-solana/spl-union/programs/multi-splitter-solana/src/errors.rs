use anchor_lang::error_code;

#[error_code]
pub enum MultiSplitterErrors {
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Mint mismatch")]
    MintMismatch,
    #[msg("Token account owner mismatch")]
    TokenAccountOwnerMismatch,
    #[msg("Invalid token index")]
    InvalidTokenIndex,
}
