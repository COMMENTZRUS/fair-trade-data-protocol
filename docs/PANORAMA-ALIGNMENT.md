# Alignment Between FTDP & Existing Panorama / COMMENTZRUS Contracts

This document maps how the open-source **Fair Trade Data Protocol (`fair-trade-data-protocol`)** aligns with the existing production Solana contracts and schemas in `commentzrus-ecosystem-contracts` and `streamy-os`.

## 1. Existing Production Solana Programs (`commentzrus-ecosystem-contracts`)

| Program | Canonical Program ID | Capabilities Already Built | How It Connects to FTDP |
| :--- | :--- | :--- | :--- |
| **`panorama-splitter`** | `E9q52F6RRPGMb4yatWW1AzyNEiMuB9FhMpDcWvwrQuJf` | Checked `u128` `RPS_PRECISION` O(1) member shares, SHA-256 Merkle epoch claims (`merkle_reserved`), expiring shares (`expires_at` + `expire_member_share`), chained parent → child pools (`push_claim_to_child_pool`), SPL `TransferChecked` vault pinning, 2-step admin handover (`propose_admin` / `accept_admin`). | **Recommended canonical Solana Data Union engine** alongside FTDP's hardened EVM `MultiSplitter` (`contracts/contracts/splitter/`). |
| **`panorama-market`** | `6NSU4y7nZggS6xSj9k6ChFgyU2DyTBZpVCq74wjg2hKY` | `register_deployment`, `add_offer`, `remove_offer`, `purchase_offer` (protocol fee bps + `treasury`), `record_access`, `record_settlement` (`intent_id_hash`, `event_id_hash`, `proof_hash`). | Solana counterpart to FTDP's EVM `Market.sol` + `AccessPermissions.sol`. |
| **`comment-protocol`** | `6T9t151KH4VKSVhPkmDmPp8vbqBe7Wyd8YEXnNkFZXGA` | On-chain config, base comment fee, staking threshold, batch committer authority, reputation & moderation versioning. | Solana settlement & batch-commit layer underneath **Top News** and **RateMyVideo**, paired with `ftdp-node` + `defradb.rs`. |

## 2. Canonical v1 JSON Schemas (`commentzrus-ecosystem-contracts/schemas/v1/`)

- **`comment.v1.schema.json` & `comment-target.schema.json`**: Supports `url`, `domain`, `solana_account`, `token_mint`, `nft_mint`, `transaction`, `dao_proposal`, and `app_thread` targets with Ed25519 signatures and `target_hash`. Maps directly into FTDP's `FtdpAnonRecord` (`dataId = keccak256("ftdp:comment:v1")`) and DefraDB `CommentRecord`.
- **`panorama-proof-envelope.schema.json` & `panorama-solana-settlement.schema.json`**: Integrates directly with `streamy-os/services/settlement-bridge` and `ftdp-node` metering outputs.

## 3. Recommended Consolidation Next Step

1. Keep **`fair-trade-data-protocol`** as the clean, public **MIT / Apache-2.0** open-source base layer (EVM contracts, `@ftdp/sdk`, `ftdp-node` + `defradb.rs` Zanzibar ACP/LensVM, and `fairtradedata.org` portal).
2. Prefer **`panorama-splitter`** (`u128` fixed-point + Merkle epoch + chained child pools) over the older `f64` `multisplitter-solana-admin` when deploying Solana Data Unions to mainnet, while keeping `contracts-solana/spl-union` for Token-2022 transfer-hook liquid share unions.
3. Point Panorama, Streamy, Comment Protocol, Top News, and RateMyVideo at `ftdp-node` + `defradb.rs` for consent-segregated storage (`FtdpAnonRecord` vs. local-only encrypted `FtdpPiiVault`) and dual-chain EVM + Solana Data Union metering.
