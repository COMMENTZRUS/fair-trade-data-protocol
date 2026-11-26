import { ethers } from "hardhat";

async function main() {
  const [deployer, panoramaAdmin, topNewsAdmin, ftdfTreasury] = await ethers.getSigners();
  console.log("Deploying FTDP v1 Protocol with:", deployer.address);

  // 1. Deploy mock settlement tokens for local / testnet demo (USDC + FTD)
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = await MockERC20.deploy("USD Coin (Mock)", "USDC", 6);
  const ftd = await MockERC20.deploy("Fair Trade Data", "FTD", 18);
  await usdc.waitForDeployment();
  await ftd.waitForDeployment();

  const supportedTokens = [ethers.ZeroAddress, await usdc.getAddress(), await ftd.getAddress()];

  // 2. Deploy SLS Access & Market Layer
  const ClientConfigManager = await ethers.getContractFactory("ClientConfigManager");
  const clientConfig = await ClientConfigManager.deploy(deployer.address);
  await clientConfig.waitForDeployment();

  const AccessPermissions = await ethers.getContractFactory("AccessPermissions");
  const accessPermissions = await AccessPermissions.deploy(await clientConfig.getAddress(), deployer.address);
  await accessPermissions.waitForDeployment();

  const Market = await ethers.getContractFactory("Market");
  const market = await Market.deploy(await clientConfig.getAddress(), await accessPermissions.getAddress());
  await market.waitForDeployment();

  await (await accessPermissions.setAuthorizedMarket(await market.getAddress(), true)).wait();

  // 3. Deploy DataUnionFactory (Constant-Time MultiSplitters)
  const DataUnionFactory = await ethers.getContractFactory("DataUnionFactory");
  const factory = await DataUnionFactory.deploy(supportedTokens, deployer.address);
  await factory.waitForDeployment();

  // 4. Demo Cascading Data Union: Tier-1 "News & Curation Data Union" -> Tier-2 Panorama & Top News Sub-Splitters
  const rootTx = await factory.createAdminDataUnion(
    "news-curation-root-v1",
    "News & Curation Data Union",
    deployer.address,
    supportedTokens,
    ethers.ZeroAddress,
    0
  );
  await rootTx.wait();
  const rootUnionAddr = await factory.allUnions(0);

  await (
    await factory.createAdminDataUnion(
      "panorama-sub-v1",
      "Panorama Contributor Pool",
      panoramaAdmin.address,
      supportedTokens,
      rootUnionAddr,
      0
    )
  ).wait();
  const panoramaSubAddr = await factory.allUnions(1);

  await (
    await factory.createAdminDataUnion(
      "topnews-sub-v1",
      "Top News Contributor Pool",
      topNewsAdmin.address,
      supportedTokens,
      rootUnionAddr,
      0
    )
  ).wait();
  const topNewsSubAddr = await factory.allUnions(2);

  // Configure Tier-1 splits: 5% FTDF Treasury, 55% Panorama Sub-Splitter, 40% Top News Sub-Splitter
  const rootUnion = await ethers.getContractAt("AdminControlledSplitter", rootUnionAddr);
  await (
    await rootUnion.setSharesMulti([
      { shareholder: ftdfTreasury.address, shares: 500 },
      { shareholder: panoramaSubAddr, shares: 5500 },
      { shareholder: topNewsSubAddr, shares: 4000 },
    ])
  ).wait();

  console.log({
    usdc: await usdc.getAddress(),
    ftd: await ftd.getAddress(),
    clientConfig: await clientConfig.getAddress(),
    accessPermissions: await accessPermissions.getAddress(),
    market: await market.getAddress(),
    dataUnionFactory: await factory.getAddress(),
    rootNewsDataUnion: rootUnionAddr,
    panoramaSubSplitter: panoramaSubAddr,
    topNewsSubSplitter: topNewsSubAddr,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
