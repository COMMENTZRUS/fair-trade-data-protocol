import crypto from "crypto";
import { ethers, Signer } from "ethers";
import {
  ConsentMerkleTree,
  HolderShareUpdate,
  isValidSolanaPubkey,
  signSetSharesMultiMeta,
  SolanaDataUnionClient,
  SolanaInstructionPlan,
  SolanaShareUpdate,
} from "@ftdp/sdk";
import { FtdpStore } from "./store";
import { ChainBridge } from "./chainBridge";
import { GrantExpirationReaper } from "./reaper";

export interface MerkleWorkerRunResult {
  checkedDeployments: number;
  committed: Array<{ deploymentId: string; merkleRoot: string; txHash: string }>;
  skippedUnchanged: number;
}

/**
 * Periodically commits updated opt-in consent Merkle roots to `AccessPermissions.setOptInMerkleRoot()`.
 * Idempotent: tracks the last committed root per deployment and skips unchanged deployments to save gas.
 */
export class MerkleCommitWorker {
  private readonly lastCommittedRoot = new Map<string, string>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly store: FtdpStore, private readonly chainBridge: ChainBridge) {}

  async runOnce(): Promise<MerkleWorkerRunResult> {
    const depIds = Object.keys(this.store.state.userFlags);
    const committed: Array<{ deploymentId: string; merkleRoot: string; txHash: string }> = [];
    let skippedUnchanged = 0;

    for (const depId of depIds) {
      const flagMap = this.store.state.userFlags[depId] || {};
      const entries = Object.entries(flagMap).map(([uidHash, flags]) => ({
        uidHash,
        flags: BigInt(flags),
      }));
      if (entries.length === 0) continue;

      const tree = new ConsentMerkleTree(entries);
      if (this.lastCommittedRoot.get(depId) === tree.root) {
        skippedUnchanged += 1;
        continue;
      }

      const { txHash } = await this.chainBridge.commitOptInMerkleRoot(depId, tree.root);
      this.lastCommittedRoot.set(depId, tree.root);
      committed.push({ deploymentId: depId, merkleRoot: tree.root, txHash });
    }

    return { checkedDeployments: depIds.length, committed, skippedUnchanged };
  }

  start(intervalMs = 300_000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => {
        console.error(JSON.stringify({ level: "error", msg: "merkle commit worker failed", error: String(err) }));
      });
    }, intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

export interface EvmShareRelayPayload {
  unionId: string;
  splitterAddress: string;
  updates: HolderShareUpdate[];
  deadline: bigint;
  v: number;
  r: string;
  s: string;
}

export interface DualChainMeteringWorkerOptions {
  store: FtdpStore;
  evmSigner?: Pick<Signer, "signTypedData">;
  evmChainId?: bigint;
  getEvmNonce?: (splitterAddress: string) => Promise<bigint>;
  onEvmRelay?: (payload: EvmShareRelayPayload) => Promise<void>;
  solanaOwnerPubkey?: string;
  onSolanaRelay?: (unionId: string, plans: SolanaInstructionPlan[]) => Promise<void>;
  requiredFlags?: bigint;
  weightPerRecord?: bigint;
}

export interface MeteringWorkerRunResult {
  checkedUnions: number;
  evmRelayed: number;
  solanaRelayed: number;
  skippedUnchanged: number;
}

/**
 * Periodically meters consented contributions across all registered Data Unions,
 * detects changes via deterministic digest, signs EIP-712 `SetSharesMulti` payloads for EVM
 * and builds Anchor `modify_shares` instruction plans for Solana/dual-chain unions.
 */
