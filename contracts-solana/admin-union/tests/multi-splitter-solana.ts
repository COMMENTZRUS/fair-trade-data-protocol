import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { MultiSplitterSolana } from "../target/types/multi_splitter_solana";
import MultiSplitterClient from "../app/client";
const keypair = anchor.getProvider().publicKey
const web3 = anchor.web3
const provider = anchor.AnchorProvider.env()


describe("multi-splitter-solana", () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const program = anchor.workspace.MultiSplitterSolana as Program<MultiSplitterSolana>;
  it("Is initialized!", async () => {
    const splitterName = "s1"

    let payer = web3.Keypair.generate();
    let u1 = web3.Keypair.generate();
    let u2 = web3.Keypair.generate();
    await provider.connection.requestAirdrop(
      payer.publicKey,
      100* web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.requestAirdrop(
      u1.publicKey,
      web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.requestAirdrop(
      u2.publicKey,
      web3.LAMPORTS_PER_SOL,
    );

    const [splitterInfoPda, ] = await anchor.web3.PublicKey.findProgramAddressSync([Buffer.from(splitterName), keypair.toBuffer() ], program.programId);
    const viewer : MultiSplitterClient = new MultiSplitterClient(program, splitterInfoPda, keypair)


    // mk new splitter
    let tx = await program.methods.initialize(splitterName).accounts(await viewer.accountsInitialize()).rpc();

    // add u1 , 100 shares
    await program.methods.addUser(u1.publicKey, new anchor.BN(100)
    ).accounts(await viewer.accountsAddModifyUser(u1.publicKey)).rpc();
    console.log(`u1 shares ${await viewer.getShares(u1.publicKey)} u2 shares ${await viewer.getShares(u2.publicKey)}`)

    // add u2 , 200 shares
    await program.methods.addUser(u2.publicKey, new anchor.BN(200)).accounts(await viewer.accountsAddModifyUser(u2.publicKey)).rpc();
    console.log(`u1 shares ${await viewer.getShares(u1.publicKey)} u2 shares ${await viewer.getShares(u2.publicKey)}`)


    const before = await provider.connection.getBalance(splitterInfoPda)
    const amount = 10000
    let sendTx = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: splitterInfoPda,
        lamports: amount
      })
    )

    //await viewer.debugInfo(u2.publicKey)   

    await web3.sendAndConfirmTransaction(provider.connection, sendTx, [payer])
    const after = await provider.connection.getBalance(splitterInfoPda)
    console.log(`sent splitter ${amount}`)
    console.log(`splitterInfoPda ${splitterInfoPda}\nbefore: ${before}\nafter: ${after}`)
    //    const sig = await provider.wallet.signTransaction(sendTx)

    let b1 = await viewer.getBalance(u1.publicKey)
    let b2 = await viewer.getBalance(u2.publicKey)

    console.log(`splitterBal b1 ${b1} b2 ${b2}`);
    console.log(`bal splitter ${await provider.connection.getBalance(splitterInfoPda)} signer ${await provider.connection.getBalance(payer.publicKey)}`);
    
/*
    await program.methods.suck(new BN(5000)).accounts({
      signer: keypair,
      splitterInfo: splitterInfoPda
    }).rpc();
    console.log(`after suck bal splitter ${await provider.connection.getBalance(splitterInfoPda)} signer ${await provider.connection.getBalance(keypair)}`);
*/
    const u2PreWithdraw = await provider.connection.getBalance(u2.publicKey)
    const splitterPre = await provider.connection.getBalance(splitterInfoPda)
    console.log(`splitterPre ${splitterPre}`)

    await program.methods.withdraw(new anchor.BN(1000)).accounts(await viewer.accountsWithdraw(u2.publicKey)).rpc();
    const u2PostWithdraw = await provider.connection.getBalance(u2.publicKey)
    console.log(`u2 withdrew ${u2PostWithdraw - u2PreWithdraw}`)
    b1 = await viewer.getBalance(u1.publicKey)
    b2 = await viewer.getBalance(u2.publicKey)
    console.log(`splitterBal after withdraw b1 ${b1} b2 ${b2}`);
    await program.methods.modifyShares(u2.publicKey, new anchor.BN(400)).accounts(await viewer.accountsAddModifyUser(u2.publicKey)).rpc();
    console.log(`u1 shares ${await viewer.getShares(u1.publicKey)} u2 shares ${await viewer.getShares(u2.publicKey)}`)

    //await viewer.debugInfo(u2.publicKey)   
    sendTx = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: splitterInfoPda,
        lamports: amount/10
      })
    )
    await web3.sendAndConfirmTransaction(provider.connection, sendTx, [payer])
    console.log(`send splitter ${amount/10}`)
    b1 = await viewer.getBalance(u1.publicKey)
    b2 = await viewer.getBalance(u2.publicKey)
    console.log(`splitterBal b1 ${b1} b2 ${b2}`);
    
    //await viewer.debugInfo(u1.publicKey)
    //await viewer.debugInfo(u2.publicKey)   

  });
});
