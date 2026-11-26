import { DefraClient } from "./defraClient";

export interface TrackedAcpGrant {
  grantKey: string;
  grantorDeploymentId: string;
  granteeDeploymentId: string;
  buyerDid: string;
  docIds: string[];
  peerMultiaddr?: string;
  expires: number; // Unix timestamp (seconds)
}

export interface ReapSummary {
  checkedAt: number;
  revokedGrants: number;
  revokedRelations: number;
  droppedReplicators: number;
}

/**
 * Local Zanzibar ACP does not auto-expire relationships on Unix timestamps.
 * `GrantExpirationReaper` tracks active `AccessPermissions` grants synced to `defradb.rs`
 * and automatically revokes `licensed_reader` relations + drops P2P peer replication
 * once `grant.expires <= now`.
 */
export class GrantExpirationReaper {
  private readonly grants = new Map<string, TrackedAcpGrant>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly defra?: DefraClient) {}

  async activateGrant(grant: Omit<TrackedAcpGrant, "grantKey">): Promise<TrackedAcpGrant> {
    const grantKey = `${grant.grantorDeploymentId.toLowerCase()}:${grant.granteeDeploymentId.toLowerCase()}:${grant.buyerDid}`;
    const full: TrackedAcpGrant = { ...grant, grantKey };

    if (this.defra) {
      for (const docId of full.docIds) {
        await this.defra.addDocumentRelation({
          collection: "FtdpAnonRecord",
          docId,
          relation: "licensed_reader",
          actorDid: full.buyerDid,
        });
      }
      if (full.peerMultiaddr) {
        await this.defra.addP2pReplicator({
          collection: "FtdpAnonRecord",
          peerMultiaddr: full.peerMultiaddr,
        });
      }
    }

    this.grants.set(grantKey, full);
    return full;
  }

  getActiveGrants(): TrackedAcpGrant[] {
    return Array.from(this.grants.values());
  }

  async reapExpiredGrants(nowSec = Math.floor(Date.now() / 1000)): Promise<ReapSummary> {
    let revokedGrants = 0;
    let revokedRelations = 0;
    let droppedReplicators = 0;

    for (const [key, grant] of Array.from(this.grants.entries())) {
      if (grant.expires > nowSec) continue;

      if (this.defra) {
        for (const docId of grant.docIds) {
          await this.defra.deleteDocumentRelation({
            collection: "FtdpAnonRecord",
            docId,
            relation: "licensed_reader",
            actorDid: grant.buyerDid,
          });
          revokedRelations += 1;
        }
        if (grant.peerMultiaddr) {
          await this.defra.removeP2pReplicator({
            collection: "FtdpAnonRecord",
            peerMultiaddr: grant.peerMultiaddr,
          });
          droppedReplicators += 1;
        }
      } else {
        revokedRelations += grant.docIds.length;
        if (grant.peerMultiaddr) droppedReplicators += 1;
      }

      this.grants.delete(key);
      revokedGrants += 1;
    }

    return { checkedAt: nowSec, revokedGrants, revokedRelations, droppedReplicators };
  }

  startInterval(intervalMs = 60_000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.reapExpiredGrants().catch((err) => {
        console.error(JSON.stringify({ level: "error", msg: "reaper sweep failed", error: String(err) }));
      });
    }, intervalMs);
    this.timer.unref();
  }

  stopInterval() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
