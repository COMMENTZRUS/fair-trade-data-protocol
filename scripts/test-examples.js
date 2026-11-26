/**
 * Ecosystem App Integration Verification (Milestone 4)
 *
 * Verifies all 4 independent ecosystem archetypes plugging into FTDP strictly
 * over the public @ftdp/sdk + ftdp-node boundary:
 *   1. Panorama (Layer 1 Deployment via FtdpClient — strictly decoupled)
 *   2. Streamy  (Layer 1 Video view receipts + Ad preferences — media on CDN/IPFS)
 *   3. Top News (Layer 2 on Comment Protocol — news:// threads & votes)
 *   4. RateMyVideo (Layer 2 on Comment Protocol — streamy://<cid> star ratings & portable karma)
 */
const assert = require("node:assert/strict");
const { ethers } = require("../node/node_modules/ethers");
const {
  CommentProtocolClient,
  FtdpClient,
  hashUserId,
  STANDARD_CONSENT_FLAGS,
} = require("../sdk/dist/index.js");
const { FtdpStore } = require("../node/dist/store.js");
const { createFtdpServer } = require("../node/dist/server.js");

async function main() {
  const store = new FtdpStore();
  const { fetchImpl } = createFtdpServer({ store });
  const baseUrl = "http://ftdp.local";

  const panoramaDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:panorama-public-boundary"));
  const streamyDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:streamy-video-v1"));
  const topNewsDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:top-news-v1"));
  const rmvDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:ratemyvideo-v1"));

  const aliceEvm = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const aliceSol = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
  const bobEvm = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
  const videoCid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  const streamyTargetUri = `streamy://${videoCid}`;
  const newsTargetUri = "news://fairtradedata.org/launch-v1";

  const ftdp = new FtdpClient({ baseUrl, fetchImpl });

  // 1. Panorama (Layer 1) connects strictly via public FtdpClient
  const panIngest = await ftdp.trackEvent({
    deploymentId: panoramaDepId,
    namespace: "panorama",
    userId: "alice",
    flags: STANDARD_CONSENT_FLAGS.ANALYTICS | STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.AI_TRAINING,
    contributorWallet: aliceEvm,
    contributorSolanaWallet: aliceSol,
    anon: {
      event: "story_curated",
      topic: "fair-trade-data",
    },
    pii: { email: "alice@panorama.example" },
  });
  assert.equal(panIngest.accepted, true);

  // 2. Streamy (Layer 1) emits video view receipt & ad consent preferences (media stays off-protocol on CDN/IPFS)
  const streamyIngest = await ftdp.trackEvent({
    deploymentId: streamyDepId,
    namespace: "streamy",
    userId: "bob",
    flags: STANDARD_CONSENT_FLAGS.ANALYTICS | STANDARD_CONSENT_FLAGS.AD_PERSONALIZATION | STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION,
    contributorWallet: bobEvm,
    anon: {
      event: "video_view_receipt",
      targetUri: streamyTargetUri,
      watchSeconds: 185,
      adCategories: ["developer-tools", "open-source"],
    },
  });
  assert.equal(streamyIngest.accepted, true);

  // 3. Top News & RateMyVideo (Layer 2) share Comment Protocol v1 + portable karma
  const commentClient = new CommentProtocolClient(ftdp, baseUrl, fetchImpl);

  const newsCommentRes = await commentClient.postComment({
    deploymentId: topNewsDepId,
    namespace: "comment-protocol",
    userId: "alice",
    targetUri: newsTargetUri,
    body: "Open-source Data Unions align publishers and readers.",
    contributorWallet: aliceEvm,
    contributorSolanaWallet: aliceSol,
  });
  assert.equal(newsCommentRes.accepted, true);

  const videoReviewRes = await commentClient.postRating({
    deploymentId: rmvDepId,
    namespace: "comment-protocol",
    userId: "alice",
    targetUri: streamyTargetUri,
    score: 5,
    review: "Crystal clear Streamy broadcast on FTDP architecture!",
    contributorWallet: aliceEvm,
    contributorSolanaWallet: aliceSol,
  });
  assert.equal(videoReviewRes.accepted, true);

  const voteRes = await commentClient.castVote({
    deploymentId: rmvDepId,
    namespace: "comment-protocol",
    userId: "bob",
    targetUri: streamyTargetUri,
    direction: 1,
    contributorWallet: bobEvm,
  });
  assert.equal(voteRes.accepted, true);

  // Verify RateMyVideo aggregate rating & vote score on the Streamy CID target
  const thread = await commentClient.getThread(streamyTargetUri);
  assert.equal(thread.ratingCount, 1);
  assert.equal(thread.averageRating, 5);
  assert.equal(thread.voteScore, 1);

  // Verify portable cross-app karma spans both Top News and RateMyVideo
  const sharedAuthorUid = hashUserId("comment-protocol", "alice");
  const karma = await commentClient.getUserKarma(sharedAuthorUid);
  assert.ok(karma.totalKarma > 0, "Expected positive portable karma across Top News + RateMyVideo");
  assert.equal(karma.deployments.length, 2, "Expected karma aggregated across 2 independent deployments");

  // 4. Register shared Dual-Chain Ecosystem Root Union and verify metering across all 4 apps
  const unionRes = await fetchImpl(`${baseUrl}/api/v1/unions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "ftdp-media-social-root",
      name: "FTDP Media & Social Root Union",
      chainMode: "dual",
      splitterAddress: "0x1000000000000000000000000000000000000001",
      solana: {
        cluster: "devnet",
        programId: "FTDP111111111111111111111111111111111111111",
        splitterPda: "Cmmt111111111111111111111111111111111111111",
        variant: "admin",
      },
      deploymentIds: [panoramaDepId, streamyDepId, topNewsDepId, rmvDepId],
    }),
  });
  assert.equal(unionRes.status, 201);

  const meterRes = await fetchImpl(`${baseUrl}/api/v1/unions/ftdp-media-social-root/meter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requiredFlags: STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION.toString() }),
  });
  assert.equal(meterRes.status, 200);
  const metered = await meterRes.json();
  assert.ok(metered.updates.length >= 2, "Expected both Alice and Bob metered on EVM");
  assert.equal(metered.solanaUpdates.length, 1, "Expected Alice metered on Solana");
  assert.equal(metered.solanaUpdates[0].shareholder, aliceSol);

  console.log("  PASS  Ecosystem App Integrations: Panorama + Streamy + Top News + RateMyVideo -> Dual-Chain Union Metering");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
