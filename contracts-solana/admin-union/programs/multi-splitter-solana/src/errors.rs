use anchor_lang::error_code;

#[error_code]
pub enum MultiSplitterErrors {
    #[msg("Insufficient balance")]
    InsufficientBalance,
}
