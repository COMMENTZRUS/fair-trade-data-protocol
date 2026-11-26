import crypto from "crypto";
import fs from "fs";
import path from "path";
import http, { IncomingMessage, ServerResponse } from "http";
import { ethers } from "ethers";
import {
  ACCESS_PERMISSIONS_ABI,
  ConsentMerkleTree,
  DataUnionRecord,
  DeploymentConfig,
  FtdpRecord,
  isValidSolanaPubkey,
  MarketOfferSummary,
  MeteringResult,
} from "@ftdp/sdk";
import { FtdpStore } from "./store";
import { validateFtdpRecord } from "./validation";
import { DefraClient } from "./defraClient";
import { PiiEnvelopeCrypto } from "./piiCrypto";
import { ChainBridge } from "./chainBridge";
import { GrantExpirationReaper } from "./reaper";
import {
  createDomainChallenge,
  isOriginAllowedForDeployment,
  normalizeDomain,
  TxtResolver,
  verifyDomainTxtRecord,
} from "./domains";

export type CanReadVerifier = (params: {
  grantee: string;
  grantorDeploymentId: string;
  uidHash: string;
  dataId: string;
  merkleFlags: bigint;
  merkleProof: string[];
}) => Promise<boolean>;

export interface FtdpServerOptions {
  store: FtdpStore;
  apiKey?: string;
  jwtSecret?: string;
  corsOrigin?: string;
  rpcUrl?: string;
  accessPermissionsAddress?: string;
  canReadVerifier?: CanReadVerifier;
  rateLimitPerMinute?: number;
  defraClient?: DefraClient;
  piiCrypto?: PiiEnvelopeCrypto;
  chainBridge?: ChainBridge;
  reaper?: GrantExpirationReaper;
  requireWriterSignature?: boolean;
  txtResolver?: TxtResolver;
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
  if (typeof decoded.exp === "number" && Date.now() / 1000 >= decoded.exp) return null;
  return decoded;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function createFtdpServer(options: FtdpServerOptions) {
  const store = options.store;
  const jwtSecret = options.jwtSecret || crypto.randomBytes(32).toString("hex");
  const corsOrigin = options.corsOrigin || "*";
  const rateLimitPerMinute = options.rateLimitPerMinute ?? 600;

  const nonces = new Map<string, { nonce: string; expiresAt: number }>();
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  const metrics = {
    startedAt: Math.floor(Date.now() / 1000),
    totalRequests: 0,
    ingestedRecords: 0,
    readsServed: 0,
    meteringRuns: 0,
  };

  // Optional live EVM verifier if RPC + AccessPermissions contract address are configured
  let rpcAccessContract: ethers.Contract | undefined;
  if (options.rpcUrl && options.accessPermissionsAddress) {
    const provider = new ethers.JsonRpcProvider(options.rpcUrl);
    rpcAccessContract = new ethers.Contract(options.accessPermissionsAddress, ACCESS_PERMISSIONS_ABI, provider);
  }

  const piiCrypto = options.piiCrypto ?? new PiiEnvelopeCrypto(process.env.FTDP_PII_MASTER_KEY);
  const defraClient = options.defraClient;
  const chainBridge = options.chainBridge;
  const reaper = options.reaper ?? new GrantExpirationReaper(defraClient);

  const verifyCanRead: CanReadVerifier =
    options.canReadVerifier ??
    (async (params) => {
      if (chainBridge) {
        return chainBridge.canRead(params);
      }
      if (!rpcAccessContract) {
        // Standalone / local node mode without chain RPC: verify Merkle root membership locally
        const tree = buildDeploymentTree(params.grantorDeploymentId);
        return ConsentMerkleTree.verify(params.merkleProof, tree.root, params.uidHash, params.merkleFlags);
      }
      return Boolean(
        await rpcAccessContract.canRead(
          params.grantee,
          params.grantorDeploymentId,
          params.uidHash,
          params.dataId,
          params.merkleFlags,
          params.merkleProof
        )
      );
    });

  function buildDeploymentTree(deploymentId: string): ConsentMerkleTree {
    const map = store.state.userFlags[deploymentId] || {};
    const entries = Object.entries(map).map(([uidHash, flags]) => ({
      uidHash,
      flags: BigInt(flags),
    }));
    return new ConsentMerkleTree(entries);
  }

  async function handleRequest(
    method: string,
    rawUrl: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
    remoteAddress: string
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    metrics.totalRequests += 1;

    const baseHeaders: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-ftdp-api-key",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    };

    const reply = (status: number, payload: unknown) => ({
      status,
      headers: baseHeaders,
      body: JSON.stringify(payload),
    });

    if (method === "OPTIONS") {
      return reply(204, {});
    }

    const now = Date.now();
    let bucket = rateBuckets.get(remoteAddress);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + 60_000 };
      rateBuckets.set(remoteAddress, bucket);
    }
    bucket.count += 1;
    if (bucket.count > rateLimitPerMinute) {
      return reply(429, { error: "Rate limit exceeded" });
    }

    const hostHeader = typeof headers.host === "string" ? headers.host : "localhost";
    const url = new URL(rawUrl || "/", `http://${hostHeader}`);
    const pathname = url.pathname;

    const requireKey = () => {
      if (!options.apiKey) return true;
      return headers["x-ftdp-api-key"] === options.apiKey;
    };

