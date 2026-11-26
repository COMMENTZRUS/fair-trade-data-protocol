import test from "node:test";
import assert from "node:assert/strict";
import { ethers, Wallet } from "ethers";
import { ConsentMerkleTree, hashUserId } from "@ftdp/sdk";
import { PiiEnvelopeCrypto } from "../piiCrypto";
import { DefraClient } from "../defraClient";
import { GrantExpirationReaper } from "../reaper";
import { ChainBridge } from "../chainBridge";
import { createFtdpServer } from "../server";
import { FtdpStore } from "../store";

/**
 * In-process mock of `defradb.rs` GraphQL + Local Zanzibar ACP + P2P replicators.
 * Enforces that buyers cannot read `FtdpPiiVault` and tracks `licensed_reader` relations.
 */
function createMockDefraDb(operatorToken: string) {
  const anonDocs: Array<Record<string, unknown>> = [];
  const piiDocs: Array<Record<string, unknown>> = [];
  const consentDocs: Array<Record<string, unknown>> = [];
  const relations = new Set<string>();
  const replicators = new Set<string>();
  let seq = 1;

  const fetchImpl: typeof fetch = async (input, init) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlStr);
    const method = (init?.method || "GET").toUpperCase();
    const body = typeof init?.body === "string" && init.body ? JSON.parse(init.body) : {};
    const authHeader =
      init?.headers && !Array.isArray(init.headers) && !(init.headers instanceof Headers)
        ? (init.headers as Record<string, string>)["Authorization"]
        : undefined;

    if (url.pathname === "/health-check") {
      return new Response("Healthy", { status: 200 });
    }

    if (url.pathname === "/api/v1/acp/document/relationship") {
      const key = `${body.collection}:${body.docId}:${body.relation}:${body.actorDid}`;
      if (method === "POST") relations.add(key);
      if (method === "DELETE") relations.delete(key);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (url.pathname === "/api/v1/p2p/replicators") {
      const key = `${body.collection}:${body.peerMultiaddr}`;
      if (method === "POST") replicators.add(key);
      if (method === "DELETE") replicators.delete(key);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (url.pathname === "/api/v1/graphql") {
      const q = String(body.query || "");
      const vars = (body.variables || {}) as Record<string, unknown>;

      if (q.includes("create_FtdpAnonRecord")) {
        const inputs = vars.input as Array<Record<string, unknown>>;
        const created = inputs.map((item) => {
          const doc = { ...item, _docID: `bae-anon-${seq}`, _cid: `bafyreib-cid-${seq++}` };
          anonDocs.push(doc);
          return doc;
        });
        return new Response(JSON.stringify({ data: { create_FtdpAnonRecord: created } }), { status: 200 });
      }

      if (q.includes("create_FtdpPiiVault")) {
        const inputs = vars.input as Array<Record<string, unknown>>;
        const created = inputs.map((item) => {
          const doc = { ...item, _docID: `bae-pii-${seq++}` };
          piiDocs.push(doc);
          return doc;
        });
        return new Response(JSON.stringify({ data: { create_FtdpPiiVault: created } }), { status: 200 });
      }

      if (q.includes("create_FtdpConsentState")) {
        const inputs = vars.input as Array<Record<string, unknown>>;
        consentDocs.push(...inputs);
        return new Response(JSON.stringify({ data: { create_FtdpConsentState: [{ _docID: `bae-cs-${seq++}` }] } }), {
          status: 200,
        });
      }

      if (q.includes("FtdpAnonRecord(")) {
        const filtered = anonDocs.filter((d) => d.deploymentId === vars.deploymentId);
        return new Response(JSON.stringify({ data: { FtdpAnonRecord: filtered } }), { status: 200 });
      }

      if (q.includes("FtdpPiiVault(")) {
        // Local Zanzibar ACP enforcement: ONLY operator (pii_custodian) can read FtdpPiiVault!
        if (authHeader !== `Bearer ${operatorToken}`) {
          return new Response(
            JSON.stringify({ errors: [{ message: "ACP unauthorized: missing pii_custodian relation on ftdp_pii_vault" }] }),
            { status: 403 }
          );
        }
        const filtered = piiDocs.filter((d) => d.deploymentId === vars.deploymentId);
        return new Response(JSON.stringify({ data: { FtdpPiiVault: filtered } }), { status: 200 });
      }
    }

    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  };

  return { fetchImpl, anonDocs, piiDocs, consentDocs, relations, replicators };
}

