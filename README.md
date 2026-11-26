# Fair Trade Data Protocol (FTDP)

An open-source, consent-first data exchange and **Data Union** protocol uniting:

- **Fair Trade Data Foundation (FTDF) Vision** (`fairtradedata.org`): Community-owned data unions, explicit consent provenance, and automated producer rewards.
- **Storage Layer Security (SLS)**: Consent-segregated user records (`anon`, `pii`, `flags`, `meta`), Merkle-verified opt-in flags, and on-chain `ClientConfigManager`, `AccessPermissions`, and `Market` contracts.
- **Constant-Time MultiSplitter Data Unions**: $O(1)$ gas revenue splitting for unlimited shareholders, cascading Tier-1/Tier-2 sub-splitters (`AutoPullSplitter`), gasless EIP-712 beneficiary & batch share updates, and DAO-governed share tokens (`VotesSplitterShare`).

Private applications (such as **Panorama** and **Top News**) and third-party sites/mobile nodes connect to FTDP strictly as registered **Deployments**, keeping app IP proprietary while participating in open, verifiable Data Unions.

## Monorepo Architecture

```text
fair-trade-data-protocol/
├── .github/workflows/ci.yml   # Full CI pipeline (Contracts, SDK, Node, Cross-Stack E2E, Portal)
├── docker-compose.yml         # Self-hosted stack: ftdp-node + unified FTDP Portal
├── LICENSE-NOTICE.md          # Open-source licensing & Dingbat Soy LLC relicensing checklist
├── docs/
│   └── PRODUCTION-READINESS.md# Security audit checklist, multisig deploy & Panorama onboarding runbook
├── spec/                      # FTDP v1 Protocol Specification & JSON Record Schema
├── contracts/                 # Hardened EVM MultiSplitter Data Unions, SLS Access/Market & Factory
├── contracts-solana/          # Solana Anchor Admin & Token-2022 Transfer-Hook Data Unions
├── sdk/                       # @ftdp/sdk TypeScript library + embeddable browser snippet
├── node/                      # @ftdp/node self-hostable reference server (Ingest, Merkle, Access Gate, Metering)
├── apps/portal/               # Unified fairtradedata.org Landing, SLS Dash, Data Union Claims & Market UI
└── scripts/
    └── test-cross-stack.js    # Full SDK -> ftdp-node -> Solidity EVM cross-stack integration test
```

## Verify Everything Locally

```bash
# Runs: solc-js + EVM contract tests (6), @ftdp/sdk build+tests (2),
# @ftdp/node build+tests (1), Cross-Stack SDK->Node->Solidity EVM test (1),
# and FTDP Portal TypeScript verification
npm run verify:all
```

## Run the Self-Hosted Stack (Docker)

```bash
docker compose up --build
# FTDP Node API:  http://localhost:4000/health
# FTDP Portal UI: http://localhost:3000
```
