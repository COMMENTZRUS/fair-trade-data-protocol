import test from "node:test";
import assert from "node:assert/strict";
import { ethers, Wallet } from "ethers";
import {
  CommentProtocolClient,
  FtdpClient,
  hashUserId,
  SolanaDataUnionClient,
  STANDARD_CONSENT_FLAGS,
} from "@ftdp/sdk";
import { createFtdpServer } from "../server";
import { FtdpStore } from "../store";

test("Comment Protocol v1: Top News + RateMyVideo + Streamy cross-linked threads, portable karma & union metering", async () => {
  const store = new FtdpStore();
  const { fetchImpl } = createFtdpServer({ store });
  const baseUrl = "http://ftdp.local";

  const ftdp = new FtdpClient({ baseUrl, fetchImpl });
  const commentClient = new CommentProtocolClient(ftdp, baseUrl, fetchImpl);

  const topNewsDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:top-news"));
  const rateMyVideoDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:ratemyvideo"));
  const streamyDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:streamy"));

  const aliceWallet = Wallet.createRandom();
  const bobWallet = Wallet.createRandom();
  const aliceSolWallet = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
  const bobSolWallet = "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs";

  const solBinding = {
    cluster: "mainnet-beta" as const,
    programId: "FTDP111111111111111111111111111111111111111",
    splitterPda: "Cmmt111111111111111111111111111111111111111",
    variant: "admin" as const,
  };

  // Register Dual-Chain (EVM + Solana) Comment Protocol Data Union spanning Top News, RateMyVideo & Streamy
  await ftdp.createDataUnion({
    id: "comment-protocol-union",
    name: "Comment Protocol Data Union (Tier-2 Dual-Chain)",
    chainMode: "dual",
    splitterAddress: "0x4444444444444444444444444444444444444444",
    solana: solBinding,
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [topNewsDepId, rateMyVideoDepId, streamyDepId],
  });

  const streamyVideoUri = "streamy://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  const topNewsArticleUri = "news://ftdp-open-protocol-launch";

  // 1. Alice (dual-chain EVM + Solana contributor) comments & upvotes on Top News
  await commentClient.postComment({
    deploymentId: topNewsDepId,
    namespace: "ftdp-global",
    userId: "alice",
    targetUri: topNewsArticleUri,
    body: "Open Data Unions with O(1) splitters are a game changer.",
    contributorWallet: aliceWallet.address,
    contributorSolanaWallet: aliceSolWallet,
  });
  await commentClient.castVote({
    deploymentId: topNewsDepId,
    namespace: "ftdp-global",
    userId: "alice",
    targetUri: topNewsArticleUri,
    direction: 1,
    contributorWallet: aliceWallet.address,
    contributorSolanaWallet: aliceSolWallet,
  });

  // 2. Alice & Bob rate and review a Streamy video inside RateMyVideo (cross-linked via streamy://<cid>)
  await commentClient.postRating({
    deploymentId: rateMyVideoDepId,
    namespace: "ftdp-global",
    userId: "alice",
    targetUri: streamyVideoUri,
    score: 5,
    maxScore: 5,
    review: "Crisp decentralized stream!",
    contributorWallet: aliceWallet.address,
    contributorSolanaWallet: aliceSolWallet,
  });
  await commentClient.postRating({
    deploymentId: rateMyVideoDepId,
    namespace: "ftdp-global",
    userId: "bob",
    targetUri: streamyVideoUri,
    score: 4,
    maxScore: 5,
    review: "Great audio quality.",
    contributorWallet: bobWallet.address,
    contributorSolanaWallet: bobSolWallet,
  });
  await commentClient.postComment({
    deploymentId: streamyDepId,
    namespace: "ftdp-global",
    userId: "bob",
    targetUri: streamyVideoUri,
    body: "Watching live on Streamy!",
    contributorWallet: bobWallet.address,
    contributorSolanaWallet: bobSolWallet,
  });

  // 3. Streamy fetches unified thread for its video CID -> sees RateMyVideo ratings + Streamy comment!
  const videoThread = await commentClient.getThread(streamyVideoUri);
  assert.equal(videoThread.ratingCount, 2);
  assert.equal(videoThread.averageRating, 4.5);
  assert.equal(videoThread.commentCount, 1);

  // 4. Top News fetches article thread -> sees comment + upvote score
  const newsThread = await commentClient.getThread(topNewsArticleUri);
  assert.equal(newsThread.commentCount, 1);
  assert.equal(newsThread.voteScore, 1);

  // 5. Alice's portable karma aggregates across BOTH Top News and RateMyVideo (1 comment=5 + 1 rating=3 + 1 vote=1 = 9)
  const aliceUidHash = hashUserId("ftdp-global", "alice");
  const aliceKarma = await commentClient.getUserKarma(aliceUidHash);
  assert.equal(aliceKarma.totalKarma, 9);
  assert.equal(aliceKarma.deployments.length, 2);

  // 6. Dual-Chain Metering -> outputs BOTH EVM HolderAndShares[] AND Solana modify_shares plans!
  const metered = await ftdp.meterDataUnion("comment-protocol-union", STANDARD_CONSENT_FLAGS.KARMA_REPUTATION.toString());
  assert.equal(metered.chainMode, "dual");
  assert.equal(metered.totalConsentedRecords, 5);
  assert.equal(metered.updates.length, 2);
  assert.equal(metered.solanaUpdates.length, 2);

  const solClient = new SolanaDataUnionClient(solBinding);
  const solPlans = solClient.buildAdminShareUpdates(aliceSolWallet, metered.solanaUpdates);
  assert.equal(solPlans.length, 2);
  assert.equal(solPlans[0].instruction, "modify_shares");
});