test("PiiEnvelopeCrypto enforces per-deployment AES-256-GCM key isolation and tamper detection", () => {
  const cryptoSvc = new PiiEnvelopeCrypto("test-master-secret-256");
  const depA = ethers.keccak256(ethers.toUtf8Bytes("deployment:panorama"));
  const depB = ethers.keccak256(ethers.toUtf8Bytes("deployment:top-news"));

  const env = cryptoSvc.encrypt(depA, { email: "alice@panorama.test", phone: "+1-555-0100" });
  assert.ok(env.piiCiphertext.startsWith("v1:"));
  assert.equal(env.piiCiphertext.includes("alice@panorama.test"), false);

  // Decrypting under correct deployment succeeds
  const decrypted = cryptoSvc.decrypt(depA, env.piiCiphertext, env.kmsKeyVersion);
  assert.equal(decrypted.email, "alice@panorama.test");

  // Decrypting under a different deployment MUST fail (HKDF key + AAD mismatch)
  assert.throws(() => cryptoSvc.decrypt(depB, env.piiCiphertext, env.kmsKeyVersion));

  // Tampering ciphertext MUST fail GCM authTag verification
  const tampered = env.piiCiphertext.slice(0, -2) + (env.piiCiphertext.endsWith("ff") ? "00" : "ff");
  assert.throws(() => cryptoSvc.decrypt(depA, tampered, env.kmsKeyVersion));
});

