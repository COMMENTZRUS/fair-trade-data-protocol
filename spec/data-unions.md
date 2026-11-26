# FTDP v1 Data Unions (Constant-Time MultiSplitters)

## 1. Core Concept

A **Data Union** pools consented data streams from one or more Deployments (e.g., Panorama + Top News + third-party sites) and distributes all licensing/marketplace revenue proportionally across contributors in **$O(1)$ gas** using Constant-Time Splitting (CTS).

For any shareholder $i$ and supported token $T$:

$$a_i(t_{\text{now}}) = a_i(t_{\text{SC}}) + s_i(t_{\text{SC}}) \cdot \left(\text{RPS}_T(t_{\text{now}}) - \text{RPS}_T(t_{\text{SC}})\right)$$

- Revenue received at time $t$ is credited strictly to shareholders holding shares at time $t$.
- Adding new contributors or changing shares never iterates over existing shareholders.
- Contributors pull accrued tokens on demand (`withdraw` / `withdrawAll`) or designate a payout address gaslessly via EIP-712 `setBeneficiaryMeta`.

## 2. Cascading Tier-1 / Tier-2 Architecture

Data Unions compose via `AutoPullSplitter`:

```text
FTDP Market.purchase() / Direct Buyer Payment (USDC, FTD, Native)
 └── Tier-1: Root Data Union Splitter (e.g. "News & Curation Data Union")
      ├── FTDF Protocol Treasury (e.g. 5% shares)
      ├── Tier-2: Panorama Sub-Splitter (AutoPull, e.g. 55% shares)
      │    ├── Panorama Operator Share (e.g. 30%)
      │    └── Opted-In Panorama Users & Mobile Nodes (70%, weighted by verified contribution)
      └── Tier-2: Top News Sub-Splitter (AutoPull, e.g. 40% shares)
           ├── Top News Publisher Share (e.g. 30%)
           └── Opted-In Readers & Curators (70%, weighted by verified contribution)
```

When a Tier-2 shareholder withdraws or when Tier-2 shares change, `AutoPullSplitter` automatically pulls accrued revenue from the Tier-1 Root Union before updating `RPS` or transferring funds.

## 3. Union Governance Variants

| Variant | Contract | Shares | Best For |
| :--- | :--- | :--- | :--- |
| **Contribution-Weighted** | `AdminControlledSplitter` | Non-transferable, updated via `setSharesMulti` or EIP-712 `setSharesMultiMeta` | Panorama / Top News / Mobile Node merit-weighted rewards |
| **Tokenized** | `ERC20SharesSplitter` + `DynamicSplitterShare` | Transferable ERC-20 (`ERC20Permit`), optional role-gated mint/burn | Liquid contributor share pools & partner syndicates |
| **DAO-Governed** | `ERC20SharesSplitter` + `VotesSplitterShare` | Transferable `ERC20Votes` (OpenZeppelin Governor compatible) | Community-governed Data Unions & Web3 discussion boards |

## 4. Market Integration

When a Data Union lists an offer on `Market.sol`:
1. The offer's `beneficiary` is set to the **Tier-1 Data Union Splitter** address.
2. When a buyer calls `Market.purchase(offerIds, recipientDeploymentId, duration)`:
   - Payment (`USDC`, `FTD`, or native token) transfers directly to the Tier-1 Data Union Splitter.
   - `Market` calls `AccessPermissions.setPermissionsAdmin(...)` to grant read access for the purchased `duration` and `requiredFlags`.
   - Every downstream sub-splitter and contributor immediately sees their increased `availableAllotment` with zero additional transactions.
