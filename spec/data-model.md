# FTDP v1 Data Model & Consent Verification

## 1. Entity Hierarchy

```text
Organization (e.g. Panorama Inc., Top News Publisher, Community DAO)
 └── Deployment (bytes32 deploymentId — e.g. panorama-web, top-news-ios)
      ├── Authorized Keys & Roles (ClientConfigManager: ADMIN, GRANT, READ, WRITE, SUPERUSER)
      ├── Opt-In Flags (uint256 bitmask defining granular user consent options)
      ├── Segregated User Records (anon, pii, flags, meta)
      └── Data Union Membership (linked to one or more Tier-1 Data Union MultiSplitters)
```

## 2. Consent-Segregated Records (`anon`, `pii`, `flags`, `meta`)

Every record ingested through the FTDP Stream/Ingestion API MUST separate fields into four top-level compartments (see [`schemas/record.schema.json`](./schemas/record.schema.json)):

1. **`anon`**: De-identified behavioral, engagement, curation, voting, or karma payload safe for aggregate licensing once consent flags match.
2. **`pii`**: Personally identifiable fields (email, handle, device/IP metadata), stored separately and never served to `anon`-only grants.
3. **`flags`**: `uint256` bitmask of user-granted consent flags active at record creation (e.g., bit 0 = Analytics, bit 1 = News Curation Data Union, bit 2 = AI Training Licensing, bit 3 = Ad Personalization).
4. **`meta`**: Record provenance (`recordId`, `deploymentId`, `uidHash`, `schemaVersion`, `timestamp`, `source`).

## 3. On-Chain Opt-In Merkle Proofs

To let off-chain Access Servers and third-party verifiers prove user consent without putting raw user records on-chain:

1. Each Deployment periodically builds a Merkle tree of active user consent states:
   ```text
   leaf = keccak256(abi.encodePacked(uidHash, optInFlagsBitmask))
   ```
2. A key holding `ROLE_ADMIN` or `ROLE_WRITE` commits the root via `AccessPermissions.setOptInMerkleRoot(deploymentId, merkleRoot)`.
3. When a buyer or Access Server checks read authorization for a user record, it calls:
   ```solidity
   AccessPermissions.canRead(
       granteeKey,
       grantorDeploymentId,
       uidHash,
       dataId,
       merkleFlags,
       merkleProof
   )
   ```
4. `canRead` succeeds **if and only if**:
   - `granteeKey` holds `ROLE_READ` on a `granteeDeploymentId` in `ClientConfigManager` (and key is unexpired).
   - An active, unexpired grant exists for `(grantorDeploymentId, granteeDeploymentId, dataId)` (or wildcard `dataId = bytes32(0)`).
   - `(merkleFlags & grant.requiredFlags) == grant.requiredFlags`.
   - `MerkleProof.verify(merkleProof, optInMerkleRoot[grantorDeploymentId], leaf)` returns `true`.
