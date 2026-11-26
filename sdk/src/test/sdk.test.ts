import test from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import {
  ConsentMerkleTree,
  decryptDatasetPayload,
  deriveScopedDatasetKeyHex,
  encryptDatasetPayload,
  hashUserId,
  isValidSolanaPubkey,
  signSetBeneficiaryMeta,
  signSetSharesMultiMeta,
  SolanaDataUnionClient,
  STANDARD_CONSENT_FLAGS,
} from "../index";

test("ConsentMerkleTree builds deterministic roots and verifies proofs", () => {
  const u1 = hashUserId("panorama", "alice");
  const u2 = hashUserId("panorama", "bob");
  const u3 = hashUserId("top-news", "carol");

  const treeA = new ConsentMerkleTree([
    { uidHash: u1, flags: STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.AI_TRAINING },
    { uidHash: u2, flags: STANDARD_CONSENT_FLAGS.ANALYTICS },
    { uidHash: u3, flags: STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION },
  ]);

  // Reverse input order must yield identical root
  const treeB = new ConsentMerkleTree([
    { uidHash: u3, flags: STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION },
    { uidHash: u2, flags: STANDARD_CONSENT_FLAGS.ANALYTICS },
    { uidHash: u1, flags: STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.AI_TRAINING },
  ]);

  assert.equal(treeA.root, treeB.root);

  const proof1 = treeA.getProof(u1);
  assert.ok(proof1);
  assert.equal(ConsentMerkleTree.verify(proof1.proof, treeA.root, u1, proof1.flags), true);
  assert.equal(ConsentMerkleTree.verify(proof1.proof, treeA.root, u1, 999n), false);
});

test("EIP-712 helpers sign SetSharesMulti and SetBeneficiary payloads cleanly", async () => {
  const wallet = new Wallet("0x" + "11".repeat(32));
  const splitterAddress = "0x000000000000000000000000000000000000dEaD";

  const sharesSig = await signSetSharesMultiMeta(wallet, {
    splitterAddress,
    chainId: 1n,
    updates: [{ shareholder: wallet.address, shares: 500n }],
    nonce: 0n,
    deadline: 1999999999n,
  });
  assert.equal(sharesSig.r.length, 66);
  assert.equal(sharesSig.s.length, 66);
  assert.ok(sharesSig.v === 27 || sharesSig.v === 28);

  const benSig = await signSetBeneficiaryMeta(wallet, {
    splitterAddress,
    chainId: 1n,
    user: wallet.address,
    beneficiary: "0x000000000000000000000000000000000000bEEF",
    nonce: 0n,
    deadline: 1999999999n,
  });
  assert.equal(benSig.r.length, 66);
  assert.ok(benSig.v === 27 || benSig.v === 28);
});

test("SolanaDataUnionClient builds admin modify_shares and SPL transfer-hook withdraw plans", () => {
  const prog = "FTDP111111111111111111111111111111111111111";
  const pda = "Cmmt111111111111111111111111111111111111111";
  const mint = "CmtM111111111111111111111111111111111111111";
  const owner = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
  const user = "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs";

  assert.equal(isValidSolanaPubkey(owner), true);
  assert.equal(isValidSolanaPubkey("0x1234"), false);

  const adminClient = new SolanaDataUnionClient({
    cluster: "mainnet-beta",
    programId: prog,
    splitterPda: pda,
    variant: "admin",
  });
  const plans = adminClient.buildAdminShareUpdates(owner, [{ shareholder: user, shares: "300" }]);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].instruction, "modify_shares");
  assert.equal(plans[0].args.shares, "300");

  const splClient = new SolanaDataUnionClient({
    cluster: "mainnet-beta",
    programId: prog,
    splitterPda: pda,
    variant: "spl-transfer-hook",
    shareMint: mint,
  });
  const withdrawPlan = splClient.buildWithdrawPlan({ userPubkey: user, tokenIndex: 1, amount: "0" });
  assert.equal(withdrawPlan.instruction, "withdraw");
  assert.equal(withdrawPlan.args.tokenIndex, 1);
  assert.equal(withdrawPlan.accounts.mint, mint);
});

test("Client-side AES-256-GCM dataset encryption enforces context AAD and detects tampering", () => {
  const key = deriveScopedDatasetKeyHex("sdk-master-secret", "0xdep1", "0xdata1");
  const ctx = "0xdep1:0xdata1";
  const envelope = encryptDatasetPayload({ records: 42, topic: "news" }, key, ctx);

  const decrypted = decryptDatasetPayload<{ records: number; topic: string }>(envelope, key, ctx);
  assert.equal(decrypted.records, 42);
  assert.equal(decrypted.topic, "news");

  // Wrong context must fail
  assert.throws(() => decryptDatasetPayload(envelope, key, "0xdep2:0xdata1"));
  // Tampered auth tag must fail
  const tampered = { ...envelope, authTagHex: "00".repeat(16) };
  assert.throws(() => decryptDatasetPayload(tampered, key, ctx));
});
