import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { MultiSplitterSolana } from "../target/types/multi_splitter_solana";
import {
    getAccount,
    getAssociatedTokenAddressSync,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const web3 = anchor.web3

class MultiSplitterClient {
    public program: Program<MultiSplitterSolana>
    public splitterInfoPda: anchor.web3.PublicKey
    public mint: anchor.web3.PublicKey
    public signer: anchor.web3.PublicKey

    constructor(program: Program<MultiSplitterSolana>, mint: anchor.web3.PublicKey, signer: anchor.web3.PublicKey) {
        this.program = program
        this.mint = mint
        const [pda] = web3.PublicKey.findProgramAddressSync(
            [Buffer.from("splitter"), mint.toBuffer()],
            program.programId
        )
        this.splitterInfoPda = pda
        this.signer = signer
    }

    public accountsInitialize() {
        return {
            signer: this.signer,
            mint: this.mint,
            splitterInfo: this.splitterInfoPda,
            tokenStats: this.tokenStatsPda(),
            systemProgram: anchor.web3.SystemProgram.programId,
        }
    }

    public accountsRegister(tokenAccount: anchor.web3.PublicKey) {
        return {
            payer: this.signer,
            splitterInfo: this.splitterInfoPda,
            balanceInfo: this.balancePda(tokenAccount),
            systemProgram: anchor.web3.SystemProgram.programId,
        }
    }

    public accountsWithdraw(user: anchor.web3.PublicKey, userTokenAccount: anchor.web3.PublicKey) {
        return {
            signer: this.signer,
            mint: this.mint,
            splitterInfo: this.splitterInfoPda,
            userTokenAccount,
            balanceInfo: this.balancePda(userTokenAccount),
            tokenStats: this.tokenStatsPda(),
            user,
        }
    }

    public async splitterInfo() {
        return await this.program.account.splitterInfo.fetch(this.splitterInfoPda)
    }

    public tokenStatsPda() {
        const [pda] = web3.PublicKey.findProgramAddressSync(
            [this.splitterInfoPda.toBuffer(), Buffer.from("SOL")],
            this.program.programId
        );
        return pda
    }

    public async tokenStatsInfo() {
        return this.program.account.tokenStats.fetch(this.tokenStatsPda())
    }

    public vaultPda() {
        const [vaultPda] = web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), this.splitterInfoPda.toBuffer()],
            this.program.programId
        );
        return vaultPda
    }

    // ATA for a split token owned by the splitter PDA (regular SPL Token)
    public splitterAta(splitMint: anchor.web3.PublicKey) {
        return getAssociatedTokenAddressSync(splitMint, this.splitterInfoPda, true, TOKEN_PROGRAM_ID)
    }

    public balancePda(tokenAccount: anchor.web3.PublicKey) {
        const [balInfoPda] = web3.PublicKey.findProgramAddressSync(
            [this.splitterInfoPda.toBuffer(), tokenAccount.toBuffer(), Buffer.from("SOL")],
            this.program.programId
        );
        return balInfoPda
    }

    public async balanceInfo(tokenAccount: anchor.web3.PublicKey) {
        return this.program.account.balanceInfo.fetch(this.balancePda(tokenAccount))
    }

    public async balanceInfoExists(tokenAccount: anchor.web3.PublicKey): Promise<boolean> {
        const info = await this.program.provider.connection.getAccountInfo(this.balancePda(tokenAccount))
        return info !== null
    }

    // Returns available allotment for each split token as BN[]
    public async getBalances(user: anchor.web3.PublicKey, userTokenAccount: anchor.web3.PublicKey): Promise<BN[]> {
        const splitterInfo = await this.splitterInfo()
        const tokenStats = await this.tokenStatsInfo()
        const balInfo = await this.balanceInfo(userTokenAccount)
        const connection = this.program.provider.connection

        // Read shares from the user's share token account
        const shareAccount = await getAccount(connection, userTokenAccount, undefined, TOKEN_2022_PROGRAM_ID)
        const shares = new BN(Number(shareAccount.amount))

        const n = splitterInfo.splitMints.length
        const results: BN[] = []

        for (let i = 0; i < n; i++) {
            const splitMint = splitterInfo.splitMints[i]
            let balance: number
            let initial: BN

            if (splitMint.equals(web3.PublicKey.default)) {
                // SOL
                balance = await connection.getBalance(this.splitterInfoPda)
                initial = splitterInfo.initialLamports
            } else {
                // SPL token: read splitter ATA balance
                const splitterAta = this.splitterAta(splitMint)
                const vaultAccount = await getAccount(connection, splitterAta, undefined, TOKEN_PROGRAM_ID)
                balance = Number(vaultAccount.amount)
                initial = new BN(0)
            }

            const totalWithdrawn = tokenStats.totalWithdrawn[i] as BN
            const lastRecordedTotalReceived = tokenStats.lastRecordedTotalReceived[i] as BN
            const lastRecordedRps = tokenStats.lastRecordedRps[i] as number

            const totalReceived = totalWithdrawn.addn(balance).sub(initial)
            const unaccounted = totalReceived.sub(lastRecordedTotalReceived)
            let rps = lastRecordedRps
            if (!splitterInfo.totalShares.eqn(0)) {
                rps += unaccounted.toNumber() / splitterInfo.totalShares.toNumber()
            }

            const balAccrual = balInfo.accrual[i] as BN
            const balWithdrawn = balInfo.withdrawn[i] as BN
            const balRps = balInfo.rpsAtLastShareChange[i] as number

            const unrecorded = shares.muln(rps - balRps)
            const total = unrecorded.add(balAccrual)
            results.push(total.sub(balWithdrawn))
        }

        return results
    }

    // Convenience: get SOL balance (first token if SOL is at index 0)
    public async getSolBalance(user: anchor.web3.PublicKey, userTokenAccount: anchor.web3.PublicKey): Promise<BN> {
        const balances = await this.getBalances(user, userTokenAccount)
        return balances[0]
    }
}

export default MultiSplitterClient
