import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { MultiSplitterSolana } from "../target/types/multi_splitter_solana";

const web3 = anchor.web3

//all accounts needed to get user bal

class MultiSplitterClient {
    public program: Program<MultiSplitterSolana>
    public splitterInfoPda: anchor.web3.PublicKey
    public signer: anchor.web3.PublicKey

    constructor(program: Program<MultiSplitterSolana>, splitterInfoPda: anchor.web3.PublicKey, signer: anchor.web3.PublicKey) {
        this.program = program
        this.splitterInfoPda = splitterInfoPda
        this.signer = signer
    }


    public async accountsInitialize() {
        return {
            signer: this.signer,
            splitterInfo: this.splitterInfoPda,
            solTokenStats: await this.solPda(),
            systemProgram: anchor.web3.SystemProgram.programId,
        }
    }
    public async accountsAddModifyUser(user: anchor.web3.PublicKey) {
        return {
            ... await this.accountsInitialize(),
            userInfo: await this.userPda(user),
            solBalanceInfo: await this.solBalPda(user),
        }
    }
    
    public async accountsTransferOwnership() {
        return {
            signer: this.signer,
            splitterInfo: this.splitterInfoPda,
        }
    }

    public async accountsWithdraw(user: anchor.web3.PublicKey) {
        return {
            ...await this.accountsAddModifyUser(user),
            user
        }
    }
    public async splitterInfo() {
        return await this.program.account.splitterInfo.fetch(this.splitterInfoPda)
    }
    public async solPda() {
        const [solInfoPda,] = await web3.PublicKey.findProgramAddressSync([this.splitterInfoPda.toBuffer(), Buffer.from("SOL")], this.program.programId);
        return solInfoPda
    }

    public async solInfo() {
        return this.program.account.tokenStats.fetch(await this.solPda())
    }

    public async solBalPda(user: anchor.web3.PublicKey) {
        const [balInfoPda,] = await web3.PublicKey.findProgramAddressSync([this.splitterInfoPda.toBuffer(), user.toBuffer(), Buffer.from("SOL")], this.program.programId);
        return balInfoPda
    }

    public async solBalInfo(user: anchor.web3.PublicKey) {
        return this.program.account.balanceInfo.fetch(await this.solBalPda(user))
    }

    public async userPda(user: anchor.web3.PublicKey) {
        const [userInfoPda,] = await web3.PublicKey.findProgramAddressSync([this.splitterInfoPda.toBuffer(), user.toBuffer()], this.program.programId);
        return userInfoPda
    }


    /*
      0 means user accounts created and 0 shares
      -1 means user accounts not created
    */
    public async getShares(user: anchor.web3.PublicKey) {
        return this.userInfo(user).then((info) => {
            return info.shares
        }).catch((reason) => {
            return new BN(-1)
        })
    }

    public async userInfo(user: anchor.web3.PublicKey) {
        return this.program.account.userInfo.fetch(await this.userPda(user))
    }

    public async allInfo(user: anchor.web3.PublicKey) {
        const splitterInfo = await this.splitterInfo()
        const solInfo = await this.solInfo()
        const balInfo = await this.solBalInfo(user)
        const userInfo = await this.userInfo(user)
        return { splitterInfo, solInfo, balInfo, userInfo }
    }


    public async getBalance(user: anchor.web3.PublicKey) {
        const a = await this.allInfo(user)
        
        /*
            let delta = ctx.accounts.splitter_info.get_lamportsrps_at_last_share_change()
    + ctx.accounts.sol_token_stats.amount_withdrawn
    - ctx.accounts.splitter_info.initial_lamports
    - ctx.accounts.sol_token_stats.amount_received;
        */
        const lamports =  await this.program.provider.connection.getBalance(this.splitterInfoPda)
        
        const total_received =  a.solInfo.totalWithdrawn.addn(lamports).sub(a.splitterInfo.initialLamports)
        const unaccounted_tokens = total_received.sub(a.solInfo.lastRecordedTotalReceived)
        let rps = a.solInfo.lastRecordedRps
        if(!a.splitterInfo.totalShares.eqn(0)) rps += unaccounted_tokens.toNumber()/a.splitterInfo.totalShares.toNumber()   
        //console.log(`rps ${rps} rpsAtLastShareChange ${a.balInfo.rpsAtLastShareChange}`)
        const unrecorded_allotment = a.userInfo.shares.muln(rps - a.balInfo.rpsAtLastShareChange)
        const total_allotment = unrecorded_allotment.add(a.balInfo.accrual)
        //const debug = {lamports, total_received, unaccounted_tokens, rps, unrecorded_allotment, total_allotment}
        //console.log(JSON.stringify(debug, null, 2))
        return total_allotment.sub(a.balInfo.withdrawn)
    }

    public async debugInfo(user: anchor.web3.PublicKey) {
        const a = await this.allInfo(user)
        const bal = await this.getBalance(user)
        console.log(`debugInfo ${user}: lamports ${await this.program.provider.connection.getBalance(user)} splitterBal ${bal}:\n ${JSON.stringify(a, null, 2)}`)
    }

}

export default MultiSplitterClient