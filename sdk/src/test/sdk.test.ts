import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
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

test("Embeddable <head> snippet classifies PII, hard-blocks secrets/passwords/auth cookies, and posts to /v1/records", async () => {
  const snippetPath = path.resolve(__dirname, "..", "ftdp-snippet.js");
  assert.ok(fs.existsSync(snippetPath), `Expected built snippet at ${snippetPath}`);
  const source = fs.readFileSync(snippetPath, "utf8");

  const capturedRequests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const sandbox: Record<string, unknown> = {
    crypto: globalThis.crypto,
    TextEncoder,
    URLSearchParams,
    fetch: async (url: string, init?: { body?: string }) => {
      capturedRequests.push({
        url,
        body: JSON.parse(init?.body || "{}"),
      });
      return { ok: true, status: 201, json: async () => ({ accepted: true }) };
    },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);

  const FTDP = sandbox.FTDP as {
    _classifyFormFields: (
      fields: Array<{ name: string; type?: string; value: string; ignore?: boolean }>,
      extraPii?: string[]
    ) => { anon: Record<string, string>; pii: Record<string, string> };
    _extractSafeCookies: (
      cookieStr: string,
      allowed?: string[]
    ) => { presentKeys: string[]; values: Record<string, string> };
    _extractUtmParams: (search: string) => Record<string, string>;
    init: (cfg: Record<string, unknown>) => unknown;
    track: (eventName: string, anon?: Record<string, unknown>, pii?: Record<string, unknown>) => Promise<unknown>;
  };

  // 1. Form field classification: hard-block passwords/payment/secrets, segregate PII vs anon
  const classified = FTDP._classifyFormFields(
    [
      { name: "plan", type: "select-one", value: "pro" },
      { name: "topic", type: "text", value: "open-protocols" },
      { name: "email", type: "email", value: "alice@example.com" },
      { name: "phone", type: "tel", value: "+1-555-0100" },
      { name: "full_name", type: "text", value: "Alice" },
      { name: "member_handle", type: "text", value: "@alice" },
      { name: "password", type: "password", value: "SuperSecret123!" },
      { name: "cvv", type: "text", value: "999" },
      { name: "credit_card", type: "text", value: "4111-1111" },
      { name: "ssn", type: "text", value: "123-45-6789" },
      { name: "csrf_token", type: "hidden", value: "tok_xyz" },
      { name: "resume", type: "file", value: "cv.pdf" },
      { name: "internal_note", type: "text", value: "skip-me", ignore: true },
    ],
    ["member_handle"]
  );

  assert.deepEqual({ ...classified.anon }, { plan: "pro", topic: "open-protocols" });
  assert.deepEqual(
    { ...classified.pii },
    {
      email: "alice@example.com",
      phone: "+1-555-0100",
      full_name: "Alice",
      member_handle: "@alice",
    }
  );
  for (const forbidden of ["password", "cvv", "credit_card", "ssn", "csrf_token", "resume", "internal_note"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(classified.anon, forbidden), false);
    assert.equal(Object.prototype.hasOwnProperty.call(classified.pii, forbidden), false);
  }

  // 2. Cookie sanitization: hard-block auth/session/jwt/csrf cookies; allowlist values only
  const cookies = FTDP._extractSafeCookies(
    "session_id=abc; jwt=eyJ123; auth_token=secret; csrf_token=xyz; theme=dark; locale=en-US; ab_bucket=B",
    ["theme", "locale"]
  );
  assert.deepEqual([...cookies.presentKeys], ["theme", "locale", "ab_bucket"]);
  assert.deepEqual({ ...cookies.values }, { theme: "dark", locale: "en-US" });

  // 3. UTM parameter extraction
  const utm = FTDP._extractUtmParams("?utm_source=newsletter&utm_campaign=launch&ref=ignore");
  assert.deepEqual({ ...utm }, { utm_source: "newsletter", utm_campaign: "launch" });

  // 4. End-to-end FTDP.init + FTDP.track emits POST /v1/records with segregated anon & pii
  FTDP.init({
    endpoint: "https://node.fairtradedata.org/",
    deploymentId: "0x" + "ab".repeat(32),
    namespace: "example.com",
    userId: "user-42",
    contributorWallet: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    consentFlags: "7",
  });
  await FTDP.track("form_submit", { fields: classified.anon }, classified.pii);

  assert.equal(capturedRequests.length, 1);
  assert.equal(capturedRequests[0].url, "https://node.fairtradedata.org/v1/records");
  assert.equal(capturedRequests[0].body.flags, "7");
  assert.deepEqual((capturedRequests[0].body.pii as Record<string, string>).email, "alice@example.com");
  assert.equal(
    (capturedRequests[0].body.anon as Record<string, string>).contributorWallet,
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  );
});
