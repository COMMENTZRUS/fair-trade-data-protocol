import { SolanaShareUpdate, SolanaUnionBinding } from "./types";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaPubkey(addr: string): boolean {
  return typeof addr === "string" && BASE58_RE.test(addr);
}

export interface SolanaInstructionPlan {
  programId: string;
  cluster: SolanaUnionBinding["cluster"];
  variant: SolanaUnionBinding["variant"];
  instruction: "add_user" | "modify_shares" | "withdraw" | "register";
  args: Record<string, string | number>;
  accounts: Record<string, string>;
}

/**
 * Builds deterministic Anchor instruction plans matching `contracts-solana/admin-union`
 * and `contracts-solana/spl-union` without forcing heavy Solana native bindings into EVM-only bundles.
 */
export class SolanaDataUnionClient {
  constructor(public readonly binding: SolanaUnionBinding) {
    if (!isValidSolanaPubkey(binding.programId)) {
      throw new Error(`Invalid Solana programId: ${binding.programId}`);
    }
    if (!isValidSolanaPubkey(binding.splitterPda)) {
      throw new Error(`Invalid Solana splitterPda: ${binding.splitterPda}`);
    }
  }

  /**
   * Generates `modify_shares` instruction plans for `contracts-solana/admin-union`
   * directly from `ftdp-node` dual-chain metering output.
   */
  buildAdminShareUpdates(
    ownerPubkey: string,
    updates: SolanaShareUpdate[]
  ): SolanaInstructionPlan[] {
    if (!isValidSolanaPubkey(ownerPubkey)) {
      throw new Error(`Invalid Solana ownerPubkey: ${ownerPubkey}`);
    }
    return updates.map((u) => {
      if (!isValidSolanaPubkey(u.shareholder)) {
        throw new Error(`Invalid Solana shareholder pubkey: ${u.shareholder}`);
      }
      return {
        programId: this.binding.programId,
        cluster: this.binding.cluster,
        variant: "admin",
        instruction: "modify_shares",
        args: {
          user: u.shareholder,
          shares: u.shares,
        },
        accounts: {
          signer: ownerPubkey,
          splitterInfo: this.binding.splitterPda,
        },
      };
    });
  }

  /**
   * Generates a `withdraw` instruction plan (amount = "0" withdraws all available allotment).
   * Supports both `admin-union` (SOL) and `spl-union` (SOL + SPL mints via `tokenIndex`).
   */
  buildWithdrawPlan(params: {
    userPubkey: string;
    tokenIndex?: number;
    amount?: string;
    userTokenAccount?: string;
  }): SolanaInstructionPlan {
    if (!isValidSolanaPubkey(params.userPubkey)) {
      throw new Error(`Invalid Solana userPubkey: ${params.userPubkey}`);
    }
    if (this.binding.variant === "spl-transfer-hook") {
      if (!this.binding.shareMint) {
        throw new Error("Solana SPL union binding missing shareMint");
      }
      return {
        programId: this.binding.programId,
        cluster: this.binding.cluster,
        variant: "spl-transfer-hook",
        instruction: "withdraw",
        args: {
          tokenIndex: params.tokenIndex ?? 0,
          amount: params.amount ?? "0",
        },
        accounts: {
          signer: params.userPubkey,
          user: params.userPubkey,
          mint: this.binding.shareMint,
          splitterInfo: this.binding.splitterPda,
          ...(params.userTokenAccount ? { userTokenAccount: params.userTokenAccount } : {}),
        },
      };
    }

    return {
      programId: this.binding.programId,
      cluster: this.binding.cluster,
      variant: "admin",
      instruction: "withdraw",
      args: {
        amount: params.amount ?? "0",
      },
      accounts: {
        signer: params.userPubkey,
        user: params.userPubkey,
        splitterInfo: this.binding.splitterPda,
      },
    };
  }
}
