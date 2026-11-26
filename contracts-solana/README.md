# FTDP Solana Data Unions (`contracts-solana/`)

Solana Anchor implementations of Constant-Time MultiSplitter Data Unions adapted from `multisplitter-bundle`:

- `admin-union/` (`multisplitter-solana-admin`, Anchor 0.30.1): Contribution-weighted, admin-controlled Data Union splitter (`initialize`, `add_user`, `modify_shares`, `withdraw`, `transfer_ownership`).
- `spl-union/` (`multisplitter-solana-spl`, Anchor 0.32.1): Token-2022 **transfer-hook** SPL share Data Union (`initialize`, `register`, `withdraw`, `initialize_extra_account_meta_list`, `transfer_hook`), updating Constant-Time Splitting accruals automatically on every SPL share transfer.

## Production Checklist Before Mainnet Deployment

> **Important**: The `declare_id!()` addresses currently in `admin-union/` and `spl-union/` are devnet demo program IDs. **Never deploy production funds to them.**

1. Generate fresh program keypairs via `anchor build && anchor keys sync && anchor build` (see [DEPLOYING.md](./DEPLOYING.md)).
2. Replace all `REPLACE_WITH_*` placeholders in `spl-union/scripts/` with environment variables pointing to your FTDF multisig (`Squads` v4) and mainnet SPL mints (`USDC`, `FTD`).
3. Transfer Solana program upgrade authority to the FTDF multisig (or set `--final` after external audit).
