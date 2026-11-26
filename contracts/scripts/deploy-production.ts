import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim().length === 0) {
    throw new Error(`Missing required production env var: ${name}`);
  }
  return val.trim();
}

function requireAddress(name: string): string {
  const val = requireEnv(name);
  if (!ethers.isAddress(val) || val === ethers.ZeroAddress) {
    throw new Error(`Env var ${name} must be a non-zero EVM address (got: ${val})`);
  }
  return ethers.getAddress(val);
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();

  const multisig = requireAddress("FTDF_MULTISIG_ADDRESS");
  const usdc = requireAddress("USDC_ADDRESS");
  const ftdToken = requireAddress("FTD_TOKEN_ADDRESS");
  const includeNative = process.env.INCLUDE_NATIVE_TOKEN !== "false";

  const trackedTokens = includeNative ? [ethers.ZeroAddress, usdc, ftdToken] : [usdc, ftdToken];

  console.log("=== FTDP Production Deployment ===");
  console.log("Chain ID:        ", network.chainId.toString());
  console.log("Deployer:        ", deployer.address);
  console.log("FTDF Multisig:   ", multisig);
  console.log("Tracked Tokens:  ", trackedTokens);

  // 1. Deploy ClientConfigManager (temporary owner = deployer for setup, then hand off to multisig)
  const ClientConfigManager = await ethers.getContractFactory("ClientConfigManager");
  const clientConfig = await ClientConfigManager.deploy(deployer.address);
  await clientConfig.waitForDeployment();

  // 2. Deploy AccessPermissions
  const AccessPermissions = await ethers.getContractFactory("AccessPermissions");
  const accessPermissions = await AccessPermissions.deploy(await clientConfig.getAddress(), deployer.address);
  await accessPermissions.waitForDeployment();

  // 3. Deploy Market & authorize it in AccessPermissions
  const Market = await ethers.getContractFactory("Market");
  const market = await Market.deploy(await clientConfig.getAddress(), await accessPermissions.getAddress());
  await market.waitForDeployment();
  await (await accessPermissions.setAuthorizedMarket(await market.getAddress(), true)).wait();

  // 4. Deploy DataUnionFactory directly owned by FTDF Multisig
  const DataUnionFactory = await ethers.getContractFactory("DataUnionFactory");
  const factory = await DataUnionFactory.deploy(trackedTokens, multisig);
  await factory.waitForDeployment();

  // 5. Hand off ownership of ClientConfigManager and AccessPermissions to FTDF Multisig
  await (await clientConfig.transferOwnership(multisig)).wait();
  await (await accessPermissions.transferOwnership(multisig)).wait();

  const manifest = {
    protocol: "Fair Trade Data Protocol (FTDP)",
    version: "1.0.0",
    chainId: network.chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    multisigOwner: multisig,
    trackedTokens,
    contracts: {
      clientConfigManager: await clientConfig.getAddress(),
      accessPermissions: await accessPermissions.getAddress(),
      market: await market.getAddress(),
      dataUnionFactory: await factory.getAddress(),
      implementations: {
        adminSplitter: await factory.adminSplitterImpl(),
        erc20Splitter: await factory.erc20SplitterImpl(),
        dynamicShare: await factory.dynamicShareImpl(),
        votesShare: await factory.votesShareImpl(),
      },
    },
  };

  const outDir = path.resolve(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `chain-${network.chainId.toString()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2), "utf8");

  console.log("Deployment manifest written to:", outFile);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
