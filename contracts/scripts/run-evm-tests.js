const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { createVM, runTx } = require("@ethereumjs/vm");
const { createBlock } = require("@ethereumjs/block");
const { Common, Mainnet, Hardfork } = require("@ethereumjs/common");
const { createLegacyTx } = require("@ethereumjs/tx");
const { Account, createAddressFromString, hexToBytes, bytesToHex } = require("@ethereumjs/util");

const BUILD_DIR = path.resolve(__dirname, "..", "build");
const CHAIN_ID = 1n; // Mainnet common chainId

function loadArtifact(name) {
  return JSON.parse(fs.readFileSync(path.join(BUILD_DIR, `${name}.json`), "utf8"));
}

async function createTestEnv(numAccounts = 15) {
  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
  const vm = await createVM({ common });

  const wallets = [];
  for (let i = 1; i <= numAccounts; i++) {
    const pk = "0x" + i.toString(16).padStart(64, "0");
    const wallet = new ethers.Wallet(pk);
    const addr = createAddressFromString(wallet.address);
    await vm.stateManager.putAccount(
      addr,
      new Account(0n, ethers.parseEther("10000"))
    );
    wallets.push({ wallet, pkBytes: hexToBytes(pk), address: wallet.address });
  }

  let blockNumber = 1n;
  let timestamp = BigInt(Math.floor(Date.now() / 1000));

  function makeBlock() {
    blockNumber += 1n;
    timestamp += 12n;
    return createBlock(
      {
        header: {
          number: blockNumber,
          timestamp,
          gasLimit: 30_000_000n,
          baseFeePerGas: 0n,
          coinbase: createAddressFromString(ethers.ZeroAddress),
        },
      },
      { common }
    );
  }

  async function sendTx(signer, { to, data = "0x", value = 0n }) {
    const addr = createAddressFromString(signer.address);
    const acct = await vm.stateManager.getAccount(addr);
    const txData = {
      nonce: acct ? acct.nonce : 0n,
      gasPrice: 0n,
      gasLimit: 15_000_000n,
      to: to ? createAddressFromString(to) : undefined,
      value,
      data: hexToBytes(data),
    };
    const tx = createLegacyTx(txData, { common }).sign(signer.pkBytes);
    const result = await runTx(vm, {
      tx,
      block: makeBlock(),
      skipBlockGasLimitValidation: true,
    });
    if (result.execResult.exceptionError) {
      const retHex = bytesToHex(result.execResult.returnValue);
      const err = new Error(
        `EVM Revert: ${result.execResult.exceptionError.error} (returnData=${retHex})`
      );
      err.returnData = retHex;
      throw err;
    }
    return result;
  }

  async function staticCall(to, abi, fnName, args = []) {
    const iface = new ethers.Interface(abi);
    const data = iface.encodeFunctionData(fnName, args);
    const res = await vm.evm.runCall({
      to: createAddressFromString(to),
      data: hexToBytes(data),
      gasLimit: 10_000_000n,
      block: makeBlock(),
      isStatic: true,
    });
    if (res.execResult.exceptionError) {
      const retHex = bytesToHex(res.execResult.returnValue);
      throw new Error(`StaticCall Revert (${fnName}): ${res.execResult.exceptionError.error} (${retHex})`);
    }
    const decoded = iface.decodeFunctionResult(fnName, bytesToHex(res.execResult.returnValue));
    return decoded.length === 1 ? decoded[0] : decoded;
  }

  async function deploy(signer, contractName, args = []) {
    const artifact = loadArtifact(contractName);
    const iface = new ethers.Interface(artifact.abi);
    const encodedArgs = args.length > 0 ? iface.encodeDeploy(args).slice(2) : "";
    const deployData = artifact.bytecode + encodedArgs;
    const res = await sendTx(signer, { data: deployData });
    const deployedAddress = ethers.getAddress(res.createdAddress.toString());
    return bind(deployedAddress, contractName);
  }

  function bind(address, contractName) {
    const artifact = loadArtifact(contractName);
    const iface = new ethers.Interface(artifact.abi);
    return {
      address,
      abi: artifact.abi,
      iface,
      async call(fnName, ...args) {
        return staticCall(address, artifact.abi, fnName, args);
      },
      async tx(signer, fnName, args = [], value = 0n) {
        const data = iface.encodeFunctionData(fnName, args);
        return sendTx(signer, { to: address, data, value });
      },
    };
  }

  async function getBalance(addr) {
    const acct = await vm.stateManager.getAccount(createAddressFromString(addr));
    return acct ? acct.balance : 0n;
  }

  return { wallets, sendTx, deploy, bind, getBalance, getTimestamp: () => timestamp };
}

function buildMerkleTree(leaves) {
  const hashPair = (a, b) =>
    BigInt(a) <= BigInt(b)
      ? ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [a, b])
      : ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [b, a]);

  const layers = [leaves.slice()];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
    }
    layers.push(next);
  }
  const root = layers[layers.length - 1][0];
  const getProof = (index) => {
    const proof = [];
    let idx = index;
    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level];
      const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (pairIdx < layer.length) proof.push(layer[pairIdx]);
      idx = Math.floor(idx / 2);
    }
    return proof;
  };
  return { root, getProof };
}

