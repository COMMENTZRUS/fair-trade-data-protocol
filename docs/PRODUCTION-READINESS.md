# FTDP Production Readiness & Launch Runbook

## 1. Open-Source Breakout Verification (Panorama vs. FTDP)

- **Public Open-Source Repos (FTDF)**:
  - `spec/` — Protocol RFCs, JSON record schema, Merkle consent format, Data Union economics.
  - `contracts/` — Hardened Constant-Time MultiSplitter Data Unions, `ClientConfigManager`, `AccessPermissions`, `Market`, `DataUnionFactory`.
  - `contracts-solana/` — Solana Anchor Admin & Token-2022 Transfer-Hook Data Unions.
  - `sdk/` — `@ftdp/sdk` + embeddable browser snippet (`dist/ftdp-snippet.js`).
  - `node/` — Self-hostable `ftdp-node` reference server (`Dockerfile` + `docker-compose.yml`).
  - `apps/portal/` — Unified `fairtradedata.org` landing, SLS Dashboard, Data Union Claim Center, and Marketplace UI.
- **Private Company Scope (Panorama / Top News)**:
  - Keep proprietary feeds, ranking/curation engines, AI pipelines, user accounts, and editorial tooling closed-source.
  - Integrate via `@ftdp/sdk` or `ftdp-snippet.js` using registered `bytes32 deploymentId`s and Tier-2 `AutoPullSplitter` Data Unions.

## 2. Pre-Mainnet Security Audit Checklist

### EVM Contracts (`contracts/`)
All 5 findings from the upstream `multisplitter-eth` review have been patched and covered by regression tests:
- [x] `AbstractSplitter.saveRPS()` early-return bug fixed (`continue` across all supported tokens + sub-precision dust guard).
- [x] `AdminControlledSplitter.init()` & `ERC20SharesSplitter.init()` wire `upstreamSplitter_` parameter properly.
- [x] `AdminControlledSplitter.setSharesMultiMeta()` EIP-712 `(nonce, deadline)` order and internal `_setShares()` fixed for third-party relayers.
- [x] `AutoPullSplitter._withdraw()` pulls upstream liquidity on demand; `ReentrancyGuard`, `SafeERC20`, and low-level ETH `.call` enforced across all splitters.
- [x] `VotesSplitterShare` & `DynamicSplitterShare` clone-safe custom `name()` / `symbol()` and optional minter role.
- [x] Relicensed under **MIT / Apache-2.0** across EVM and Solana MultiSplitter contracts (`LICENSE` & `LICENSE-NOTICE.md`).
- [ ] External smart-contract security audit completed (covering `Market`, `AccessPermissions`, `ClientConfigManager`, `DataUnionFactory`, `splitter/*`, and `v2/*`).

### Solana Programs (`contracts-solana/`)
- [ ] Fresh mainnet program keypairs generated (`anchor keys sync`) — zero devnet demo IDs remaining.
- [ ] Upgrade authority transferred to FTDF Squads multisig (or `--final` after external audit).

### Off-Chain Node (`node/`)
- [x] Strict physical separation of `anonRecords` (`ftdp-state.json`) and `piiVault` (`ftdp-pii-vault.json`).
- [x] Runtime schema validation against `spec/schemas/record.schema.json`.
- [x] Rate limiting, `1 MiB` payload cap, security headers, EIP-191 wallet auth + HMAC-SHA256 JWTs, graceful shutdown.
- [ ] Production secrets set via secret manager (`FTDP_API_KEY`, `FTDP_JWT_SECRET`, `FTDP_RPC_URL`, `FTDP_ACCESS_PERMISSIONS_ADDRESS`).
- [ ] TLS termination behind reverse proxy / CDN + encrypted backups for `piiVault` (or Postgres adapter for high throughput).

## 3. Production EVM Deployment Steps

```bash
export DEPLOYER_PRIVATE_KEY="0x..."
export FTDF_MULTISIG_ADDRESS="0x..." # Gnosis Safe on Base / Gnosis / Mainnet
export USDC_ADDRESS="0x..."
export FTD_TOKEN_ADDRESS="0x..."

cd contracts
npx hardhat run scripts/deploy-production.ts --network <target-network>
```

Verify the generated manifest in `contracts/deployments/chain-<id>.json`, confirm `owner()` on `ClientConfigManager`, `AccessPermissions`, and `DataUnionFactory` all equal `FTDF_MULTISIG_ADDRESS`, and publish verified contract source on the block explorer.

## 4. Onboarding Panorama & Top News as First-Party Deployments

1. Register `deployment:panorama-v1` and `deployment:top-news-v1` in `ClientConfigManager`.
2. Deploy **Tier-1 Root Union** (`News & Curation Data Union`) and **Tier-2 AutoPull Sub-Splitters** (`Panorama Contributor Pool`, `Top News Contributor Pool`) via `DataUnionFactory`.
3. Configure Tier-1 shares (e.g., 5% FTDF Treasury, 55% Panorama Sub-Splitter, 40% Top News Sub-Splitter).
4. Embed `@ftdp/sdk` or `ftdp-snippet.js` into Panorama and Top News to stream consented records to `ftdp-node`.
5. Schedule periodic jobs to:
   - Commit `GET /api/v1/deployments/:id/merkle/root` to `AccessPermissions.setOptInMerkleRoot()`.
   - Run `POST /api/v1/unions/:id/meter`, sign `SetSharesMulti` via EIP-712, and submit to `AdminControlledSplitter.setSharesMultiMeta()`.
6. List dataset offers on `Market.sol` with `beneficiary = Tier-1 Root Data Union`.
