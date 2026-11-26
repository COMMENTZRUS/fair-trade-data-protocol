import { ethers } from "ethers";
import { hashUserId, STANDARD_CONSENT_FLAGS } from "@ftdp/sdk";
import { createFtdpServer } from "./server";
import { FtdpStore } from "./store";
import { DefraClient } from "./defraClient";
import { PiiEnvelopeCrypto } from "./piiCrypto";
import { EthersChainBridge } from "./chainBridge";
import { GrantExpirationReaper } from "./reaper";

function seedDemoData(store: FtdpStore) {
  if (Object.keys(store.state.deployments).length > 0) return;

  const panoramaDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:panorama-web-v1"));
  const topNewsDepId = ethers.keccak256(ethers.toUtf8Bytes("deployment:top-news-app-v1"));
  const newsDataId = ethers.keccak256(ethers.toUtf8Bytes("dataset:news-engagement-anon"));

  store.state.organizations["org-panorama"] = {
    id: "org-panorama",
    name: "Panorama Inc. (Private App Deployment)",
    adminAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    createdAt: Math.floor(Date.now() / 1000),
  };
  store.state.organizations["org-topnews"] = {
    id: "org-topnews",
    name: "Top News Collective",
    adminAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    createdAt: Math.floor(Date.now() / 1000),
  };

  const defaultFlags = [
    { bit: 0, mask: "1", name: "Analytics", description: "Anonymous usage telemetry" },
    { bit: 1, mask: "2", name: "News Data Union", description: "Share de-identified reading & curation signals" },
    { bit: 2, mask: "4", name: "AI Training", description: "License anonymized signals to AI labs" },
    { bit: 3, mask: "8", name: "Ad Personalization", description: "Fair Trade Data Ad Network preferences" },
  ];

  store.state.deployments[panoramaDepId] = {
    id: panoramaDepId,
    organizationId: "org-panorama",
    name: "Panorama Web",
    adminAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    flags: defaultFlags,
    createdAt: Math.floor(Date.now() / 1000),
  };
  store.state.deployments[topNewsDepId] = {
    id: topNewsDepId,
    organizationId: "org-topnews",
    name: "Top News Reader",
    adminAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    flags: defaultFlags,
    createdAt: Math.floor(Date.now() / 1000),
  };

  const rootSplitter = "0x1000000000000000000000000000000000000001";
  const panoramaSubSplitter = "0x2000000000000000000000000000000000000002";
  const topNewsSubSplitter = "0x3000000000000000000000000000000000000003";

  store.state.unions["news-curation-root"] = {
    id: "news-curation-root",
    name: "News & Curation Data Union (Tier-1 Root)",
    splitterAddress: rootSplitter,
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [panoramaDepId, topNewsDepId],
    createdAt: Math.floor(Date.now() / 1000),
  };
  store.state.unions["panorama-pool"] = {
    id: "panorama-pool",
    name: "Panorama Contributor Pool (Tier-2 AutoPull)",
    splitterAddress: panoramaSubSplitter,
    upstreamSplitterAddress: rootSplitter,
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [panoramaDepId],
    createdAt: Math.floor(Date.now() / 1000),
  };
  store.state.unions["topnews-pool"] = {
    id: "topnews-pool",
    name: "Top News Contributor Pool (Tier-2 AutoPull)",
    splitterAddress: topNewsSubSplitter,
    upstreamSplitterAddress: rootSplitter,
    kind: "ADMIN_CONTROLLED",
    deploymentIds: [topNewsDepId],
    createdAt: Math.floor(Date.now() / 1000),
  };

  store.addRecord(panoramaDepId, {
    meta: {
      recordId: "seed-pan-1",
      deploymentId: panoramaDepId,
      uidHash: hashUserId("panorama", "alice"),
      dataId: newsDataId,
      schemaVersion: "1.0.0",
      timestamp: Math.floor(Date.now() / 1000),
      source: "webSdk",
    },
    flags: (STANDARD_CONSENT_FLAGS.ANALYTICS | STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.AI_TRAINING).toString(),
    anon: {
      event: "story_curated",
      topic: "ai-infrastructure",
      sentiment: 0.92,
      contributorWallet: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    },
    pii: { email: "alice@example.com" },
  });

  store.addRecord(topNewsDepId, {
    meta: {
      recordId: "seed-tn-1",
      deploymentId: topNewsDepId,
      uidHash: hashUserId("top-news", "bob"),
      dataId: newsDataId,
      schemaVersion: "1.0.0",
      timestamp: Math.floor(Date.now() / 1000),
      source: "mobileNode",
    },
    flags: (STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION | STANDARD_CONSENT_FLAGS.AI_TRAINING).toString(),
    anon: {
      event: "headline_vote",
      topic: "open-protocols",
      karmaDelta: 15,
      contributorWallet: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    },
  });

  store.state.marketOffers["0x381cfafe120c0c2ffb35fdbb06791c4bfd61eeab"] = [
    {
      id: "1",
      deploymentId: panoramaDepId,
      dataId: newsDataId,
      title: "News & Curation Data Union — Real-Time Engagement Feed",
      description: "De-identified curation, topic velocity, and karma signals pooled from Panorama & Top News. Proceeds split in O(1) via Tier-1/Tier-2 MultiSplitters.",
      paymentToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      pricePerSecond: "10000000",
      minDuration: 86400,
      maxDuration: 31536000,
      beneficiary: rootSplitter,
      requiredFlags: "6",
      active: true,
    },
  ];
  store.persist();
}

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";
const store = new FtdpStore(process.env.FTDP_DATA_DIR || undefined);