export class DualChainMeteringWorker {
  private readonly lastDigest = new Map<string, string>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly opts: DualChainMeteringWorkerOptions) {}

  async runOnce(nowSec = Math.floor(Date.now() / 1000)): Promise<MeteringWorkerRunResult> {
    const unions = Object.values(this.opts.store.state.unions);
    const requiredFlags = this.opts.requiredFlags ?? 0n;
    const weight = this.opts.weightPerRecord ?? 100n;

    let evmRelayed = 0;
    let solanaRelayed = 0;
    let skippedUnchanged = 0;

    for (const union of unions) {
      const evmTally = new Map<string, bigint>();
      const solTally = new Map<string, bigint>();

      for (const depId of union.deploymentIds) {
        const recs = this.opts.store.state.anonRecords[depId] || [];
        const flagsByUid = this.opts.store.state.userFlags[depId] || {};
        for (const rec of recs) {
          const activeFlags = BigInt(flagsByUid[rec.meta.uidHash.toLowerCase()] || rec.flags);
          if ((activeFlags & requiredFlags) !== requiredFlags) continue;

          const evmWallet = rec.anon.contributorWallet;
          if (typeof evmWallet === "string" && ethers.isAddress(evmWallet)) {
            const addr = ethers.getAddress(evmWallet);
            evmTally.set(addr, (evmTally.get(addr) || 0n) + weight);
          }
          const solWallet = rec.anon.contributorSolanaWallet;
          if (typeof solWallet === "string" && isValidSolanaPubkey(solWallet)) {
            solTally.set(solWallet, (solTally.get(solWallet) || 0n) + weight);
          }
        }
      }

      const evmUpdates: HolderShareUpdate[] = Array.from(evmTally.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([shareholder, shares]) => ({ shareholder, shares }));

      const solUpdates: SolanaShareUpdate[] = Array.from(solTally.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([shareholder, shares]) => ({ shareholder, shares: shares.toString() }));

      if (evmUpdates.length === 0 && solUpdates.length === 0) continue;

      const digest = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            evm: evmUpdates.map((u) => [u.shareholder, u.shares.toString()]),
            sol: solUpdates.map((u) => [u.shareholder, u.shares]),
          })
        )
        .digest("hex");

      if (this.lastDigest.get(union.id) === digest) {
        skippedUnchanged += 1;
        continue;
      }

      const evmSplitter = union.evm?.splitterAddress || union.splitterAddress;
      if (evmSplitter && evmUpdates.length > 0 && this.opts.evmSigner && this.opts.onEvmRelay) {
        const nonce = this.opts.getEvmNonce ? await this.opts.getEvmNonce(evmSplitter) : 0n;
        const deadline = BigInt(nowSec + 3600);
        const signed = await signSetSharesMultiMeta(this.opts.evmSigner, {
          splitterAddress: evmSplitter,
          chainId: this.opts.evmChainId ?? BigInt(union.evm?.chainId ?? 8453),
          updates: evmUpdates,
          nonce,
          deadline,
        });
        await this.opts.onEvmRelay({
          unionId: union.id,
          splitterAddress: evmSplitter,
          updates: evmUpdates,
          ...signed,
        });
        evmRelayed += 1;
      }

      if (union.solana && solUpdates.length > 0 && this.opts.solanaOwnerPubkey && this.opts.onSolanaRelay) {
        const solClient = new SolanaDataUnionClient(union.solana);
        const plans = solClient.buildAdminShareUpdates(this.opts.solanaOwnerPubkey, solUpdates);
        await this.opts.onSolanaRelay(union.id, plans);
        solanaRelayed += 1;
      }

      this.lastDigest.set(union.id, digest);
    }

    return { checkedUnions: unions.length, evmRelayed, solanaRelayed, skippedUnchanged };
  }

  start(intervalMs = 600_000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => {
        console.error(JSON.stringify({ level: "error", msg: "metering worker failed", error: String(err) }));
      });
    }, intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

/**
 * Syncs on-chain `AccessPermissions.AccessSet` events into `GrantExpirationReaper`
 * so purchased grants automatically provision DefraDB Zanzibar ACP `licensed_reader` relations
 * and auto-revoke when `expires` lapses.
 */
export async function syncAccessSetEventToReaper(params: {
  reaper: GrantExpirationReaper;
  grantorDeploymentId: string;
  granteeDeploymentId: string;
  buyerDid: string;
  docIds: string[];
  peerMultiaddr?: string;
  expires: number;
}) {
  return params.reaper.activateGrant({
    grantorDeploymentId: params.grantorDeploymentId,
    granteeDeploymentId: params.granteeDeploymentId,
    buyerDid: params.buyerDid,
    docIds: params.docIds,
    peerMultiaddr: params.peerMultiaddr,
    expires: params.expires,
  });
}
