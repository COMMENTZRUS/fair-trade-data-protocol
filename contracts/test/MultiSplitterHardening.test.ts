import { expect } from "chai";
import { ethers } from "hardhat";
import { parseEther, parseUnits, ZeroAddress } from "ethers";

describe("MultiSplitter Hardening & Regression Suite", function () {
  async function deployFixture() {
    const [owner, admin, relayer, u1, u2, u3, beneficiaryWallet] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    const ftd = await MockERC20.deploy("Fair Trade Data", "FTD", 18);

    const tokens = [ZeroAddress, await usdc.getAddress(), await ftd.getAddress()];

    const Factory = await ethers.getContractFactory("DataUnionFactory");
    const factory = await Factory.deploy(tokens, owner.address);

    await usdc.mint(owner.address, parseUnits("1000000", 6));
    await ftd.mint(owner.address, parseEther("1000000"));

    return { owner, admin, relayer, u1, u2, u3, beneficiaryWallet, usdc, ftd, tokens, factory };
  }

  it("Bug 1 Regression: saveRPS accounts for tokens[1..n] even when tokens[0] (ETH) has 0 receipts", async function () {
    const { owner, admin, u1, u2, usdc, ftd, tokens, factory } = await deployFixture();

    await factory.createAdminDataUnion("multi-token-test", "MultiToken Union", admin.address, tokens, ZeroAddress, 0);
    const unionAddr = await factory.allUnions(0);
    const union = await ethers.getContractAt("AdminControlledSplitter", unionAddr);

    // u1 starts with 100% of shares
    await union.connect(admin).setShares(u1.address, 100);

    // Deposit ONLY USDC and FTD (0 ETH in tokens[0])
    const usdcAmt = parseUnits("1000", 6);
    const ftdAmt = parseEther("500");
    await usdc.transfer(unionAddr, usdcAmt);
    await ftd.transfer(unionAddr, ftdAmt);

    // Now u2 joins with 100 shares (50/50 split going forward)
    // Before fix, saveRPS returned early on tokens[0] (ETH == 0) and failed to checkpoint USDC & FTD!
    await union.connect(admin).setShares(u2.address, 100);

    // u1 must retain 100% of pre-join USDC & FTD; u2 must have 0
    expect(await union.availableAllotment(u1.address, await usdc.getAddress())).to.equal(usdcAmt);
    expect(await union.availableAllotment(u1.address, await ftd.getAddress())).to.equal(ftdAmt);
    expect(await union.availableAllotment(u2.address, await usdc.getAddress())).to.equal(0n);
    expect(await union.availableAllotment(u2.address, await ftd.getAddress())).to.equal(0n);

    // Subsequent deposit splits 50/50
    await usdc.transfer(unionAddr, usdcAmt);
    expect(await union.availableAllotment(u1.address, await usdc.getAddress())).to.equal(parseUnits("1500", 6));
    expect(await union.availableAllotment(u2.address, await usdc.getAddress())).to.equal(parseUnits("500", 6));
  });

  it("Bug 2 & 4 Regression: AutoPullSplitter wires upstream in init() and pulls on-demand during withdraw()", async function () {
    const { admin, u1, u2, usdc, tokens, factory } = await deployFixture();

    // Tier-1 Root Union
    await factory.createAdminDataUnion("root-union", "Root Union", admin.address, tokens, ZeroAddress, 0);
    const rootAddr = await factory.allUnions(0);
    const root = await ethers.getContractAt("AdminControlledSplitter", rootAddr);

    // Tier-2 Sub-Splitter pointing at Root Union via init()
    await factory.createAdminDataUnion("sub-union", "App Sub-Splitter", admin.address, tokens, rootAddr, 0);
    const subAddr = await factory.allUnions(1);
    const sub = await ethers.getContractAt("AdminControlledSplitter", subAddr);

    expect(await sub.upstreamSplitter()).to.equal(rootAddr);

    // Root allocates 100% to sub-splitter; sub-splitter splits 60/40 between u1 and u2
    await root.connect(admin).setShares(subAddr, 100);
    await sub.connect(admin).setSharesMulti([
      { shareholder: u1.address, shares: 60 },
      { shareholder: u2.address, shares: 40 },
    ]);

    // Deposit 1000 USDC into Root ONLY (Sub-Splitter holds 0 local USDC!)
    const deposit = parseUnits("1000", 6);
    await usdc.transfer(rootAddr, deposit);
    expect(await usdc.balanceOf(subAddr)).to.equal(0n);

    // u1 withdraws directly from Sub-Splitter WITHOUT anyone calling saveRPS or pullAllFromUpstream first
    await sub.connect(u1).withdrawAll(u1.address, await usdc.getAddress());
    expect(await usdc.balanceOf(u1.address)).to.equal(parseUnits("600", 6));

    // u2 withdraws remaining 400 USDC (now held locally in Sub-Splitter)
    await sub.connect(u2).withdrawAll(u2.address, await usdc.getAddress());
    expect(await usdc.balanceOf(u2.address)).to.equal(parseUnits("400", 6));
  });

  it("Bug 3 Regression: setSharesMultiMeta succeeds when relayed by a third party and blocks replay", async function () {
    const { admin, relayer, u1, u2, tokens, factory } = await deployFixture();

    await factory.createAdminDataUnion("meta-union", "Meta Union", admin.address, tokens, ZeroAddress, 0);
    const unionAddr = await factory.allUnions(0);
    const union = await ethers.getContractAt("AdminControlledSplitter", unionAddr);

    const network = await ethers.provider.getNetwork();
    const block = await ethers.provider.getBlock("latest");
    const deadline = BigInt(block!.timestamp + 3600);
    const nonce = await union.nonces(admin.address);

    const updates = [
      { shareholder: u1.address, shares: 750n },
      { shareholder: u2.address, shares: 250n },
    ];

    const domain = {
      name: "FTDPDataUnion",
      version: "1",
      chainId: network.chainId,
      verifyingContract: unionAddr,
    };

    const types = {
      HolderAndShares: [
        { name: "shareholder", type: "address" },
        { name: "shares", type: "uint256" },
      ],
      SetSharesMulti: [
        { name: "updates", type: "HolderAndShares[]" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const sig = await admin.signTypedData(domain, types, { updates, nonce, deadline });
    const { v, r, s } = ethers.Signature.from(sig);

    // Third-party relayer submits the meta-tx
    await union.connect(relayer).setSharesMultiMeta(updates, deadline, v, r, s);

    expect(await union.shares(u1.address)).to.equal(750n);
    expect(await union.shares(u2.address)).to.equal(250n);
    expect(await union.totalShares()).to.equal(1000n);

    // Replay must fail (nonce consumed)
    await expect(
      union.connect(relayer).setSharesMultiMeta(updates, deadline, v, r, s)
    ).to.be.revertedWithCustomError(union, "InvalidSignature");
  });

  it("Bug 4b Hardening: ReentrancyGuard blocks native ETH reentrancy on withdrawAll", async function () {
    const { owner, admin, tokens, factory } = await deployFixture();

    await factory.createAdminDataUnion("reentrancy-union", "Guard Union", admin.address, tokens, ZeroAddress, 0);
    const unionAddr = await factory.allUnions(0);
    const union = await ethers.getContractAt("AdminControlledSplitter", unionAddr);

    const Attacker = await ethers.getContractFactory("ReentrantReceiver");
    const attacker = await Attacker.deploy(unionAddr);
    const attackerAddr = await attacker.getAddress();

    await union.connect(admin).setShares(attackerAddr, 100);
    await owner.sendTransaction({ to: unionAddr, value: parseEther("2") });

    await attacker.attack();
    expect(await attacker.attempted()).to.equal(true);
    expect(await attacker.reentrancySucceeded()).to.equal(false);
    expect(await ethers.provider.getBalance(attackerAddr)).to.equal(parseEther("2"));
  });

  it("Bug 5 Feature: Clone-deployed VotesSplitterShare supports custom name/symbol, governance voting, and dynamic minting", async function () {
    const { admin, u1, u2, ftd, tokens, factory } = await deployFixture();

    await factory.createVotesDataUnion(
      "dao-union-1",
      "FTDP News DAO Union",
      "FNEWS",
      parseEther("100"),
      u1.address,
      admin.address,
      tokens,
      ZeroAddress,
      0
    );

    const splitterAddr = await factory.allUnions(0);
    const info = await factory.unionInfo(splitterAddr);
    const splitter = await ethers.getContractAt("ERC20SharesSplitter", splitterAddr);
    const shareToken = await ethers.getContractAt("VotesSplitterShare", info.sharesToken);

    expect(await shareToken.name()).to.equal("FTDP News DAO Union");
    expect(await shareToken.symbol()).to.equal("FNEWS");

    // u1 delegates voting power to self
    await shareToken.connect(u1).delegate(u1.address);
    expect(await shareToken.getVotes(u1.address)).to.equal(parseEther("100"));

    // Deposit 100 FTD while u1 holds 100%
    await ftd.transfer(splitterAddr, parseEther("100"));

    // Minter mints 100 new union shares to u2 (now 50/50 going forward)
    await shareToken.connect(admin).mint(u2.address, parseEther("100"));
    await shareToken.connect(u2).delegate(u2.address);
    expect(await shareToken.getVotes(u2.address)).to.equal(parseEther("100"));

    // Deposit another 100 FTD (splits 50/50)
    await ftd.transfer(splitterAddr, parseEther("100"));

    expect(await splitter.availableAllotment(u1.address, await ftd.getAddress())).to.equal(parseEther("150"));
    expect(await splitter.availableAllotment(u2.address, await ftd.getAddress())).to.equal(parseEther("50"));

    await splitter.withdrawAll(u1.address, await ftd.getAddress());
    await splitter.withdrawAll(u2.address, await ftd.getAddress());
    expect(await ftd.balanceOf(u1.address)).to.equal(parseEther("150"));
    expect(await ftd.balanceOf(u2.address)).to.equal(parseEther("50"));
  });
});
