# FTDP Dual-Chain Architecture (Ethereum/EVM + Solana)

## 1. Overview

FTDP supports **single-chain EVM**, **single-chain Solana**, and **dual-chain (EVM + Solana simultaneously)** Data Unions—allowing protocols like **Comment Protocol**, **Panorama**, **Streamy**, **Top News**, and **RateMyVideo** to settle data licensing and contributor payouts natively on both ecosystems from a **single shared `defradb.rs` / FTDP data stream**.

```text
                       Single Consent-Verified FTDP + defradb.rs Stream
                   (anon records carry EVM and/or Solana contributor wallets)
                                              |
                        ftdp-node Dual-Chain Metering & Access Gate
                         /                                       \
       EVM Settlement Rail                                  Solana Settlement Rail
 (Base / Gnosis / Ethereum Mainnet)                     (Solana Mainnet / Devnet)
  - ClientConfigManager + AccessPermissions              - admin-union (Anchor 0.30.1)
  - Market.sol -> MultiSplitter Data Unions                -> modify_shares / withdraw (SOL)
  - AdminControlled / ERC20 / VotesSplitterShare         - spl-union (Anchor 0.32.1 Token-2022)
  - AutoPullSplitter (3-tier atomic cascade)               -> TransferHook auto-accrual (SOL + USDC + FTD)
```

## 2. Dual-Chain Data Union Configuration

A Data Union registered in `ftdp-node` declares `chainMode: "evm" | "solana" | "dual"` with explicit settlement targets:

```json
{
  "id": "comment-protocol-dual-union",
  "name": "Comment Protocol Data Union (Dual-Chain EVM + Solana)",
  "chainMode": "dual",
  "kind": "ADMIN_CONTROLLED",
  "splitterAddress": "0x2000000000000000000000000000000000000002",
  "evm": {
    "chainId": 100,
    "splitterAddress": "0x2000000000000000000000000000000000000002",
    "upstreamSplitterAddress": "0x1000000000000000000000000000000000000001"
  },
  "solana": {
    "cluster": "mainnet-beta",
    "programId": "<YOUR_SOLANA_PROGRAM_ID>",
    "splitterPda": "<YOUR_SOLANA_SPLITTER_PDA>",
    "variant": "spl-transfer-hook",
    "shareMint": "<YOUR_TOKEN_2022_SHARE_MINT>",
    "splitMints": ["11111111111111111111111111111111", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]
  },
  "deploymentIds": ["0x...top-news", "0x...ratemyvideo"]
}
```

## 3. Contributor Identity & Dual-Chain Metering

- Contributors can attach `contributorWallet` (EVM `0x...`), `contributorSolanaWallet` (Solana Base58 pubkey), or **both** to their consented events.
- Calling `POST /api/v1/unions/:id/meter` returns:
  - `updates`: EVM `HolderAndShares[]` ready for `AdminControlledSplitter.setSharesMultiMeta()` (EIP-712 gasless relay).
  - `solanaUpdates`: Solana `{ shareholder, shares }[]` ready for `admin-union::modify_shares` or `spl-union` Token-2022 share distribution.
- **No cross-chain bridge required**: EVM buyers pay USDC/FTD/ETH into the EVM MultiSplitter, Solana buyers pay SOL/USDC/FTD into the Solana MultiSplitter, and contributors claim natively on whichever chain(s) they participate on.