async function expectRevert(promise, customErrorName, iface) {
  try {
    await promise;
    assert.fail(`Expected revert (${customErrorName}), but succeeded`);
  } catch (err) {
    if (customErrorName && iface && err.returnData && err.returnData !== "0x") {
      const parsed = iface.parseError(err.returnData);
      assert.strictEqual(parsed.name, customErrorName, `Expected ${customErrorName}, got ${parsed.name}`);
    }
  }
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("Bug 1 Regression: saveRPS accounts for tokens[1..n] when tokens[0] (ETH) has 0 receipts", async () => {
  const env = await createTestEnv();
  const [owner, admin, , u1, u2] = env.wallets;
  const usdc = await env.deploy(owner, "MockERC20", ["USD Coin", "USDC", 6]);
  const ftd = await env.deploy(owner, "MockERC20", ["Fair Trade Data", "FTD", 18]);
  const tokens = [ethers.ZeroAddress, usdc.address, ftd.address];

  const factory = await env.deploy(owner, "DataUnionFactory", [tokens, owner.address]);
  await usdc.tx(owner, "mint", [owner.address, ethers.parseUnits("1000000", 6)]);
  await ftd.tx(owner, "mint", [owner.address, ethers.parseEther("1000000")]);

  await factory.tx(owner, "createAdminDataUnion", ["multi-token", "MultiToken Union", admin.address, tokens, ethers.ZeroAddress, 0n]);
  const unionAddr = await factory.call("allUnions", 0);
  const union = env.bind(unionAddr, "AdminControlledSplitter");

  await union.tx(admin, "setShares", [u1.address, 100n]);
  const usdcAmt = ethers.parseUnits("1000", 6);
  const ftdAmt = ethers.parseEther("500");
  await usdc.tx(owner, "transfer", [unionAddr, usdcAmt]);
  await ftd.tx(owner, "transfer", [unionAddr, ftdAmt]);

  // u2 joins with 100 shares -> saveRPS MUST account for USDC & FTD despite 0 ETH!
  await union.tx(admin, "setShares", [u2.address, 100n]);

  assert.strictEqual(await union.call("availableAllotment", u1.address, usdc.address), usdcAmt);
  assert.strictEqual(await union.call("availableAllotment", u1.address, ftd.address), ftdAmt);
  assert.strictEqual(await union.call("availableAllotment", u2.address, usdc.address), 0n);
  assert.strictEqual(await union.call("availableAllotment", u2.address, ftd.address), 0n);

  // Subsequent 1000 USDC splits 50/50
  await usdc.tx(owner, "transfer", [unionAddr, usdcAmt]);
  assert.strictEqual(await union.call("availableAllotment", u1.address, usdc.address), ethers.parseUnits("1500", 6));
  assert.strictEqual(await union.call("availableAllotment", u2.address, usdc.address), ethers.parseUnits("500", 6));
});

test("Bug 2 & 4 Regression: AutoPullSplitter wires upstream in init() and pulls on-demand during withdraw()", async () => {
  const env = await createTestEnv();
  const [owner, admin, , u1, u2] = env.wallets;
  const usdc = await env.deploy(owner, "MockERC20", ["USD Coin", "USDC", 6]);
  const tokens = [ethers.ZeroAddress, usdc.address];

  const factory = await env.deploy(owner, "DataUnionFactory", [tokens, owner.address]);
  await usdc.tx(owner, "mint", [owner.address, ethers.parseUnits("100000", 6)]);

  await factory.tx(owner, "createAdminDataUnion", ["root", "Root Union", admin.address, tokens, ethers.ZeroAddress, 0n]);
  const rootAddr = await factory.call("allUnions", 0);
  const root = env.bind(rootAddr, "AdminControlledSplitter");

  await factory.tx(owner, "createAdminDataUnion", ["sub", "App Sub", admin.address, tokens, rootAddr, 0n]);
  const subAddr = await factory.call("allUnions", 1);
  const sub = env.bind(subAddr, "AdminControlledSplitter");

  assert.strictEqual(await sub.call("upstreamSplitter"), rootAddr);

  await root.tx(admin, "setShares", [subAddr, 100n]);
  await sub.tx(admin, "setSharesMulti", [[
    { shareholder: u1.address, shares: 60n },
    { shareholder: u2.address, shares: 40n },
  ]]);

  await usdc.tx(owner, "transfer", [rootAddr, ethers.parseUnits("1000", 6)]);
  assert.strictEqual(await usdc.call("balanceOf", subAddr), 0n);

  // Withdraw directly from Tier-2 BEFORE any saveRPS/pullAllFromUpstream
  await sub.tx(u1, "withdrawAll", [u1.address, usdc.address]);
  assert.strictEqual(await usdc.call("balanceOf", u1.address), ethers.parseUnits("600", 6));

  await sub.tx(u2, "withdrawAll", [u2.address, usdc.address]);
  assert.strictEqual(await usdc.call("balanceOf", u2.address), ethers.parseUnits("400", 6));
});

test("Bug 3 Regression: setSharesMultiMeta succeeds when relayed by third party and blocks replay", async () => {
  const env = await createTestEnv();
  const [owner, admin, relayer, u1, u2] = env.wallets;
  const usdc = await env.deploy(owner, "MockERC20", ["USD Coin", "USDC", 6]);
  const tokens = [ethers.ZeroAddress, usdc.address];
  const factory = await env.deploy(owner, "DataUnionFactory", [tokens, owner.address]);

  await factory.tx(owner, "createAdminDataUnion", ["meta", "Meta Union", admin.address, tokens, ethers.ZeroAddress, 0n]);
  const unionAddr = await factory.call("allUnions", 0);
  const union = env.bind(unionAddr, "AdminControlledSplitter");

  const deadline = env.getTimestamp() + 3600n;
  const nonce = await union.call("nonces", admin.address);
  const updates = [
    { shareholder: u1.address, shares: 750n },
    { shareholder: u2.address, shares: 250n },
  ];

  const sig = await admin.wallet.signTypedData(
    { name: "FTDPDataUnion", version: "1", chainId: CHAIN_ID, verifyingContract: unionAddr },
    {
      HolderAndShares: [
        { name: "shareholder", type: "address" },
        { name: "shares", type: "uint256" },
      ],
      SetSharesMulti: [
        { name: "updates", type: "HolderAndShares[]" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    { updates, nonce, deadline }
  );
  const { v, r, s } = ethers.Signature.from(sig);

  await union.tx(relayer, "setSharesMultiMeta", [updates, deadline, v, r, s]);
  assert.strictEqual(await union.call("shares", u1.address), 750n);
  assert.strictEqual(await union.call("shares", u2.address), 250n);
  assert.strictEqual(await union.call("totalShares"), 1000n);

  // Replay must revert with InvalidSignature
  await expectRevert(
    union.tx(relayer, "setSharesMultiMeta", [updates, deadline, v, r, s]),
    "InvalidSignature",
    union.iface
  );
});

test("Bug 4b Hardening: ReentrancyGuard blocks native ETH reentrancy on withdrawAll", async () => {
  const env = await createTestEnv();
  const [owner, admin] = env.wallets;
  const tokens = [ethers.ZeroAddress];
  const factory = await env.deploy(owner, "DataUnionFactory", [tokens, owner.address]);

  await factory.tx(owner, "createAdminDataUnion", ["guard", "Guard Union", admin.address, tokens, ethers.ZeroAddress, 0n]);
  const unionAddr = await factory.call("allUnions", 0);
  const union = env.bind(unionAddr, "AdminControlledSplitter");

  const attacker = await env.deploy(owner, "ReentrantReceiver", [unionAddr]);
  await union.tx(admin, "setShares", [attacker.address, 100n]);
  await env.sendTx(owner, { to: unionAddr, value: ethers.parseEther("2") });

  await attacker.tx(owner, "attack");
  assert.strictEqual(await attacker.call("attempted"), true);
  assert.strictEqual(await attacker.call("reentrancySucceeded"), false);
  assert.strictEqual(await env.getBalance(attacker.address), ethers.parseEther("2"));
});

test("Bug 5 Feature: Clone-deployed VotesSplitterShare supports custom name/symbol, governance votes, and dynamic mint", async () => {
  const env = await createTestEnv();
  const [owner, admin, , u1, u2] = env.wallets;
  const ftd = await env.deploy(owner, "MockERC20", ["Fair Trade Data", "FTD", 18]);
  const tokens = [ethers.ZeroAddress, ftd.address];
  const factory = await env.deploy(owner, "DataUnionFactory", [tokens, owner.address]);
  await ftd.tx(owner, "mint", [owner.address, ethers.parseEther("10000")]);

  await factory.tx(owner, "createVotesDataUnion", [
    "dao-1",
    "FTDP News DAO Union",
    "FNEWS",
    ethers.parseEther("100"),
    u1.address,
    admin.address,
    tokens,
    ethers.ZeroAddress,
    0n,
  ]);
  const splitterAddr = await factory.call("allUnions", 0);
  const info = await factory.call("unionInfo", splitterAddr);
  const splitter = env.bind(splitterAddr, "ERC20SharesSplitter");
  const shareToken = env.bind(info.sharesToken, "VotesSplitterShare");

  assert.strictEqual(await shareToken.call("name"), "FTDP News DAO Union");
  assert.strictEqual(await shareToken.call("symbol"), "FNEWS");

  await shareToken.tx(u1, "delegate", [u1.address]);
  assert.strictEqual(await shareToken.call("getVotes", u1.address), ethers.parseEther("100"));

  await ftd.tx(owner, "transfer", [splitterAddr, ethers.parseEther("100")]);

  // Mint 100 shares to u2 -> 50/50 going forward
  await shareToken.tx(admin, "mint", [u2.address, ethers.parseEther("100")]);
  await shareToken.tx(u2, "delegate", [u2.address]);
  assert.strictEqual(await shareToken.call("getVotes", u2.address), ethers.parseEther("100"));

  await ftd.tx(owner, "transfer", [splitterAddr, ethers.parseEther("100")]);

  assert.strictEqual(await splitter.call("availableAllotment", u1.address, ftd.address), ethers.parseEther("150"));
  assert.strictEqual(await splitter.call("availableAllotment", u2.address, ftd.address), ethers.parseEther("50"));

  await splitter.tx(u1, "withdrawAll", [u1.address, ftd.address]);
  await splitter.tx(u2, "withdrawAll", [u2.address, ftd.address]);
  assert.strictEqual(await ftd.call("balanceOf", u1.address), ethers.parseEther("150"));
  assert.strictEqual(await ftd.call("balanceOf", u2.address), ethers.parseEther("50"));
});

test("FTDP End-to-End: Panorama + Top News Cascading Data Unions + SLS Consent Merkle Proofs + Market Purchase", async () => {
  const env = await createTestEnv(15);
  const [
    ftdfAdmin,
    ftdfTreasury,
    panoramaAdmin,
    panoramaOp,
    panoramaUser1,
    panoramaUser2,
    panoramaUser2ColdWallet,
    panoramaUser3LateJoiner,
    topNewsAdmin,
    topNewsOp,
    topNewsReader1,
    aiBuyerAdmin,
    aiBuyerReaderKey,
    relayer,
  ] = env.wallets;

  const usdc = await env.deploy(ftdfAdmin, "MockERC20", ["USD Coin", "USDC", 6]);
  const ftd = await env.deploy(ftdfAdmin, "MockERC20", ["Fair Trade Data", "FTD", 18]);
  const supportedTokens = [ethers.ZeroAddress, usdc.address, ftd.address];

  await usdc.tx(ftdfAdmin, "mint", [aiBuyerAdmin.address, ethers.parseUnits("100000", 6)]);
  await ftd.tx(ftdfAdmin, "mint", [aiBuyerAdmin.address, ethers.parseEther("100000")]);

  const clientConfig = await env.deploy(ftdfAdmin, "ClientConfigManager", [ftdfAdmin.address]);
  const accessPermissions = await env.deploy(ftdfAdmin, "AccessPermissions", [clientConfig.address, ftdfAdmin.address]);
  const market = await env.deploy(ftdfAdmin, "Market", [clientConfig.address, accessPermissions.address]);
  await accessPermissions.tx(ftdfAdmin, "setAuthorizedMarket", [market.address, true]);

  const factory = await env.deploy(ftdfAdmin, "DataUnionFactory", [supportedTokens, ftdfAdmin.address]);

  const unionDeploymentId = ethers.keccak256(ethers.toUtf8Bytes("union:news-curation-v1"));
  const buyerDeploymentId = ethers.keccak256(ethers.toUtf8Bytes("buyer:ai-lab-v1"));
  const newsFeedDataId = ethers.keccak256(ethers.toUtf8Bytes("dataset:news-engagement-anon"));

  await clientConfig.tx(ftdfAdmin, "registerDeployment", [unionDeploymentId, ftdfAdmin.address, 0n]);
  await clientConfig.tx(aiBuyerAdmin, "registerDeployment", [buyerDeploymentId, aiBuyerAdmin.address, 0n]);

  // Gasless EIP-712 setKeyMeta granting ROLE_READ to AI Lab's reader key
  const roleRead = await clientConfig.call("ROLE_READ");
  const deadline = env.getTimestamp() + 3600n;
  const keySig = await aiBuyerAdmin.wallet.signTypedData(
    { name: "FTDPClientConfig", version: "1", chainId: CHAIN_ID, verifyingContract: clientConfig.address },
    {
      SetKey: [
        { name: "deploymentId", type: "bytes32" },
        { name: "key", type: "address" },
        { name: "roles", type: "uint256" },
        { name: "expires", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    {
      deploymentId: buyerDeploymentId,
      key: aiBuyerReaderKey.address,
      roles: roleRead,
      expires: 0n,
      nonce: await clientConfig.call("nonces", aiBuyerAdmin.address),
      deadline,
    }
  );
  const parsedKeySig = ethers.Signature.from(keySig);
  await clientConfig.tx(relayer, "setKeyMeta", [
    buyerDeploymentId,
    aiBuyerAdmin.address,
    aiBuyerReaderKey.address,
    roleRead,
    0n,
    deadline,
    parsedKeySig.v,
    parsedKeySig.r,
    parsedKeySig.s,
  ]);

  // Commit user opt-in consent Merkle tree
  const REQUIRED_FLAGS = 6n; // Bit 1 (News Union) | Bit 2 (AI Training)
  const uidOptedIn = ethers.keccak256(ethers.toUtf8Bytes("user:panorama-1"));
  const uidOptedOutOfAI = ethers.keccak256(ethers.toUtf8Bytes("user:panorama-2-no-ai"));
  const leaf0 = ethers.solidityPackedKeccak256(["bytes32", "uint256"], [uidOptedIn, 7n]);
  const leaf1 = ethers.solidityPackedKeccak256(["bytes32", "uint256"], [uidOptedOutOfAI, 3n]);
  const tree = buildMerkleTree([leaf0, leaf1]);
  await accessPermissions.tx(ftdfAdmin, "setOptInMerkleRoot", [unionDeploymentId, tree.root]);

  // Deploy Tier-1 Root Data Union + Tier-2 Panorama & Top News AutoPull Sub-Splitters
  await factory.tx(ftdfAdmin, "createAdminDataUnion", [
    "news-root",
    "News & Curation Data Union",
    ftdfAdmin.address,
    supportedTokens,
    ethers.ZeroAddress,
    0n,
  ]);
  const rootUnionAddr = await factory.call("allUnions", 0);
  const rootUnion = env.bind(rootUnionAddr, "AdminControlledSplitter");

  await factory.tx(panoramaAdmin, "createAdminDataUnion", [
    "panorama-tier2",
    "Panorama Contributor Pool",
    panoramaAdmin.address,
    supportedTokens,
    rootUnionAddr,
    0n,
  ]);
  const panoramaSubAddr = await factory.call("allUnions", 1);
  const panoramaSub = env.bind(panoramaSubAddr, "AdminControlledSplitter");

  await factory.tx(topNewsAdmin, "createAdminDataUnion", [
    "topnews-tier2",
    "Top News Contributor Pool",
    topNewsAdmin.address,
    supportedTokens,
    rootUnionAddr,
    0n,
  ]);
  const topNewsSubAddr = await factory.call("allUnions", 2);
  const topNewsSub = env.bind(topNewsSubAddr, "AdminControlledSplitter");

  // Configure Tier-1 (5% FTDF, 55% Panorama, 40% Top News)
  await rootUnion.tx(ftdfAdmin, "setSharesMulti", [[
    { shareholder: ftdfTreasury.address, shares: 500n },
    { shareholder: panoramaSubAddr, shares: 5500n },
    { shareholder: topNewsSubAddr, shares: 4000n },
  ]]);

  // Configure Tier-2 Panorama (30% Op, 40% User1, 30% User2)
  await panoramaSub.tx(panoramaAdmin, "setSharesMulti", [[
    { shareholder: panoramaOp.address, shares: 300n },
    { shareholder: panoramaUser1.address, shares: 400n },
    { shareholder: panoramaUser2.address, shares: 300n },
  ]]);

  // Configure Tier-2 Top News (25% Op, 75% Reader1)
  await topNewsSub.tx(topNewsAdmin, "setSharesMulti", [[
    { shareholder: topNewsOp.address, shares: 250n },
    { shareholder: topNewsReader1.address, shares: 750n },
  ]]);

  // Panorama User 2 sets gasless EIP-712 Beneficiary -> Cold Wallet
  const benSig = await panoramaUser2.wallet.signTypedData(
    { name: "FTDPDataUnion", version: "1", chainId: CHAIN_ID, verifyingContract: panoramaSubAddr },
    {
      SetBeneficiary: [
        { name: "user", type: "address" },
        { name: "beneficiary", type: "address" },
        { name: "deadline", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    {
      user: panoramaUser2.address,
      beneficiary: panoramaUser2ColdWallet.address,
      deadline,
      nonce: await panoramaSub.call("nonces", panoramaUser2.address),
    }
  );
  const parsedBen = ethers.Signature.from(benSig);
  await panoramaSub.tx(relayer, "setBeneficiaryMeta", [
    panoramaUser2.address,
    panoramaUser2ColdWallet.address,
    deadline,
    parsedBen.v,
    parsedBen.r,
    parsedBen.s,
  ]);

  // Post Market offer pointing beneficiary at Tier-1 Root Data Union
  await market.tx(ftdfAdmin, "addOffer", [
    unionDeploymentId,
    newsFeedDataId,
    usdc.address,
    ethers.parseUnits("10", 6), // 10 USDC/sec -> 10,000 USDC for 1000s
    100n,
    86400n * 365n,
    rootUnionAddr,
    REQUIRED_FLAGS,
    roleRead,
  ]);

  // Pre-purchase: reader cannot read
  assert.strictEqual(
    await accessPermissions.call("canRead", aiBuyerReaderKey.address, unionDeploymentId, uidOptedIn, newsFeedDataId, 7n, tree.getProof(0)),
    false
  );

  // Buyer purchases Offer #1 for 10,000 USDC
  const totalCost = ethers.parseUnits("10000", 6);
  await usdc.tx(aiBuyerAdmin, "approve", [market.address, totalCost]);
  await market.tx(aiBuyerAdmin, "purchase", [[1n], buyerDeploymentId, 1000n]);

  // Post-purchase consent enforcement
  assert.strictEqual(
    await accessPermissions.call("canRead", aiBuyerReaderKey.address, unionDeploymentId, uidOptedIn, newsFeedDataId, 7n, tree.getProof(0)),
    true
  );
  assert.strictEqual(
    await accessPermissions.call("canRead", aiBuyerReaderKey.address, unionDeploymentId, uidOptedOutOfAI, newsFeedDataId, 3n, tree.getProof(1)),
    false
  );
  assert.strictEqual(
    await accessPermissions.call("canRead", aiBuyerReaderKey.address, unionDeploymentId, uidOptedOutOfAI, newsFeedDataId, 7n, tree.getProof(1)),
    false
  );

  // Late joiner joins Panorama BEFORE withdrawals -> must NOT dilute prior 5,500 USDC
  await panoramaSub.tx(panoramaAdmin, "setShares", [panoramaUser3LateJoiner.address, 1000n]);
  assert.strictEqual(await panoramaSub.call("availableAllotment", panoramaUser3LateJoiner.address, usdc.address), 0n);

  // Exact cascading withdrawals
  await rootUnion.tx(ftdfTreasury, "withdrawAll", [ftdfTreasury.address, usdc.address]);
  assert.strictEqual(await usdc.call("balanceOf", ftdfTreasury.address), ethers.parseUnits("500", 6));

  await panoramaSub.tx(panoramaOp, "withdrawAll", [panoramaOp.address, usdc.address]);
  await panoramaSub.tx(panoramaUser1, "withdrawAll", [panoramaUser1.address, usdc.address]);
  await panoramaSub.tx(panoramaUser2, "withdrawAll", [panoramaUser2.address, usdc.address]);

  assert.strictEqual(await usdc.call("balanceOf", panoramaOp.address), ethers.parseUnits("1650", 6));
  assert.strictEqual(await usdc.call("balanceOf", panoramaUser1.address), ethers.parseUnits("2200", 6));
  assert.strictEqual(await usdc.call("balanceOf", panoramaUser2.address), 0n);
  assert.strictEqual(await usdc.call("balanceOf", panoramaUser2ColdWallet.address), ethers.parseUnits("1650", 6));

  await topNewsSub.tx(topNewsOp, "withdrawAll", [topNewsOp.address, usdc.address]);
  await topNewsSub.tx(topNewsReader1, "withdrawAll", [topNewsReader1.address, usdc.address]);
  assert.strictEqual(await usdc.call("balanceOf", topNewsOp.address), ethers.parseUnits("1000", 6));
  assert.strictEqual(await usdc.call("balanceOf", topNewsReader1.address), ethers.parseUnits("3000", 6));

  // Second stream (1000 FTD) -> Panorama gets 550 FTD -> Late joiner (1000/2000 shares) gets 275 FTD!
  await ftd.tx(aiBuyerAdmin, "transfer", [rootUnionAddr, ethers.parseEther("1000")]);
  assert.strictEqual(await panoramaSub.call("availableAllotment", panoramaUser3LateJoiner.address, ftd.address), ethers.parseEther("275"));
  await panoramaSub.tx(panoramaUser3LateJoiner, "withdrawAll", [panoramaUser3LateJoiner.address, ftd.address]);
  assert.strictEqual(await ftd.call("balanceOf", panoramaUser3LateJoiner.address), ethers.parseEther("275"));
});

test("Phase 4 v2: FtdToken cap + FtdAccessStaking Mobile Node threshold & cooldown", async () => {
  const env = await createTestEnv();
  const [owner, treasury, nodeOp] = env.wallets;

  const maxSupply = ethers.parseEther("1000000000");
  const initialMint = ethers.parseEther("1000000");
  const ftd = await env.deploy(owner, "FtdToken", [owner.address, treasury.address, initialMint, maxSupply]);
  assert.strictEqual(await ftd.call("symbol"), "FTD");
  assert.strictEqual(await ftd.call("balanceOf", treasury.address), initialMint);

  // Exceeding maxSupply must revert
  await expectRevert(
    ftd.tx(owner, "mint", [treasury.address, maxSupply]),
    "MaxSupplyExceeded",
    ftd.iface
  );

  // Deploy FtdAccessStaking (read/write = 100 FTD, mobile node = 500 FTD, cooldown = 0s for fast test)
  const staking = await env.deploy(owner, "FtdAccessStaking", [
    ftd.address,
    owner.address,
    ethers.parseEther("100"),
    ethers.parseEther("500"),
    0n,
  ]);

  await ftd.tx(treasury, "transfer", [nodeOp.address, ethers.parseEther("600")]);
  await ftd.tx(nodeOp, "approve", [staking.address, ethers.parseEther("600")]);

  await staking.tx(nodeOp, "stake", [ethers.parseEther("150")]);
  assert.strictEqual(await staking.call("hasNetworkAccess", nodeOp.address), true);
  assert.strictEqual(await staking.call("isActiveMobileNode", nodeOp.address), false);

  await staking.tx(nodeOp, "stake", [ethers.parseEther("400")]);
  assert.strictEqual(await staking.call("isActiveMobileNode", nodeOp.address), true);

  await staking.tx(nodeOp, "requestUnstake", [ethers.parseEther("550")]);
  assert.strictEqual(await staking.call("hasNetworkAccess", nodeOp.address), false);
  await staking.tx(nodeOp, "withdrawUnstaked");
  assert.strictEqual(await ftd.call("balanceOf", nodeOp.address), ethers.parseEther("600"));
});

test("Phase 4 v2: DataUnionGovernor wired to VotesSplitterShare enables on-chain DAO proposals & voting", async () => {
  const env = await createTestEnv();
  const [owner, member1] = env.wallets;
  const ftd = await env.deploy(owner, "MockERC20", ["Fair Trade Data", "FTD", 18]);
  const tokens = [ethers.ZeroAddress, ftd.address];
  const factory = await env.deploy(owner, "DataUnionFactory", [tokens, owner.address]);

  await factory.tx(owner, "createVotesDataUnion", [
    "gov-union-1",
    "FTDP Governed Union",
    "FDUV",
    ethers.parseEther("1000"),
    member1.address,
    owner.address,
    tokens,
    ethers.ZeroAddress,
    0n,
  ]);
  const splitterAddr = await factory.call("allUnions", 0);
  const info = await factory.call("unionInfo", splitterAddr);
  const shareToken = env.bind(info.sharesToken, "VotesSplitterShare");

  // Delegate voting power to member1
  await shareToken.tx(member1, "delegate", [member1.address]);

  // Deploy OpenZeppelin v5 DataUnionGovernor with 1-block delay, 5-block period, 10% quorum
  const governor = await env.deploy(owner, "DataUnionGovernor", [
    "FTDP Union DAO",
    info.sharesToken,
    1n,
    5n,
    0n,
    10n,
  ]);

  const description = "Proposal #1: Ratify News Data Union pricing policy";
  const calldata = "0x";
  await governor.tx(member1, "propose", [[splitterAddr], [0n], [calldata], description]);
  const proposalId = await governor.call("hashProposal", [splitterAddr], [0n], [calldata], ethers.id(description));

  // Advance 1 block past votingDelay by performing a harmless tx, then cast FOR vote (support = 1)
  await shareToken.tx(member1, "delegate", [member1.address]);
  await governor.tx(member1, "castVote", [proposalId, 1n]);

  const votes = await governor.call("proposalVotes", proposalId);
  assert.strictEqual(votes.forVotes, ethers.parseEther("1000"));
});

test("3-Tier Recursive AutoPull: Root Union -> Comment Protocol -> Top News & RateMyVideo -> Rater pulls atomically in 1 tx", async () => {
  const env = await createTestEnv(12);
  const [owner, ftdfTreasury, panoramaSub, streamySub, commentAdmin, topNewsAdmin, rateMyVideoAdmin, rateMyVideoOp, rater1] = env.wallets;
  const usdc = await env.deploy(owner, "MockERC20", ["USD Coin", "USDC", 6]);
  const tokens = [ethers.ZeroAddress, usdc.address];
  await usdc.tx(owner, "mint", [owner.address, ethers.parseUnits("100000", 6)]);

  const factory = await env.deploy(owner, "DataUnionFactory", [tokens, owner.address]);

  // Tier-1: FTDP Media & Social Root Union
  await factory.tx(owner, "createAdminDataUnion", ["root-media", "FTDP Media & Social Union", owner.address, tokens, ethers.ZeroAddress, 0n]);
  const tier1Addr = await factory.call("allUnions", 0);
  const tier1 = env.bind(tier1Addr, "AdminControlledSplitter");

  // Tier-2: Comment Protocol AutoPull Sub-Splitter (upstream = Tier-1)
  await factory.tx(commentAdmin, "createAdminDataUnion", ["comment-proto", "Comment Protocol Pool", commentAdmin.address, tokens, tier1Addr, 0n]);
  const tier2Addr = await factory.call("allUnions", 1);
  const tier2 = env.bind(tier2Addr, "AdminControlledSplitter");

  // Tier-3: Top News & RateMyVideo AutoPull Sub-Splitters (upstream = Tier-2 Comment Protocol)
  await factory.tx(topNewsAdmin, "createAdminDataUnion", ["top-news-t3", "Top News Pool", topNewsAdmin.address, tokens, tier2Addr, 0n]);
  const tier3TopNewsAddr = await factory.call("allUnions", 2);

  await factory.tx(rateMyVideoAdmin, "createAdminDataUnion", ["ratemyvideo-t3", "RateMyVideo Pool", rateMyVideoAdmin.address, tokens, tier2Addr, 0n]);
  const tier3RateAddr = await factory.call("allUnions", 3);
  const tier3Rate = env.bind(tier3RateAddr, "AdminControlledSplitter");

  // Tier-1 splits: 5% FTDF, 35% Panorama, 30% Streamy, 30% Comment Protocol
  await tier1.tx(owner, "setSharesMulti", [[
    { shareholder: ftdfTreasury.address, shares: 500n },
    { shareholder: panoramaSub.address, shares: 3500n },
    { shareholder: streamySub.address, shares: 3000n },
    { shareholder: tier2Addr, shares: 3000n },
  ]]);

  // Tier-2 Comment Protocol splits: 50% Top News, 50% RateMyVideo
  await tier2.tx(commentAdmin, "setSharesMulti", [[
    { shareholder: tier3TopNewsAddr, shares: 500n },
    { shareholder: tier3RateAddr, shares: 500n },
  ]]);

  // Tier-3 RateMyVideo splits: 30% Operator, 70% Rater 1
  await tier3Rate.tx(rateMyVideoAdmin, "setSharesMulti", [[
    { shareholder: rateMyVideoOp.address, shares: 300n },
    { shareholder: rater1.address, shares: 700n },
  ]]);

  // Deposit 10,000 USDC into Tier-1 ONLY (Tier-2 and Tier-3 both hold 0 USDC!)
  await usdc.tx(owner, "transfer", [tier1Addr, ethers.parseUnits("10000", 6)]);
  assert.strictEqual(await usdc.call("balanceOf", tier2Addr), 0n);
  assert.strictEqual(await usdc.call("balanceOf", tier3RateAddr), 0n);

  // Rater 1 sees exact cascading allotment: 10,000 * 30% * 50% * 70% = 1,050 USDC!
  assert.strictEqual(await tier3Rate.call("availableAllotment", rater1.address, usdc.address), ethers.parseUnits("1050", 6));

  // Rater 1 withdraws in ONE atomic tx -> recursively pulls Tier-1 -> Tier-2 -> Tier-3 -> Rater 1!
  await tier3Rate.tx(rater1, "withdrawAll", [rater1.address, usdc.address]);
  assert.strictEqual(await usdc.call("balanceOf", rater1.address), ethers.parseUnits("1050", 6));

  // RateMyVideo Operator withdraws remaining 450 USDC (30% of 1,500)
  await tier3Rate.tx(rateMyVideoOp, "withdrawAll", [rateMyVideoOp.address, usdc.address]);
  assert.strictEqual(await usdc.call("balanceOf", rateMyVideoOp.address), ethers.parseUnits("450", 6));
});

test("Phase 4 v2: ComputeToDataEscrow enforces AccessPermissions, pays Data Union on attestation, and refunds expired jobs", async () => {
  const env = await createTestEnv(10);
  const [owner, grantorAdmin, worker, buyerAdmin, contributor1, contributor2] = env.wallets;

  const usdc = await env.deploy(owner, "MockERC20", ["USD Coin", "USDC", 6]);
  await usdc.tx(owner, "mint", [buyerAdmin.address, ethers.parseUnits("10000", 6)]);

  const clientConfig = await env.deploy(owner, "ClientConfigManager", [owner.address]);
  const accessPermissions = await env.deploy(owner, "AccessPermissions", [clientConfig.address, owner.address]);
  const escrow = await env.deploy(owner, "ComputeToDataEscrow", [clientConfig.address, accessPermissions.address, owner.address]);
  await escrow.tx(owner, "setAuthorizedWorker", [worker.address, true]);

  const factory = await env.deploy(owner, "DataUnionFactory", [[ethers.ZeroAddress, usdc.address], owner.address]);
  await factory.tx(grantorAdmin, "createAdminDataUnion", ["c2d-union", "C2D Union", grantorAdmin.address, [ethers.ZeroAddress, usdc.address], ethers.ZeroAddress, 0n]);
  const unionAddr = await factory.call("allUnions", 0);
  const union = env.bind(unionAddr, "AdminControlledSplitter");
  await union.tx(grantorAdmin, "setSharesMulti", [[
    { shareholder: contributor1.address, shares: 600n },
    { shareholder: contributor2.address, shares: 400n },
  ]]);

  const grantorDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:c2d-grantor"));
  const buyerDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:c2d-buyer"));
  const dataId = ethers.keccak256(ethers.toUtf8Bytes("dataset:c2d-news"));
  const algoHash = ethers.keccak256(ethers.toUtf8Bytes("algo:topic-velocity-v1"));

  await clientConfig.tx(grantorAdmin, "registerDeployment", [grantorDepId, grantorAdmin.address, 0n]);
  await clientConfig.tx(buyerAdmin, "registerDeployment", [buyerDepId, buyerAdmin.address, 0n]);

  const fee = ethers.parseUnits("2000", 6);
  await usdc.tx(buyerAdmin, "approve", [escrow.address, ethers.parseUnits("5000", 6)]);

  // Without AccessPermissions grant -> submitJob MUST revert with NoActiveAccessGrant
  await expectRevert(
    escrow.tx(buyerAdmin, "submitJob", [grantorDepId, dataId, algoHash, usdc.address, fee, unionAddr, env.getTimestamp() + 3600n]),
    "NoActiveAccessGrant",
    escrow.iface
  );

  // Grant active read permission to buyer deployment
  await accessPermissions.tx(grantorAdmin, "setPermissions", [grantorDepId, buyerDepId, dataId, 2n, 4n, env.getTimestamp() + 7200n]);

  // Job #1: Submit -> Worker completes -> 2,000 USDC streams into Data Union -> contributors claim 1,200 & 800 USDC!
  await escrow.tx(buyerAdmin, "submitJob", [grantorDepId, dataId, algoHash, usdc.address, fee, unionAddr, env.getTimestamp() + 3600n]);
  const resultCidHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://bafyresult1"));
  const attestationHash = ethers.keccak256(ethers.toUtf8Bytes("tee-quote-1"));
  await escrow.tx(worker, "completeJob", [1n, resultCidHash, attestationHash]);

  await union.tx(contributor1, "withdrawAll", [contributor1.address, usdc.address]);
  await union.tx(contributor2, "withdrawAll", [contributor2.address, usdc.address]);
  assert.strictEqual(await usdc.call("balanceOf", contributor1.address), ethers.parseUnits("1200", 6));
  assert.strictEqual(await usdc.call("balanceOf", contributor2.address), ethers.parseUnits("800", 6));

  // Job #2: Submit with short deadline (15s) -> advance 2 blocks (+24s) -> refundExpiredJob returns 1,000 USDC to buyer!
  const refundFee = ethers.parseUnits("1000", 6);
  const shortDeadline = env.getTimestamp() + 15n;
  await escrow.tx(buyerAdmin, "submitJob", [grantorDepId, dataId, algoHash, usdc.address, refundFee, unionAddr, shortDeadline]);
  const balBeforeRefund = await usdc.call("balanceOf", buyerAdmin.address);
  // 2 blocks pass (12s each) during refund tx; run 1 no-op approve first to ensure block.timestamp >= shortDeadline
  await usdc.tx(buyerAdmin, "approve", [escrow.address, 0n]);
  await escrow.tx(buyerAdmin, "refundExpiredJob", [2n]);
  assert.strictEqual(await usdc.call("balanceOf", buyerAdmin.address), balBeforeRefund + refundFee);
});

test("3-Tier Cascading AutoPull Data Union: Tier-1 Root -> Tier-2 Comment Protocol -> Tier-3 Top News & RateMyVideo", async () => {
  const env = await createTestEnv();
  const [admin, ftdfTreasury, panoramaPool, streamyPool, topNewsUser, rmvUser, payer] = env.wallets;

  const usdc = await env.deploy(admin, "MockERC20", ["USD Coin", "USDC", 6]);
  await usdc.tx(admin, "mint", [payer.address, ethers.parseUnits("100000", 6)]);
  const tokens = [ethers.ZeroAddress, usdc.address];

  const factory = await env.deploy(admin, "DataUnionFactory", [tokens, admin.address]);

  // Tier-1 Root
  await factory.tx(admin, "createAdminDataUnion", ["root", "FTDP Root", admin.address, tokens, ethers.ZeroAddress, 0n]);
  const rootAddr = await factory.call("allUnions", 0);
  const root = env.bind(rootAddr, "AdminControlledSplitter");

  // Tier-2 Comment Protocol (upstream = root)
  await factory.tx(admin, "createAdminDataUnion", ["comment-t2", "Comment Protocol", admin.address, tokens, rootAddr, 0n]);
  const commentAddr = await factory.call("allUnions", 1);
  const comment = env.bind(commentAddr, "AdminControlledSplitter");

  // Tier-3 Top News & RateMyVideo (upstream = comment)
  await factory.tx(admin, "createAdminDataUnion", ["topnews-t3", "Top News", admin.address, tokens, commentAddr, 0n]);
  const topNewsAddr = await factory.call("allUnions", 2);
  const topNews = env.bind(topNewsAddr, "AdminControlledSplitter");

  await factory.tx(admin, "createAdminDataUnion", ["rmv-t3", "RateMyVideo", admin.address, tokens, commentAddr, 0n]);
  const rmvAddr = await factory.call("allUnions", 3);
  const rmv = env.bind(rmvAddr, "AdminControlledSplitter");

  // Tier-1 weights: 5% FTDF, 35% Panorama, 25% Streamy, 35% Comment Protocol
  await root.tx(admin, "setSharesMulti", [[
    { shareholder: ftdfTreasury.address, shares: 500n },
    { shareholder: panoramaPool.address, shares: 3500n },
    { shareholder: streamyPool.address, shares: 2500n },
    { shareholder: commentAddr, shares: 3500n },
  ]]);

  // Tier-2 Comment Protocol weights: 55% Top News, 45% RateMyVideo
  await comment.tx(admin, "setSharesMulti", [[
    { shareholder: topNewsAddr, shares: 5500n },
    { shareholder: rmvAddr, shares: 4500n },
  ]]);

  // Tier-3 contributors: 100% Top News user, 100% RateMyVideo user
  await topNews.tx(admin, "setShares", [topNewsUser.address, 1000n]);
  await rmv.tx(admin, "setShares", [rmvUser.address, 1000n]);

  // Stream 10,000 USDC into Tier-1 Root
  // Expected:
  //   FTDF = 500 USDC
  //   Panorama = 3,500 USDC
  //   Streamy = 2,500 USDC
  //   Comment Protocol (Tier-2) = 3,500 USDC
  //     -> Top News (Tier-3, 55% of 3,500) = 1,925 USDC
  //     -> RateMyVideo (Tier-3, 45% of 3,500) = 1,575 USDC
  await usdc.tx(payer, "transfer", [rootAddr, ethers.parseUnits("10000", 6)]);

  // Single O(1) withdrawAll() at Tier-3 triggers cascading AutoPull: Tier-3 -> Tier-2 -> Tier-1!
  await topNews.tx(topNewsUser, "withdrawAll", [topNewsUser.address, usdc.address]);
  await rmv.tx(rmvUser, "withdrawAll", [rmvUser.address, usdc.address]);
  await root.tx(ftdfTreasury, "withdrawAll", [ftdfTreasury.address, usdc.address]);
  await root.tx(panoramaPool, "withdrawAll", [panoramaPool.address, usdc.address]);
  await root.tx(streamyPool, "withdrawAll", [streamyPool.address, usdc.address]);

  assert.strictEqual(await usdc.call("balanceOf", ftdfTreasury.address), ethers.parseUnits("500", 6));
  assert.strictEqual(await usdc.call("balanceOf", panoramaPool.address), ethers.parseUnits("3500", 6));
  assert.strictEqual(await usdc.call("balanceOf", streamyPool.address), ethers.parseUnits("2500", 6));
  assert.strictEqual(await usdc.call("balanceOf", topNewsUser.address), ethers.parseUnits("1925", 6));
  assert.strictEqual(await usdc.call("balanceOf", rmvUser.address), ethers.parseUnits("1575", 6));

  // Zero dust trapped across all 4 cascading splitters
  assert.strictEqual(await usdc.call("balanceOf", rootAddr), 0n);
  assert.strictEqual(await usdc.call("balanceOf", commentAddr), 0n);
  assert.strictEqual(await usdc.call("balanceOf", topNewsAddr), 0n);
  assert.strictEqual(await usdc.call("balanceOf", rmvAddr), 0n);
});

(async () => {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  PASS  ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL  ${t.name}`);
      console.error(err);
      failed++;
    }
  }
  console.log(`\nEVM Test Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
