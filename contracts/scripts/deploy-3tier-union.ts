import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

interface CoreManifest {
  chainId: string;
  multisigOwner: string;
  trackedTokens: string[];
  contracts: {
    dataUnionFactory: string;
    market: string;
  };
}

/**
 * Deploys the FTDP Reference 3-Tier Cascading Data Union topology onto a live testnet or mainnet:
 *
 *   Tier-1: FTDP Media & Social Root Union
 *     ├── 5%  -> FTDF Treasury (Safe Multisig)
 *     ├── 35% -> Tier-2 Panorama Contributor Pool (AutoPull)
 *     ├── 25% -> Tier-2 Streamy Video & Ad Union (AutoPull)
 *     └── 35% -> Tier-2 Comment Protocol Union (AutoPull)
 *                   ├── 55% -> Tier-3 Top News Community Pool (AutoPull)
 *                   └── 45% -> Tier-3 RateMyVideo Reviewer Pool (AutoPull)
 *
 * Requires an existing core deployment manifest in `contracts/deployments/chain-<chainId>.json`
 * created by `deploy-production.ts`.
 */
async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId.toString();
  const [deployer] = await ethers.getSigners();

  const manifestPath = path.resolve(__dirname, "..", "deployments", `chain-${chainId}.json`);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Core deployment manifest not found at ${manifestPath}. Run deploy-production.ts first.`);
  }
  const core = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as CoreManifest;

  const factory = await ethers.getContractAt("DataUnionFactory", core.contracts.dataUnionFactory, deployer);
  const tokens = core.trackedTokens;

  const ftdfTreasury = process.env.FTDF_MULTISIG_ADDRESS || core.multisigOwner;
  const unionAdmin = process.env.UNION_ADMIN_ADDRESS || deployer.address;

  console.log("=== Deploying FTDP 3-Tier Cascading Data Union ===");
  console.log("Chain ID:     ", chainId);
  console.log("Factory:      ", core.contracts.dataUnionFactory);
  console.log("Union Admin:  ", unionAdmin);
  console.log("FTDF Treasury:", ftdfTreasury);

  async function createTier(
    unionId: string,
    name: string,
    upstream: string
  ): Promise<string> {
    const tx = await factory.createAdminDataUnion(unionId, name, deployer.address, tokens, upstream, 0n);
    const receipt = await tx.wait();
    const total = Number(await factory.unionCount());
    const addr = await factory.allUnions(total - 1);
    console.log(`  Created ${unionId} (${name}) -> ${addr} (tx: ${receipt?.hash})`);
    return addr;
  }

  // Tier-1 Root
  const rootAddr = await createTier("ftdp-media-social-root", "FTDP Media & Social Root Union", ethers.ZeroAddress);

  // Tier-2 App & Protocol Sub-Splitters (AutoPull from Tier-1 Root)
  const panoramaSubAddr = await createTier("panorama-tier2", "Panorama Contributor Pool (Tier-2)", rootAddr);
  const streamySubAddr = await createTier("streamy-tier2", "Streamy Video & Ad Union (Tier-2)", rootAddr);
  const commentSubAddr = await createTier("comment-protocol-tier2", "Comment Protocol Union (Tier-2)", rootAddr);

  // Tier-3 Community App Sub-Splitters (AutoPull from Tier-2 Comment Protocol)
  const topNewsSubAddr = await createTier("top-news-tier3", "Top News Community Pool (Tier-3)", commentSubAddr);
  const rateMyVideoSubAddr = await createTier("ratemyvideo-tier3", "RateMyVideo Reviewer Pool (Tier-3)", commentSubAddr);

  // Wire Tier-1 weights (500 / 3500 / 2500 / 3500 = 10,000 bps)
  const rootSplitter = await ethers.getContractAt("AdminControlledSplitter", rootAddr, deployer);
  await (
    await rootSplitter.setSharesMulti([
      { shareholder: ftdfTreasury, shares: 500n },
      { shareholder: panoramaSubAddr, shares: 3500n },
      { shareholder: streamySubAddr, shares: 2500n },
      { shareholder: commentSubAddr, shares: 3500n },
    ])
  ).wait();

  // Wire Tier-2 Comment Protocol weights (5500 Top News / 4500 RateMyVideo)
  const commentSplitter = await ethers.getContractAt("AdminControlledSplitter", commentSubAddr, deployer);
  await (
    await commentSplitter.setSharesMulti([
      { shareholder: topNewsSubAddr, shares: 5500n },
      { shareholder: rateMyVideoSubAddr, shares: 4500n },
    ])
  ).wait();

  // Optional ownership handoff if UNION_ADMIN_ADDRESS differs from deployer
  if (ethers.getAddress(unionAdmin) !== ethers.getAddress(deployer.address)) {
    for (const addr of [rootAddr, panoramaSubAddr, streamySubAddr, commentSubAddr, topNewsSubAddr, rateMyVideoSubAddr]) {
      const s = await ethers.getContractAt("AdminControlledSplitter", addr, deployer);
      await (await s.transferOwnership(unionAdmin)).wait();
    }
  }

  const unionsManifest = {
    protocol: "Fair Trade Data Protocol (FTDP)",
    topology: "3-tier-cascading-auto-pull",
    chainId,
    deployedAt: new Date().toISOString(),
    unionAdmin,
    ftdfTreasury,
    unions: {
      tier1Root: { id: "ftdp-media-social-root", address: rootAddr },
      tier2Panorama: { id: "panorama-tier2", address: panoramaSubAddr, upstream: rootAddr, shareBps: 3500 },
      tier2Streamy: { id: "streamy-tier2", address: streamySubAddr, upstream: rootAddr, shareBps: 2500 },
      tier2CommentProtocol: { id: "comment-protocol-tier2", address: commentSubAddr, upstream: rootAddr, shareBps: 3500 },
      tier3TopNews: { id: "top-news-tier3", address: topNewsSubAddr, upstream: commentSubAddr, shareBps: 5500 },
      tier3RateMyVideo: { id: "ratemyvideo-tier3", address: rateMyVideoSubAddr, upstream: commentSubAddr, shareBps: 4500 },
    },
  };

  const outFile = path.resolve(__dirname, "..", "deployments", `chain-${chainId}-unions.json`);
  fs.writeFileSync(outFile, JSON.stringify(unionsManifest, null, 2), "utf8");
  console.log("3-Tier Data Union manifest written to:", outFile);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