test("DefraDB Gateway + Zanzibar ACP + Merkle Commit + GrantExpirationReaper end-to-end", async () => {
  const operatorToken = "did:key:ftdp-operator";
  const buyerToken = "did:key:buyer-analytics";
  const mockDefra = createMockDefraDb(operatorToken);
  const defraClient = new DefraClient({
    baseUrl: "http://defradb.local:9181",
    identityToken: operatorToken,
    fetchImpl: mockDefra.fetchImpl,
  });

  // Safety guard: FtdpPiiVault MUST NEVER be replicated to P2P peers
  await assert.rejects(
    () => defraClient.addP2pReplicator({ collection: "FtdpPiiVault", peerMultiaddr: "/ip4/1.2.3.4/tcp/9171" }),
    /SECURITY VIOLATION/
  );

  const panoramaDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:panorama-web"));
  const buyerDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:buyer-analytics"));
  const dataId = ethers.keccak256(ethers.toUtf8Bytes("dataset:news-union"));

  const writerWallet = Wallet.createRandom();
  const rogueWallet = Wallet.createRandom();
  const buyerWallet = Wallet.createRandom();

  let committedRoot = ethers.ZeroHash;
  let grantExpires = BigInt(Math.floor(Date.now() / 1000) + 300); // active for 300s
  const requiredFlags = 2n; // bit 1 = News Curation Data Union

  const chainBridge: ChainBridge = {
    async hasWriteRole(depId, signer) {
      return depId === panoramaDepId && signer.toLowerCase() === writerWallet.address.toLowerCase();
    },
    async getDeploymentIdForKey(key) {
      return key.toLowerCase() === buyerWallet.address.toLowerCase() ? buyerDepId : ethers.ZeroHash;
    },
    async getPermissions(grantor, grantee) {
      if (grantor === panoramaDepId && grantee === buyerDepId) {
        return { requiredFlags, readRoles: 4n, expires: grantExpires };
      }
      return { requiredFlags: 0n, readRoles: 0n, expires: 0n };
    },
    async canRead({ grantee, uidHash, merkleFlags, merkleProof }) {
      if (grantee.toLowerCase() !== buyerWallet.address.toLowerCase()) return false;
      if ((merkleFlags & requiredFlags) !== requiredFlags) return false;
      return ConsentMerkleTree.verify(merkleProof, committedRoot, uidHash, merkleFlags);
    },
    async commitOptInMerkleRoot(_depId, root) {
      committedRoot = root;
      return { txHash: "0x" + "ab".repeat(32) };
    },
  };

  const piiCrypto = new PiiEnvelopeCrypto("prod-kms-key");
  const reaper = new GrantExpirationReaper(defraClient);
  const store = new FtdpStore();
  const { fetchImpl } = createFtdpServer({
    store,
    defraClient,
    piiCrypto,
    chainBridge,
    reaper,
    requireWriterSignature: true,
  });

  const userAHash = hashUserId("panorama", "userA");
  const userBHash = hashUserId("panorama", "userB");

  const recA = {
    meta: {
      recordId: "rec-A",
      deploymentId: panoramaDepId,
      uidHash: userAHash,
      dataId,
      schemaVersion: "1.0.0",
      timestamp: Math.floor(Date.now() / 1000),
      source: "webSdk",
    },
    flags: "2", // opted into News Curation Data Union
    anon: { event: "story_curated", topic: "ai-safety" },
    pii: { email: "userA-secret@panorama.test" },
  };
  const recB = {
    meta: {
      recordId: "rec-B",
      deploymentId: panoramaDepId,
      uidHash: userBHash,
      dataId,
      schemaVersion: "1.0.0",
      timestamp: Math.floor(Date.now() / 1000),
      source: "webSdk",
    },
    flags: "1", // Analytics ONLY (NOT Data Union!)
    anon: { event: "page_view", topic: "sports" },
  };

  // Unauthorized writer signature must be rejected (403)
  const badMsg = "ftdp-write:1";
  const rogueRes = await fetchImpl("http://ftdp.local/v1/records", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ftdp-message": badMsg,
      "x-ftdp-signature": await rogueWallet.signMessage(badMsg),
    },
    body: JSON.stringify(recA),
  });
  assert.equal(rogueRes.status, 403);

  // Authorized writer ingests User A (with PII) and User B (analytics-only)
  const writeMsg = "ftdp-write:authorized";
  const writeSig = await writerWallet.signMessage(writeMsg);
  const resA = (await fetchImpl("http://ftdp.local/v1/records", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ftdp-message": writeMsg,
      "x-ftdp-signature": writeSig,
    },
    body: JSON.stringify(recA),
  }).then((r) => r.json())) as { accepted: boolean; defraDocId: string; defraCid: string };
  assert.equal(resA.accepted, true);
  assert.ok(resA.defraDocId.startsWith("bae-anon-"));
  assert.ok(resA.defraCid.startsWith("bafyreib-cid-"));

  await fetchImpl("http://ftdp.local/v1/records", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ftdp-message": writeMsg,
      "x-ftdp-signature": writeSig,
    },
    body: JSON.stringify(recB),
  });

  // Verify DefraDB PII vault contains ONLY AES-256-GCM ciphertext (never plaintext email)
  assert.equal(mockDefra.piiDocs.length, 1);
  assert.ok(String(mockDefra.piiDocs[0].piiCiphertext).startsWith("v1:"));
  assert.equal(JSON.stringify(mockDefra.piiDocs[0]).includes("userA-secret"), false);

  // Pass Condition 3: Direct query against FtdpPiiVault as buyer fails Local Zanzibar ACP!
  await assert.rejects(() => defraClient.queryPiiVault(panoramaDepId, buyerToken), /ACP unauthorized/);

  // Commit opt-in Merkle root via POST /v1/merkle/commit
  const commitRes = (await fetchImpl("http://ftdp.local/v1/merkle/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deploymentId: panoramaDepId }),
  }).then((r) => r.json())) as { merkleRoot: string; txHash: string };
  assert.equal(commitRes.merkleRoot, committedRoot);
  assert.ok(commitRes.txHash);

  // Buyer queries POST /v1/query/anon using EIP-191 signed header
  const queryMsg = "ftdp-query:buyer-analytics";
  const querySig = await buyerWallet.signMessage(queryMsg);
  const queryRes = (await fetchImpl("http://ftdp.local/v1/query/anon", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ftdp-message": queryMsg,
      "x-ftdp-signature": querySig,
    },
    body: JSON.stringify({ deploymentId: panoramaDepId, dataId }),
  }).then((r) => r.json())) as {
    records: Array<{ meta: { uidHash: string }; merkleProof: string[]; defraDocId: string; defraCid: string }>;
  };

  // Pass Condition 1 & 2 & 3: ONLY User A returned, valid merkleProof & DefraDB CID, User B excluded, zero PII!
  assert.equal(queryRes.records.length, 1);
  assert.equal(queryRes.records[0].meta.uidHash, userAHash);
  assert.equal(queryRes.records[0].defraDocId, resA.defraDocId);
  assert.equal(queryRes.records[0].defraCid, resA.defraCid);
  assert.equal("pii" in queryRes.records[0], false);
  assert.equal(ConsentMerkleTree.verify(queryRes.records[0].merkleProof, committedRoot, userAHash, 2n), true);

  // Activate Zanzibar ACP licensed_reader + P2P replicator for buyer, then expire grant & run reaper!
  await reaper.activateGrant({
    grantorDeploymentId: panoramaDepId,
    granteeDeploymentId: buyerDepId,
    buyerDid: buyerToken,
    docIds: [resA.defraDocId],
    peerMultiaddr: "/ip4/10.0.0.5/tcp/9171/p2p/12D3KooWBuyer",
    expires: Number(grantExpires),
  });
  assert.equal(mockDefra.relations.size, 1);
  assert.equal(mockDefra.replicators.size, 1);

  // Before expiration: reaper leaves grant intact
  const preReap = await reaper.reapExpiredGrants(Number(grantExpires) - 10);
  assert.equal(preReap.revokedGrants, 0);
  assert.equal(mockDefra.relations.size, 1);

  // After expiration: POST /v1/reaper/run revokes Zanzibar relation + drops P2P replicator!
  const postReap = (await fetchImpl("http://ftdp.local/v1/reaper/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nowSec: Number(grantExpires) + 1 }),
  }).then((r) => r.json())) as { revokedGrants: number; revokedRelations: number; droppedReplicators: number };
  assert.equal(postReap.revokedGrants, 1);
  assert.equal(postReap.revokedRelations, 1);
  assert.equal(postReap.droppedReplicators, 1);
  assert.equal(mockDefra.relations.size, 0);
  assert.equal(mockDefra.replicators.size, 0);

  // Expired buyer query on /v1/query/anon is immediately rejected (403)
  const expiredRes = await fetchImpl("http://ftdp.local/v1/query/anon", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ftdp-message": queryMsg,
      "x-ftdp-signature": querySig,
    },
    body: JSON.stringify({
      deploymentId: panoramaDepId,
      dataId,
      nowSec: Number(grantExpires) + 1,
    }),
  });
  assert.equal(expiredRes.status, 403);
});
