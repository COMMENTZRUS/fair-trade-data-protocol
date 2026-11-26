import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getExtraAccountMetaAddress,
  getMintLen,
  ExtensionType,
  createInitializeTransferHookInstruction,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAccount,
  addExtraAccountMetasForExecute,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { MultiSplitterSolana } from "../target/types/multi_splitter_solana";
import MultiSplitterClient from "../app/client";

describe("multi-splitter with transfer hook (multi-token)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .MultiSplitterSolana as Program<MultiSplitterSolana>;

  const decimals = 0; // 1 token = 1 share
  const mintKeypair = Keypair.generate();
  const mockSplMintKeypair = Keypair.generate(); // mock SPL token (e.g. "USDC")
  const payer = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();

  let payerAta: PublicKey;
  let aliceAta: PublicKey;
  let bobAta: PublicKey;
  let extraMetasAddress: PublicKey;
  let viewer: MultiSplitterClient;

  // Mock SPL token ATAs
  let splSplitterAta: PublicKey; // splitter ATA for mock SPL token (owned by splitter PDA)
  let payerSplAta: PublicKey;
  let aliceSplAta: PublicKey;
  let bobSplAta: PublicKey;

  before(async () => {
    // Airdrop SOL to payer and alice
    const sig = await provider.connection.requestAirdrop(
      payer.publicKey,
      10_000_000_000
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
    const sig2 = await provider.connection.requestAirdrop(
      alice.publicKey,
      1_000_000_000
    );
    await provider.connection.confirmTransaction(sig2, "confirmed");

    // ----- Create share token mint (Token-2022 with TransferHook) -----
    payerAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      payer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    aliceAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      alice.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    bobAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      bob.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    extraMetasAddress = getExtraAccountMetaAddress(
      mintKeypair.publicKey,
      program.programId
    );

    viewer = new MultiSplitterClient(
      program,
      mintKeypair.publicKey,
      payer.publicKey
    );

    const extensions = [ExtensionType.TransferHook];
    const mintLen = getMintLen(extensions);
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(mintLen);

    const createMintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferHookInstruction(
        mintKeypair.publicKey,
        payer.publicKey,
        program.programId,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        payer.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        payerAta,
        payer.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        aliceAta,
        alice.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        bobAta,
        bob.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      ),
      createMintToInstruction(
        mintKeypair.publicKey,
        payerAta,
        payer.publicKey,
        100,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(provider.connection, createMintTx, [
      payer,
      mintKeypair,
    ]);

    // ----- Create mock SPL token mint (regular TOKEN_PROGRAM_ID) -----
    const splMintLen = 82; // standard mint size
    const splMintLamports =
      await provider.connection.getMinimumBalanceForRentExemption(splMintLen);

    // Derive splitter ATA (owned by splitter PDA, uses regular TOKEN_PROGRAM_ID)
    splSplitterAta = getAssociatedTokenAddressSync(
      mockSplMintKeypair.publicKey,
      viewer.splitterInfoPda,
      true,
      TOKEN_PROGRAM_ID
    );
    payerSplAta = getAssociatedTokenAddressSync(
      mockSplMintKeypair.publicKey,
      payer.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    aliceSplAta = getAssociatedTokenAddressSync(
      mockSplMintKeypair.publicKey,
      alice.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    bobSplAta = getAssociatedTokenAddressSync(
      mockSplMintKeypair.publicKey,
      bob.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const createSplMintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mockSplMintKeypair.publicKey,
        space: splMintLen,
        lamports: splMintLamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mockSplMintKeypair.publicKey,
        6, // 6 decimals like USDC
        payer.publicKey,
        null,
        TOKEN_PROGRAM_ID
      ),
      // Create payer's SPL ATA and splitter ATA
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        payerSplAta,
        payer.publicKey,
        mockSplMintKeypair.publicKey,
        TOKEN_PROGRAM_ID
      ),
      // Mint 1,000,000 mock tokens to payer (1.0 USDC equivalent with 6 decimals)
      createMintToInstruction(
        mockSplMintKeypair.publicKey,
        payerSplAta,
        payer.publicKey,
        1_000_000,
        [],
        TOKEN_PROGRAM_ID
      ),
    );

    await sendAndConfirmTransaction(provider.connection, createSplMintTx, [
      payer,
      mockSplMintKeypair,
    ]);
  });

  it("initializes the multisplitter with [SOL, mockSPL]", async () => {
    await program.methods
      .initialize([PublicKey.default, mockSplMintKeypair.publicKey])
      .accounts(viewer.accountsInitialize())
      .signers([payer])
      .rpc();

    const info = await viewer.splitterInfo();
    assert.isTrue(info.mint.equals(mintKeypair.publicKey), "Mint should match");
    assert.equal(info.totalShares.toNumber(), 100, "Total shares = mint supply");
    assert.equal(info.splitMints.length, 2, "Should have 2 split tokens");
    assert.isTrue(info.splitMints[0].equals(PublicKey.default), "First split mint is SOL");
    assert.isTrue(info.splitMints[1].equals(mockSplMintKeypair.publicKey), "Second split mint is mock SPL");
  });

  it("creates splitter ATA for mock SPL token", async () => {
    const createVaultAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        splSplitterAta,
        viewer.splitterInfoPda,
        mockSplMintKeypair.publicKey,
        TOKEN_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(provider.connection, createVaultAtaTx, [payer]);

    const account = await getAccount(provider.connection, splSplitterAta, undefined, TOKEN_PROGRAM_ID);
    assert.equal(Number(account.amount), 0, "Vault ATA should start with 0");
  });

  it("initializes extra account meta list", async () => {
    const tx = await program.methods
      .initializeExtraAccountMetaList()
      .accounts({
        payer: payer.publicKey,
        mint: mintKeypair.publicKey,
        splitterInfo: viewer.splitterInfoPda,
      })
      .signers([payer])
      .rpc();

    console.log("Initialize extra account meta list tx:", tx);
    const account = await provider.connection.getAccountInfo(extraMetasAddress);
    assert.isNotNull(account, "Extra account meta list should exist");
  });

  it("funds the vault PDA", async () => {
    const vaultPda = viewer.vaultPda();
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: vaultPda,
        lamports: 100_000_000, // 0.1 SOL — enough for many auto-creates
      })
    );
    await sendAndConfirmTransaction(provider.connection, fundTx, [payer]);

    const balance = await provider.connection.getBalance(vaultPda);
    console.log(`Vault PDA funded with ${balance} lamports`);
    assert.isAbove(balance, 0, "Vault should have SOL");
  });

  it("registers payer, alice, bob", async () => {
    await program.methods
      .register(payerAta)
      .accounts(viewer.accountsRegister(payerAta))
      .signers([payer])
      .rpc();

    await program.methods
      .register(aliceAta)
      .accounts(viewer.accountsRegister(aliceAta))
      .signers([payer])
      .rpc();

    await program.methods
      .register(bobAta)
      .accounts(viewer.accountsRegister(bobAta))
      .signers([payer])
      .rpc();

    // Verify BalanceInfo PDAs exist with Vec arrays of length 2
    const payerBal = await viewer.balanceInfo(payerAta);
    assert.equal(payerBal.accrual.length, 2, "Should have 2 accrual entries");
    assert.equal(payerBal.accrual[0].toNumber(), 0);
    assert.equal(payerBal.accrual[1].toNumber(), 0);
    assert.equal(payerBal.withdrawn.length, 2);
  });

  it("sends SOL to splitter and verifies payer gets 100%", async () => {
    const amount = 10000;
    const sendTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: viewer.splitterInfoPda,
        lamports: amount,
      })
    );
    await sendAndConfirmTransaction(provider.connection, sendTx, [payer]);

    const payerBal = await viewer.getSolBalance(payer.publicKey, payerAta);
    console.log(`Payer SOL balance after 10000 lamports sent: ${payerBal}`);
    assert.equal(payerBal.toNumber(), 10000, "Payer should have all 10000 (100% shares)");
  });

  it("deposits mock SPL tokens to vault and verifies payer gets 100%", async () => {
    // Transfer mock tokens from payer to splitter ATA
    const depositAmount = 500_000; // 0.5 USDC
    const depositIx = await import("@solana/spl-token").then(spl =>
      spl.createTransferInstruction(
        payerSplAta,
        splSplitterAta,
        payer.publicKey,
        depositAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    const tx = new Transaction().add(depositIx);
    await sendAndConfirmTransaction(provider.connection, tx, [payer]);

    const balances = await viewer.getBalances(payer.publicKey, payerAta);
    console.log(`Payer balances after deposit: SOL=${balances[0]}, SPL=${balances[1]}`);
    assert.equal(balances[0].toNumber(), 10000, "SOL balance unchanged");
    assert.equal(balances[1].toNumber(), 500_000, "SPL: payer should get all 500000");
  });

  it("transfers 60 tokens payer -> alice (hook fires, updates both SOL and SPL)", async () => {
    const transferAmount = 60;

    const transferIx = createTransferCheckedInstruction(
      payerAta,
      mintKeypair.publicKey,
      aliceAta,
      payer.publicKey,
      transferAmount,
      decimals,
      [],
      TOKEN_2022_PROGRAM_ID
    );

    await addExtraAccountMetasForExecute(
      provider.connection,
      transferIx,
      program.programId,
      payerAta,
      mintKeypair.publicKey,
      aliceAta,
      payer.publicKey,
      transferAmount,
      "confirmed"
    );

    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      transferIx
    );

    await sendAndConfirmTransaction(provider.connection, tx, [payer]);
    console.log("Transfer 60 tokens payer -> alice completed");

    // Verify share token balances
    const payerAccount = await getAccount(provider.connection, payerAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(payerAccount.amount), 40, "Payer should have 40 tokens");

    const aliceAccount = await getAccount(provider.connection, aliceAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(aliceAccount.amount), 60, "Alice should have 60 tokens");
  });

  it("transfers 30 tokens payer -> bob (hook fires)", async () => {
    const transferAmount = 30;

    const transferIx = createTransferCheckedInstruction(
      payerAta,
      mintKeypair.publicKey,
      bobAta,
      payer.publicKey,
      transferAmount,
      decimals,
      [],
      TOKEN_2022_PROGRAM_ID
    );

    await addExtraAccountMetasForExecute(
      provider.connection,
      transferIx,
      program.programId,
      payerAta,
      mintKeypair.publicKey,
      bobAta,
      payer.publicKey,
      transferAmount,
      "confirmed"
    );

    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      transferIx
    );

    await sendAndConfirmTransaction(provider.connection, tx, [payer]);
    console.log("Transfer 30 tokens payer -> bob completed");

    const payerAccount = await getAccount(provider.connection, payerAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(payerAccount.amount), 10, "Payer should have 10 tokens");

    const bobAccount = await getAccount(provider.connection, bobAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(bobAccount.amount), 30, "Bob should have 30 tokens");
  });

  it("verifies balance accruals are correct for both SOL and SPL", async () => {
    // Payer had 100 shares when both deposits arrived, so accrued everything
    const payerBals = await viewer.getBalances(payer.publicKey, payerAta);
    console.log(`Payer: SOL=${payerBals[0]}, SPL=${payerBals[1]}`);
    assert.equal(payerBals[0].toNumber(), 10000, "Payer accrued all SOL");
    assert.equal(payerBals[1].toNumber(), 500_000, "Payer accrued all SPL");

    const aliceBals = await viewer.getBalances(alice.publicKey, aliceAta);
    console.log(`Alice: SOL=${aliceBals[0]}, SPL=${aliceBals[1]}`);
    assert.equal(aliceBals[0].toNumber(), 0, "Alice: no SOL (joined after)");
    assert.equal(aliceBals[1].toNumber(), 0, "Alice: no SPL (joined after)");

    const bobBals = await viewer.getBalances(bob.publicKey, bobAta);
    console.log(`Bob: SOL=${bobBals[0]}, SPL=${bobBals[1]}`);
    assert.equal(bobBals[0].toNumber(), 0, "Bob: no SOL (joined after)");
    assert.equal(bobBals[1].toNumber(), 0, "Bob: no SPL (joined after)");
  });

  it("sends more SOL + SPL and verifies 60/30/10 split", async () => {
    // Send 1000 SOL lamports
    const sendSolTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: viewer.splitterInfoPda,
        lamports: 1000,
      })
    );
    await sendAndConfirmTransaction(provider.connection, sendSolTx, [payer]);

    // Send 100000 mock SPL tokens (0.1 USDC) to vault
    const depositIx = await import("@solana/spl-token").then(spl =>
      spl.createTransferInstruction(
        payerSplAta,
        splSplitterAta,
        payer.publicKey,
        100_000,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    const sendSplTx = new Transaction().add(depositIx);
    await sendAndConfirmTransaction(provider.connection, sendSplTx, [payer]);

    // Alice: 60%, Bob: 30%, Payer: 10%
    const aliceBals = await viewer.getBalances(alice.publicKey, aliceAta);
    const bobBals = await viewer.getBalances(bob.publicKey, bobAta);
    const payerBals = await viewer.getBalances(payer.publicKey, payerAta);
    console.log(`After new deposits: Payer SOL=${payerBals[0]} SPL=${payerBals[1]}`);
    console.log(`Alice SOL=${aliceBals[0]} SPL=${aliceBals[1]}`);
    console.log(`Bob SOL=${bobBals[0]} SPL=${bobBals[1]}`);

    assert.equal(payerBals[0].toNumber(), 10100, "Payer SOL: 10000 + 100");
    assert.equal(aliceBals[0].toNumber(), 600, "Alice SOL: 600");
    assert.equal(bobBals[0].toNumber(), 300, "Bob SOL: 300");

    assert.equal(payerBals[1].toNumber(), 510_000, "Payer SPL: 500000 + 10000");
    assert.equal(aliceBals[1].toNumber(), 60_000, "Alice SPL: 60000");
    assert.equal(bobBals[1].toNumber(), 30_000, "Bob SPL: 30000");
  });

  it("Alice withdraws 500 lamports (SOL, token_index=0)", async () => {
    const aliceBalsBefore = await viewer.getBalances(alice.publicKey, aliceAta);
    console.log(`Alice SOL before withdraw: ${aliceBalsBefore[0]}`);

    await program.methods
      .withdraw(0, new anchor.BN(500))
      .accounts(viewer.accountsWithdraw(alice.publicKey, aliceAta))
      .signers([payer])
      .rpc();

    const aliceBalsAfter = await viewer.getBalances(alice.publicKey, aliceAta);
    console.log(`Alice SOL after withdraw: ${aliceBalsAfter[0]}`);
    assert.equal(aliceBalsAfter[0].toNumber(), aliceBalsBefore[0].toNumber() - 500, "Alice SOL: balance - 500");
    // SPL balance should be unchanged
    assert.equal(aliceBalsAfter[1].toNumber(), aliceBalsBefore[1].toNumber(), "Alice SPL unchanged");
  });

  it("Alice withdraws 10000 mock SPL tokens (token_index=1)", async () => {
    const aliceBalsBefore = await viewer.getBalances(alice.publicKey, aliceAta);
    console.log(`Alice SPL before withdraw: ${aliceBalsBefore[1]}`);

    // Create Alice's SPL ATA if needed
    const ataInfo = await provider.connection.getAccountInfo(aliceSplAta);
    if (!ataInfo) {
      const createAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          aliceSplAta,
          alice.publicKey,
          mockSplMintKeypair.publicKey,
          TOKEN_PROGRAM_ID
        )
      );
      await sendAndConfirmTransaction(provider.connection, createAtaTx, [payer]);
    }

    await program.methods
      .withdraw(1, new anchor.BN(10_000))
      .accounts(viewer.accountsWithdraw(alice.publicKey, aliceAta))
      .remainingAccounts([
        { pubkey: splSplitterAta, isSigner: false, isWritable: true },
        { pubkey: aliceSplAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ])
      .signers([payer])
      .rpc();

    const aliceBalsAfter = await viewer.getBalances(alice.publicKey, aliceAta);
    console.log(`Alice SPL after withdraw: ${aliceBalsAfter[1]}`);
    assert.equal(aliceBalsAfter[1].toNumber(), aliceBalsBefore[1].toNumber() - 10_000, "Alice SPL: balance - 10000");

    // Verify tokens actually arrived in Alice's ATA
    const aliceSplAccount = await getAccount(provider.connection, aliceSplAta, undefined, TOKEN_PROGRAM_ID);
    assert.equal(Number(aliceSplAccount.amount), 10_000, "Alice should have 10000 mock SPL tokens");
  });

  it("transfers 10 tokens alice -> charlie (auto-creates BalanceInfo via vault)", async () => {
    const charlie = Keypair.generate();
    const charlieAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      charlie.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Create ATA for charlie but do NOT register — hook should auto-create BalanceInfo
    const createAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        charlieAta,
        charlie.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(provider.connection, createAtaTx, [payer]);

    const transferAmount = 10;
    const transferIx = createTransferCheckedInstruction(
      aliceAta,
      mintKeypair.publicKey,
      charlieAta,
      alice.publicKey,
      transferAmount,
      decimals,
      [],
      TOKEN_2022_PROGRAM_ID
    );

    await addExtraAccountMetasForExecute(
      provider.connection,
      transferIx,
      program.programId,
      aliceAta,
      mintKeypair.publicKey,
      charlieAta,
      alice.publicKey,
      transferAmount,
      "confirmed"
    );

    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      transferIx
    );

    await sendAndConfirmTransaction(provider.connection, tx, [payer, alice]);
    console.log("Transfer 10 tokens alice -> charlie completed (auto-created BalanceInfo)");

    const charlieAccount = await getAccount(provider.connection, charlieAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(charlieAccount.amount), 10, "Charlie should have 10 tokens");

    // Verify charlie's BalanceInfo PDA was auto-created with Vec arrays
    const charlieBal = await viewer.balanceInfo(charlieAta);
    assert.equal(charlieBal.accrual.length, 2, "Charlie should have 2 accrual entries");
    assert.equal(charlieBal.accrual[0].toNumber(), 0, "Charlie SOL accrual = 0");
    assert.equal(charlieBal.accrual[1].toNumber(), 0, "Charlie SPL accrual = 0");
  });
});
