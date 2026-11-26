/**
 * Pure-JS EVM Live Deployment Runner (Ethers v6 + solc-js artifacts)
 * Works identically on Linux, macOS, and Windows ARM64 (zero native Hardhat binary dependency).
 *
 * Usage:
 *   # Dry-run plan check (no private key / no RPC spent):
 *   node contracts/scripts/deploy-live-evm.js --network baseSepolia --with-3tier-union --dry-run
 *
 *   # Live testnet deploy (reads DEPLOYER_PRIVATE_KEY from env or contracts/.env):
 *   node contracts/scripts/deploy-live-evm.js --network baseSepolia --with-3tier-union
 *
 *   # Live mainnet deploy (requires FTDF_MULTISIG_ADDRESS != deployer, USDC_ADDRESS):
 *   node contracts/scripts/deploy-live-evm.js --network base --with-3tier-union
 */
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const NETWORKS = {
  baseSepolia: {
    name: "baseSepolia",
    chainId: 84532,
    rpcEnv: "BASE_SEPOLIA_RPC_URL",
    defaultRpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    isMainnet: false,
  },
  gnosisChiado: {
    name: "gnosisChiado",
    chainId: 10200,
    rpcEnv: "GNOSIS_CHIADO_RPC_URL",
    defaultRpc: "https://rpc.chiadochain.net",
    explorer: "https://gnosis-chiado.blockscout.com",
    isMainnet: false,
  },
  sepolia: {
    name: "sepolia",
    chainId: 11155111,
    rpcEnv: "SEPOLIA_RPC_URL",
    defaultRpc: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    isMainnet: false,
  },
  base: {
    name: "base",
    chainId: 8453,
    rpcEnv: "BASE_RPC_URL",
    defaultRpc: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    isMainnet: true,
  },
  gnosis: {
    name: "gnosis",
    chainId: 100,
    rpcEnv: "GNOSIS_RPC_URL",
    defaultRpc: "https://rpc.gnosischain.com",
    explorer: "https://gnosisscan.io",
    isMainnet: true,
  },
  mainnet: {
    name: "mainnet",
    chainId: 1,
    rpcEnv: "MAINNET_RPC_URL",
    defaultRpc: "https://ethereum-rpc.publicnode.com",
    explorer: "https://etherscan.io",
    isMainnet: true,
  },
};

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

function loadArtifact(contractName) {
  const buildDir = path.resolve(__dirname, "..", "build");
  const filePath = path.join(buildDir, `${contractName}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Artifact missing: ${filePath}. Run "npm run compile:solc --prefix contracts" first.`);
  }
  const art = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const bytecode = art.bytecode.startsWith("0x") ? art.bytecode : `0x${art.bytecode}`;
  return { abi: art.abi, bytecode };
}

function parseArgs(argv) {
  const out = { network: "baseSepolia", dryRun: false, with3TierUnion: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--with-3tier-union") out.with3TierUnion = true;
    else if (a === "--network" && argv[i + 1]) out.network = argv[++i];
  }
  return out;
}

async function deployContract(wallet, contractName, args = []) {
  const { abi, bytecode } = loadArtifact(contractName);
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction()?.hash || "";
  console.log(`  Deployed ${contractName.padEnd(22)} -> ${address} (tx: ${txHash})`);
  return { contract, address, txHash };
}

