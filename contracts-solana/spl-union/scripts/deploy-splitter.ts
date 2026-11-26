import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  getMintLen,
  ExtensionType,
  createInitializeTransferHookInstruction,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createV1, mplTokenMetadata, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair, fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { createSignerFromKeypair, keypairIdentity, percentAmount } from "@metaplex-foundation/umi";
import { MultiSplitterSolana } from "../target/types/multi_splitter_solana";
import MultiSplitterClient from "../app/client";
import fs from "fs";

const SUPPLY = Number(process.env.FTDP_SPL_SUPPLY || 1_000_000);
const DECIMALS = Number(process.env.FTDP_SPL_DECIMALS || 0);
const VAULT_FUND_LAMPORTS = Number(process.env.FTDP_VAULT_FUND_LAMPORTS || 100_000_000);
const TOKEN_NAME = process.env.FTDP_UNION_TOKEN_NAME || "FTDP Data Union Share";
const TOKEN_SYMBOL = process.env.FTDP_UNION_TOKEN_SYMBOL || "FTDU";
const TOKEN_URI = process.env.FTDP_UNION_TOKEN_URI || "https://fairtradedata.org/metadata/union.json";
const RPC_URL = process.env.FTDP_SOLANA_RPC_URL || "https://api.devnet.solana.com";
if (!process.env.FTDP_SOLANA_OWNER) {
  throw new Error("Set FTDP_SOLANA_OWNER env var to the Solana Data Union owner/multisig pubkey");
}
const OWNER = new PublicKey(process.env.FTDP_SOLANA_OWNER);

// Split tokens: native SOL (PublicKey.default) + comma-separated SPL mints via FTDP_SPLIT_MINTS (e.g. USDC, FTD)
const extraMints = (process.env.FTDP_SPLIT_MINTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => new PublicKey(s));
const SPLIT_MINTS: PublicKey[] = [PublicKey.default, ...extraMints];

describe("deploy splitter", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MultiSplitterSolana as Program<MultiSplitterSolana>;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const mintKeypair = Keypair.generate();

  it("deploys", async () => {
    console.log("Program ID:", program.programId.toBase58());
    console.log("Payer:", payer.publicKey.toBase58());
    console.log("Owner:", OWNER.toBase58());
    console.log("Mint:", mintKeypair.publicKey.toBase58());
    console.log("Split mints:", SPLIT_MINTS.map(m => m.equals(PublicKey.default) ? "SOL" : m.toBase58()));

    // 1. Create mint with TransferHook extension, ATA, mint supply
    const extensions = [ExtensionType.TransferHook];
    const mintLen = getMintLen(extensions);
    const mintLamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

    const ownerAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      OWNER,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const createMintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports: mintLamports,
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
        ownerAta,
        OWNER,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      ),
      createMintToInstruction(
        mintKeypair.publicKey,
        ownerAta,
        payer.publicKey,
        SUPPLY,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const sig1 = await sendAndConfirmTransaction(provider.connection, createMintTx, [payer, mintKeypair]);
    console.log(`Mint created + minted ${SUPPLY} tokens to owner. Tx:`, sig1);

    // 1b. Create Metaplex Metadata Account (Phantom reads this for token name/symbol)
    const umi = createUmi(RPC_URL)
      .use(mplTokenMetadata())
      .use(keypairIdentity(fromWeb3JsKeypair(payer)));

    const umiMintSigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(mintKeypair));

    const metadataBuilder = createV1(umi, {
      mint: umiMintSigner,
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      uri: TOKEN_URI,
      sellerFeeBasisPoints: percentAmount(0),
      tokenStandard: TokenStandard.Fungible,
      splTokenProgram: fromWeb3JsPublicKey(TOKEN_2022_PROGRAM_ID),
    });

    const metadataResult = await metadataBuilder.sendAndConfirm(umi);
    console.log(`Metaplex metadata created (${TOKEN_NAME}/${TOKEN_SYMBOL}).`);

    // 2. Initialize splitter with split_mints
    const viewer = new MultiSplitterClient(program, mintKeypair.publicKey, payer.publicKey);

    const sig2 = await program.methods
      .initialize(SPLIT_MINTS)
      .accounts(viewer.accountsInitialize())
      .signers([payer])
      .rpc();
    console.log("Splitter initialized. Tx:", sig2);

    // 2b. Create splitter ATAs for non-SOL split mints
    for (const splitMint of SPLIT_MINTS) {
      if (!splitMint.equals(PublicKey.default)) {
        const splitterAta = viewer.splitterAta(splitMint);
        const createAtaTx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            payer.publicKey,
            splitterAta,
            viewer.splitterInfoPda,
            splitMint,
            TOKEN_PROGRAM_ID
          )
        );
        await sendAndConfirmTransaction(provider.connection, createAtaTx, [payer]);
        console.log(`Splitter ATA created for ${splitMint.toBase58()}: ${splitterAta.toBase58()}`);
      }
    }

    // 3. Initialize extra account meta list
    const sig3 = await program.methods
      .initializeExtraAccountMetaList()
      .accounts({
        payer: payer.publicKey,
        mint: mintKeypair.publicKey,
        splitterInfo: viewer.splitterInfoPda,
      })
      .signers([payer])
      .rpc();
    console.log("ExtraAccountMetaList initialized. Tx:", sig3);

    // 4. Fund vault PDA
    const vaultPda = viewer.vaultPda();
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: vaultPda,
        lamports: VAULT_FUND_LAMPORTS,
      })
    );
    const sig4 = await sendAndConfirmTransaction(provider.connection, fundTx, [payer]);
    console.log("Vault funded with", VAULT_FUND_LAMPORTS / 1e9, "SOL. Tx:", sig4);

    // 5. Register owner (keyed by ATA address)
    const sig5 = await program.methods
      .register(ownerAta)
      .accounts(viewer.accountsRegister(ownerAta))
      .signers([payer])
      .rpc();
    console.log("Owner registered. Tx:", sig5);

    // Summary
    console.log("\n=== Splitter Deployed ===");
    console.log("Mint:          ", mintKeypair.publicKey.toBase58());
    console.log("Splitter PDA:  ", viewer.splitterInfoPda.toBase58());
    console.log("Token Stats:   ", viewer.tokenStatsPda().toBase58());
    console.log("Vault PDA:     ", vaultPda.toBase58());
    console.log("Owner ATA:     ", ownerAta.toBase58());
    console.log("Supply:        ", SUPPLY, "tokens");
    console.log("Vault balance: ", VAULT_FUND_LAMPORTS / 1e9, "SOL");
    console.log("Split tokens:  ", SPLIT_MINTS.length);

    // Save mint keypair
    fs.writeFileSync(
      "scripts/mint-keypair.json",
      JSON.stringify(Array.from(mintKeypair.secretKey))
    );
    console.log("\nMint keypair saved to scripts/mint-keypair.json");
  });
});
