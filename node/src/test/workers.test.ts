import test from "node:test";
import assert from "node:assert/strict";
import { ethers, Wallet } from "ethers";
import { hashUserId, SolanaInstructionPlan, STANDARD_CONSENT_FLAGS } from "@ftdp/sdk";
import { FtdpStore } from "../store";
import { ChainBridge } from "../chainBridge";
import { GrantExpirationReaper } from "../reaper";
import {
  DualChainMeteringWorker,
  EvmShareRelayPayload,
  MerkleCommitWorker,
  syncAccessSetEventToReaper,
} from "../workers";

test("MerkleCommitWorker commits changed consent roots once and skips unchanged deployments", async () => {
  const store = new FtdpStore();
  const depId = ethers.keccak256(ethers.toUtf8Bytes("deployment:worker-test"));
  const commits: Array<{ depId: string; root: string }> = [];

  const mockBridge: ChainBridge = {
    async hasWriteRole() { return true; },
    async getDeploymentIdForKey() { return depId; },
    async getPermissions() { return { requiredFlags: 0n, readRoles: 0n, expires: 0n }; },
    async canRead() { return true; },
    async commitOptInMerkleRoot(d, root) {
      commits.push({ depId: d, root });
      return { txHash: "0x" + "aa".repeat(32) };
    },
  };

  store.addRecord(depId, {
    meta: {
      recordId: "w-1",
      deploymentId: depId,
      uidHash: hashUserId("test", "alice"),
      schemaVersion: "1.0.0",
      timestamp: 1700000000,
    },
    flags: "6",
    anon: { event: "click" },
  });

  const worker = new MerkleCommitWorker(store, mockBridge);
  const run1 = await worker.runOnce();
  assert.equal(run1.committed.length, 1);
  assert.equal(run1.skippedUnchanged, 0);

  // Second run with no new consent changes MUST skip on-chain commit
  const run2 = await worker.runOnce();
  assert.equal(run2.committed.length, 0);
  assert.equal(run2.skippedUnchanged, 1);
  assert.equal(commits.length, 1);
});

test("DualChainMeteringWorker signs EIP-712 EVM updates & builds Solana Anchor plans idempotently", async () => {
  const store = new FtdpStore();
  const depId = ethers.keccak256(ethers.toUtf8Bytes("deployment:dual-worker"));
  const evmAdmin = Wallet.createRandom();
  const evmContributor = Wallet.createRandom();
  const solOwner = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
  const solContributor = "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs";

  store.state.unions["dual-comment"] = {
    id: "dual-comment",
    name: "Dual Comment Union",
    chainMode: "dual",
    splitterAddress: "0x1111111111111111111111111111111111111111",
    solana: {
      cluster: "devnet",
      programId: "FTDP111111111111111111111111111111111111111",
      splitterPda: "Cmmt111111111111111111111111111111111111111",
      variant: "admin",
    },
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [depId],
    createdAt: 1700000000,
  };

  store.addRecord(depId, {
    meta: {
      recordId: "d-1",
      deploymentId: depId,
      uidHash: hashUserId("dual", "u1"),
      schemaVersion: "1.0.0",
      timestamp: 1700000000,
    },
    flags: STANDARD_CONSENT_FLAGS.KARMA_REPUTATION.toString(),
    anon: {
      kind: "comment",
      contributorWallet: evmContributor.address,
      contributorSolanaWallet: solContributor,
    },
  });

  const evmPayloads: EvmShareRelayPayload[] = [];
  const solPayloads: SolanaInstructionPlan[][] = [];

  const worker = new DualChainMeteringWorker({
    store,
    evmSigner: evmAdmin,
    evmChainId: 100n,
    solanaOwnerPubkey: solOwner,
    requiredFlags: STANDARD_CONSENT_FLAGS.KARMA_REPUTATION,
    onEvmRelay: async (p) => { evmPayloads.push(p); },
    onSolanaRelay: async (_id, plans) => { solPayloads.push(plans); },
  });

  const r1 = await worker.runOnce();
  assert.equal(r1.evmRelayed, 1);
  assert.equal(r1.solanaRelayed, 1);
  assert.equal(evmPayloads[0].updates[0].shareholder, evmContributor.address);
  assert.equal(solPayloads[0][0].instruction, "modify_shares");

  // Second run with unchanged records skips both relays
  const r2 = await worker.runOnce();
  assert.equal(r2.evmRelayed, 0);
  assert.equal(r2.solanaRelayed, 0);
  assert.equal(r2.skippedUnchanged, 1);

  // Sync AccessSet event into GrantExpirationReaper and verify expiry sweep
  const reaper = new GrantExpirationReaper();
  await syncAccessSetEventToReaper({
    reaper,
    grantorDeploymentId: depId,
    granteeDeploymentId: ethers.keccak256(ethers.toUtf8Bytes("buyer")),
    buyerDid: "did:key:buyer1",
    docIds: ["bae-anon-1"],
    expires: 1700000500,
  });
  assert.equal(reaper.getActiveGrants().length, 1);
  const reaped = await reaper.reapExpiredGrants(1700000501);
  assert.equal(reaped.revokedGrants, 1);
  assert.equal(reaper.getActiveGrants().length, 0);
});
