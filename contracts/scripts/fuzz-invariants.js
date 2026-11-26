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
const loadArtifact = (name) => JSON.parse(fs.readFileSync(path.join(BUILD_DIR, `${name}.json`), "utf8"));

// Deterministic PRNG (Mulberry32) so fuzz failures are 100% reproducible
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function runInvariantFuzzSuite() {
  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
  const vm = await createVM({ common });

  const wallets = [];
  for (let i = 1; i <= 10; i++) {
    const pk = "0x" + i.toString(16).padStart(64, "0");
    const wallet = new ethers.Wallet(pk);
    await vm.stateManager.putAccount(createAddressFromString(wallet.address), new Account(0n, ethers.parseEther("100000")));
    wallets.push({ wallet, pkBytes: hexToBytes(pk), address: wallet.address });
  }

  let blockNumber = 1n;
  let timestamp = BigInt(Math.floor(Date.now() / 1000));
  const nextBlock = () => {
    blockNumber += 1n;
    timestamp += 12n;
    return createBlock({ header: { number: blockNumber, timestamp, gasLimit: 30_000_000n, baseFeePerGas: 0n } }, { common });
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
    if (res.execResult.exceptionError) throw new Error(`Fuzz tx revert: ${res.execResult.exceptionError.error}`);
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

  async function getEthBalance(addr) {
    const acct = await vm.stateManager.getAccount(createAddressFromString(addr));
    return acct ? acct.balance : 0n;
  }

  const [owner, admin, ...users] = wallets;
  const usdc = await deploy(owner, "MockERC20", ["USD Coin", "USDC", 6]);
  const ftd = await deploy(owner, "MockERC20", ["Fair Trade Data", "FTD", 18]);
  await usdc.tx(owner, "mint", [owner.address, ethers.parseUnits("100000000", 6)]);
  await ftd.tx(owner, "mint", [owner.address, ethers.parseEther("100000000")]);

  const tokens = [ethers.ZeroAddress, usdc.address, ftd.address];
  const factory = await deploy(owner, "DataUnionFactory", [tokens, owner.address]);

  // Tier-1 Root + Tier-2 AutoPull Sub-Splitter
  await factory.tx(admin, "createAdminDataUnion", ["fuzz-root", "Fuzz Root", admin.address, tokens, ethers.ZeroAddress, 0n]);
  const rootAddr = await factory.call("allUnions", 0);
  const root = bind(rootAddr, "AdminControlledSplitter");

  await factory.tx(admin, "createAdminDataUnion", ["fuzz-sub", "Fuzz Sub", admin.address, tokens, rootAddr, 0n]);
  const subAddr = await factory.call("allUnions", 1);
  const sub = bind(subAddr, "AdminControlledSplitter");

  // Seed initial shares: root splits between users[0] and sub; sub splits across users[1..4]
  await root.tx(admin, "setSharesMulti", [[
    { shareholder: users[0].address, shares: 200n },
    { shareholder: subAddr, shares: 800n },
  ]]);
  await sub.tx(admin, "setSharesMulti", [[
    { shareholder: users[1].address, shares: 500n },
    { shareholder: users[2].address, shares: 300n },
  ]]);

  const rng = mulberry32(20261126);
  const trackedSubUsers = [users[1], users[2], users[3], users[4], users[5]];
  const STEPS = 60;

  async function assertInvariants(stepLabel) {
    for (const tok of tokens) {
      // 1. Tier-1 Solvency & Conservation
      const rootReceived = await root.call("totalReceived", tok);
      const rootWithdrawn = await root.call("totalWithdrawn", tok);
      const rootBal = tok === ethers.ZeroAddress ? await getEthBalance(rootAddr) : await (tok === usdc.address ? usdc : ftd).call("balanceOf", rootAddr);
      assert.strictEqual(rootBal + rootWithdrawn, rootReceived, `[${stepLabel}] Root conservation failed`);

      const rAllot0 = await root.call("totalAllotment", users[0].address, tok);
      const rAllotSub = await root.call("totalAllotment", subAddr, tok);
      assert.ok(rAllot0 + rAllotSub <= rootReceived, `[${stepLabel}] Root solvency violated`);

      // 2. Tier-2 AutoPull Solvency: sum(sub allotments) <= sub.totalReceived(tok)
      const subReceived = await sub.call("totalReceived", tok);
      let sumSubAllotments = 0n;
      for (const u of trackedSubUsers) {
        sumSubAllotments += await sub.call("totalAllotment", u.address, tok);
      }
      assert.ok(sumSubAllotments <= subReceived, `[${stepLabel}] Sub-splitter solvency violated (${sumSubAllotments} > ${subReceived})`);
    }
  }

  for (let step = 1; step <= STEPS; step++) {
    const action = Math.floor(rng() * 4);
    if (action === 0) {
      // Random multi-token deposit into Root (ETH, USDC, or FTD)
      const tokIdx = Math.floor(rng() * 3);
      if (tokIdx === 0) {
        const amt = BigInt(Math.floor(rng() * 500) + 1) * 10n ** 15n; // 0.001..0.5 ETH
        await sendTx(owner, { to: rootAddr, value: amt });
      } else if (tokIdx === 1) {
        const amt = BigInt(Math.floor(rng() * 5000) + 1) * 10n ** 6n; // 1..5000 USDC
        await usdc.tx(owner, "transfer", [rootAddr, amt]);
      } else {
        const amt = BigInt(Math.floor(rng() * 5000) + 1) * 10n ** 18n; // 1..5000 FTD
        await ftd.tx(owner, "transfer", [rootAddr, amt]);
      }
    } else if (action === 1) {
      // Random share update on Tier-2 Sub-Splitter (verifying zero retroactive dilution for brand-new joiners)
      const u = trackedSubUsers[Math.floor(rng() * trackedSubUsers.length)];
      const prevShares = await sub.call("shares", u.address);
      const prevAllotUsdc = await sub.call("availableAllotment", u.address, usdc.address);
      const newShares = BigInt(Math.floor(rng() * 1000));
      await sub.tx(admin, "setShares", [u.address, newShares]);
      if (prevShares === 0n && newShares > 0n) {
        const postAllotUsdc = await sub.call("availableAllotment", u.address, usdc.address);
        assert.strictEqual(postAllotUsdc, prevAllotUsdc, `Step ${step}: late joiner diluted prior USDC receipts!`);
      }
    } else if (action === 2) {
      // Random on-demand cascading withdrawal from Tier-2 Sub-Splitter
      const u = trackedSubUsers[Math.floor(rng() * trackedSubUsers.length)];
      const tok = tokens[Math.floor(rng() * tokens.length)];
      const avail = await sub.call("availableAllotment", u.address, tok);
      if (avail > 0n) {
        await sub.tx(u, "withdrawAll", [u.address, tok]);
        assert.strictEqual(await sub.call("availableAllotment", u.address, tok), 0n);
      }
    } else {
      // Random root share weight rebalance between users[0] and subAddr
      const s0 = BigInt(Math.floor(rng() * 500) + 50);
      const s1 = BigInt(Math.floor(rng() * 900) + 100);
      await root.tx(admin, "setSharesMulti", [[
        { shareholder: users[0].address, shares: s0 },
        { shareholder: subAddr, shares: s1 },
      ]]);
    }

    await assertInvariants(`step-${step}`);
  }

  // Final drain: every shareholder across both tiers withdraws 100% of every token cleanly
  for (const tok of tokens) {
    await root.tx(users[0], "withdrawAll", [users[0].address, tok]);
    for (const u of trackedSubUsers) {
      await sub.tx(u, "withdrawAll", [u.address, tok]);
    }
  }
  await assertInvariants("final-drain");
  console.log(`  PASS  EVM Solvency & Invariant Fuzz Suite (${STEPS} randomized multi-token Tier-1/Tier-2 steps + full drain, 0 violations)`);
}

runInvariantFuzzSuite().catch((err) => {
  console.error("  FAIL  EVM Fuzz Suite:", err);
  process.exit(1);
});
