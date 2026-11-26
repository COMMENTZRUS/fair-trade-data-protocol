import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, parseEther, parseUnits, solidityPackedKeccak256, ZeroAddress } from "ethers";

// Minimal sorted-pair Merkle tree matching OpenZeppelin MerkleProof.verify
function buildMerkleTree(leaves: string[]) {
  const hashPair = (a: string, b: string) =>
    BigInt(a) <= BigInt(b)
      ? solidityPackedKeccak256(["bytes32", "bytes32"], [a, b])
      : solidityPackedKeccak256(["bytes32", "bytes32"], [b, a]);

  const layers: string[][] = [leaves.slice()];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 < prev.length) {
        next.push(hashPair(prev[i], prev[i + 1]));
      } else {
        next.push(prev[i]);
      }
    }
    layers.push(next);
  }

  const root = layers[layers.length - 1][0];
  const getProof = (index: number): string[] => {
    const proof: string[] = [];
    let idx = index;
    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level];
      const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (pairIdx < layer.length) {
        proof.push(layer[pairIdx]);
      }
      idx = Math.floor(idx / 2);
    }
    return proof;
  };

  return { root, getProof };
}

describe("FTDP End-to-End: Panorama + Top News Cascading Data Unions + SLS Market", function () {
  it("Executes full lifecycle: Deployments -> Consent Merkle Proofs -> Market Purchase -> Cascading O(1) Payouts", async function () {
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
    ] = await ethers.getSigners();

    // 1. Deploy Settlement Tokens (USDC + FTD)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    const ftd = await MockERC20.deploy("Fair Trade Data", "FTD", 18);
    const usdcAddr = await usdc.getAddress();
    const ftdAddr = await ftd.getAddress();
    const supportedTokens = [ZeroAddress, usdcAddr, ftdAddr];

    await usdc.mint(aiBuyerAdmin.address, parseUnits("100000", 6));
    await ftd.mint(aiBuyerAdmin.address, parseEther("100000"));

    // 2. Deploy SLS Core Contracts + DataUnionFactory
    const ClientConfig = await ethers.getContractFactory("ClientConfigManager");
    const clientConfig = await ClientConfig.deploy(ftdfAdmin.address);

    const AccessPermissions = await ethers.getContractFactory("AccessPermissions");
    const accessPermissions = await AccessPermissions.deploy(await clientConfig.getAddress(), ftdfAdmin.address);

    const Market = await ethers.getContractFactory("Market");
    const market = await Market.deploy(await clientConfig.getAddress(), await accessPermissions.getAddress());
    await accessPermissions.connect(ftdfAdmin).setAuthorizedMarket(await market.getAddress(), true);

    const Factory = await ethers.getContractFactory("DataUnionFactory");
    const factory = await Factory.deploy(supportedTokens, ftdfAdmin.address);

    // 3. Register Deployments: News Union, Panorama, Top News, and AI Lab Buyer
    const unionDeploymentId = keccak256(ethers.toUtf8Bytes("union:news-curation-v1"));
    const buyerDeploymentId = keccak256(ethers.toUtf8Bytes("buyer:ai-lab-v1"));
    const newsFeedDataId = keccak256(ethers.toUtf8Bytes("dataset:news-engagement-anon"));

    await clientConfig.registerDeployment(unionDeploymentId, ftdfAdmin.address, 0);
    await clientConfig.registerDeployment(buyerDeploymentId, aiBuyerAdmin.address, 0);

    // Grant ROLE_READ to AI Lab's reader key via EIP-712 setKeyMeta relayed by third party
    const network = await ethers.provider.getNetwork();
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latestBlock!.timestamp + 3600);
    const roleRead = await clientConfig.ROLE_READ();
    const sig = await aiBuyerAdmin.signTypedData(
      {
        name: "FTDPClientConfig",
        version: "1",
        chainId: network.chainId,
        verifyingContract: await clientConfig.getAddress(),
      },
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
        nonce: await clientConfig.nonces(aiBuyerAdmin.address),
        deadline,
      }
    );
    const parsedSig = ethers.Signature.from(sig);
    await clientConfig
      .connect(relayer)
      .setKeyMeta(
        buyerDeploymentId,
        aiBuyerAdmin.address,
        aiBuyerReaderKey.address,
        roleRead,
        0,
        deadline,
        parsedSig.v,
        parsedSig.r,
        parsedSig.s
      );

    // 4. Commit User Opt-In Consent Merkle Root
    // Bit 0 (1) = Analytics, Bit 1 (2) = News Data Union, Bit 2 (4) = AI Training
    const FLAG_NEWS_UNION = 2n;
    const FLAG_AI_TRAINING = 4n;
    const REQUIRED_FLAGS = FLAG_NEWS_UNION | FLAG_AI_TRAINING; // 6

    const uidOptedIn = keccak256(ethers.toUtf8Bytes("user:panorama-1"));
    const uidOptedOutOfAI = keccak256(ethers.toUtf8Bytes("user:panorama-2-no-ai"));

    const leafOptedIn = solidityPackedKeccak256(["bytes32", "uint256"], [uidOptedIn, 7n]); // bits 0,1,2
    const leafOptedOut = solidityPackedKeccak256(["bytes32", "uint256"], [uidOptedOutOfAI, 3n]); // bits 0,1 only
    const tree = buildMerkleTree([leafOptedIn, leafOptedOut]);

    await accessPermissions.connect(ftdfAdmin).setOptInMerkleRoot(unionDeploymentId, tree.root);

    // 5. Deploy Tier-1 Root Data Union + Tier-2 Panorama & Top News AutoPull Sub-Splitters
    await factory.createAdminDataUnion(
      "news-root",
      "News & Curation Data Union",
      ftdfAdmin.address,
      supportedTokens,
      ZeroAddress,
      0
    );
    const rootUnionAddr = await factory.allUnions(0);
    const rootUnion = await ethers.getContractAt("AdminControlledSplitter", rootUnionAddr);

    await factory.createAdminDataUnion(
      "panorama-tier2",
      "Panorama Contributor Pool",
      panoramaAdmin.address,
      supportedTokens,
      rootUnionAddr,
      0
    );
    const panoramaSubAddr = await factory.allUnions(1);
    const panoramaSub = await ethers.getContractAt("AdminControlledSplitter", panoramaSubAddr);

    await factory.createAdminDataUnion(
      "topnews-tier2",
      "Top News Contributor Pool",
      topNewsAdmin.address,
      supportedTokens,
      rootUnionAddr,
      0
    );
    const topNewsSubAddr = await factory.allUnions(2);
    const topNewsSub = await ethers.getContractAt("AdminControlledSplitter", topNewsSubAddr);

    // Tier-1 Splits: 5% FTDF Treasury, 55% Panorama Sub-Splitter, 40% Top News Sub-Splitter
    await rootUnion.connect(ftdfAdmin).setSharesMulti([
      { shareholder: ftdfTreasury.address, shares: 500 },
      { shareholder: panoramaSubAddr, shares: 5500 },
      { shareholder: topNewsSubAddr, shares: 4000 },
    ]);

    // Tier-2 Panorama Splits: 30% Panorama Operator, 40% User1, 30% User2
    await panoramaSub.connect(panoramaAdmin).setSharesMulti([
      { shareholder: panoramaOp.address, shares: 300 },
      { shareholder: panoramaUser1.address, shares: 400 },
      { shareholder: panoramaUser2.address, shares: 300 },
    ]);

    // Tier-2 Top News Splits: 25% Top News Operator, 75% Reader1
    await topNewsSub.connect(topNewsAdmin).setSharesMulti([
      { shareholder: topNewsOp.address, shares: 250 },
      { shareholder: topNewsReader1.address, shares: 750 },
    ]);

    // Panorama User 2 sets gasless EIP-712 Beneficiary to a separate cold wallet
    const benSig = await panoramaUser2.signTypedData(
      {
        name: "FTDPDataUnion",
        version: "1",
        chainId: network.chainId,
        verifyingContract: panoramaSubAddr,
      },
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
        nonce: await panoramaSub.nonces(panoramaUser2.address),
      }
    );
    const parsedBen = ethers.Signature.from(benSig);
    await panoramaSub
      .connect(relayer)
      .setBeneficiaryMeta(
        panoramaUser2.address,
        panoramaUser2ColdWallet.address,
        deadline,
        parsedBen.v,
        parsedBen.r,
        parsedBen.s
      );

    // 6. Post Market Offers (10,000 USDC for 1000s = 10 USDC/sec) with beneficiary = Tier-1 Root Data Union
    const duration = 1000n;
    const pricePerSecond = parseUnits("10", 6); // 10 USDC / sec -> 10,000 USDC total

    await market
      .connect(ftdfAdmin)
      .addOffer(
        unionDeploymentId,
        newsFeedDataId,
        usdcAddr,
        pricePerSecond,
        100,
        86400 * 365,
        rootUnionAddr,
        REQUIRED_FLAGS,
        roleRead
      );

    // Before purchase, buyer cannot read opted-in user's record
    expect(
      await accessPermissions.canRead(
        aiBuyerReaderKey.address,
        unionDeploymentId,
        uidOptedIn,
        newsFeedDataId,
        7n,
        tree.getProof(0)
      )
    ).to.equal(false);

    // 7. AI Lab Purchases Offer #1 for 10,000 USDC
    const totalCost = parseUnits("10000", 6);
    await usdc.connect(aiBuyerAdmin).approve(await market.getAddress(), totalCost);
    await market.connect(aiBuyerAdmin).purchase([1], buyerDeploymentId, duration);

    // 8. Verify On-Chain Consent & Access Enforcement
    // Opted-in user (flags = 7, satisfies requiredFlags = 6) -> ALLOWED
    expect(
      await accessPermissions.canRead(
        aiBuyerReaderKey.address,
        unionDeploymentId,
        uidOptedIn,
        newsFeedDataId,
        7n,
        tree.getProof(0)
      )
    ).to.equal(true);

    // User who did NOT opt into AI training (flags = 3, fails requiredFlags = 6) -> DENIED
    expect(
      await accessPermissions.canRead(
        aiBuyerReaderKey.address,
        unionDeploymentId,
        uidOptedOutOfAI,
        newsFeedDataId,
        3n,
        tree.getProof(1)
      )
    ).to.equal(false);

    // Forged flags (claiming 7 for opted-out user with leaf 1 proof) -> DENIED by Merkle proof
    expect(
      await accessPermissions.canRead(
        aiBuyerReaderKey.address,
        unionDeploymentId,
        uidOptedOutOfAI,
        newsFeedDataId,
        7n,
        tree.getProof(1)
      )
    ).to.equal(false);

    // 9. Verify Exact Cascading Payouts Across Both Tiers
    // 10,000 USDC total:
    //  - FTDF Treasury (5%): 500 USDC
    //  - Panorama Sub-Splitter (55% = 5,500 USDC):
    //      - Panorama Operator (30%): 1,650 USDC
    //      - Panorama User 1 (40%):   2,200 USDC
    //      - Panorama User 2 (30%):   1,650 USDC -> routed to Cold Wallet!
    //  - Top News Sub-Splitter (40% = 4,000 USDC):
    //      - Top News Operator (25%): 1,000 USDC
    //      - Top News Reader 1 (75%): 3,000 USDC

    await rootUnion.withdrawAll(ftdfTreasury.address, usdcAddr);
    expect(await usdc.balanceOf(ftdfTreasury.address)).to.equal(parseUnits("500", 6));

    // Late joiner added to Panorama BEFORE anyone withdraws from Panorama -> must NOT dilute past 5,500 USDC!
    await panoramaSub.connect(panoramaAdmin).setShares(panoramaUser3LateJoiner.address, 1000);
    expect(await panoramaSub.availableAllotment(panoramaUser3LateJoiner.address, usdcAddr)).to.equal(0n);

    await panoramaSub.withdrawAll(panoramaOp.address, usdcAddr);
    await panoramaSub.withdrawAll(panoramaUser1.address, usdcAddr);
    await panoramaSub.withdrawAll(panoramaUser2.address, usdcAddr);

    expect(await usdc.balanceOf(panoramaOp.address)).to.equal(parseUnits("1650", 6));
    expect(await usdc.balanceOf(panoramaUser1.address)).to.equal(parseUnits("2200", 6));
    expect(await usdc.balanceOf(panoramaUser2.address)).to.equal(0n);
    expect(await usdc.balanceOf(panoramaUser2ColdWallet.address)).to.equal(parseUnits("1650", 6));

    await topNewsSub.withdrawAll(topNewsOp.address, usdcAddr);
    await topNewsSub.withdrawAll(topNewsReader1.address, usdcAddr);
    expect(await usdc.balanceOf(topNewsOp.address)).to.equal(parseUnits("1000", 6));
    expect(await usdc.balanceOf(topNewsReader1.address)).to.equal(parseUnits("3000", 6));

    // 10. Second Purchase (FTD token / direct stream): Late joiner now owns 50% of Panorama (1000 / 2000 shares)
    // Stream 1000 FTD into Root Union -> Panorama gets 550 FTD -> Late joiner gets 275 FTD!
    await ftd.connect(aiBuyerAdmin).transfer(rootUnionAddr, parseEther("1000"));
    expect(await panoramaSub.availableAllotment(panoramaUser3LateJoiner.address, ftdAddr)).to.equal(parseEther("275"));
    await panoramaSub.withdrawAll(panoramaUser3LateJoiner.address, ftdAddr);
    expect(await ftd.balanceOf(panoramaUser3LateJoiner.address)).to.equal(parseEther("275"));
  });
});
