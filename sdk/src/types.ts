export type RecordSource = "webSdk" | "mobileNode" | "serverApi" | "csvImport" | "webhook";

export interface FtdpRecordMeta {
  recordId: string;
  deploymentId: string;
  uidHash: string;
  dataId?: string;
  schemaVersion: "1.0.0";
  timestamp: number;
  source?: RecordSource;
}

export interface FtdpRecord {
  meta: FtdpRecordMeta;
  /** uint256 bitmask serialized as decimal or hex string */
  flags: string;
  anon: Record<string, unknown>;
  pii?: Record<string, unknown>;
}

export interface OptInFlagDefinition {
  bit: number;
  mask: string;
  name: string;
  description: string;
}

export interface DeploymentConfig {
  id: string; // bytes32
  organizationId: string;
  name: string;
  adminAddress: string;
  flags: OptInFlagDefinition[];
  createdAt: number;
}

export type ChainMode = "evm" | "solana" | "dual";

export interface EvmUnionBinding {
  chainId: number;
  splitterAddress: string;
  sharesTokenAddress?: string;
  upstreamSplitterAddress?: string;
  marketAddress?: string;
}

export interface SolanaUnionBinding {
  cluster: "mainnet-beta" | "devnet" | "localnet";
  programId: string;
  splitterPda: string;
  variant: "admin" | "spl-transfer-hook";
  shareMint?: string;
  splitMints?: string[];
}

export interface DataUnionRecord {
  id: string;
  name: string;
  /** Primary EVM splitter address (optional for Solana-only unions) */
  splitterAddress?: string;
  sharesTokenAddress?: string;
  upstreamSplitterAddress?: string;
  chainMode?: ChainMode;
  evm?: EvmUnionBinding;
  solana?: SolanaUnionBinding;
  kind: "ADMIN_CONTROLLED" | "ERC20_SHARES" | "VOTES_GOVERNED";
  deploymentIds: string[];
  createdAt: number;
}

export interface HolderShareUpdate {
  shareholder: string;
  shares: bigint;
}

export interface SolanaShareUpdate {
  shareholder: string; // Base58 Solana pubkey
  shares: string;
}

export interface MeteringResult {
  unionId: string;
  chainMode: ChainMode;
  splitterAddress?: string;
  solanaSplitterPda?: string;
  totalConsentedRecords: number;
  updates: Array<{ shareholder: string; shares: string }>;
  solanaUpdates: SolanaShareUpdate[];
  generatedAt: number;
}

export interface MarketOfferSummary {
  id: string;
  deploymentId: string;
  dataId: string;
  title: string;
  description: string;
  paymentToken: string;
  pricePerSecond: string;
  minDuration: number;
  maxDuration: number;
  beneficiary: string;
  requiredFlags: string;
  active: boolean;
}

export const STANDARD_CONSENT_FLAGS = {
  ANALYTICS: 1n << 0n,
  NEWS_DATA_UNION: 1n << 1n,
  AI_TRAINING: 1n << 2n,
  AD_PERSONALIZATION: 1n << 3n,
  KARMA_REPUTATION: 1n << 4n,
} as const;
