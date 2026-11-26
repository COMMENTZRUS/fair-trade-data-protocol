const assert = require("assert");
const { ethers, Wallet } = require("../contracts/node_modules/ethers");
const { FtdpClient, CommentProtocolClient, STANDARD_CONSENT_FLAGS } = require("../sdk/dist/index.js");
const { createFtdpServer } = require("../node/dist/server.js");
const { FtdpStore } = require("../node/dist/store.js");

async function main() {
  const remoteUrl = process.env.FTDP_NODE_URL;
  let fetchImpl = globalThis.fetch;
  let baseUrl = remoteUrl || "http://ftdp.local";

  if (!remoteUrl) {
    const store = new FtdpStore();
    const srv = createFtdpServer({ store });
    fetchImpl = srv.fetchImpl;
  }

  const ftdp = new FtdpClient({ baseUrl, fetchImpl });
  const comments = new CommentProtocolClient(ftdp, baseUrl, fetchImpl);

  const health = await ftdp.health();
  assert.strictEqual(health.status, "ok");

  const depId = ethers.keccak256(ethers.toUtf8Bytes("deployment:smoke-test"));
  const buyer = Wallet.createRandom();
  const contributor = Wallet.createRandom();

  await ftdp.createDeployment({ id: depId, organizationId: "smoke-org", name: "Smoke App", adminAddress: contributor.address });
  await comments.postRating({
    deploymentId: depId,
    namespace: "smoke",
    userId: "u1",
    targetUri: "streamy://smoke-cid-1",
    score: 5,
    review: "Smoke test passed",
    contributorWallet: contributor.address,
    flags: STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.KARMA_REPUTATION,
  });

  // Verify Compute-to-Data aggregate endpoint returns aggregate metrics with zero raw records
  const c2dRes = await fetchImpl(`${baseUrl}/v1/compute/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deploymentId: depId,
      granteeAddress: buyer.address,
      requiredFlags: STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION.toString(),
      algorithm: "avg_rating",
    }),
  }).then((r) => r.json());

  assert.strictEqual(c2dRes.result.averageRating, 5);
  assert.ok(c2dRes.resultCidHash.startsWith("0x"));
  assert.ok(c2dRes.attestationHash.startsWith("0x"));
  assert.strictEqual("records" in c2dRes, false);

  console.log(`  PASS  FTDP Live Smoke Test (${remoteUrl ? remoteUrl : "in-process"}): health + comment + Compute-to-Data verified`);
}

main().catch((err) => {
  console.error("  FAIL  FTDP Live Smoke Test:", err);
  process.exit(1);
});
