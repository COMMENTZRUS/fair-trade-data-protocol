import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const HOOK_PROGRAM_ID = new PublicKey("EpzDyxiALMpGSBzD32HKmuA7w4cbHq1PeaV7XsZiWPKK");
const SPLITTER_PROGRAM_ID = new PublicKey("5L2JmoDTzvb16VfBeNozP8jZBUjQUaA4JB4FzrmqTpLy");

function resolveHookAccounts(mint: PublicKey, sourceAta: PublicKey, destAta: PublicKey) {
  const [splitterInfo] = PublicKey.findProgramAddressSync(
    [Buffer.from("splitter"), mint.toBuffer()],
    SPLITTER_PROGRAM_ID,
  );
  const [solTokenStats] = PublicKey.findProgramAddressSync(
    [splitterInfo.toBuffer(), Buffer.from("SOL")],
    SPLITTER_PROGRAM_ID,
  );
  const [sourceBalanceInfo] = PublicKey.findProgramAddressSync(
    [splitterInfo.toBuffer(), sourceAta.toBuffer(), Buffer.from("SOL")],
    SPLITTER_PROGRAM_ID,
  );
  const [destBalanceInfo] = PublicKey.findProgramAddressSync(
    [splitterInfo.toBuffer(), destAta.toBuffer(), Buffer.from("SOL")],
    SPLITTER_PROGRAM_ID,
  );
  const [hookAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("hook-authority"), mint.toBuffer()],
    HOOK_PROGRAM_ID,
  );
  const [extraAccountMetaList] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    HOOK_PROGRAM_ID,
  );

  return {
    extraAccountMetaList,
    accounts: [
      { pubkey: SPLITTER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: splitterInfo, isSigner: false, isWritable: true },
      { pubkey: solTokenStats, isSigner: false, isWritable: true },
      { pubkey: sourceBalanceInfo, isSigner: false, isWritable: true },
      { pubkey: destBalanceInfo, isSigner: false, isWritable: true },
      { pubkey: hookAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  };
}

async function main() {
  const mint = new PublicKey(process.argv[2]);
  const amount = Number(process.argv[3]);
  const recipient = new PublicKey(process.argv[4]);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payer = provider.wallet as anchor.Wallet;

  const sourceAta = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const destAta = getAssociatedTokenAddressSync(mint, recipient, false, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction();

  // Create dest ATA if needed
  try {
    await getAccount(connection, destAta, undefined, TOKEN_2022_PROGRAM_ID);
  } catch {
    console.log("Creating recipient ATA:", destAta.toString());
    tx.add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey, destAta, recipient, mint, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
      )
    );
  }

  // Build transfer instruction
  const transferIx = createTransferCheckedInstruction(
    sourceAta, mint, destAta, payer.publicKey, amount, 0, [], TOKEN_2022_PROGRAM_ID,
  );

  // Manually resolve hook extra accounts (uses ATA addresses, no on-chain reads needed)
  const { extraAccountMetaList, accounts } = resolveHookAccounts(mint, sourceAta, destAta);

  // Token-2022 expects: extra_account_meta_list, then the resolved accounts, then hook program
  // The extra_account_meta_list goes first, hook program goes last
  transferIx.keys.push(
    { pubkey: extraAccountMetaList, isSigner: false, isWritable: false },
    ...accounts,
  );

  tx.add(transferIx);

  const sig = await sendAndConfirmTransaction(connection, tx, [payer.payer]);
  console.log("Transfer complete:", sig);
}

main().catch(console.error);
