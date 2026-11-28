export const SOLANA_DEVNET_PROGRAMS = {
  cluster: "devnet" as const,
  deployer: "BAXfj2RNPgi5oyoDtm1T4gagZ9ZRh2xvuf5nAQ3enY5Q",
  adminUnion: {
    programId: "ERFSmNHga5Dn56fVtqrrJ4bF4z9tk8VaY91E8HXeZra8",
    deployTx: "3xUnNjs3Yc3iYkocssEXkGLdgUTPjJvB9aNojK96bkQEBZ6cGub8cy7MvVh4haKXUsEvCX5c4KZTxp3Ezuhbqw6h",
    solscanUrl: "https://solscan.io/account/ERFSmNHga5Dn56fVtqrrJ4bF4z9tk8VaY91E8HXeZra8?cluster=devnet",
  },
  splUnion: {
    programId: "9qYPc7fP7Veb2MRhXTXJo3gDjjG2ZJKGfVbez46eeQFg",
    deployTx: "2zuzqbzABdvAJZHVHbZdioujcZcNMv4bZMZPwNZ51zUKHn2sMM8Ms45PGapT56pCDQ9c52bbpd9UhjAhz4v9wb9",
    solscanUrl: "https://solscan.io/account/9qYPc7fP7Veb2MRhXTXJo3gDjjG2ZJKGfVbez46eeQFg?cluster=devnet",
  },
};

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
    name: "Panorama Web (Flagship App Deployment)",
    adminAddress: "BAXfj2RNPgi5oyoDtm1T4gagZ9ZRh2xvuf5nAQ3enY5Q",
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
    name: "Top News / TTN Community Boards",
    adminAddress: "BAXfj2RNPgi5oyoDtm1T4gagZ9ZRh2xvuf5nAQ3enY5Q",
    flags: [
      { bit: 0, mask: "1", name: "Analytics", description: "Anonymous usage telemetry" },
      { bit: 1, mask: "2", name: "News Data Union", description: "Pool headline votes & karma signals" },
      { bit: 2, mask: "4", name: "AI Training", description: "License anonymized signals to AI labs" },
      { bit: 4, mask: "16", name: "Karma / Reputation", description: "Web3 discussion board karma union" },
    ],
  },
];

export const DEMO_UNIONS: DataUnion[] = [
  {
    id: "ftdp-admin-data-union-devnet",
    name: "FTDP Media & Social Data Union (Solana Devnet — Admin MultiSplitter)",
    chainMode: "solana",
    solana: {
      cluster: "devnet",
      programId: SOLANA_DEVNET_PROGRAMS.adminUnion.programId,
      splitterPda: SOLANA_DEVNET_PROGRAMS.adminUnion.programId,
      variant: "admin",
    },
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [DEMO_DEPLOYMENTS[0].id, DEMO_DEPLOYMENTS[1].id],
  },
  {
    id: "ftdp-spl-transfer-hook-union-devnet",
    name: "FTDP Token-2022 Transfer-Hook Data Union (Solana Devnet — SPL MultiSplitter)",
    chainMode: "solana",
    solana: {
      cluster: "devnet",
      programId: SOLANA_DEVNET_PROGRAMS.splUnion.programId,
      splitterPda: SOLANA_DEVNET_PROGRAMS.splUnion.programId,
      variant: "spl-transfer-hook",
    },
    kind: "ERC20_SHARES",
    deploymentIds: [DEMO_DEPLOYMENTS[1].id],
  },
];

export const DEMO_OFFERS: MarketOffer[] = [
  {
    id: "1",
    deploymentId: DEMO_DEPLOYMENTS[0].id,
    dataId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    title: "Open Knowledgebase for Gaming Community + Agentic AI Coaching",
    description:
      "Consented gameplay telemetry, strategy guides, and agentic coaching signals pooled into a Solana Constant-Time MultiSplitter Data Union.",
    paymentToken: "USDC (Solana SPL)",
    pricePerSecond: "10000000",
    minDuration: 86400,
    maxDuration: 31536000,
    beneficiary: SOLANA_DEVNET_PROGRAMS.adminUnion.programId,
    requiredFlags: "6",
    active: true,
  },
  {
    id: "2",
    deploymentId: DEMO_DEPLOYMENTS[0].id,
    dataId: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    title: "Fair Trade Data Ad Network + Video Streaming via Decentralized Storage",
    description:
      "Consented Streamy view receipts and ethical ad preferences backed by Apache-2.0/MIT Source Network defradb.rs.",
    paymentToken: "USDC (Solana SPL)",
    pricePerSecond: "8000000",
    minDuration: 86400,
    maxDuration: 31536000,
    beneficiary: SOLANA_DEVNET_PROGRAMS.adminUnion.programId,
    requiredFlags: "10",
    active: true,
  },
  {
    id: "3",
    deploymentId: DEMO_DEPLOYMENTS[1].id,
    dataId: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    title: "Web 3 Native Discussion Boards for zk Voting + User Karma Data Unions via TTN",
    description:
      "Comment Protocol v1 threads, star ratings, and portable user karma streaming directly into Token-2022 Transfer-Hook Data Unions.",
    paymentToken: "USDC (Solana SPL)",
    pricePerSecond: "6000000",
    minDuration: 86400,
    maxDuration: 31536000,
    beneficiary: SOLANA_DEVNET_PROGRAMS.splUnion.programId,
    requiredFlags: "18",
    active: true,
  },
];
