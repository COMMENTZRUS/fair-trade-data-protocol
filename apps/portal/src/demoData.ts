export interface Deployment {
  id: string;
  organizationId: string;
  name: string;
  adminAddress: string;
  flags: Array<{ bit: number; mask: string; name: string; description: string }>;
}

export interface DataUnion {
  id: string;
  name: string;
  splitterAddress?: string;
  sharesTokenAddress?: string;
  upstreamSplitterAddress?: string;
  chainMode?: "evm" | "solana" | "dual";
  solana?: {
    cluster: "mainnet-beta" | "devnet" | "localnet";
    programId: string;
    splitterPda: string;
    variant: "admin" | "spl-transfer-hook";
    shareMint?: string;
  };
  kind: "ADMIN_CONTROLLED" | "ERC20_SHARES" | "VOTES_GOVERNED";
  deploymentIds: string[];
}

export interface MarketOffer {
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

export const DEMO_DEPLOYMENTS: Deployment[] = [
  {
    id: "0x8a4e3f6e4d3a7f5f2b1c9e8d7a6f5e4d3c2b1a0987654321fedcba9876543210",
    organizationId: "org-panorama",
    name: "Panorama Web (Private Flagship App)",
    adminAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    flags: [
      { bit: 0, mask: "1", name: "Analytics", description: "Anonymous usage telemetry" },
      { bit: 1, mask: "2", name: "News Data Union", description: "Pool de-identified curation signals" },
      { bit: 2, mask: "4", name: "AI Training", description: "License anonymized signals to AI labs" },
      { bit: 3, mask: "8", name: "Ad Personalization", description: "FTD ethical ad network preferences" },
    ],
  },
  {
    id: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    organizationId: "org-topnews",
    name: "Top News Reader",
    adminAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    flags: [
      { bit: 0, mask: "1", name: "Analytics", description: "Anonymous usage telemetry" },
      { bit: 1, mask: "2", name: "News Data Union", description: "Pool headline votes & karma signals" },
      { bit: 2, mask: "4", name: "AI Training", description: "License anonymized signals to AI labs" },
    ],
  },
];

export const DEMO_UNIONS: DataUnion[] = [
  {
    id: "news-curation-root",
    name: "FTDP Media & Social Root Data Union (Tier-1 Dual-Chain)",
    splitterAddress: "0x1000000000000000000000000000000000000001",
    chainMode: "dual",
    solana: {
      cluster: "mainnet-beta",
      programId: "FTDP111111111111111111111111111111111111111",
      splitterPda: "Root111111111111111111111111111111111111111",
      variant: "spl-transfer-hook",
      shareMint: "Mint111111111111111111111111111111111111111",
    },
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [DEMO_DEPLOYMENTS[0].id, DEMO_DEPLOYMENTS[1].id],
  },
  {
    id: "panorama-pool",
    name: "Panorama Contributor Pool (Tier-2 AutoPull)",
    splitterAddress: "0x2000000000000000000000000000000000000002",
    upstreamSplitterAddress: "0x1000000000000000000000000000000000000001",
    chainMode: "dual",
    solana: {
      cluster: "mainnet-beta",
      programId: "FTDP111111111111111111111111111111111111111",
      splitterPda: "Pano111111111111111111111111111111111111111",
      variant: "admin",
    },
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [DEMO_DEPLOYMENTS[0].id],
  },
  {
    id: "comment-protocol-pool",
    name: "Comment Protocol Pool (Tier-2 Dual-Chain -> Top News & RateMyVideo)",
    splitterAddress: "0x3000000000000000000000000000000000000003",
    upstreamSplitterAddress: "0x1000000000000000000000000000000000000001",
    chainMode: "dual",
    solana: {
      cluster: "mainnet-beta",
      programId: "FTDP111111111111111111111111111111111111111",
      splitterPda: "Cmmt111111111111111111111111111111111111111",
      variant: "spl-transfer-hook",
      shareMint: "CmtM111111111111111111111111111111111111111",
    },
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [DEMO_DEPLOYMENTS[1].id],
  },
];

export const DEMO_OFFERS: MarketOffer[] = [
  {
    id: "1",
    deploymentId: DEMO_DEPLOYMENTS[0].id,
    dataId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    title: "News & Curation Data Union — Real-Time Engagement Feed",
    description:
      "Consented, de-identified curation, topic velocity, and karma signals pooled from Panorama & Top News. Proceeds stream in O(1) via Tier-1/Tier-2 Constant-Time MultiSplitters.",
    paymentToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    pricePerSecond: "10000000",
    minDuration: 86400,
    maxDuration: 31536000,
    beneficiary: "0x1000000000000000000000000000000000000001",
    requiredFlags: "6",
    active: true,
  },
];
