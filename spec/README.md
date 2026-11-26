# FTDP v1 Protocol Specification

## 1. Purpose & Design Boundary

The **Fair Trade Data Protocol (FTDP)** breaks out the shared consent, access-control, marketplace, and revenue-distribution base layer from proprietary consumer applications (such as **Panorama** and **Top News**).

### Naming Alignment
- **Fair Trade Data Protocol (FTDP)**: The umbrella open-source protocol, developer SDK, Data Union standard, and Foundation governance (`fairtradedata.org`).
- **Storage Layer Security (SLS)**: The technical data-protection and access-control subsystem within FTDP (`ClientConfigManager`, `AccessPermissions`, consent-segregated records, and opt-in Merkle verification).
- **Data Unions**: On-chain Constant-Time MultiSplitter contracts that pool multiple Deployments and split marketplace/ad/AI licensing revenue in $O(1)$ gas across protocol, app operators, and opted-in users.

### Open-Source vs. Proprietary Separation
- **Open Source (FTDP)**: Record schemas, Merkle opt-in verification, EVM/Solana smart contracts, reference node APIs, and SDKs.
- **Proprietary (Panorama, Top News, Third-Party Apps)**: UI/UX, content indexing, ranking algorithms, AI pipelines, and direct user relationships. Every app integrates as one or more FTDP **Deployments**.

## 2. Specification Documents
- [Data Model & Consent Verification](./data-model.md)
- [Data Unions & Constant-Time MultiSplitters](./data-unions.md)
- [Record JSON Schema](./schemas/record.schema.json)
