# Fair Trade Data Protocol (FTDP) — Production Launch & Handover Runbook

This runbook covers the final live-infrastructure, credential, and handover steps across **Milestones 1–6** for the standalone MIT/Apache-2.0 **Fair Trade Data Protocol** (`COMMENTZRUS/fair-trade-data-protocol`).

---

## 1. Custom Domains & Live Hosting (Milestone 2 — Final DNS Cutover)

### Live Staging & Production Deployments Already Running
- **Portal (Vercel `fair-trade-data-portal`)**: `https://fair-trade-data-portal.vercel.app`
- **Hosted Auto-Capture Snippet (Vercel CDN)**: `https://fair-trade-data-portal.vercel.app/sdk/ftdp-snippet.js`
- **Reference Node (Railway `ftdp-staging` / `ftdp-node`)**: `https://ftdp-node-production.up.railway.app`
- **Apache-2.0/MIT DefraDB Sidecar (Railway `ftdp-staging` / `defradb-rs`)**: `http://defradb-rs.railway.internal:9181`

### DNS Records to Add at Your Registrar (`domaincontrol.com` / GoDaddy)
1. **Apex Portal (`fairtradedata.org`)** — already registered in Vercel project `fair-trade-data-portal`:
   - Type: `A` | Name: `@` | Value: `76.76.21.21`
2. **API Node (`api.fairtradedata.org`)**:
   - In Railway dashboard → `ftdp-staging` → `ftdp-node` → Settings → Networking → Custom Domain → add `api.fairtradedata.org`, then add the CNAME record shown by Railway at your registrar.
   - Once DNS resolves, update `VITE_FTDP_NODE_URL=https://api.fairtradedata.org` in Vercel and redeploy `apps/portal`.

### Bootstrap `defradb.rs` Zanzibar ACP Policies & Schemas
```bash
DEFRADB_URL=http://127.0.0.1:9181 ./node/defradb/bootstrap-defradb.sh
```
*(Run from a container or private network tunnel with access to `defradb-rs:9181` before setting `FTDP_STORAGE_DRIVER=defradb` on `ftdp-node`.)*

---

## 2. Activate GitHub Actions CI (Milestone 1)

`docs/ci.workflow.yml` runs Solidity (`solc-js` + Hardhat), 60-step EVM fuzz invariants, `@ftdp/sdk`, `@ftdp/node`, cross-stack E2E, ecosystem examples, live smoke test, Portal build, and Rust LensVM WASM compilation (`wasm32-unknown-unknown`).

```bash
gh auth refresh -s workflow
git mv docs/ci.workflow.yml .github/workflows/ci.yml
git commit -m "ci: activate GitHub Actions workflow"
git push origin main
```

---

## 3. Dual-Chain Testnet Deployment (Milestone 3)

### EVM (Base Sepolia or Gnosis Chiado — works on Windows, macOS, and Linux)
```bash
# 1. Create contracts/.env with a funded Base Sepolia DEPLOYER_PRIVATE_KEY
#    (Optional: set FTDF_MULTISIG_ADDRESS to a testnet Gnosis Safe)
node contracts/scripts/deploy-live-evm.js --network baseSepolia --with-3tier-union --dry-run
node contracts/scripts/deploy-live-evm.js --network baseSepolia --with-3tier-union
```
The script writes `contracts/deployments/baseSepolia.json` and prints the exact env vars (`FTDP_CHAIN_ID`, `FTDP_RPC_URL`, `FTDP_CLIENT_CONFIG_ADDRESS`, `FTDP_ACCESS_PERMISSIONS_ADDRESS`, `VITE_FTDP_MARKET_ADDRESS`) to paste into Railway & Vercel.

### Standalone Solana Programs (Devnet — run on Linux / macOS / WSL2 with Anchor CLI)
```bash
# Admin-Controlled MultiSplitter Data Union (u128 fixed-point RPS)
cd contracts-solana/admin-union
anchor build && anchor keys sync && anchor deploy --provider.cluster devnet

# Token-2022 Transfer-Hook SPL Data Union (u128 fixed-point RPS)
cd ../spl-union
anchor build && anchor keys sync && anchor deploy --provider.cluster devnet
```

---

## 4. Publish `@ftdp/sdk` to npm (Milestone 4)

```bash
npm login
cd sdk
npm run build
npm pack --dry-run
npm publish --access public
```
*(Note: If the `@ftdp` npm org isn't registered yet, create the `ftdp` organization on npmjs.com first or publish under `@fairtradedata/sdk`.)*

---

## 5. Pre-Mainnet External Security Audit (Milestone 5)

Hand off [`docs/SECURITY-AUDIT-BRIEF.md`](./SECURITY-AUDIT-BRIEF.md) covering:
- EVM contracts (`contracts/contracts/`: MultiSplitter CTS, AutoPull, EIP-712, SLS Core, Phase 4 v2)
- Standalone Solana programs (`contracts-solana/admin-union` & `spl-union` checked `u128` RPS + Token-2022 transfer hook)
- Privacy & PII Vault boundary (`node/src/piiCrypto.ts`, `node/src/domains.ts`, `sdk/scripts/build-snippet.js`)

---

## 6. Mainnet Launch & FTDF Multisig Handover (Milestone 6)

1. Provision production **Gnosis Safe** (`FTDF_MULTISIG_ADDRESS` on Base / Gnosis / Ethereum) and **Squads v4 Multisig** (Solana Mainnet-Beta).
2. Deploy audited EVM contracts with mandatory multisig handover and canonical USDC:
   ```bash
   FTDF_MULTISIG_ADDRESS=0x... USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
     node contracts/scripts/deploy-live-evm.js --network base --with-3tier-union
   ```
3. Deploy audited Solana programs to `mainnet-beta` and set upgrade authority to the FTDF Squads Multisig (or `--final`).
4. Flip `FTDP_SEED_DEMO=false`, `FTDP_ENABLE_WORKERS=true`, and `FTDP_CORS_ORIGIN=https://fairtradedata.org` on `ftdp-node`, and update `VITE_FTDP_NODE_URL` + `VITE_FTDP_MARKET_ADDRESS` on Vercel.
