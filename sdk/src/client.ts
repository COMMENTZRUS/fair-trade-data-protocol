import { DataUnionRecord, DeploymentConfig, FtdpRecord, MarketOfferSummary, MeteringResult } from "./types";
import { hashUserId } from "./merkle";

export interface FtdpClientOptions {
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
}

export class FtdpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private apiKey?: string;
  private bearerToken?: string;

  constructor(options: FtdpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.bearerToken = options.bearerToken;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  setBearerToken(token: string) {
    this.bearerToken = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) headers["x-ftdp-api-key"] = this.apiKey;
    if (this.bearerToken) headers["Authorization"] = `Bearer ${this.bearerToken}`;

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`FTDP API ${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
    }
    return data as T;
  }

  health() {
    return this.request<{ status: string; version: string }>("GET", "/health");
  }

  createDeployment(payload: {
    id: string;
    organizationId: string;
    name: string;
    adminAddress: string;
    flags?: Array<{ bit: number; name: string; description: string }>;
  }) {
    return this.request<{ data: DeploymentConfig }>("POST", "/api/v1/deployments", payload);
  }

  listDeployments() {
    return this.request<{ data: DeploymentConfig[] }>("GET", "/api/v1/deployments");
  }

  ingestRecord(deploymentId: string, record: FtdpRecord) {
    return this.request<{ accepted: boolean; recordId: string; merkleRoot: string }>(
      "POST",
      `/api/v1/deployments/${encodeURIComponent(deploymentId)}/records`,
      record
    );
  }

  /**
   * Convenience helper for apps (Panorama, Top News) to emit a consent-segregated event.
   */
  trackEvent(params: {
    deploymentId: string;
    namespace: string;
    userId: string;
    flags: bigint;
    anon: Record<string, unknown>;
    pii?: Record<string, unknown>;
    dataId?: string;
    contributorWallet?: string;
    contributorSolanaWallet?: string;
  }) {
    const uidHash = hashUserId(params.namespace, params.userId);
    const record: FtdpRecord = {
      meta: {
        recordId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        deploymentId: params.deploymentId,
        uidHash,
        dataId: params.dataId,
        schemaVersion: "1.0.0",
        timestamp: Math.floor(Date.now() / 1000),
        source: "serverApi",
      },
      flags: params.flags.toString(),
      anon: {
        ...params.anon,
        ...(params.contributorWallet ? { contributorWallet: params.contributorWallet } : {}),
        ...(params.contributorSolanaWallet ? { contributorSolanaWallet: params.contributorSolanaWallet } : {}),
      },
      ...(params.pii ? { pii: params.pii } : {}),
    };
    return this.ingestRecord(params.deploymentId, record);
  }

  getMerkleRoot(deploymentId: string) {
    return this.request<{ deploymentId: string; merkleRoot: string; leafCount: number }>(
      "GET",
      `/api/v1/deployments/${encodeURIComponent(deploymentId)}/merkle/root`
    );
  }

  getMerkleProof(deploymentId: string, uidHash: string) {
    return this.request<{
      deploymentId: string;
      uidHash: string;
      flags: string;
      leaf: string;
      merkleRoot: string;
      proof: string[];
    }>("GET", `/api/v1/deployments/${encodeURIComponent(deploymentId)}/merkle/proof/${encodeURIComponent(uidHash)}`);
  }

  readConsentedRecords(
    deploymentId: string,
    params: { granteeAddress: string; dataId?: string; requiredFlags?: string }
  ) {
    return this.request<{
      deploymentId: string;
      merkleRoot: string;
      records: Array<{ meta: FtdpRecord["meta"]; flags: string; anon: Record<string, unknown>; proof: string[] }>;
    }>("POST", `/api/v1/deployments/${encodeURIComponent(deploymentId)}/records/read`, params);
  }

  createDataUnion(payload: {
    id: string;
    name: string;
    splitterAddress?: string;
    sharesTokenAddress?: string;
    upstreamSplitterAddress?: string;
    chainMode?: DataUnionRecord["chainMode"];
    evm?: DataUnionRecord["evm"];
    solana?: DataUnionRecord["solana"];
    kind: DataUnionRecord["kind"];
    deploymentIds: string[];
  }) {
    return this.request<{ data: DataUnionRecord }>("POST", "/api/v1/unions", payload);
  }

  listDataUnions() {
    return this.request<{ data: DataUnionRecord[] }>("GET", "/api/v1/unions");
  }

  meterDataUnion(unionId: string, requiredFlags = "0") {
    return this.request<MeteringResult>(
      "POST",
      `/api/v1/unions/${encodeURIComponent(unionId)}/meter`,
      { requiredFlags }
    );
  }

  listMarketOffers(marketAddress: string) {
    return this.request<{ data: MarketOfferSummary[] }>(
      "GET",
      `/market_public/${encodeURIComponent(marketAddress)}/offers`
    );
  }
}