    const bearerWallet = (): string | null => {
      const auth = headers.authorization;
      if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return null;
      const payload = verifyJwt(auth.slice(7), jwtSecret);
      return typeof payload?.wallet === "string" ? payload.wallet : null;
    };

    const parseBody = (): unknown => {
      const trimmed = rawBody.trim();
      if (!trimmed) return {};
      try {
        return JSON.parse(trimmed);
      } catch {
        throw new Error("Invalid JSON body");
      }
    };

    try {
      // Health, readiness, metrics, and hosted browser snippet
      if (method === "GET" && pathname === "/sdk/ftdp-snippet.js") {
        const snippetCandidates = [
          path.resolve(__dirname, "..", "..", "sdk", "dist", "ftdp-snippet.js"),
          path.resolve(__dirname, "..", "node_modules", "@ftdp", "sdk", "dist", "ftdp-snippet.js"),
        ];
        for (const p of snippetCandidates) {
          if (fs.existsSync(p)) {
            return {
              status: 200,
              headers: {
                ...baseHeaders,
                "Content-Type": "application/javascript; charset=utf-8",
                "Cache-Control": "public, max-age=300",
              },
              body: fs.readFileSync(p, "utf8"),
            };
          }
        }
        return reply(404, { error: "ftdp-snippet.js not built yet" });
      }
      if (method === "GET" && pathname === "/health") {
        return reply(200, { status: "ok", service: "ftdp-node", version: "1.0.0" });
      }
      if (method === "GET" && pathname === "/ready") {
        return reply(200, { ready: true, deployments: Object.keys(store.state.deployments).length });
      }
      if (method === "GET" && pathname === "/metrics") {
        return reply(200, {
          ...metrics,
          organizations: Object.keys(store.state.organizations).length,
          deployments: Object.keys(store.state.deployments).length,
          unions: Object.keys(store.state.unions).length,
        });
      }

      // Organizations
      if (method === "GET" && pathname === "/api/v1/organizations") {
        return reply(200, { data: Object.values(store.state.organizations) });
      }
      if (method === "POST" && pathname === "/api/v1/organizations") {
        if (!requireKey()) return reply(401, { error: "Unauthorized" });
        const body = parseBody() as Record<string, unknown>;
        if (typeof body.id !== "string" || typeof body.name !== "string" || typeof body.adminAddress !== "string") {
          return reply(400, { error: "id, name, and adminAddress are required" });
        }
        const org = {
          id: body.id,
          name: body.name,
          adminAddress: body.adminAddress,
          createdAt: Math.floor(Date.now() / 1000),
        };
        store.state.organizations[org.id] = org;
        store.persist();
        return reply(201, { data: org });
      }

      // Deployments
      if (method === "GET" && pathname === "/api/v1/deployments") {
        return reply(200, { data: Object.values(store.state.deployments) });
      }
      if (method === "POST" && pathname === "/api/v1/deployments") {
        if (!requireKey()) return reply(401, { error: "Unauthorized" });
        const body = parseBody() as Record<string, unknown>;
        if (typeof body.id !== "string" || typeof body.organizationId !== "string" || typeof body.name !== "string") {
          return reply(400, { error: "id, organizationId, and name are required" });
        }
        const rawFlags = Array.isArray(body.flags) ? body.flags : [];
        const dep: DeploymentConfig = {
          id: body.id,
          organizationId: body.organizationId,
          name: body.name,
          adminAddress: typeof body.adminAddress === "string" ? body.adminAddress : ethers.ZeroAddress,
          flags: rawFlags.map((f: Record<string, unknown>) => ({
            bit: Number(f.bit),
            mask: (1n << BigInt(Number(f.bit))).toString(),
            name: String(f.name || ""),
            description: String(f.description || ""),
          })),
          createdAt: Math.floor(Date.now() / 1000),
        };
        store.state.deployments[dep.id] = dep;
        store.persist();
        return reply(201, { data: dep });
      }

      // Deployment Flags
      const flagsMatch = pathname.match(/^\/api\/v1\/deployments\/([^/]+)\/flags$/);
      if (flagsMatch) {
        const deploymentId = decodeURIComponent(flagsMatch[1]);
        const dep = store.state.deployments[deploymentId];
        if (!dep) return reply(404, { error: "Deployment not found" });
        if (method === "GET") {
          return reply(200, { deploymentId, flags: dep.flags });
        }
        if (method === "PUT") {
          if (!requireKey()) return reply(401, { error: "Unauthorized" });
          const body = parseBody() as { flags?: Array<{ bit: number; name: string; description: string }> };
          dep.flags = (body.flags || []).map((f) => ({
            bit: Number(f.bit),
            mask: (1n << BigInt(Number(f.bit))).toString(),
            name: String(f.name || ""),
            description: String(f.description || ""),
          }));
          store.persist();
          return reply(200, { deploymentId, flags: dep.flags });
        }
      }

      // Record Ingestion
      const ingestMatch = pathname.match(/^\/api\/v1\/deployments\/([^/]+)\/records$/);
      if (ingestMatch && method === "POST") {
        if (!requireKey()) return reply(401, { error: "Unauthorized" });
        const deploymentId = decodeURIComponent(ingestMatch[1]);
        const origin = typeof headers.origin === "string" ? headers.origin : undefined;
        const depDomains = store.state.domains?.[deploymentId] || [];
        if (!isOriginAllowedForDeployment(origin, depDomains)) {
          return reply(403, { error: `Origin ${origin} is not a verified domain for deployment ${deploymentId}` });
        }
        const body = parseBody();
        const validated = validateFtdpRecord(body, deploymentId);
        if (!validated.ok) return reply(400, { error: validated.error });

        store.addRecord(deploymentId, validated.record);
        metrics.ingestedRecords += 1;
        const tree = buildDeploymentTree(deploymentId);
        return reply(201, {
          accepted: true,
          recordId: validated.record.meta.recordId,
          merkleRoot: tree.root,
          leafCount: tree.leaves.length,
        });
      }

      // Merkle Root
      const merkleRootMatch = pathname.match(/^\/api\/v1\/deployments\/([^/]+)\/merkle\/root$/);
      if (merkleRootMatch && method === "GET") {
        const deploymentId = decodeURIComponent(merkleRootMatch[1]);
        const tree = buildDeploymentTree(deploymentId);
        return reply(200, { deploymentId, merkleRoot: tree.root, leafCount: tree.leaves.length });
      }

      // Merkle Proof
      const merkleProofMatch = pathname.match(/^\/api\/v1\/deployments\/([^/]+)\/merkle\/proof\/([^/]+)$/);
      if (merkleProofMatch && method === "GET") {
        const deploymentId = decodeURIComponent(merkleProofMatch[1]);
        const uidHash = decodeURIComponent(merkleProofMatch[2]);
        const tree = buildDeploymentTree(deploymentId);
        const proofData = tree.getProof(uidHash);
        if (!proofData) return reply(404, { error: "User consent leaf not found" });
        return reply(200, {
          deploymentId,
          uidHash,
          flags: proofData.flags.toString(),
          leaf: proofData.leaf,
          merkleRoot: tree.root,
          proof: proofData.proof,
        });
      }

      // Permissioned Access Gate (anon records ONLY; strictly strips PII and verifies consent + on-chain AccessPermissions)
      const readMatch = pathname.match(/^\/api\/v1\/deployments\/([^/]+)\/records\/read$/);
      if (readMatch && method === "POST") {
        const deploymentId = decodeURIComponent(readMatch[1]);
        const body = parseBody() as {
          granteeAddress?: string;
          dataId?: string;
          requiredFlags?: string;
        };
        if (!body.granteeAddress || !ethers.isAddress(body.granteeAddress)) {
          return reply(400, { error: "Valid granteeAddress is required" });
        }
        const requiredFlags = BigInt(body.requiredFlags || "0");
        const dataId = body.dataId || ethers.ZeroHash;
        const tree = buildDeploymentTree(deploymentId);
        const allAnon = store.state.anonRecords[deploymentId] || [];

        const permitted: Array<{
          meta: FtdpRecord["meta"];
          flags: string;
          anon: Record<string, unknown>;
          proof: string[];
        }> = [];

        for (const rec of allAnon) {
          if (body.dataId && rec.meta.dataId && rec.meta.dataId.toLowerCase() !== body.dataId.toLowerCase()) {
            continue;
          }
          const proofObj = tree.getProof(rec.meta.uidHash);
          if (!proofObj) continue;
          if ((proofObj.flags & requiredFlags) !== requiredFlags) continue;

          const allowed = await verifyCanRead({
            grantee: body.granteeAddress,
            grantorDeploymentId: deploymentId,
            uidHash: rec.meta.uidHash,
            dataId,
            merkleFlags: proofObj.flags,
            merkleProof: proofObj.proof,
          });
          if (allowed) {
            permitted.push({
              meta: rec.meta,
              flags: proofObj.flags.toString(),
              anon: rec.anon,
              proof: proofObj.proof,
            });
          }
        }

        metrics.readsServed += 1;
        return reply(200, {
          deploymentId,
          merkleRoot: tree.root,
          records: permitted,
        });
      }

      // Data Unions (supports single-chain EVM, single-chain Solana, and dual-chain EVM + Solana)
      if (method === "GET" && pathname === "/api/v1/unions") {
        return reply(200, { data: Object.values(store.state.unions) });
      }
      if (method === "POST" && pathname === "/api/v1/unions") {
        if (!requireKey()) return reply(401, { error: "Unauthorized" });
        const body = parseBody() as Partial<DataUnionRecord>;
        const evmSplitter = body.evm?.splitterAddress || body.splitterAddress;
        const hasValidEvm = Boolean(evmSplitter && ethers.isAddress(evmSplitter));
        const hasValidSolana = Boolean(
          body.solana &&
            isValidSolanaPubkey(body.solana.programId) &&
            isValidSolanaPubkey(body.solana.splitterPda)
        );
        if (!body.id || !body.name || (!hasValidEvm && !hasValidSolana)) {
          return reply(400, {
            error: "id, name, and at least one valid EVM splitterAddress or Solana binding are required",
          });
        }
        const inferredMode =
          body.chainMode || (hasValidEvm && hasValidSolana ? "dual" : hasValidSolana ? "solana" : "evm");

        const union: DataUnionRecord = {
          id: body.id,
          name: body.name,
          splitterAddress: evmSplitter,
          sharesTokenAddress: body.sharesTokenAddress || body.evm?.sharesTokenAddress,
          upstreamSplitterAddress: body.upstreamSplitterAddress || body.evm?.upstreamSplitterAddress,
          chainMode: inferredMode,
          evm: hasValidEvm
            ? {
                chainId: body.evm?.chainId ?? 8453,
                splitterAddress: evmSplitter!,
                sharesTokenAddress: body.evm?.sharesTokenAddress || body.sharesTokenAddress,
                upstreamSplitterAddress: body.evm?.upstreamSplitterAddress || body.upstreamSplitterAddress,
                marketAddress: body.evm?.marketAddress,
              }
            : undefined,
          solana: hasValidSolana ? body.solana : undefined,
          kind: body.kind || "ADMIN_CONTROLLED",
          deploymentIds: Array.isArray(body.deploymentIds) ? body.deploymentIds : [],
          createdAt: Math.floor(Date.now() / 1000),
        };
        store.state.unions[union.id] = union;
        store.persist();
        return reply(201, { data: union });
      }

      // Dual-Chain Data Union Metering -> produces EVM HolderAndShares[] AND Solana share updates
      const meterMatch = pathname.match(/^\/api\/v1\/unions\/([^/]+)\/meter$/);
      if (meterMatch && method === "POST") {
        const unionId = decodeURIComponent(meterMatch[1]);
        const union = store.state.unions[unionId];
        if (!union) return reply(404, { error: "Data Union not found" });
        const body = parseBody() as { requiredFlags?: string; weightPerRecord?: string };
        const requiredFlags = BigInt(body.requiredFlags || "0");
        const weight = BigInt(body.weightPerRecord || "100");

        const evmTally = new Map<string, bigint>();
        const solTally = new Map<string, bigint>();
        let totalConsentedRecords = 0;

        for (const depId of union.deploymentIds) {
          const recs = store.state.anonRecords[depId] || [];
          const flagsByUid = store.state.userFlags[depId] || {};
          for (const rec of recs) {
            const activeFlags = BigInt(flagsByUid[rec.meta.uidHash.toLowerCase()] || rec.flags);
            if ((activeFlags & requiredFlags) !== requiredFlags) continue;

            let counted = false;
            const evmWallet = rec.anon.contributorWallet;
            if (typeof evmWallet === "string" && ethers.isAddress(evmWallet)) {
              const normalized = ethers.getAddress(evmWallet);
              evmTally.set(normalized, (evmTally.get(normalized) || 0n) + weight);
              counted = true;
            }
            const solWallet = rec.anon.contributorSolanaWallet;
            if (typeof solWallet === "string" && isValidSolanaPubkey(solWallet)) {
              solTally.set(solWallet, (solTally.get(solWallet) || 0n) + weight);
              counted = true;
            }
            if (counted) totalConsentedRecords += 1;
          }
        }

        const updates = Array.from(evmTally.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([shareholder, shares]) => ({ shareholder, shares: shares.toString() }));

        const solanaUpdates = Array.from(solTally.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([shareholder, shares]) => ({ shareholder, shares: shares.toString() }));

        metrics.meteringRuns += 1;
        const result: MeteringResult = {
          unionId: union.id,
          chainMode: union.chainMode || (union.solana && union.splitterAddress ? "dual" : union.solana ? "solana" : "evm"),
          splitterAddress: union.evm?.splitterAddress || union.splitterAddress,
          solanaSplitterPda: union.solana?.splitterPda,
          totalConsentedRecords,
          updates,
          solanaUpdates,
          generatedAt: Math.floor(Date.now() / 1000),
        };
        return reply(200, result);
      }

      // Marketplace Auth (compatible with sls-protocol-market/waev-market-develop)
      if (method === "POST" && pathname === "/market_public/accounts/nonce") {
        const body = parseBody() as { address?: string };
        if (!body.address || !ethers.isAddress(body.address)) {
          return reply(400, { error: "Valid EVM address is required" });
        }
        const normalized = ethers.getAddress(body.address).toLowerCase();
        const nonce = `FTDP Market Sign-In Nonce: ${crypto.randomBytes(16).toString("hex")}`;
        nonces.set(normalized, { nonce, expiresAt: Date.now() + 5 * 60_000 });
        return reply(200, { address: normalized, nonce });
      }

      if (method === "POST" && pathname === "/market_public/accounts/verify") {
        const body = parseBody() as { address?: string; signature?: string };
        if (!body.address || !ethers.isAddress(body.address) || typeof body.signature !== "string") {
          return reply(400, { error: "address and signature are required" });
        }
        const normalized = ethers.getAddress(body.address).toLowerCase();
        const entry = nonces.get(normalized);
        if (!entry || Date.now() > entry.expiresAt) {
          return reply(401, { error: "Nonce missing or expired" });
        }
        const recovered = ethers.verifyMessage(entry.nonce, body.signature).toLowerCase();
        if (recovered !== normalized) {
          return reply(401, { error: "Invalid wallet signature" });
        }
        nonces.delete(normalized);
        const token = signJwt(
          { wallet: ethers.getAddress(body.address), iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 },
          jwtSecret
        );
        return reply(200, { token, wallet: ethers.getAddress(body.address) });
      }

      // Marketplace Public Catalog
      const publicOffersMatch = pathname.match(/^\/market_public\/([^/]+)\/offers$/);
      if (publicOffersMatch && method === "GET") {
        const marketAddr = decodeURIComponent(publicOffersMatch[1]).toLowerCase();
        const offers = (store.state.marketOffers[marketAddr] || []).filter((o) => o.active);
        return reply(200, { data: offers });
      }

      // Marketplace Authenticated Offer Posting
      const authOffersMatch = pathname.match(/^\/market\/([^/]+)\/offers$/);
      if (authOffersMatch && method === "POST") {
        const wallet = bearerWallet();
        if (!wallet) return reply(401, { error: "Valid Bearer token required" });
        const marketAddr = decodeURIComponent(authOffersMatch[1]).toLowerCase();
        const body = parseBody() as Partial<MarketOfferSummary>;
        if (!body.id || !body.deploymentId || !body.title || !body.beneficiary) {
          return reply(400, { error: "id, deploymentId, title, and beneficiary are required" });
        }
        const offer: MarketOfferSummary = {
          id: String(body.id),
          deploymentId: body.deploymentId,
          dataId: body.dataId || ethers.ZeroHash,
          title: body.title,
          description: body.description || "",
          paymentToken: body.paymentToken || ethers.ZeroAddress,
          pricePerSecond: String(body.pricePerSecond || "0"),
          minDuration: Number(body.minDuration || 86400),
          maxDuration: Number(body.maxDuration || 31536000),
          beneficiary: body.beneficiary,
          requiredFlags: String(body.requiredFlags || "0"),
          active: true,
        };
        if (!store.state.marketOffers[marketAddr]) store.state.marketOffers[marketAddr] = [];
        store.state.marketOffers[marketAddr].push(offer);
        store.persist();
        return reply(201, { data: offer, postedBy: wallet });
      }

      // Domain Ownership Verification (DNS TXT) for Client <head> Snippet Onboarding
      const domainsMatch = pathname.match(/^\/api\/v1\/deployments\/([^/]+)\/domains$/);
      if (domainsMatch) {
        const deploymentId = decodeURIComponent(domainsMatch[1]);
        if (!store.state.domains) store.state.domains = {};
        if (method === "GET") {
          return reply(200, { deploymentId, data: store.state.domains[deploymentId] || [] });
        }
        if (method === "POST") {
          if (!requireKey()) return reply(401, { error: "Unauthorized" });
          const body = parseBody() as { domain?: string };
          if (typeof body.domain !== "string" || !body.domain.trim()) {
            return reply(400, { error: "domain is required" });
          }
          const normalized = normalizeDomain(body.domain);
          const list = store.state.domains[deploymentId] || [];
          const existing = list.find((d) => d.domain === normalized);
          if (existing) {
            return reply(200, { data: existing });
          }
          const challenge = createDomainChallenge(deploymentId, normalized);
          list.push(challenge);
          store.state.domains[deploymentId] = list;
          store.persist();
          return reply(201, {
            data: challenge,
            instructions: `Add a DNS TXT record at ${challenge.txtHost} (or ${challenge.domain}) with value: ${challenge.txtValue}`,
          });
        }
      }

      const verifyDomainMatch = pathname.match(/^\/api\/v1\/deployments\/([^/]+)\/domains\/verify$/);
      if (verifyDomainMatch && method === "POST") {
        if (!requireKey()) return reply(401, { error: "Unauthorized" });
        const deploymentId = decodeURIComponent(verifyDomainMatch[1]);
        const body = parseBody() as { domain?: string };
        if (typeof body.domain !== "string" || !body.domain.trim()) {
          return reply(400, { error: "domain is required" });
        }
        const normalized = normalizeDomain(body.domain);
        const list = store.state.domains?.[deploymentId] || [];
        const record = list.find((d) => d.domain === normalized);
        if (!record) return reply(404, { error: "Domain challenge not found; register domain first" });

        const check = await verifyDomainTxtRecord(record, options.txtResolver);
        if (!check.verified) {
          return reply(400, {
            verified: false,
            domain: record.domain,
            expectedTxtHost: record.txtHost,
            expectedTxtValue: record.txtValue,
            error: "Matching DNS TXT record not found yet",
          });
        }
        record.verified = true;
        record.verifiedAt = Math.floor(Date.now() / 1000);
        store.persist();
        return reply(200, {
          verified: true,
          matchedHost: check.matchedHost,
          data: record,
        });
      }

      // =========================================================================
      // DefraDB + EVM Bridge Gateway Endpoints (/v1/records, /v1/merkle/commit, /v1/query/anon, /v1/reaper/run)
      // =========================================================================
      if (method === "POST" && pathname === "/v1/records") {
        if (!requireKey()) return reply(401, { error: "Unauthorized" });
        const raw = parseBody() as { meta?: { deploymentId?: string } };
        const depId = raw?.meta?.deploymentId || "";
        const origin = typeof headers.origin === "string" ? headers.origin : undefined;
        const depDomains = store.state.domains?.[depId] || [];
        if (!isOriginAllowedForDeployment(origin, depDomains)) {
          return reply(403, { error: `Origin ${origin} is not a verified domain for deployment ${depId}` });
        }
        const validated = validateFtdpRecord(raw, depId);
        if (!validated.ok) return reply(400, { error: validated.error });
        const rec = validated.record;

        // Optional / enforced EIP-191 writer role check against ClientConfigManager
        const sig = typeof headers["x-ftdp-signature"] === "string" ? headers["x-ftdp-signature"] : undefined;
        const msg = typeof headers["x-ftdp-message"] === "string" ? headers["x-ftdp-message"] : undefined;
        if (options.requireWriterSignature || (sig && msg && chainBridge)) {
          if (!sig || !msg) return reply(401, { error: "Missing x-ftdp-signature or x-ftdp-message header" });
          const recoveredWriter = ethers.verifyMessage(msg, sig);
          if (chainBridge) {
            const hasWrite = await chainBridge.hasWriteRole(rec.meta.deploymentId, recoveredWriter);
            if (!hasWrite) return reply(403, { error: "Writer lacks ROLE_WRITE on deployment" });
          }
        }

        // Defense-in-depth: encrypt PII with deployment-scoped AES-256-GCM envelope
        let encryptedPiiEnvelope: { piiCiphertext: string; kmsKeyVersion: string } | undefined;
        if (rec.pii && Object.keys(rec.pii).length > 0) {
          encryptedPiiEnvelope = piiCrypto.encrypt(rec.meta.deploymentId, rec.pii);
        }

        let defraDocId: string | undefined;
        let defraCid: string | undefined;
        if (defraClient) {
          const created = await defraClient.createAnonRecord(rec);
          defraDocId = created.docId;
          defraCid = created.cid;
          if (encryptedPiiEnvelope) {
            await defraClient.createPiiVaultRecord({
              recordId: rec.meta.recordId,
              deploymentId: rec.meta.deploymentId,
              uidHash: rec.meta.uidHash,
              piiCiphertext: encryptedPiiEnvelope.piiCiphertext,
              kmsKeyVersion: encryptedPiiEnvelope.kmsKeyVersion,
              timestamp: rec.meta.timestamp,
            });
          }
          await defraClient.upsertConsentState({
            deploymentId: rec.meta.deploymentId,
            uidHash: rec.meta.uidHash,
            flags: rec.flags,
            updatedAt: rec.meta.timestamp,
          });
        }

        // Mirror into local store (storing encrypted envelope in PII vault if encrypted)
        store.addRecord(rec.meta.deploymentId, {
          ...rec,
          ...(encryptedPiiEnvelope ? { pii: encryptedPiiEnvelope as unknown as Record<string, unknown> } : {}),
        });
        metrics.ingestedRecords += 1;
        const tree = buildDeploymentTree(rec.meta.deploymentId);
        return reply(201, {
          accepted: true,
          recordId: rec.meta.recordId,
          merkleRoot: tree.root,
          leafCount: tree.leaves.length,
          ...(defraDocId ? { defraDocId } : {}),
          ...(defraCid ? { defraCid } : {}),
        });
      }

      if (method === "POST" && pathname === "/v1/merkle/commit") {
        if (!requireKey()) return reply(401, { error: "Unauthorized" });
        const body = parseBody() as { deploymentId?: string };
        if (!body.deploymentId) return reply(400, { error: "deploymentId is required" });
        const tree = buildDeploymentTree(body.deploymentId);
        let txHash: string | undefined;
        if (chainBridge) {
          const res = await chainBridge.commitOptInMerkleRoot(body.deploymentId, tree.root);
          txHash = res.txHash;
        }
        return reply(200, {
          deploymentId: body.deploymentId,
          merkleRoot: tree.root,
          leafCount: tree.leaves.length,
          ...(txHash ? { txHash } : {}),
        });
      }

      if (method === "POST" && pathname === "/v1/query/anon") {
        const body = parseBody() as {
          deploymentId?: string;
          dataId?: string;
          sinceTimestamp?: number;
          granteeAddress?: string;
          nowSec?: number;
        };
        if (!body.deploymentId) return reply(400, { error: "deploymentId is required" });

        // Authenticate buyer via EIP-191 headers if provided, otherwise fall back to body.granteeAddress
        const sig = typeof headers["x-ftdp-signature"] === "string" ? headers["x-ftdp-signature"] : undefined;
        const msg = typeof headers["x-ftdp-message"] === "string" ? headers["x-ftdp-message"] : undefined;
        let grantee = body.granteeAddress;
        if (sig && msg) {
          grantee = ethers.verifyMessage(msg, sig);
        }
        if (!grantee || !ethers.isAddress(grantee)) {
          return reply(401, { error: "Valid buyer EIP-191 signature or granteeAddress is required" });
        }

        const dataId = body.dataId || ethers.ZeroHash;
        const nowSec = BigInt(body.nowSec ?? Math.floor(Date.now() / 1000));

        // On-chain pre-check via AccessPermissions.getPermissions()
        if (chainBridge) {
          const granteeDepId = await chainBridge.getDeploymentIdForKey(grantee);
          if (!granteeDepId || granteeDepId === ethers.ZeroHash) {
            return reply(403, { error: "Buyer key is not registered in ClientConfigManager" });
          }
          let grant = await chainBridge.getPermissions(body.deploymentId, granteeDepId, dataId);
          if (grant.expires === 0n && dataId !== ethers.ZeroHash) {
            grant = await chainBridge.getPermissions(body.deploymentId, granteeDepId, ethers.ZeroHash);
          }
          if (grant.expires === 0n || nowSec >= grant.expires) {
            return reply(403, { error: "Access grant missing or expired" });
          }
        }

        const tree = buildDeploymentTree(body.deploymentId);
        const candidates: Array<{
          meta: FtdpRecord["meta"];
          anon: Record<string, unknown>;
          defraDocId?: string;
          defraCid?: string;
        }> = [];

        if (defraClient) {
          const rows = await defraClient.queryAnonRecords({
            deploymentId: body.deploymentId,
            dataId: body.dataId,
            sinceTimestamp: body.sinceTimestamp,
          });
          for (const row of rows) {
            candidates.push({
              meta: {
                recordId: row.recordId,
                deploymentId: row.deploymentId,
                uidHash: row.uidHash,
                dataId: row.dataId || undefined,
                schemaVersion: "1.0.0",
                timestamp: row.timestamp,
                source: (row.source as FtdpRecord["meta"]["source"]) || "serverApi",
              },
              anon: JSON.parse(row.anonJson) as Record<string, unknown>,
              defraDocId: row._docID,
              defraCid: row._cid,
            });
          }
        } else {
          for (const rec of store.state.anonRecords[body.deploymentId] || []) {
            if (body.dataId && rec.meta.dataId && rec.meta.dataId.toLowerCase() !== body.dataId.toLowerCase()) {
              continue;
            }
            if (body.sinceTimestamp !== undefined && rec.meta.timestamp < body.sinceTimestamp) continue;
            candidates.push({ meta: rec.meta, anon: rec.anon });
          }
        }

        const permitted: Array<{
          meta: FtdpRecord["meta"];
          flags: string;
          anon: Record<string, unknown>;
          merkleProof: string[];
          defraDocId?: string;
          defraCid?: string;
        }> = [];

        for (const item of candidates) {
          const proofObj = tree.getProof(item.meta.uidHash);
          if (!proofObj) continue;
          const allowed = await verifyCanRead({
            grantee,
            grantorDeploymentId: body.deploymentId,
            uidHash: item.meta.uidHash,
            dataId,
            merkleFlags: proofObj.flags,
            merkleProof: proofObj.proof,
          });
          if (allowed) {
            permitted.push({
              meta: item.meta,
              flags: proofObj.flags.toString(),
              anon: item.anon,
              merkleProof: proofObj.proof,
              ...(item.defraDocId ? { defraDocId: item.defraDocId } : {}),
              ...(item.defraCid ? { defraCid: item.defraCid } : {}),
            });
          }
        }

        metrics.readsServed += 1;
        return reply(200, {
          deploymentId: body.deploymentId,
          merkleRoot: tree.root,
          records: permitted,
        });
      }

      if (method === "POST" && pathname === "/v1/reaper/run") {
        if (!requireKey()) return reply(401, { error: "Unauthorized" });
        const body = parseBody() as { nowSec?: number };
        const summary = await reaper.reapExpiredGrants(body.nowSec);
        return reply(200, summary);
      }

      // =========================================================================
      // Comment Protocol v1 Aggregation & Portable Karma (Top News, RateMyVideo, Streamy)
      // =========================================================================
      if (method === "GET" && pathname === "/api/v1/comments/thread") {
        const targetUri = url.searchParams.get("targetUri");
        if (!targetUri) return reply(400, { error: "targetUri query parameter is required" });

        const comments: Array<{
          recordId: string;
          deploymentId: string;
          uidHash: string;
          parentId?: string;
          body: string;
          timestamp: number;
        }> = [];
        const ratings: Array<{
          recordId: string;
          deploymentId: string;
          uidHash: string;
          score: number;
          maxScore: number;
          review?: string;
          timestamp: number;
        }> = [];
        let voteScore = 0;

        for (const recs of Object.values(store.state.anonRecords)) {
          for (const rec of recs) {
            if (rec.anon.targetUri !== targetUri) continue;
            if (rec.anon.kind === "comment" && typeof rec.anon.body === "string") {
              comments.push({
                recordId: rec.meta.recordId,
                deploymentId: rec.meta.deploymentId,
                uidHash: rec.meta.uidHash,
                parentId: typeof rec.anon.parentId === "string" ? rec.anon.parentId : undefined,
                body: rec.anon.body,
                timestamp: rec.meta.timestamp,
              });
            } else if (rec.anon.kind === "rating" && typeof rec.anon.score === "number") {
              ratings.push({
                recordId: rec.meta.recordId,
                deploymentId: rec.meta.deploymentId,
                uidHash: rec.meta.uidHash,
                score: rec.anon.score,
                maxScore: typeof rec.anon.maxScore === "number" ? rec.anon.maxScore : 5,
                review: typeof rec.anon.review === "string" ? rec.anon.review : undefined,
                timestamp: rec.meta.timestamp,
              });
            } else if (rec.anon.kind === "vote" && (rec.anon.direction === 1 || rec.anon.direction === -1)) {
              voteScore += rec.anon.direction;
            }
          }
        }

        comments.sort((a, b) => a.timestamp - b.timestamp);
        ratings.sort((a, b) => a.timestamp - b.timestamp);
        const avg =
          ratings.length > 0
            ? Number((ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length).toFixed(2))
            : null;

        return reply(200, {
          targetUri,
          commentCount: comments.length,
          ratingCount: ratings.length,
          averageRating: avg,
          voteScore,
          comments,
          ratings,
        });
      }

      const karmaMatch = pathname.match(/^\/api\/v1\/comments\/karma\/([^/]+)$/);
      if (karmaMatch && method === "GET") {
        const uidHash = decodeURIComponent(karmaMatch[1]).toLowerCase();
        let commentCount = 0;
        let ratingCount = 0;
        let voteCount = 0;
        const deployments = new Set<string>();

        for (const [depId, recs] of Object.entries(store.state.anonRecords)) {
          for (const rec of recs) {
            if (rec.meta.uidHash.toLowerCase() !== uidHash) continue;
            if (rec.anon.kind === "comment") {
              commentCount += 1;
              deployments.add(depId);
            } else if (rec.anon.kind === "rating") {
              ratingCount += 1;
              deployments.add(depId);
            } else if (rec.anon.kind === "vote") {
              voteCount += 1;
              deployments.add(depId);
            }
          }
        }

        const totalKarma = commentCount * 5 + ratingCount * 3 + voteCount * 1;
        return reply(200, {
          uidHash,
          totalKarma,
          commentCount,
          ratingCount,
          voteCount,
          deployments: Array.from(deployments),
        });
      }

      // =========================================================================
      // Modular v2 Compute-to-Data Worker Endpoint (Returns Aggregates Only — Zero Raw Records / Zero PII)
      // =========================================================================
      if (method === "POST" && pathname === "/v1/compute/jobs") {
        const body = parseBody() as {
          deploymentId?: string;
          dataId?: string;
          granteeAddress?: string;
          requiredFlags?: string;
          algorithm?: "topic_counts" | "avg_rating" | "engagement_summary";
        };
        if (!body.deploymentId || !body.granteeAddress || !ethers.isAddress(body.granteeAddress)) {
          return reply(400, { error: "deploymentId and valid granteeAddress are required" });
        }
        const algorithm = body.algorithm || "engagement_summary";
        const requiredFlags = BigInt(body.requiredFlags || "0");
        const dataId = body.dataId || ethers.ZeroHash;
        const tree = buildDeploymentTree(body.deploymentId);
        const allAnon = store.state.anonRecords[body.deploymentId] || [];

        const topicCounts: Record<string, number> = {};
        let eligibleCount = 0;
        let ratingSum = 0;
        let ratingCount = 0;

        for (const rec of allAnon) {
          if (body.dataId && rec.meta.dataId && rec.meta.dataId.toLowerCase() !== body.dataId.toLowerCase()) {
            continue;
          }
          const proofObj = tree.getProof(rec.meta.uidHash);
          if (!proofObj || (proofObj.flags & requiredFlags) !== requiredFlags) continue;
          const allowed = await verifyCanRead({
            grantee: body.granteeAddress,
            grantorDeploymentId: body.deploymentId,
            uidHash: rec.meta.uidHash,
            dataId,
            merkleFlags: proofObj.flags,
            merkleProof: proofObj.proof,
          });
          if (!allowed) continue;

          eligibleCount += 1;
          const topic = typeof rec.anon.topic === "string" ? rec.anon.topic : "unclassified";
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          if (typeof rec.anon.score === "number") {
            ratingSum += rec.anon.score;
            ratingCount += 1;
          }
        }

        const aggregateResult =
          algorithm === "topic_counts"
            ? { algorithm, eligibleRecords: eligibleCount, topicCounts }
            : algorithm === "avg_rating"
            ? {
                algorithm,
                eligibleRecords: eligibleCount,
                ratingCount,
                averageRating: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(3)) : null,
              }
            : {
                algorithm,
                eligibleRecords: eligibleCount,
                distinctTopics: Object.keys(topicCounts).length,
                topicCounts,
              };

        const canonicalResult = JSON.stringify(aggregateResult);
        const resultCidHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalResult));
        const attestationHash = ethers.solidityPackedKeccak256(
          ["bytes32", "bytes32", "bytes32"],
          [body.deploymentId, tree.root, resultCidHash]
        );

        return reply(200, {
          deploymentId: body.deploymentId,
          merkleRoot: tree.root,
          result: aggregateResult,
          resultCidHash,
          attestationHash,
        });
      }

      return reply(404, { error: `Route not found: ${method} ${pathname}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal server error";
      const status =
        msg === "Payload too large"
          ? 413
          : msg === "Invalid JSON body" || msg.startsWith("Invalid domain name:")
          ? 400
          : 500;
      return reply(status, { error: msg });
    }
  }

  /**
   * In-process Fetch-compatible dispatcher (useful for airgapped/sandboxed integration tests).
   */
  const fetchImpl: typeof fetch = async (input, init) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || "GET").toUpperCase();
    const hdrs: Record<string, string> = {};
    if (init?.headers) {
      const entries =
        init.headers instanceof Headers
          ? Array.from(init.headers.entries())
          : Array.isArray(init.headers)
          ? init.headers
          : Object.entries(init.headers);
      for (const [k, v] of entries) hdrs[k.toLowerCase()] = String(v);
    }
    const rawBody = typeof init?.body === "string" ? init.body : "";
    const parsedUrl = new URL(urlStr);
    const out = await handleRequest(method, `${parsedUrl.pathname}${parsedUrl.search}`, hdrs, rawBody, "in-process");
    return new Response(out.body, { status: out.status, headers: out.headers });
  };

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const rawBody = await new Promise<string>((resolve, reject) => {
        let total = 0;
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BODY_BYTES) {
            reject(new Error("Payload too large"));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
      });

      const normalizedHeaders: Record<string, string | string[] | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) normalizedHeaders[k.toLowerCase()] = v;

      const out = await handleRequest(
        req.method || "GET",
        req.url || "/",
        normalizedHeaders,
        rawBody,
        req.socket.remoteAddress || "local"
      );
      res.writeHead(out.status, out.headers);
      res.end(out.body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal server error";
      const status = msg === "Payload too large" ? 413 : 500;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: msg }));
    }
  });

  return { server, fetchImpl, handleRequest, buildDeploymentTree, reaper, piiCrypto };
}
