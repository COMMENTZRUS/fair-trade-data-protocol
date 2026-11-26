# FTDP Smart Contract & Off-Chain Security Audit Brief

This document prepares the **Fair Trade Data Protocol (`fair-trade-data-protocol`)** codebase for independent external security auditing prior to mainnet fund deployment.

## 1. Scope & Contract Inventory (MIT Licensed)

### EVM Contracts (`contracts/contracts/` — Solidity `^0.8.24`, compiled with `solc 0.8.26`, `viaIR: true`)
1. **Constant-Time MultiSplitter Data Unions (`splitter/`)**:
   - `AbstractSplitter.sol`, `AutoPullSplitter.sol`, `AdminControlledSplitter.sol`, `ERC20SharesSplitter.sol`, `Beneficiary.sol`, `SplitterShare.sol`, `DynamicSplitterShare.sol`, `VotesSplitterShare.sol`
2. **Storage Layer Security & Marketplace (`sls/` & Root)**:
   - `ClientConfigManager.sol`, `AccessPermissions.sol`, `Market.sol`, `DataUnionFactory.sol`
3. **Modular v2 Ecosystem Contracts (`v2/`)**:
   - `FtdToken.sol`, `FtdAccessStaking.sol`, `DataUnionGovernor.sol`, `ComputeToDataEscrow.sol`

### Standalone Solana Anchor Programs (`contracts-solana/`)
1. `contracts-solana/admin-union/` — Admin-controlled O(1) SOL splitter (Anchor 0.30.1), upgraded to checked **`u128` fixed-point `RPS_PRECISION = 1e18`**, rent-exempt reserve guard, and `mut` `sol_token_stats` fix.
2. `contracts-solana/spl-union/` — Token-2022 Transfer-Hook multi-token SPL splitter (Anchor 0.32.1), upgraded to checked **`u128` fixed-point `RPS_PRECISION = 1e18`** with SPL ATA mint/owner verification in both `withdraw.rs` and `transfer_hook.rs`.

## 2. Core Security Invariants to Verify

1. **MultiSplitter Solvency**: For every supported token $T$ and every sequence of deposits, share updates, ERC-20 share transfers, and cascading `AutoPullSplitter` withdrawals:
   $$\sum_{i} \text{totalAllotment}(i, T) \le \text{totalReceived}(T)$$
   and no new shareholder can dilute revenue received before their shares were issued.
2. **Recursive AutoPull Atomicity**: Across up to 3 cascading tiers (`Root Union → Tier-2 Union → Tier-3 App Sub-Splitter`), `withdrawAll` pulls upstream funds on demand while preserving `totalReceived` invariance and blocking reentrancy via `ReentrancyGuard`.
3. **EIP-712 Meta-Transaction Safety**: `setSharesMultiMeta`, `setBeneficiaryMeta`, and `ClientConfigManager.setKeyMeta` enforce nonces, deadlines, clone-unique domain separators (`verifyingContract`), and reject replays.
4. **Consent Soundness**: `AccessPermissions.canRead()` returns `true` **only** when the grantee key holds an unexpired `ROLE_READ`, an unexpired grant exists, `(merkleFlags & requiredFlags) == requiredFlags`, and the OpenZeppelin sorted-pair Keccak256 Merkle proof matches `optInMerkleRoots[grantorDeploymentId]`.
5. **Compute-to-Data Escrow Solvency**: Escrowed buyer funds can only transition `OPEN → COMPLETED` (paid to `job.beneficiary` by an authorized worker/admin) or `OPEN → REFUNDED` (reclaimed by `job.buyer` strictly at or after `job.deadline`).
6. **Off-Chain PII Isolation (`node/`)**: PII is AES-256-GCM encrypted per `(deploymentId, kmsKeyVersion)` with `deploymentId` AAD, isolated in `FtdpPiiVault`, hard-blocked from DefraDB P2P replication, and stripped from all `anon` and Compute-to-Data responses.

## 3. Reproducing Verification Locally

```bash
npm run verify:all
```
