import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
  PublicKey,
  Connection,
} from "@solana/web3.js";
import {
  getMintLen,
  ExtensionType,
  createInitializeTransferHookInstruction,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { MultiSplitterSolana } from "../target/types/multi_splitter_solana";
import MultiSplitterClient from "../app/client";

if (!process.env.FTDP_SOLANA_RECIPIENT) {
  throw new Error("Set FTDP_SOLANA_RECIPIENT env var to the initial share recipient wallet pubkey");
}
const RECIPIENT = new PublicKey(process.env.FTDP_SOLANA_RECIPIENT);
const MINT_AMOUNT = Number(process.env.FTDP_SPL_SUPPLY || 1_000_000);
const DECIMALS = Number(process.env.FTDP_SPL_DECIMALS || 0);
const SPLIT_MINTS: PublicKey[] = [PublicKey.default];

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MultiSplitterSolana as Program<MultiSplitterSolana>;
  const payer = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  console.log("Payer:", payer.publicKey.toString());
  console.log("Program:", program.programId.toString());

  // 1. Create mint with TransferHook extension
  const mintKeypair = Keypair.generate();
  console.log("\nMint:", mintKeypair.publicKey.toString());

  const recipientAta = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    RECIPIENT,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("Recipient ATA:", recipientAta.toString());

  const extensions = [ExtensionType.TransferHook];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

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
      DECIMALS,
      payer.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    ),
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      recipientAta,
      RECIPIENT,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createMintToInstruction(
      mintKeypair.publicKey,
      recipientAta,
      payer.publicKey,
      MINT_AMOUNT,
      [],
      TOKEN_2022_PROGRAM_ID
    ),
    // Revoke mint authority so supply is fixed
    createSetAuthorityInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_2022_PROGRAM_ID
    ),
  );

  const sig1 = await sendAndConfirmTransaction(connection, createMintTx, [payer.payer, mintKeypair]);
  console.log("Mint created & tokens minted:", sig1);

  // 2. Initialize splitter
  const viewer = new MultiSplitterClient(program, mintKeypair.publicKey, payer.publicKey);
  console.log("\nSplitter PDA:", viewer.splitterInfoPda.toString());

  const sig2 = await program.methods
    .initialize(SPLIT_MINTS)
    .accounts(viewer.accountsInitialize())
    .rpc();
  console.log("Splitter initialized:", sig2);

  const info = await viewer.splitterInfo();
  console.log("Total shares:", info.totalShares.toString());

  // 3. Register recipient
  const sig3a = await program.methods
    .register(RECIPIENT)
    .accounts(viewer.accountsRegister(RECIPIENT))
    .rpc();
  console.log("Recipient registered:", sig3a);

  // 4. Initialize extra account metas
  const sig3 = await program.methods
    .initializeExtraAccountMetaList()
    .accounts({
      payer: payer.publicKey,
      mint: mintKeypair.publicKey,
    })
    .rpc();
  console.log("Extra account metas initialized:", sig3);

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("Mint:", mintKeypair.publicKey.toString());
  console.log("Splitter PDA:", viewer.splitterInfoPda.toString());
  console.log("Recipient:", RECIPIENT.toString());
  console.log("Shares:", MINT_AMOUNT);
  console.log("\nGUI URL: ?m=" + mintKeypair.publicKey.toString());
}

main().catch(console.error);
