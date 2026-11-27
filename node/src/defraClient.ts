import { FtdpRecord } from "@ftdp/sdk";

export interface DefraClientOptions {
  baseUrl: string;
  identityToken?: string;
  fetchImpl?: typeof fetch;
}

export interface DefraAnonRow {
  _docID: string;
  _cid?: string;
  recordId: string;
  deploymentId: string;
  uidHash: string;
  dataId?: string;
  schemaVersion: string;
  timestamp: number;
  source?: string;
  flags: string;
  anonJson: string;
}

export interface DefraPiiVaultInput {
  recordId: string;
  deploymentId: string;
  uidHash: string;
  piiCiphertext: string;
  kmsKeyVersion: string;
  timestamp: number;
}

export class DefraClient {
  private readonly baseUrl: string;
  private readonly identityToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DefraClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.identityToken = options.identityToken;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  private headers(actorToken?: string): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const token = actorToken ?? this.identityToken;
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/health-check`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>, actorToken?: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v0/graphql`, {
      method: "POST",
      headers: this.headers(actorToken),
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: Array<{ message: string }> };
    if (!res.ok || (json.errors && json.errors.length > 0)) {
      const errMsg = json.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
      throw new Error(`DefraDB GraphQL error: ${errMsg}`);
    }
    return ((json.data !== undefined ? json.data : json) as unknown) as T;
  }

  async createAnonRecord(record: FtdpRecord): Promise<{ docId: string; cid?: string }> {
    const mutation = `
      mutation CreateAnon($input: [FtdpAnonRecordMutationInputArg!]) {
        create_FtdpAnonRecord(input: $input) {
          _docID
          recordId
        }
      }
    `;
    const data = await this.graphql<
      Record<string, Array<{ _docID?: string; _cid?: string; recordId?: string }> | { _docID?: string; _cid?: string; recordId?: string }>
    >(mutation, {
      input: [
        {
          recordId: record.meta.recordId,
          deploymentId: record.meta.deploymentId,
          uidHash: record.meta.uidHash,
          dataId: record.meta.dataId || "",
          schemaVersion: record.meta.schemaVersion,
          timestamp: record.meta.timestamp,
          source: record.meta.source || "serverApi",
          flags: record.flags,
          anonJson: JSON.stringify(record.anon),
        },
      ],
    });
    const raw = data?.create_FtdpAnonRecord ?? Object.values(data || {})[0];
    const created = Array.isArray(raw) ? raw[0] : raw;
    if (!created?._docID) {
      throw new Error(`DefraDB did not return _docID for FtdpAnonRecord (got: ${JSON.stringify(data)})`);
    }
    return { docId: created._docID, cid: created._cid };
  }

  async queryAnonRecords(
    filter: { deploymentId: string; dataId?: string; sinceTimestamp?: number },
    actorToken?: string
  ): Promise<DefraAnonRow[]> {
    const query = `
      query QueryAnon($deploymentId: String!) {
        FtdpAnonRecord(filter: { deploymentId: { _eq: $deploymentId } }) {
          _docID
          recordId
          deploymentId
          uidHash
          dataId
          schemaVersion
          timestamp
          source
          flags
          anonJson
        }
      }
    `;
    const data = await this.graphql<{ FtdpAnonRecord: DefraAnonRow[] }>(
      query,
      { deploymentId: filter.deploymentId },
      actorToken
    );
    const rows = data.FtdpAnonRecord || [];
    return rows.filter((row) => {
      if (filter.dataId && row.dataId && row.dataId.toLowerCase() !== filter.dataId.toLowerCase()) return false;
      if (filter.sinceTimestamp !== undefined && row.timestamp < filter.sinceTimestamp) return false;
      return true;
    });
  }

  async createPiiVaultRecord(input: DefraPiiVaultInput): Promise<{ docId: string }> {
    const mutation = `
      mutation CreatePii($input: [FtdpPiiVaultMutationInputArg!]) {
        create_FtdpPiiVault(input: $input) {
          _docID
          recordId
        }
      }
    `;
    const data = await this.graphql<
      Record<string, Array<{ _docID?: string }> | { _docID?: string }>
    >(mutation, { input: [input] });
    const raw = data?.create_FtdpPiiVault ?? Object.values(data || {})[0];
    const created = Array.isArray(raw) ? raw[0] : raw;
    if (!created?._docID) {
      throw new Error(`DefraDB did not return _docID for FtdpPiiVault (got: ${JSON.stringify(data)})`);
    }
    return { docId: created._docID };
  }

  async queryPiiVault(deploymentId: string, actorToken?: string): Promise<Array<{ _docID: string; recordId: string; piiCiphertext: string }>> {
    const query = `
      query QueryPii($deploymentId: String!) {
        FtdpPiiVault(filter: { deploymentId: { _eq: $deploymentId } }) {
          _docID
          recordId
          piiCiphertext
        }
      }
    `;
    const data = await this.graphql<{
      FtdpPiiVault: Array<{ _docID: string; recordId: string; piiCiphertext: string }>;
    }>(query, { deploymentId }, actorToken);
    return data.FtdpPiiVault || [];
  }

  async upsertConsentState(input: {
    deploymentId: string;
    uidHash: string;
    flags: string;
    updatedAt: number;
  }): Promise<void> {
    const mutation = `
      mutation UpsertConsent($input: [FtdpConsentStateMutationInputArg!]) {
        create_FtdpConsentState(input: $input) {
          _docID
        }
      }
    `;
    await this.graphql(mutation, { input: [input] });
  }

  async addDocumentRelation(params: {
    collection: string;
    docId: string;
    relation: string;
    actorDid: string;
  }): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v0/acp/document/relationship`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`DefraDB ACP addDocumentRelation failed (HTTP ${res.status})`);
  }

  async deleteDocumentRelation(params: {
    collection: string;
    docId: string;
    relation: string;
    actorDid: string;
  }): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v0/acp/document/relationship`, {
      method: "DELETE",
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`DefraDB ACP deleteDocumentRelation failed (HTTP ${res.status})`);
  }

  async addP2pReplicator(params: { collection: string; peerMultiaddr: string }): Promise<void> {
    if (params.collection === "FtdpPiiVault") {
      throw new Error("SECURITY VIOLATION: FtdpPiiVault MUST NEVER be replicated to external P2P peers");
    }
    const res = await this.fetchImpl(`${this.baseUrl}/api/v0/p2p/replicators`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`DefraDB addP2pReplicator failed (HTTP ${res.status})`);
  }

  async removeP2pReplicator(params: { collection: string; peerMultiaddr: string }): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v0/p2p/replicators`, {
      method: "DELETE",
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`DefraDB removeP2pReplicator failed (HTTP ${res.status})`);
  }
}
