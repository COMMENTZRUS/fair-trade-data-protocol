const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { ethers } = require("../contracts/node_modules/ethers");
const { createVM, runTx } = require("../contracts/node_modules/@ethereumjs/vm");
const { createBlock } = require("../contracts/node_modules/@ethereumjs/block");
const { Common, Mainnet, Hardfork } = require("../contracts/node_modules/@ethereumjs/common");
const { createLegacyTx } = require("../contracts/node_modules/@ethereumjs/tx");
const { Account, createAddressFromString, hexToBytes, bytesToHex } = require("../contracts/node_modules/@ethereumjs/util");

const { FtdpClient, signSetSharesMultiMeta, STANDARD_CONSENT_FLAGS } = require("../sdk/dist/index.js");
const { createFtdpServer } = require("../node/dist/server.js");
const { FtdpStore } = require("../node/dist/store.js");

const BUILD_DIR = path.resolve(__dirname, "..", "contracts", "build");
const loadArtifact = (name) => JSON.parse(fs.readFileSync(path.join(BUILD_DIR, `${name}.json`), "utf8"));

async function runCrossStackTest() {
  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
  const vm = await createVM({ common });

  const wallets = [];
  for (let i = 1; i <= 8; i++) {
    const pk = "0x" + i.toString(16).padStart(64, "0");
    const wallet = new ethers.Wallet(pk);
    await vm.stateManager.putAccount(createAddressFromString(wallet.address), new Account(0n, ethers.parseEther("1000")));
    wallets.push({ wallet, pkBytes: hexToBytes(pk), address: wallet.address });
  }

  let blockNumber = 1n;
  let timestamp = BigInt(Math.floor(Date.now() / 1000));
  const nextBlock = () => {
    blockNumber += 1n;
    timestamp += 12n;
    return createBlock(
      { header: { number: blockNumber, timestamp, gasLimit: 30_000_000n, baseFeePerGas: 0n } },
      { common }
    );
  };

  async function sendTx(signer, { to, data = "0x", value = 0n }) {
    const acct = await vm.stateManager.getAccount(createAddressFromString(signer.address));
    const tx = createLegacyTx(
      {
        nonce: acct ? acct.nonce : 0n,
        gasPrice: 0n,
        gasLimit: 15_000_000n,
        to: to ? createAddressFromString(to) : undefined,
        value,
        data: hexToBytes(data),
      },
      { common }
    ).sign(signer.pkBytes);
    const res = await runTx(vm, { tx, block: nextBlock(), skipBlockGasLimitValidation: true });
    if (res.execResult.exceptionError) {
      throw new Error(`EVM revert: ${res.execResult.exceptionError.error}`);
    }
    return res;
  }

  async function staticCall(to, abi, fn, args = []) {
    const iface = new ethers.Interface(abi);
    const res = await vm.evm.runCall({
      to: createAddressFromString(to),
      data: hexToBytes(iface.encodeFunctionData(fn, args)),
      gasLimit: 10_000_000n,
      block: nextBlock(),
      isStatic: true,
    });
    if (res.execResult.exceptionError) throw new Error(`StaticCall revert (${fn})`);
    const decoded = iface.decodeFunctionResult(fn, bytesToHex(res.execResult.returnValue));
    return decoded.length === 1 ? decoded[0] : decoded;
  }

  async function deploy(signer, name, args = []) {
    const art = loadArtifact(name);
    const iface = new ethers.Interface(art.abi);
    const encoded = args.length > 0 ? iface.encodeDeploy(args).slice(2) : "";
    const res = await sendTx(signer, { data: art.bytecode + encoded });
    return bind(ethers.getAddress(res.createdAddress.toString()), name);
  }

  function bind(address, name) {
    const art = loadArtifact(name);
    const iface = new ethers.Interface(art.abi);
    return {
      address,
      call: (fn, ...args) => staticCall(address, art.abi, fn, args),
      tx: (signer, fn, args = [], value = 0n) => sendTx(signer, { to: address, data: iface.encodeFunctionData(fn, args), value }),
    };
  }

  const [ftdfAdmin, panoramaAdmin, user1, user2, buyerAdmin, buyerReader, relayer] = wallets;

  // 1. Deploy FTDP Contracts on EVM
  const usdc = await deploy(ftdfAdmin, "MockERC20", ["USD Coin", "USDC", 6]);
  await usdc.tx(ftdfAdmin, "mint", [buyerAdmin.address, ethers.parseUnits("50000", 6)]);
  const clientConfig = await deploy(ftdfAdmin, "ClientConfigManager", [ftdfAdmin.address]);
  const accessPermissions = await deploy(ftdfAdmin, "AccessPermissions", [clientConfig.address, ftdfAdmin.address]);
  const market = await deploy(ftdfAdmin, "Market", [clientConfig.address, accessPermissions.address]);
  await accessPermissions.tx(ftdfAdmin, "setAuthorizedMarket", [market.address, true]);
  const factory = await deploy(ftdfAdmin, "DataUnionFactory", [[ethers.ZeroAddress, usdc.address], ftdfAdmin.address]);

  // 2. Register Deployments on-chain
  const panoramaDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:panorama-prod"));
  const buyerDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:ai-buyer-prod"));
  const newsDataId = ethers.keccak256(ethers.toUtf8Bytes("dataset:panorama-news-v1"));
  const roleRead = await clientConfig.call("ROLE_READ");

  await clientConfig.tx(panoramaAdmin, "registerDeployment", [panoramaDepId, panoramaAdmin.address, 0n]);
  await clientConfig.tx(buyerAdmin, "registerDeployment", [buyerDepId, buyerAdmin.address, 0n]);
  await clientConfig.tx(buyerAdmin, "setKey", [buyerDepId, buyerReader.address, roleRead, 0n]);

  // 3. Deploy Data Union MultiSplitter via DataUnionFactory
  await factory.tx(panoramaAdmin, "createAdminDataUnion", [
    "panorama-union-v1",
    "Panorama Data Union",
    panoramaAdmin.address,
    [ethers.ZeroAddress, usdc.address],
    ethers.ZeroAddress,
    0n,
  ]);
  const splitterAddr = await factory.call("allUnions", 0);
  const splitter = bind(splitterAddr, "AdminControlledSplitter");

  // 4. Boot ftdp-node wired DIRECTLY to the live Solidity AccessPermissions.canRead()!
  const store = new FtdpStore();
  const { fetchImpl } = createFtdpServer({
    store,
    canReadVerifier: async ({ grantee, grantorDeploymentId, uidHash, dataId, merkleFlags, merkleProof }) => {
      return Boolean(
        await accessPermissions.call("canRead", grantee, grantorDeploymentId, uidHash, dataId, merkleFlags, merkleProof)
      );
    },
  });

  const sdk = new FtdpClient({ baseUrl: "http://ftdp.local", fetchImpl });
  await sdk.createDeployment({
    id: panoramaDepId,
    organizationId: "panorama-inc",
    name: "Panorama",
    adminAddress: panoramaAdmin.address,
  });
  await sdk.createDataUnion({
    id: "panorama-union",
    name: "Panorama Data Union",
    splitterAddress: splitterAddr,
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [panoramaDepId],
  });

  // 5. Stream consented events via @ftdp/sdk -> ftdp-node (user1: 2 events with AI consent, user2: 1 event NO AI consent)
  const AI_CONSENT = STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.AI_TRAINING; // 6
  await sdk.trackEvent({
    deploymentId: panoramaDepId,
    namespace: "panorama",
    userId: "u1",
    flags: AI_CONSENT,
    anon: { event: "read_story", score: 10 },
    pii: { email: "private-u1@panorama.test" },
    dataId: newsDataId,
    contributorWallet: user1.address,
  });
  await sdk.trackEvent({
    deploymentId: panoramaDepId,
    namespace: "panorama",
    userId: "u1",
    flags: AI_CONSENT,
    anon: { event: "curate_story", score: 20 },
    dataId: newsDataId,
    contributorWallet: user1.address,
  });
  const lastIngest = await sdk.trackEvent({
    deploymentId: panoramaDepId,
    namespace: "panorama",
    userId: "u2",
    flags: STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION, // 2 only (no AI training!)
    anon: { event: "read_story", score: 5 },
    dataId: newsDataId,
    contributorWallet: user2.address,
  });

  // 6. Commit ftdp-node's Merkle root on-chain in AccessPermissions.sol
  await accessPermissions.tx(panoramaAdmin, "setOptInMerkleRoot", [panoramaDepId, lastIngest.merkleRoot]);

  // 7. Meter Data Union in ftdp-node -> sign EIP-712 with @ftdp/sdk -> relay to AdminControlledSplitter.setSharesMultiMeta!
  const metered = await sdk.meterDataUnion("panorama-union", "2");
  assert.strictEqual(metered.totalConsentedRecords, 3); // 2 from u1 (200 shares), 1 from u2 (100 shares)
  const updates = metered.updates.map((u) => ({ shareholder: u.shareholder, shares: BigInt(u.shares) }));
  const nonce = await splitter.call("nonces", panoramaAdmin.address);
  const signed = await signSetSharesMultiMeta(panoramaAdmin.wallet, {
    splitterAddress: splitterAddr,
    chainId: 1n,
    updates,
    nonce,
    deadline: timestamp + 3600n,
  });
  await splitter.tx(relayer, "setSharesMultiMeta", [updates, signed.deadline, signed.v, signed.r, signed.s]);
  assert.strictEqual(await splitter.call("shares", user1.address), 200n);
  assert.strictEqual(await splitter.call("shares", user2.address), 100n);

  // 8. Before Market.purchase(), ftdp-node Access Gate returns 0 records (blocked by real Solidity AccessPermissions.canRead!)
  const preRead = await sdk.readConsentedRecords(panoramaDepId, {
    granteeAddress: buyerReader.address,
    dataId: newsDataId,
    requiredFlags: "6",
  });
  assert.strictEqual(preRead.records.length, 0);

  // 9. Post offer on Market.sol with beneficiary = Data Union MultiSplitter & Buyer purchases for 3,000 USDC
  await market.tx(panoramaAdmin, "addOffer", [
    panoramaDepId,
    newsDataId,
    usdc.address,
    ethers.parseUnits("3", 6), // 3 USDC/sec * 1000s = 3,000 USDC
    100n,
    86400n,
    splitterAddr,
    6n,
    roleRead,
  ]);
  const cost = ethers.parseUnits("3000", 6);
  await usdc.tx(buyerAdmin, "approve", [market.address, cost]);
  await market.tx(buyerAdmin, "purchase", [[1n], buyerDepId, 1000n]);

  // 10. Post-purchase: ftdp-node Access Gate calls REAL Solidity AccessPermissions.canRead() -> serves ONLY u1's 2 anon records (NO u2, NO PII)!
  const postRead = await sdk.readConsentedRecords(panoramaDepId, {
    granteeAddress: buyerReader.address,
    dataId: newsDataId,
    requiredFlags: "6",
  });
  assert.strictEqual(postRead.records.length, 2);
  assert.strictEqual("pii" in postRead.records[0], false);

  // 11. Contributors withdraw exact metered split (200/300 = 2,000 USDC to u1, 100/300 = 1,000 USDC to u2)
  await splitter.tx(user1, "withdrawAll", [user1.address, usdc.address]);
  await splitter.tx(user2, "withdrawAll", [user2.address, usdc.address]);
  assert.strictEqual(await usdc.call("balanceOf", user1.address), ethers.parseUnits("2000", 6));
  assert.strictEqual(await usdc.call("balanceOf", user2.address), ethers.parseUnits("1000", 6));

  console.log("  PASS  Cross-Stack E2E: @ftdp/sdk -> ftdp-node -> Solidity AccessPermissions + Market + MultiSplitter Data Union");
}

runCrossStackTest().catch((err) => {
  console.error("  FAIL  Cross-Stack E2E:", err);
  process.exit(1);
});