if (process.env.FTDP_SEED_DEMO === "true") {
  seedDemoData(store);
}

const defraClient =
  process.env.FTDP_STORAGE_DRIVER === "defradb" || process.env.DEFRADB_URL
    ? new DefraClient({
        baseUrl: process.env.DEFRADB_URL || "http://127.0.0.1:9181",
        identityToken: process.env.DEFRADB_IDENTITY_TOKEN || undefined,
      })
    : undefined;

const chainBridge =
  process.env.FTDP_RPC_URL &&
  process.env.FTDP_CLIENT_CONFIG_ADDRESS &&
  process.env.FTDP_ACCESS_PERMISSIONS_ADDRESS
    ? new EthersChainBridge({
        rpcUrl: process.env.FTDP_RPC_URL,
        clientConfigAddress: process.env.FTDP_CLIENT_CONFIG_ADDRESS,
        accessPermissionsAddress: process.env.FTDP_ACCESS_PERMISSIONS_ADDRESS,
        operatorPrivateKey: process.env.FTDP_OPERATOR_PRIVATE_KEY || undefined,
      })
    : undefined;

const reaper = new GrantExpirationReaper(defraClient);
reaper.startInterval(Number(process.env.FTDP_REAPER_INTERVAL_MS || 60_000));

const { server } = createFtdpServer({
  store,
  apiKey: process.env.FTDP_API_KEY || undefined,
  jwtSecret: process.env.FTDP_JWT_SECRET || undefined,
  corsOrigin: process.env.FTDP_CORS_ORIGIN || "*",
  rpcUrl: process.env.FTDP_RPC_URL || undefined,
  accessPermissionsAddress: process.env.FTDP_ACCESS_PERMISSIONS_ADDRESS || undefined,
  defraClient,
  piiCrypto: new PiiEnvelopeCrypto(process.env.FTDP_PII_MASTER_KEY || undefined),
  chainBridge,
  reaper,
});

server.listen(port, host, () => {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "ftdp-node listening",
      host,
      port,
      storageDriver: defraClient ? "defradb" : process.env.FTDP_DATA_DIR ? "file" : "memory",
    })
  );
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(JSON.stringify({ level: "info", msg: "shutting down ftdp-node", signal: sig }));
    reaper.stopInterval();
    server.close(() => process.exit(0));
  });
}
