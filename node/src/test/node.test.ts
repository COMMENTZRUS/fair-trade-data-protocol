import test from "node:test";
import assert from "node:assert/strict";
import { ethers, Wallet } from "ethers";
import {
  ConsentMerkleTree,
  FtdpClient,
  hashUserId,
  signSetSharesMultiMeta,
  STANDARD_CONSENT_FLAGS,
} from "@ftdp/sdk";
import { createFtdpServer } from "../server";
import { FtdpStore } from "../store";

test("ftdp-node + @ftdp/sdk end-to-end: ingest, PII segregation, Merkle proofs, Access Gate, Union metering & Market wallet auth", async () => {
  const store = new FtdpStore();
  const apiKey = "test-secret-key";

  // Verifier matching on-chain AccessPermissions.canRead Merkle proof & flags bitmask
  let latestCommittedRoot = ethers.ZeroHash;
  const { fetchImpl } = createFtdpServer({
    store,
    apiKey,
    canReadVerifier: async ({ uidHash, merkleFlags, merkleProof }) => {
      return ConsentMerkleTree.verify(merkleProof, latestCommittedRoot, uidHash, merkleFlags);
    },
  });

  const baseUrl = "http://ftdp.local";
  const client = new FtdpClient({ baseUrl, apiKey, fetchImpl });

  // 1. Health check
  const health = await client.health();
  assert.equal(health.status, "ok");

  // 2. Register Panorama & Top News Deployments
  const panoramaDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:panorama"));
  const topNewsDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:top-news"));
  const newsDataId = ethers.keccak256(ethers.toUtf8Bytes("dataset:news-anon"));

  const user1Wallet = Wallet.createRandom();
  const user2Wallet = Wallet.createRandom();
  const buyerReader = Wallet.createRandom();

  await client.createDeployment({
    id: panoramaDepId,
    organizationId: "panorama-inc",
    name: "Panorama",
    adminAddress: user1Wallet.address,
    flags: [
      { bit: 1, name: "News Data Union", description: "Join news union" },
      { bit: 2, name: "AI Training", description: "Allow AI dataset licensing" },
    ],
  });
  await client.createDeployment({
    id: topNewsDepId,
    organizationId: "top-news",
    name: "Top News",
    adminAddress: user2Wallet.address,
  });

  // 3. Stream records (User 1 opted into News + AI with PII attached; User 2 opted into News only)
  const r1 = await client.trackEvent({
    deploymentId: panoramaDepId,
    namespace: "panorama",
    userId: "alice",
    flags: STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.AI_TRAINING, // 6
    anon: { event: "curate_article", topic: "crypto-news" },
    pii: { email: "alice-secret@example.com", ip: "192.0.2.1" },
    dataId: newsDataId,
    contributorWallet: user1Wallet.address,
  });
  assert.equal(r1.accepted, true);

  const r2 = await client.trackEvent({
    deploymentId: panoramaDepId,
    namespace: "panorama",
    userId: "bob",
    flags: STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION, // 2 (NOT AI_TRAINING)
    anon: { event: "curate_article", topic: "markets" },
    dataId: newsDataId,
    contributorWallet: user2Wallet.address,
  });
  assert.equal(r2.accepted, true);
  latestCommittedRoot = r2.merkleRoot;

  // 4. Verify physical PII segregation in store
  assert.equal(store.piiVault.piiRecords[panoramaDepId].length, 1);
  assert.equal(store.piiVault.piiRecords[panoramaDepId][0].pii.email, "alice-secret@example.com");

  // 5. Verify Merkle proof endpoint
  const aliceHash = hashUserId("panorama", "alice");
  const proofRes = await client.getMerkleProof(panoramaDepId, aliceHash);
  assert.equal(proofRes.merkleRoot, latestCommittedRoot);
  assert.equal(ConsentMerkleTree.verify(proofRes.proof, latestCommittedRoot, aliceHash, 6n), true);

  // 6. Permissioned Read for AI Training (requiredFlags = 6) -> returns ONLY Alice, NEVER Bob, NEVER PII!
  const readRes = await client.readConsentedRecords(panoramaDepId, {
    granteeAddress: buyerReader.address,
    dataId: newsDataId,
    requiredFlags: "6",
  });
  assert.equal(readRes.records.length, 1);
  assert.equal(readRes.records[0].meta.uidHash, aliceHash);
  assert.equal("pii" in readRes.records[0], false);

  // 7. Data Union Metering -> produces HolderAndShares[] ready for AdminControlledSplitter.setSharesMultiMeta
  const splitterAddr = "0x1111111111111111111111111111111111111111";
  await client.createDataUnion({
    id: "news-union",
    name: "News & Curation Data Union",
    splitterAddress: splitterAddr,
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [panoramaDepId, topNewsDepId],
  });

  const metered = await client.meterDataUnion("news-union", "2"); // News Data Union flag
  assert.equal(metered.totalConsentedRecords, 2);
  assert.equal(metered.updates.length, 2);

  // Sign EIP-712 SetSharesMulti from metered output
  const adminWallet = Wallet.createRandom();
  const signed = await signSetSharesMultiMeta(adminWallet, {
    splitterAddress: metered.splitterAddress!,
    chainId: 1n,
    updates: metered.updates.map((u) => ({ shareholder: u.shareholder, shares: BigInt(u.shares) })),
    nonce: 0n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
  });
  assert.equal(signed.r.length, 66);

  // 8. Marketplace Wallet Signature Auth + Offer Posting
  const nonceRes = (await fetchImpl(`${baseUrl}/market_public/accounts/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: adminWallet.address }),
  }).then((r) => r.json())) as { nonce: string };

  const walletSig = await adminWallet.signMessage(nonceRes.nonce);
  const verifyRes = (await fetchImpl(`${baseUrl}/market_public/accounts/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: adminWallet.address, signature: walletSig }),
  }).then((r) => r.json())) as { token: string };
  assert.ok(verifyRes.token);

  const marketAddr = "0x381cfafe120c0c2ffb35fdbb06791c4bfd61eeab";
  const postOfferRes = await fetchImpl(`${baseUrl}/market/${marketAddr}/offers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${verifyRes.token}`,
    },
    body: JSON.stringify({
      id: "101",
      deploymentId: panoramaDepId,
      dataId: newsDataId,
      title: "Panorama News Union Feed",
      beneficiary: splitterAddr,
      requiredFlags: "6",
    }),
  });
  assert.equal(postOfferRes.status, 201);

  const offers = await client.listMarketOffers(marketAddr);
  assert.equal(offers.data.length, 1);
  assert.equal(offers.data[0].beneficiary, splitterAddr);
});