async function main() {
  loadDotEnv(path.resolve(__dirname, "..", ".env"));
  const opts = parseArgs(process.argv);
  const net = NETWORKS[opts.network];
  if (!net) {
    throw new Error(`Unknown network "${opts.network}". Valid: ${Object.keys(NETWORKS).join(", ")}`);
  }

  // Verify all required compiled artifacts exist up-front
  const requiredArtifacts = [
    "FtdToken",
    "MockERC20",
    "ClientConfigManager",
    "AccessPermissions",
    "Market",
    "DataUnionFactory",
    "FtdAccessStaking",
    "ComputeToDataEscrow",
    "AdminControlledSplitter",
  ];
  for (const name of requiredArtifacts) loadArtifact(name);

  const rpcUrl = process.env[net.rpcEnv] || net.defaultRpc;
  console.log("=== Fair Trade Data Protocol (FTDP) Live EVM Deployer ===");
  console.log("Network:        ", `${net.name} (chainId ${net.chainId})`);
  console.log("RPC URL:        ", rpcUrl);
  console.log("3-Tier Union:   ", opts.with3TierUnion);
  console.log("Mode:           ", opts.dryRun ? "DRY-RUN (no transactions sent)" : "LIVE BROADCAST");

  if (opts.dryRun) {
    console.log("\nVerified compiled artifacts:", requiredArtifacts.join(", "));
    console.log("Deployment sequence:");
    console.log("  1. FtdToken (or existing FTD_TOKEN_ADDRESS) + Testnet MockUSDC (if USDC_ADDRESS unset on testnet)");
    console.log("  2. ClientConfigManager");
    console.log("  3. AccessPermissions");
    console.log("  4. Market + AccessPermissions.setAuthorizedMarket(market, true)");
    console.log("  5. DataUnionFactory (tracked tokens: [ETH, USDC, FTD])");
    console.log("  6. FtdAccessStaking + ComputeToDataEscrow (Phase 4 v2)");
    if (opts.with3TierUnion) {
      console.log("  7. 3-Tier Cascading Data Union: Tier-1 Root -> FTDF(5%) + Panorama(35%) + Streamy(25%) + Tier-2 Comment(35%) -> Tier-3 Top News(55%) & RateMyVideo(45%)");
    }
    console.log("  8. Ownership handover to FTDF_MULTISIG_ADDRESS + write contracts/deployments/" + net.name + ".json");
    console.log("\n  PASS  FTDP Live EVM Deployment Dry-Run verified");
    return;
  }

  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk || !pk.trim()) {
    throw new Error("Missing DEPLOYER_PRIVATE_KEY in environment or contracts/.env");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk.trim(), provider);
  const liveNet = await provider.getNetwork();
  if (Number(liveNet.chainId) !== net.chainId) {
    throw new Error(`RPC chainId mismatch: expected ${net.chainId}, got ${liveNet.chainId}`);
  }

  const balance = await provider.getBalance(wallet.address);
  console.log("Deployer:       ", wallet.address);
  console.log("Native Balance: ", ethers.formatEther(balance));
  if (balance === 0n) {
    throw new Error(`Deployer ${wallet.address} has 0 native balance on ${net.name}. Fund it from a faucet first.`);
  }

  const multisig = process.env.FTDF_MULTISIG_ADDRESS
    ? ethers.getAddress(process.env.FTDF_MULTISIG_ADDRESS)
    : wallet.address;

  if (net.isMainnet && multisig.toLowerCase() === wallet.address.toLowerCase()) {
    throw new Error("Mainnet deployment requires FTDF_MULTISIG_ADDRESS to be a dedicated Gnosis Safe (not deployer EOA)");
  }

  // 1. Tokens (FTD + USDC)
  let ftdAddress = process.env.FTD_TOKEN_ADDRESS ? ethers.getAddress(process.env.FTD_TOKEN_ADDRESS) : "";
  if (!ftdAddress) {
    const ftdRes = await deployContract(wallet, "FtdToken", [
      multisig,
      multisig,
      ethers.parseEther("100000000"), // 100M initial treasury supply
      ethers.parseEther("1000000000"), // 1B hard cap
    ]);
    ftdAddress = ftdRes.address;
  }

  let usdcAddress = process.env.USDC_ADDRESS ? ethers.getAddress(process.env.USDC_ADDRESS) : "";
  if (!usdcAddress) {
    if (net.isMainnet) {
      throw new Error("Mainnet deployment requires canonical USDC_ADDRESS env var");
    }
    const usdcRes = await deployContract(wallet, "MockERC20", ["Testnet USD Coin", "USDC", 6]);
    usdcAddress = usdcRes.address;
  }

  const trackedTokens = [ethers.ZeroAddress, usdcAddress, ftdAddress];

  // 2. SLS Core
  const clientConfig = await deployContract(wallet, "ClientConfigManager", [wallet.address]);
  const accessPermissions = await deployContract(wallet, "AccessPermissions", [clientConfig.address, wallet.address]);
  const market = await deployContract(wallet, "Market", [clientConfig.address, accessPermissions.address]);
  await (await accessPermissions.contract.setAuthorizedMarket(market.address, true)).wait();

  // 3. DataUnionFactory
  const factory = await deployContract(wallet, "DataUnionFactory", [trackedTokens, multisig]);

  // 4. Phase 4 v2 Modules
  const staking = await deployContract(wallet, "FtdAccessStaking", [
    ftdAddress,
    multisig,
    ethers.parseEther("100"), // 100 FTD read/write access threshold
    ethers.parseEther("500"), // 500 FTD Mobile Node threshold
    net.isMainnet ? 7n * 86400n : 60n, // 7d unstake cooldown mainnet, 60s testnet
  ]);
  const c2dEscrow = await deployContract(wallet, "ComputeToDataEscrow", [
    clientConfig.address,
    accessPermissions.address,
    multisig,
  ]);

  // 5. Optional 3-Tier Cascading Data Union
  let unions;
  if (opts.with3TierUnion) {
    console.log("\nDeploying 3-Tier Cascading Data Union topology...");
    async function createTier(id, name, upstream) {
      await (await factory.contract.createAdminDataUnion(id, name, wallet.address, trackedTokens, upstream, 0n)).wait();
      const count = Number(await factory.contract.unionCount());
      const addr = await factory.contract.allUnions(count - 1);
      console.log(`  Created ${id.padEnd(24)} -> ${addr}`);
      return addr;
    }

    const rootAddr = await createTier("ftdp-media-social-root", "FTDP Media & Social Root Union", ethers.ZeroAddress);
    const panoramaSub = await createTier("panorama-tier2", "Panorama Contributor Pool (Tier-2)", rootAddr);
    const streamySub = await createTier("streamy-tier2", "Streamy Video & Ad Union (Tier-2)", rootAddr);
    const commentSub = await createTier("comment-protocol-tier2", "Comment Protocol Union (Tier-2)", rootAddr);
    const topNewsSub = await createTier("top-news-tier3", "Top News Community Pool (Tier-3)", commentSub);
    const rmvSub = await createTier("ratemyvideo-tier3", "RateMyVideo Reviewer Pool (Tier-3)", commentSub);

    const splitterAbi = loadArtifact("AdminControlledSplitter").abi;
    const rootContract = new ethers.Contract(rootAddr, splitterAbi, wallet);
    await (
      await rootContract.setSharesMulti([
        { shareholder: multisig, shares: 500n },
        { shareholder: panoramaSub, shares: 3500n },
        { shareholder: streamySub, shares: 2500n },
        { shareholder: commentSub, shares: 3500n },
      ])
    ).wait();

    const commentContract = new ethers.Contract(commentSub, splitterAbi, wallet);
    await (
      await commentContract.setSharesMulti([
        { shareholder: topNewsSub, shares: 5500n },
        { shareholder: rmvSub, shares: 4500n },
      ])
    ).wait();

    if (multisig.toLowerCase() !== wallet.address.toLowerCase()) {
      for (const addr of [rootAddr, panoramaSub, streamySub, commentSub, topNewsSub, rmvSub]) {
        const s = new ethers.Contract(addr, splitterAbi, wallet);
        await (await s.transferOwnership(multisig)).wait();
      }
    }

    unions = {
      tier1Root: rootAddr,
      tier2Panorama: panoramaSub,
      tier2Streamy: streamySub,
      tier2CommentProtocol: commentSub,
      tier3TopNews: topNewsSub,
      tier3RateMyVideo: rmvSub,
    };
  }

  // 6. Transfer SLS core ownership to FTDF Multisig
  if (multisig.toLowerCase() !== wallet.address.toLowerCase()) {
    await (await clientConfig.contract.transferOwnership(multisig)).wait();
    await (await accessPermissions.contract.transferOwnership(multisig)).wait();
  }

  const manifest = {
    protocol: "Fair Trade Data Protocol (FTDP)",
    version: "1.0.0",
    network: net.name,
    chainId: String(net.chainId),
    explorer: net.explorer,
    deployedAt: new Date().toISOString(),
    deployer: wallet.address,
    multisigOwner: multisig,
    trackedTokens,
    contracts: {
      ftdToken: ftdAddress,
      usdc: usdcAddress,
      clientConfigManager: clientConfig.address,
      accessPermissions: accessPermissions.address,
      market: market.address,
      dataUnionFactory: factory.address,
      ftdAccessStaking: staking.address,
      computeToDataEscrow: c2dEscrow.address,
    },
    ...(unions ? { unions } : {}),
  };

  const outDir = path.resolve(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${net.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\nManifest saved to:", outFile);
  console.log("\n=== Next: Wire into Railway ftdp-node & Vercel Portal ===");
  console.log(`FTDP_CHAIN_ID=${net.chainId}`);
  console.log(`FTDP_RPC_URL=${rpcUrl}`);
  console.log(`FTDP_CLIENT_CONFIG_ADDRESS=${clientConfig.address}`);
  console.log(`FTDP_ACCESS_PERMISSIONS_ADDRESS=${accessPermissions.address}`);
  console.log(`VITE_FTDP_MARKET_ADDRESS=${market.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
