import { keccak256, solidityPackedKeccak256, toUtf8Bytes } from "ethers";

export interface ConsentLeafInput {
  uidHash: string;
  flags: bigint;
}

/**
 * Computes the pseudonymous bytes32 uidHash for an app-local user identifier.
 */
export function hashUserId(namespace: string, userId: string): string {
  return keccak256(toUtf8Bytes(`${namespace}:${userId}`));
}

/**
 * Computes the bytes32 leaf matching AccessPermissions.sol:
 * keccak256(abi.encodePacked(uidHash, merkleFlags))
 */
export function computeConsentLeaf(uidHash: string, flags: bigint): string {
  return solidityPackedKeccak256(["bytes32", "uint256"], [uidHash, flags]);
}

function hashSortedPair(a: string, b: string): string {
  return BigInt(a) <= BigInt(b)
    ? solidityPackedKeccak256(["bytes32", "bytes32"], [a, b])
    : solidityPackedKeccak256(["bytes32", "bytes32"], [b, a]);
}

export class ConsentMerkleTree {
  public readonly entries: ConsentLeafInput[];
  public readonly leaves: string[];
  public readonly layers: string[][];
  public readonly root: string;

  constructor(entries: ConsentLeafInput[]) {
    // Sort deterministically by uidHash so roots are reproducible across nodes
    this.entries = [...entries].sort((a, b) => a.uidHash.localeCompare(b.uidHash));
    this.leaves = this.entries.map((e) => computeConsentLeaf(e.uidHash, e.flags));

    if (this.leaves.length === 0) {
      this.layers = [[]];
      this.root = "0x" + "00".repeat(32);
      return;
    }

    const layers: string[][] = [this.leaves.slice()];
    while (layers[layers.length - 1].length > 1) {
      const prev = layers[layers.length - 1];
      const next: string[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        next.push(i + 1 < prev.length ? hashSortedPair(prev[i], prev[i + 1]) : prev[i]);
      }
      layers.push(next);
    }
    this.layers = layers;
    this.root = layers[layers.length - 1][0];
  }

  getProof(uidHash: string): { leaf: string; flags: bigint; proof: string[] } | null {
    const idx = this.entries.findIndex((e) => e.uidHash.toLowerCase() === uidHash.toLowerCase());
    if (idx === -1) return null;

    const proof: string[] = [];
    let cursor = idx;
    for (let level = 0; level < this.layers.length - 1; level++) {
      const layer = this.layers[level];
      const pairIdx = cursor % 2 === 0 ? cursor + 1 : cursor - 1;
      if (pairIdx < layer.length) {
        proof.push(layer[pairIdx]);
      }
      cursor = Math.floor(cursor / 2);
    }

    return {
      leaf: this.leaves[idx],
      flags: this.entries[idx].flags,
      proof,
    };
  }

  static verify(proof: string[], root: string, uidHash: string, flags: bigint): boolean {
    let computed = computeConsentLeaf(uidHash, flags);
    for (const sibling of proof) {
      computed = hashSortedPair(computed, sibling);
    }
    return computed.toLowerCase() === root.toLowerCase();
  }
}
