import fs from "fs";
import path from "path";
import { DataUnionRecord, DeploymentConfig, FtdpRecord, MarketOfferSummary } from "@ftdp/sdk";

export interface OrganizationRecord {
  id: string;
  name: string;
  adminAddress: string;
  createdAt: number;
}

export interface StoredAnonRecord {
  meta: FtdpRecord["meta"];
  flags: string;
  anon: Record<string, unknown>;
}

export interface StoredPiiRecord {
  recordId: string;
  deploymentId: string;
  uidHash: string;
  pii: Record<string, unknown>;
  storedAt: number;
}

export interface NodeSnapshot {
  organizations: Record<string, OrganizationRecord>;
  deployments: Record<string, DeploymentConfig>;
  unions: Record<string, DataUnionRecord>;
  /** deploymentId => (uidHash => latest consent flags bitmask string) */
  userFlags: Record<string, Record<string, string>>;
  /** deploymentId => StoredAnonRecord[] */
  anonRecords: Record<string, StoredAnonRecord[]>;
  /** marketAddress (lowercase) => MarketOfferSummary[] */
  marketOffers: Record<string, MarketOfferSummary[]>;
}

export interface PiiSnapshot {
  /** deploymentId => StoredPiiRecord[] (physically segregated from anonRecords) */
  piiRecords: Record<string, StoredPiiRecord[]>;
}

export class FtdpStore {
  public state: NodeSnapshot;
  public piiVault: PiiSnapshot;
  private readonly dataDir?: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir;
    this.state = {
      organizations: {},
      deployments: {},
      unions: {},
      userFlags: {},
      anonRecords: {},
      marketOffers: {},
    };
    this.piiVault = { piiRecords: {} };
    if (this.dataDir) {
      this.loadFromDisk();
    }
  }

  private get statePath(): string {
    return path.join(this.dataDir!, "ftdp-state.json");
  }

  private get piiPath(): string {
    return path.join(this.dataDir!, "ftdp-pii-vault.json");
  }

  private loadFromDisk() {
    fs.mkdirSync(this.dataDir!, { recursive: true });
    if (fs.existsSync(this.statePath)) {
      this.state = JSON.parse(fs.readFileSync(this.statePath, "utf8")) as NodeSnapshot;
    }
    if (fs.existsSync(this.piiPath)) {
      this.piiVault = JSON.parse(fs.readFileSync(this.piiPath, "utf8")) as PiiSnapshot;
    }
  }

  persist() {
    if (!this.dataDir) return;
    fs.mkdirSync(this.dataDir, { recursive: true });
    // Atomic write via temp file + rename
    const tmpState = `${this.statePath}.tmp`;
    fs.writeFileSync(tmpState, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tmpState, this.statePath);

    const tmpPii = `${this.piiPath}.tmp`;
    fs.writeFileSync(tmpPii, JSON.stringify(this.piiVault, null, 2), "utf8");
    fs.renameSync(tmpPii, this.piiPath);
  }

  addRecord(deploymentId: string, record: FtdpRecord) {
    if (!this.state.anonRecords[deploymentId]) this.state.anonRecords[deploymentId] = [];
    if (!this.state.userFlags[deploymentId]) this.state.userFlags[deploymentId] = {};

    this.state.anonRecords[deploymentId].push({
      meta: record.meta,
      flags: record.flags,
      anon: record.anon,
    });
    this.state.userFlags[deploymentId][record.meta.uidHash.toLowerCase()] = record.flags;

    if (record.pii && Object.keys(record.pii).length > 0) {
      if (!this.piiVault.piiRecords[deploymentId]) this.piiVault.piiRecords[deploymentId] = [];
      this.piiVault.piiRecords[deploymentId].push({
        recordId: record.meta.recordId,
        deploymentId,
        uidHash: record.meta.uidHash,
        pii: record.pii,
        storedAt: Math.floor(Date.now() / 1000),
      });
    }
    this.persist();
  }
}
