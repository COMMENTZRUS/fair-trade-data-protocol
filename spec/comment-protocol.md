# FTDP Comment Protocol v1 Specification

## 1. Role in the 3-Tier FTDP Stack

```text
Layer 2 (Vertical Apps)         Top News              RateMyVideo
                                    \                      /
Layer 1 (Apps & Protocols)   Panorama    Streamy    Comment Protocol (Open Social / Karma)
                                 \          |          /
Layer 0 (Open Base Layer)     FTDP (SLS + MultiSplitter Data Unions) + Source Network (defradb.rs)
```

**Comment Protocol** is an open, reusable social, discussion, rating, and portable karma layer built directly on top of **FTDP** and **Source Network (`defradb.rs`)**. Any app—including **Top News**, **RateMyVideo**, **Streamy**, **Panorama**, or third-party builders—can read and write interoperable comments, star ratings, and votes without re-implementing consent, P2P sync, or revenue distribution.

## 2. Universal `targetUri` Addressing

Every comment, rating, or vote binds to a canonical `targetUri`:

| App / Source | Canonical `targetUri` Pattern | Example |
| :--- | :--- | :--- |
| **Top News** | `news://<sha256-or-slug>` | `news://ftdp-launch-2026` |
| **Streamy** | `streamy://<video-cid>` | `streamy://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi` |
| **RateMyVideo** | `streamy://<video-cid>` or `video://<hash>` | Cross-links directly onto Streamy media IDs |
| **Panorama** | `panorama://<item-id>` | `panorama://brief-0042` |

## 3. Canonical `dataId` Identifiers & Record Types

All Comment Protocol events are standard consent-segregated FTDP `FtdpAnonRecord` documents with:
- `dataId = keccak256("ftdp:comment:v1")` — Threaded text comments (`targetUri`, `parentId?`, `body`).
- `dataId = keccak256("ftdp:rating:v1")` — Structured ratings & reviews (`targetUri`, `score`, `maxScore`, `review?`).
- `dataId = keccak256("ftdp:vote:v1")` — Upvotes / downvotes (`targetUri`, `direction: 1 | -1`).

Required consent bitmask for shared Karma & Social Data Unions:
- Bit 4 (`KARMA_REPUTATION = 16`): User opts into portable cross-app karma & Comment Protocol Data Union rewards.

## 4. 3-Tier Cascading Revenue Flow (`AutoPullSplitter`)

```text
Tier-1: FTDP Media & Social Root Data Union (Market.sol Beneficiary)
 ├── FTDF Protocol Treasury (e.g. 5%)
 ├── Panorama Sub-Splitter (e.g. 35%)
 ├── Streamy Sub-Splitter (e.g. 30%)
 └── Tier-2: Comment Protocol AutoPull Sub-Splitter (e.g. 30%)
      ├── Tier-3: Top News AutoPull Sub-Splitter -> Top News Op + Commenters / Curators
      └── Tier-3: RateMyVideo AutoPull Sub-Splitter -> RateMyVideo Op + Raters / Reviewers
```

Because `AutoPullSplitter._withdraw()` pulls on-demand from its upstream splitter, a Tier-3 contributor calling `withdrawAll()` pulls recursively from `Tier-1 → Tier-2 → Tier-3 → User` in **one single atomic transaction**.
