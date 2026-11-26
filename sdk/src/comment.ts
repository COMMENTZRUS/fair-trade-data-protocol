import { keccak256, toUtf8Bytes } from "ethers";
import { FtdpClient } from "./client";
import { STANDARD_CONSENT_FLAGS } from "./types";

export const COMMENT_DATA_IDS = {
  COMMENT_V1: keccak256(toUtf8Bytes("ftdp:comment:v1")),
  RATING_V1: keccak256(toUtf8Bytes("ftdp:rating:v1")),
  VOTE_V1: keccak256(toUtf8Bytes("ftdp:vote:v1")),
} as const;

export interface ThreadSummary {
  targetUri: string;
  commentCount: number;
  ratingCount: number;
  averageRating: number | null;
  voteScore: number;
  comments: Array<{
    recordId: string;
    deploymentId: string;
    uidHash: string;
    parentId?: string;
    body: string;
    timestamp: number;
  }>;
  ratings: Array<{
    recordId: string;
    deploymentId: string;
    uidHash: string;
    score: number;
    maxScore: number;
    review?: string;
    timestamp: number;
  }>;
}

export interface UserKarmaSummary {
  uidHash: string;
  totalKarma: number;
  commentCount: number;
  ratingCount: number;
  voteCount: number;
  deployments: string[];
}

/**
 * Reusable Comment Protocol v1 client built on top of `FtdpClient`.
 * Powers Top News discussions, RateMyVideo ratings/reviews, Streamy cross-linked threads,
 * and portable cross-app user karma.
 */
export class CommentProtocolClient {
  constructor(private readonly ftdp: FtdpClient, private readonly baseUrl: string, private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  postComment(params: {
    deploymentId: string;
    namespace: string;
    userId: string;
    targetUri: string;
    body: string;
    parentId?: string;
    contributorWallet?: string;
    contributorSolanaWallet?: string;
    flags?: bigint;
  }) {
    const flags = params.flags ?? (STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.KARMA_REPUTATION);
    return this.ftdp.trackEvent({
      deploymentId: params.deploymentId,
      namespace: params.namespace,
      userId: params.userId,
      flags,
      dataId: COMMENT_DATA_IDS.COMMENT_V1,
      contributorWallet: params.contributorWallet,
      contributorSolanaWallet: params.contributorSolanaWallet,
      anon: {
        kind: "comment",
        targetUri: params.targetUri,
        body: params.body,
        ...(params.parentId ? { parentId: params.parentId } : {}),
      },
    });
  }

  postRating(params: {
    deploymentId: string;
    namespace: string;
    userId: string;
    targetUri: string;
    score: number;
    maxScore?: number;
    review?: string;
    contributorWallet?: string;
    contributorSolanaWallet?: string;
    flags?: bigint;
  }) {
    const flags = params.flags ?? (STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.KARMA_REPUTATION);
    return this.ftdp.trackEvent({
      deploymentId: params.deploymentId,
      namespace: params.namespace,
      userId: params.userId,
      flags,
      dataId: COMMENT_DATA_IDS.RATING_V1,
      contributorWallet: params.contributorWallet,
      contributorSolanaWallet: params.contributorSolanaWallet,
      anon: {
        kind: "rating",
        targetUri: params.targetUri,
        score: params.score,
        maxScore: params.maxScore ?? 5,
        ...(params.review ? { review: params.review } : {}),
      },
    });
  }

  castVote(params: {
    deploymentId: string;
    namespace: string;
    userId: string;
    targetUri: string;
    direction: 1 | -1;
    contributorWallet?: string;
    contributorSolanaWallet?: string;
    flags?: bigint;
  }) {
    const flags = params.flags ?? (STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.KARMA_REPUTATION);
    return this.ftdp.trackEvent({
      deploymentId: params.deploymentId,
      namespace: params.namespace,
      userId: params.userId,
      flags,
      dataId: COMMENT_DATA_IDS.VOTE_V1,
      contributorWallet: params.contributorWallet,
      contributorSolanaWallet: params.contributorSolanaWallet,
      anon: {
        kind: "vote",
        targetUri: params.targetUri,
        direction: params.direction,
      },
    });
  }

  async getThread(targetUri: string): Promise<ThreadSummary> {
    const cleanBase = this.baseUrl.replace(/\/+$/, "");
    const res = await this.fetchImpl(`${cleanBase}/api/v1/comments/thread?targetUri=${encodeURIComponent(targetUri)}`);
    if (!res.ok) throw new Error(`getThread failed (${res.status})`);
    return (await res.json()) as ThreadSummary;
  }

  async getUserKarma(uidHash: string): Promise<UserKarmaSummary> {
    const cleanBase = this.baseUrl.replace(/\/+$/, "");
    const res = await this.fetchImpl(`${cleanBase}/api/v1/comments/karma/${encodeURIComponent(uidHash)}`);
    if (!res.ok) throw new Error(`getUserKarma failed (${res.status})`);
    return (await res.json()) as UserKarmaSummary;
  }
}
