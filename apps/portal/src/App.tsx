import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { DataUnion, DEMO_DEPLOYMENTS, DEMO_OFFERS, DEMO_UNIONS, Deployment, MarketOffer } from "./demoData";

type Tab = "home" | "dashboard" | "unions" | "market" | "developers";

const DEFAULT_NODE_URL = (import.meta.env.VITE_FTDP_NODE_URL as string) || "http://localhost:4000";
const DEFAULT_MARKET_ADDR =
  (import.meta.env.VITE_FTDP_MARKET_ADDRESS as string) || "0x381CFAfe120c0c2fFB35Fdbb06791c4BfD61eEAb";
const GITHUB_ORG_URL =
  (import.meta.env.VITE_FTDP_GITHUB_URL as string) ||
  "https://github.com/COMMENTZRUS/fair-trade-data-protocol";

const SPLITTER_READ_ABI = [
  "function availableAllotment(address shareholder, address token) view returns (uint256)",
  "function shares(address shareholder) view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function withdrawAll(address shareholder, address token) returns (uint256)",
  "function setBeneficiary(address beneficiary_)",
];

const CONSENT_FLAGS = [
  { bit: 0, label: "Analytics", desc: "De-identified app telemetry" },
  { bit: 1, label: "News Data Union", desc: "Share engagement & curation into shared Data Unions" },
  { bit: 2, label: "AI Training", desc: "License anonymized signals to AI labs" },
  { bit: 3, label: "Ad Personalization", desc: "Fair Trade Data Ad Network preferences" },
  { bit: 4, label: "Karma / Reputation", desc: "Web3 discussion board karma union" },
];

const ROADMAP_STEPS = [
  {
    step: "01",
    title: "Stream Data",
    desc: "Apps embed the FTDP snippet or SDK to emit consent-segregated records (anon, encrypted pii, flags, meta) with verifiable opt-in Merkle roots.",
  },
  {
    step: "02",
    title: "Earn Rewards",
    desc: "When AI labs, advertisers, or enterprises license a Data Union dataset on Market.sol, USDC & FTD stream directly to contributors in O(1) gas.",
  },
  {
    step: "03",
    title: "Optimize",
    desc: "Automated union metering computes contribution weights and submits EIP-712 SetSharesMulti updates with zero retroactive dilution.",
  },
  {
    step: "04",
    title: "Grow",
    desc: "Multiple apps (Panorama, Top News, community sites, Mobile Nodes) pool signals into cascading Tier-1/Tier-2 Data Unions governed by ERC20Votes.",
  },
];

const ECOSYSTEM_USE_CASES = [
  {
    badge: "Layer 1 • Flagship App",
    title: "Panorama",
    desc: "Private intelligence, curation & discovery platform plugged directly into FTDP as a first-party Deployment—proving the protocol in production while keeping app IP proprietary.",
  },
  {
    badge: "Layer 1 • Video & AdTech",
    title: "Streamy",
    desc: "Decentralized video streaming and Fair Trade Data Ad Network—keeping video media on CDN/IPFS while recording consented view receipts and ad preferences on FTDP + defradb.rs.",
  },
  {
    badge: "Layer 1 • Open Social",
    title: "Comment Protocol",
    desc: "Reusable open discussion, star-rating, voting, and portable karma layer built on FTDP + defradb.rs—with VotesSplitterShare DAO governance and universal targetUri addressing.",
  },
  {
    badge: "Layer 2 • Built on Comment",
    title: "Top News",
    desc: "Community news aggregation, article threads, headline votes, and reader karma built on Comment Protocol—earning cascading Tier-3 AutoPull Data Union payouts.",
  },
  {
    badge: "Layer 2 • Built on Comment",
    title: "RateMyVideo",
    desc: "Video ratings, reviews, and creator/viewer karma built on Comment Protocol and cross-linked directly to Streamy video CIDs (streamy://<cid>).",
  },
  {
    badge: "Anti-Spam • Staking",
    title: "FTD Mobile Node Program",
    desc: "Staked FTD Mobile Nodes (FtdAccessStaking.sol) verify human-originated streams across all layers, fight bot spam, and earn protocol data dividends.",
  },
];

const FAQ_ITEMS = [
  {
    q: "How does Panorama stay a private company while FTDP is open source?",
    a: "Panorama keeps its proprietary UI, editorial feeds, ranking models, and customer accounts closed-source. It connects to the open-source Fair Trade Data Protocol strictly as a registered Deployment via @ftdp/sdk—proving the protocol in production while allowing Top News and external developers to join the same Data Unions.",
  },
  {
    q: "How do Data Unions split revenue across thousands of contributors without huge gas fees?",
    a: "FTDP uses hardened Constant-Time MultiSplitter contracts (CTS). Each withdrawal runs in O(1) gas without looping over shareholders, credits revenue strictly to who held shares when payment arrived, and cascades automatically from Tier-1 Root Unions into Tier-2 App Sub-Splitters via AutoPullSplitter.",
  },
  {
    q: "How is PII protected from data buyers?",
    a: "Defense in depth: every record splits anon and pii at ingestion. PII is encrypted per-Deployment with AES-256-GCM (HKDF + AAD), isolated into a local-only DefraDB FtdpPiiVault collection with its own Zanzibar ACP policy, never replicated to external P2P peers, and stripped from all anon-only reads.",
  },
  {
    q: "Why does FTDP use defradb.rs instead of Go DefraDB?",
    a: "Source Network's Rust implementation (defradb.rs) is dual-licensed Apache-2.0 OR MIT, avoiding the BSL 1.1 managed-service restrictions on the legacy Go binary while providing Regolith storage, Local Zanzibar ACP, and LensVM WASM schema evolution.",
  },
  {
    q: "What is the FTD token used for?",
    a: "FTD (FtdToken.sol + FtdAccessStaking.sol) supports network read/write staking thresholds, anti-spam Mobile Node bonding, protocol governance, and multi-token Data Union settlements alongside USDC and native gas tokens.",
  },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [nodeUrl, setNodeUrl] = useState(DEFAULT_NODE_URL);
  const [nodeOnline, setNodeOnline] = useState(false);
  const [wallet, setWallet] = useState<string>("");
  const [solanaWallet, setSolanaWallet] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [openFaq, setOpenFaq] = useState<number>(0);

  const [deployments, setDeployments] = useState<Deployment[]>(DEMO_DEPLOYMENTS);
  const [unions, setUnions] = useState<DataUnion[]>(DEMO_UNIONS);
  const [offers, setOffers] = useState<MarketOffer[]>(DEMO_OFFERS);

  // Mobile Node Opt-In form state
  const [nodeEmailOrWallet, setNodeEmailOrWallet] = useState("");
  const [referralCode, setReferralCode] = useState("");

  // Dashboard interactive state
  const [selectedDepId, setSelectedDepId] = useState<string>(DEMO_DEPLOYMENTS[0].id);
  const [flagBits, setFlagBits] = useState<number[]>([0, 1, 2]);
  const [merkleRoot, setMerkleRoot] = useState<string>("Connect ftdp-node for live committed root");
  const [eventTopic, setEventTopic] = useState<string>("open-protocols");

  // Website Onboarding (DNS TXT + Auto-Capture <head> Snippet) state
  interface DomainRecord {
    domain: string;
    deploymentId: string;
    txtHost: string;
    txtValue: string;
    verified: boolean;
    verifiedAt?: number;
  }
  const [domainInput, setDomainInput] = useState<string>("news.example.com");
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [activeDomain, setActiveDomain] = useState<DomainRecord | null>(null);
  const [autoCapture, setAutoCapture] = useState({
    pageViews: true,
    forms: true,
    clicks: true,
    cookies: true,
    scrollDepth: true,
  });

  // Data Union metering & claim state
  const [meterResult, setMeterResult] = useState<{
    unionId: string;
    chainMode?: string;
    totalConsentedRecords: number;
    updates: Array<{ shareholder: string; shares: string }>;
    solanaUpdates?: Array<{ shareholder: string; shares: string }>;
  } | null>(null);
  const [beneficiaryInput, setBeneficiaryInput] = useState<string>("");
  const [purchaseDays, setPurchaseDays] = useState<number>(30);

  const activeFlagMask = useMemo(
    () => flagBits.reduce((acc, b) => acc | (1n << BigInt(b)), 0n),
    [flagBits]
  );

  async function refreshFromNode() {
    try {
      const health = await fetch(`${nodeUrl}/health`);
      if (!health.ok) throw new Error("offline");
      setNodeOnline(true);

      const [depRes, unionRes, offerRes] = await Promise.all([
        fetch(`${nodeUrl}/api/v1/deployments`).then((r) => r.json()),
        fetch(`${nodeUrl}/api/v1/unions`).then((r) => r.json()),
        fetch(`${nodeUrl}/market_public/${DEFAULT_MARKET_ADDR}/offers`).then((r) => r.json()),
      ]);

      if (Array.isArray(depRes.data) && depRes.data.length > 0) {
        setDeployments(depRes.data);
        setSelectedDepId(depRes.data[0].id);
      }
      if (Array.isArray(unionRes.data) && unionRes.data.length > 0) {
        setUnions(unionRes.data);
      }
      if (Array.isArray(offerRes.data) && offerRes.data.length > 0) {
        setOffers(offerRes.data);
      }
    } catch {
      setNodeOnline(false);
    }
  }

  useEffect(() => {
    refreshFromNode();
  }, [nodeUrl]);

  useEffect(() => {
    if (!nodeOnline || !selectedDepId) return;
    fetch(`${nodeUrl}/api/v1/deployments/${encodeURIComponent(selectedDepId)}/merkle/root`)
      .then((r) => r.json())
      .then((d) => {
        if (d.merkleRoot) setMerkleRoot(`${d.merkleRoot} (${d.leafCount} leaves)`);
      })
      .catch(() => {});

    fetch(`${nodeUrl}/api/v1/deployments/${encodeURIComponent(selectedDepId)}/domains`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.data)) {
          setDomains(d.data);
          setActiveDomain(d.data[0] || null);
        }
      })
      .catch(() => {});
  }, [nodeOnline, selectedDepId, nodeUrl]);

  async function registerDomainChallenge(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = domainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0]
      .replace(/\.$/, "");
    if (!cleaned || !cleaned.includes(".")) {
      setStatusMsg({ text: "Enter a valid domain name (e.g. app.example.com).", isError: true });
      return;
    }

    if (!nodeOnline) {
      const previewToken = ethers.keccak256(ethers.toUtf8Bytes(`${selectedDepId}:${cleaned}`)).slice(2, 34);
      const previewRec: DomainRecord = {
        domain: cleaned,
        deploymentId: selectedDepId,
        txtHost: `_ftdp-verify.${cleaned}`,
        txtValue: `ftdp-verify=${previewToken}`,
        verified: false,
      };
      setDomains((prev) => [previewRec, ...prev.filter((d) => d.domain !== cleaned)]);
      setActiveDomain(previewRec);
      setStatusMsg({
        text: `Generated sandbox DNS TXT challenge for ${cleaned}. Connect ftdp-node for live DNS verification.`,
      });
      return;
    }

    try {
      const res = await fetch(`${nodeUrl}/api/v1/deployments/${encodeURIComponent(selectedDepId)}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: cleaned }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to generate DNS TXT challenge");
      const rec = payload.data as DomainRecord;
      setDomains((prev) => [rec, ...prev.filter((d) => d.domain !== rec.domain)]);
      setActiveDomain(rec);
      setStatusMsg({
        text: `DNS TXT challenge ready: add ${rec.txtValue} at ${rec.txtHost} (or apex ${rec.domain}).`,
      });
    } catch (err) {
      setStatusMsg({ text: String(err), isError: true });
    }
  }

  async function verifyDomainChallenge(targetDomain: string) {
    if (!nodeOnline) {
      setDomains((prev) =>
        prev.map((d) => (d.domain === targetDomain ? { ...d, verified: true, verifiedAt: Math.floor(Date.now() / 1000) } : d))
      );
      setActiveDomain((prev) =>
        prev && prev.domain === targetDomain
          ? { ...prev, verified: true, verifiedAt: Math.floor(Date.now() / 1000) }
          : prev
      );
      setStatusMsg({ text: `Verified ${targetDomain} in sandbox preview mode.` });
      return;
    }

    try {
      const res = await fetch(
        `${nodeUrl}/api/v1/deployments/${encodeURIComponent(selectedDepId)}/domains/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: targetDomain }),
        }
      );
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "DNS TXT record not found yet. Wait for DNS propagation and retry.");
      }
      const rec = payload.data as DomainRecord;
      setDomains((prev) => prev.map((d) => (d.domain === rec.domain ? rec : d)));
      setActiveDomain(rec);
      setStatusMsg({
        text: `Domain ${rec.domain} verified via ${payload.matchedHost || rec.txtHost}! Origin lock is now active.`,
      });
    } catch (err) {
      setStatusMsg({ text: String(err), isError: true });
    }
  }

  async function connectWallet() {
    const eth = (window as unknown as { ethereum?: ethers.Eip1193Provider }).ethereum;
    if (!eth) {
      setStatusMsg({
        text: "No EVM wallet detected in browser. Install MetaMask or Rabby to sign live on-chain transactions.",
        isError: true,
      });
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(eth);
      const accounts = await provider.send("eth_requestAccounts", []);
      setWallet(accounts[0]);
      setStatusMsg({ text: `Connected wallet ${accounts[0]}` });
    } catch (err) {
      setStatusMsg({ text: `Wallet connection cancelled: ${String(err)}`, isError: true });
    }
  }

  async function connectSolanaWallet() {
    const sol = (
      window as unknown as {
        solana?: { connect: () => Promise<{ publicKey: { toString: () => string } }> };
      }
    ).solana;
    if (!sol) {
      setStatusMsg({
        text: "No Solana wallet detected. Install Phantom or Solflare to claim Solana Data Union payouts.",
        isError: true,
      });
      return;
    }
    try {
      const res = await sol.connect();
      const pubkey = res.publicKey.toString();
      setSolanaWallet(pubkey);
      setStatusMsg({ text: `Connected Solana wallet ${pubkey}` });
    } catch (err) {
      setStatusMsg({ text: `Solana wallet connection cancelled: ${String(err)}`, isError: true });
    }
  }

  function handleMobileNodeOptIn(e: React.FormEvent) {
    e.preventDefault();
    const id = nodeEmailOrWallet.trim() || wallet;
    if (!id) {
      setStatusMsg({ text: "Enter a wallet address or connect your wallet to opt in to the FTD Mobile Node program.", isError: true });
      return;
    }
    const code = "FTD-" + ethers.keccak256(ethers.toUtf8Bytes(id)).slice(2, 10).toUpperCase();
    setReferralCode(code);
    setStatusMsg({ text: `Opt-in recorded for ${id}. Your referral code is ${code}.` });
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatusMsg({ text: `Copied ${label} to clipboard.` });
    } catch {
      setStatusMsg({ text: `Select and copy the ${label} block manually.`, isError: true });
    }
  }

  async function emitSampleRecord() {
    if (!nodeOnline) {
      setStatusMsg({
        text: "Start ftdp-node (docker compose up --build) to ingest live records into the node.",
        isError: true,
      });
      return;
    }
    try {
      const uidHash = ethers.keccak256(ethers.toUtf8Bytes(`portal:${wallet || "demo-user"}`));
      const res = await fetch(`${nodeUrl}/v1/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: {
            recordId: `portal-${Date.now()}`,
            deploymentId: selectedDepId,
            uidHash,
            schemaVersion: "1.0.0",
            timestamp: Math.floor(Date.now() / 1000),
            source: "webSdk",
          },
          flags: activeFlagMask.toString(),
          anon: {
            event: "article_curated",
            topic: eventTopic,
            contributorWallet: wallet || "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
          },
          pii: { sessionHint: "aes-256-gcm-encrypted-into-pii-vault" },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingest failed");
      setMerkleRoot(`${data.merkleRoot} (${data.leafCount} leaves)`);
      setStatusMsg({
        text: `Ingested record ${data.recordId} (PII AES-256-GCM encrypted). Updated opt-in Merkle root!`,
      });
    } catch (err) {
      setStatusMsg({ text: String(err), isError: true });
    }
  }

  async function runUnionMetering(unionId: string) {
    if (!nodeOnline) {
      setMeterResult({
        unionId,
        chainMode: "dual",
        totalConsentedRecords: 2,
        updates: [
          { shareholder: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", shares: "100" },
          { shareholder: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", shares: "100" },
        ],
        solanaUpdates: [
          { shareholder: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", shares: "100" },
          { shareholder: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", shares: "100" },
        ],
      });
      setStatusMsg({ text: "Simulated Dual-Chain (EVM + Solana) Data Union metering (demo mode)." });
      return;
    }
    try {
      const res = await fetch(`${nodeUrl}/api/v1/unions/${encodeURIComponent(unionId)}/meter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiredFlags: "2" }),
      });
      const data = await res.json();
      setMeterResult(data);
      setStatusMsg({ text: `Metered ${data.totalConsentedRecords} consented records for ${unionId}.` });
    } catch (err) {
      setStatusMsg({ text: String(err), isError: true });
    }
  }

  async function withdrawFromUnion(splitterAddress: string) {
    const eth = (window as unknown as { ethereum?: ethers.Eip1193Provider }).ethereum;
    if (!eth || !wallet) {
      setStatusMsg({ text: "Connect an EVM wallet first to claim Data Union payouts on-chain.", isError: true });
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const splitter = new ethers.Contract(splitterAddress, SPLITTER_READ_ABI, signer);
      const tx = await splitter.withdrawAll(wallet, ethers.ZeroAddress);
      await tx.wait();
      setStatusMsg({ text: `Claimed native payout from ${splitterAddress} (tx: ${tx.hash})` });
    } catch (err) {
      setStatusMsg({ text: `Withdrawal reverted or cancelled: ${String(err)}`, isError: true });
    }
  }

  async function setCustomBeneficiary(splitterAddress: string) {
    const eth = (window as unknown as { ethereum?: ethers.Eip1193Provider }).ethereum;
    if (!eth || !wallet || !ethers.isAddress(beneficiaryInput)) {
      setStatusMsg({ text: "Connect wallet and enter a valid beneficiary EVM address.", isError: true });
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const splitter = new ethers.Contract(splitterAddress, SPLITTER_READ_ABI, signer);
      const tx = await splitter.setBeneficiary(beneficiaryInput);
      await tx.wait();
      setStatusMsg({ text: `Updated payout beneficiary to ${beneficiaryInput}` });
    } catch (err) {
      setStatusMsg({ text: `Beneficiary update failed: ${String(err)}`, isError: true });
    }
  }

  const cleanNodeUrl = nodeUrl.replace(/\/+$/, "");
  const snippetCode = `<!-- Paste inside <head> after verifying DNS TXT ownership -->
<script src="${cleanNodeUrl}/sdk/ftdp-snippet.js"></script>
<script>
  FTDP.init({
    endpoint: "${cleanNodeUrl}",
    deploymentId: "${selectedDepId}",
    namespace: "${activeDomain?.domain || "your-site.com"}",
    consentFlags: "${activeFlagMask.toString()}", // set after user opt-in
    contributorWallet: currentUser?.wallet || "",
    autoCapture: {
      pageViews: ${autoCapture.pageViews},
      forms: ${autoCapture.forms},
      clicks: ${autoCapture.clicks},
      cookies: ${autoCapture.cookies},
      scrollDepth: ${autoCapture.scrollDepth}
    },
    allowedCookies: ["theme", "locale"] // auth/session/JWT cookies are hard-blocked
  });
</script>`;

  const defraComposeCode = `# Self-host FTDP Reference Node + Apache-2.0/MIT defradb.rs
git clone ${GITHUB_ORG_URL}.git
cd fair-trade-data-protocol/node
docker compose up -d
./defradb/bootstrap-defradb.sh`;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand" onClick={() => setTab("home")}>
          <span className="brand-dot" />
          <span>Fair Trade Data</span>
          <span className={`badge ${nodeOnline ? "green" : "amber"}`}>
            {nodeOnline ? "Node Live" : "Sandbox"}
          </span>
        </div>

        <nav className="nav">
          <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
            Home
          </button>
          <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>
            SLS Dashboard
          </button>
          <button className={tab === "unions" ? "active" : ""} onClick={() => setTab("unions")}>
            Data Unions
          </button>
          <button className={tab === "market" ? "active" : ""} onClick={() => setTab("market")}>
            Marketplace
          </button>
          <button className={tab === "developers" ? "active" : ""} onClick={() => setTab("developers")}>
            Developers
          </button>
        </nav>

        <div className="row">
          {wallet ? (
            <span className="badge purple mono">
              EVM {wallet.slice(0, 6)}...{wallet.slice(-4)}
            </span>
          ) : (
            <button className="btn sm" onClick={connectWallet}>
              EVM Wallet
            </button>
          )}
          {solanaWallet ? (
            <span className="badge green mono">
              SOL {solanaWallet.slice(0, 4)}...{solanaWallet.slice(-4)}
            </span>
          ) : (
            <button className="btn secondary sm" onClick={connectSolanaWallet}>
              Solana Wallet
            </button>
          )}
        </div>
      </header>

      {statusMsg && (
        <div className={`status-bar ${statusMsg.isError ? "error" : ""}`}>{statusMsg.text}</div>
      )}

      {/* ==================== HOME (fairtradedata.org) ==================== */}
      {tab === "home" && (
        <>
          <section className="hero">
            <span className="badge">Fair Trade Data Foundation • Open-Source Base Layer (MIT)</span>
            <h1>Turn Corporate Data Lakes into Community-Owned Data Unions.</h1>
            <p>
              The <strong>Fair Trade Data Protocol (FTDP)</strong> enables ethical, verifiable data
              exchange across humans, bots, advertisers, AI labs, and enterprises. Combining{" "}
              <strong>Storage Layer Security (SLS)</strong>, Apache-2.0/MIT{" "}
              <strong>defradb.rs</strong> with Local Zanzibar ACP, and{" "}
              <strong>O(1) Constant-Time MultiSplitter Data Unions</strong>, FTDP powers flagship
              deployments like <strong>Panorama</strong> and <strong>Top News</strong> while letting
              anyone build on top.
            </p>
            <div className="row" style={{ marginTop: 24 }}>
              <button className="btn" onClick={() => setTab("developers")}>
                For Developers
              </button>
              <button className="btn emerald" onClick={() => setTab("unions")}>
                Explore Data Unions
              </button>
              <button className="btn secondary" onClick={() => setTab("dashboard")}>
                Open SLS Dashboard
              </button>
              <a className="btn secondary" href="#mobile-node" style={{ textDecoration: "none" }}>
                Join Mobile Node Program
              </a>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <span className="badge green">Core Architecture</span>
              <h2>Built for Privacy, Consent Provenance &amp; Real-Time Rewards</h2>
              <p>
                Private apps keep their proprietary product IP while plugging into an open,
                cryptographically enforced base layer.
              </p>
            </div>
            <div className="grid">
              <div className="card">
                <span className="badge">SLS Consent Layer</span>
                <h3 style={{ marginTop: 10 }}>Segregated Records &amp; Merkle Proofs</h3>
                <p>
                  Every record separates <code>anon</code>, <code>pii</code>, <code>flags</code>, and{" "}
                  <code>meta</code>. On-chain <code>AccessPermissions.canRead()</code> verifies
                  user consent via OpenZeppelin Merkle proofs before serving any query.
                </p>
              </div>
              <div className="card">
                <span className="badge purple">Source Network Storage</span>
                <h3 style={{ marginTop: 10 }}>defradb.rs + Zanzibar ACP + LensVM</h3>
                <p>
                  Peer-to-peer Merkle-CRDT replication for <code>FtdpAnonRecord</code>, local-only
                  AES-256-GCM <code>FtdpPiiVault</code>, automatic grant expiration reaping, and
                  non-destructive WASM schema upgrades.
                </p>
              </div>
              <div className="card">
                <span className="badge green">Constant-Time Splitting</span>
                <h3 style={{ marginTop: 10 }}>O(1) Cascading Data Unions</h3>
                <p>
                  <code>Market.purchase()</code> routes USDC, FTD, and native tokens directly to
                  Tier-1 Data Unions that cascade via <code>AutoPullSplitter</code> to apps and
                  unlimited contributors with zero retroactive dilution.
                </p>
              </div>
            </div>
          </section>

          <section id="roadmap" className="section">
            <div className="section-head">
              <span className="badge">How It Works</span>
              <h2>4-Step Producer &amp; Data Union Lifecycle</h2>
            </div>
            <div className="grid-4">
              {ROADMAP_STEPS.map((s) => (
                <div key={s.step} className="card">
                  <div className="step-num">{s.step}</div>
                  <h3>{s.title}</h3>
                  <p style={{ marginBottom: 0 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <span className="badge purple">Ecosystem</span>
              <h2>What Builders Launch on FTDP</h2>
            </div>
            <div className="grid">
              {ECOSYSTEM_USE_CASES.map((item) => (
                <div key={item.title} className="card">
                  <span className="badge">{item.badge}</span>
                  <h3 style={{ marginTop: 10 }}>{item.title}</h3>
                  <p style={{ marginBottom: 0 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="mobile-node" className="section">
            <div className="card">
              <div className="grid-2">
                <div>
                  <span className="badge green">FTD Token &amp; Mobile Node Program</span>
                  <h2 style={{ margin: "10px 0 10px" }}>Opt-In, Fight Spam &amp; Earn FTD Rewards</h2>
                  <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                    The <strong>FTD Token</strong> (<code>FtdToken.sol</code> +{" "}
                    <code>FtdAccessStaking.sol</code>) aligns network readers, writers, and Mobile
                    Nodes. Stake FTD to validate human-generated data streams, prevent bot abuse,
                    and earn proportional Data Union dividends as aggregate consumption grows.
                  </p>
                </div>
                <form onSubmit={handleMobileNodeOptIn} className="tier-box">
                  <h3 style={{ margin: "0 0 8px" }}>Enroll in FTD Mobile Node Waitlist</h3>
                  <p style={{ margin: "0 0 12px", fontSize: 13 }}>
                    Enter your EVM address (or connect wallet) to generate your node referral code.
                  </p>
                  <div className="row">
                    <input
                      value={nodeEmailOrWallet}
                      onChange={(e) => setNodeEmailOrWallet(e.target.value)}
                      placeholder={wallet || "0x... EVM Address or Email"}
                      style={{ flex: 1, minWidth: 200 }}
                    />
                    <button type="submit" className="btn emerald">
                      Opt-In &amp; Get Referral
                    </button>
                  </div>
                  {referralCode && (
                    <div className="row space-between" style={{ marginTop: 12 }}>
                      <span className="mono" style={{ color: "var(--emerald)" }}>
                        Referral Code: {referralCode}
                      </span>
                      <button
                        type="button"
                        className="btn secondary sm"
                        onClick={() => copyText("referral code", referralCode)}
                      >
                        Copy Code
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>
          </section>

          <section id="faq" className="section">
            <div className="section-head">
              <span className="badge">FAQ</span>
              <h2>Frequently Asked Questions</h2>
            </div>
            {FAQ_ITEMS.map((item, idx) => (
              <div key={item.q} className="faq-item">
                <button className="faq-q" onClick={() => setOpenFaq(openFaq === idx ? -1 : idx)}>
                  <span>{item.q}</span>
                  <span style={{ color: "var(--accent)" }}>{openFaq === idx ? "−" : "+"}</span>
                </button>
                {openFaq === idx && <div className="faq-a">{item.a}</div>}
              </div>
            ))}
          </section>
        </>
      )}

      {/* ==================== SLS DASHBOARD ==================== */}
      {tab === "dashboard" && (
        <section className="section" style={{ marginTop: 28 }}>
          <div className="grid-2">
            <div className="card">
              <h3>Registered Deployments</h3>
              <p>Private apps &amp; community publishers streaming into FTDP.</p>
              {deployments.map((d) => (
                <div
                  key={d.id}
                  onClick={() => setSelectedDepId(d.id)}
                  className="tier-box"
                  style={{
                    marginBottom: 10,
                    cursor: "pointer",
                    borderColor: selectedDepId === d.id ? "var(--accent)" : undefined,
                  }}
                >
                  <div className="row space-between">
                    <strong>{d.name}</strong>
                    <span className="badge">{d.organizationId}</span>
                  </div>
                  <div className="mono" style={{ color: "var(--muted)", marginTop: 6 }}>
                    ID: {d.id}
                  </div>
                </div>
              ))}
              <div className="tier-box" style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Latest Opt-In Merkle Root</div>
                <div className="mono" style={{ marginTop: 4, color: "var(--emerald)" }}>
                  {merkleRoot}
                </div>
              </div>
            </div>

            <div className="card">
              <h3>Consent Bitmask Builder &amp; Live Ingestion (<code>POST /v1/records</code>)</h3>
              <p>
                Toggle granular opt-in flags to compute the exact <code>uint256</code> bitmask used
                in Merkle consent leaves and <code>AccessPermissions.canRead()</code>.
              </p>

              {CONSENT_FLAGS.map((f) => {
                const checked = flagBits.includes(f.bit);
                return (
                  <label key={f.bit} className="flag-toggle">
                    <div>
                      <strong>
                        Bit {f.bit}: {f.label}
                      </strong>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{f.desc}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setFlagBits((prev) =>
                          checked ? prev.filter((b) => b !== f.bit) : [...prev, f.bit]
                        )
                      }
                    />
                  </label>
                );
              })}

              <div className="row space-between" style={{ marginTop: 14 }}>
                <div>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>Bitmask: </span>
                  <strong className="mono" style={{ color: "var(--accent)" }}>
                    {activeFlagMask.toString()} (0x{activeFlagMask.toString(16)})
                  </strong>
                </div>
                <div className="row">
                  <input
                    value={eventTopic}
                    onChange={(e) => setEventTopic(e.target.value)}
                    placeholder="Topic tag"
                    style={{ width: 150 }}
                  />
                  <button className="btn emerald" onClick={emitSampleRecord}>
                    Emit Consented Event
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3-Step Client Website Onboarding: DNS TXT Ownership + Auto-Capture <head> Snippet */}
          <div className="card" style={{ marginTop: 18 }}>
            <div className="row space-between" style={{ marginBottom: 12 }}>
              <div>
                <span className="badge green">Client Website Onboarding</span>
                <h3 style={{ margin: "8px 0 4px" }}>
                  Connect a Website via DNS TXT &amp; Auto-Capture <code>&lt;head&gt;</code> Snippet
                </h3>
                <p style={{ margin: 0 }}>
                  Prove domain ownership with a DNS TXT record to lock browser <code>Origin</code>{" "}
                  ingestion, then paste one <code>&lt;head&gt;</code> tag to stream consented forms,
                  behavioral telemetry, and safe cookie metadata into your Data Union.
                </p>
              </div>
              {activeDomain && (
                <span className={`badge ${activeDomain.verified ? "green" : "amber"}`}>
                  {activeDomain.verified ? `Verified ✓ (${activeDomain.domain})` : `Pending DNS (${activeDomain.domain})`}
                </span>
              )}
            </div>

            <div className="grid-2" style={{ marginTop: 14 }}>
              <div className="tier-box">
                <div className="badge">Step 1 • Register Domain</div>
                <form onSubmit={registerDomainChallenge} className="row" style={{ marginTop: 10 }}>
                  <input
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder="example.com or app.example.com"
                    style={{ flex: 1, minWidth: 180 }}
                  />
                  <button type="submit" className="btn sm">
                    Generate DNS TXT
                  </button>
                </form>

                {domains.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                      Deployment Domains
                    </div>
                    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                      {domains.map((d) => (
                        <button
                          key={d.domain}
                          type="button"
                          className={`btn sm ${activeDomain?.domain === d.domain ? "" : "secondary"}`}
                          onClick={() => setActiveDomain(d)}
                        >
                          {d.domain} {d.verified ? "✓" : "•"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="badge purple" style={{ marginTop: 16 }}>
                  Step 2 • Verify DNS TXT Record
                </div>
                {activeDomain ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>TXT Host (or apex {activeDomain.domain})</div>
                    <div className="mono" style={{ color: "var(--accent)", marginBottom: 8 }}>
                      {activeDomain.txtHost}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>TXT Value</div>
                    <div className="mono" style={{ color: "var(--emerald)", marginBottom: 10, wordBreak: "break-all" }}>
                      {activeDomain.txtValue}
                    </div>
                    <div className="row">
                      <button
                        type="button"
                        className="btn secondary sm"
                        onClick={() => copyText("DNS TXT value", activeDomain.txtValue)}
                      >
                        Copy TXT Value
                      </button>
                      <button
                        type="button"
                        className="btn emerald sm"
                        onClick={() => verifyDomainChallenge(activeDomain.domain)}
                      >
                        {activeDomain.verified ? "Re-Verify DNS TXT" : "Verify DNS TXT"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8, marginBottom: 0 }}>
                    Enter your client domain above to generate a unique <code>_ftdp-verify</code> DNS
                    TXT challenge.
                  </p>
                )}
              </div>

              <div className="tier-box">
                <div className="row space-between">
                  <span className="badge green">Step 3 • Configure &amp; Paste &lt;head&gt; Snippet</span>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => copyText("<head> auto-capture snippet", snippetCode)}
                  >
                    Copy Snippet
                  </button>
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0" }}>
                  Passwords, CVV/card/SSN inputs, and auth/session/JWT cookies are hard-blocked.
                  Email/name/phone/address fields auto-route into the encrypted <code>pii</code> vault.
                </p>
                <div className="row" style={{ flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  {(
                    [
                      ["pageViews", "Page Views & UTM"],
                      ["forms", "Form Submissions"],
                      ["clicks", "UI Clicks"],
                      ["cookies", "Safe Cookie Meta"],
                      ["scrollDepth", "Scroll Depth"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={autoCapture[key]}
                        onChange={() =>
                          setAutoCapture((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <pre className="code" style={{ margin: 0, maxHeight: 270, overflow: "auto" }}>
                  {snippetCode}
                </pre>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ==================== DATA UNIONS ==================== */}
      {tab === "unions" && (
        <section className="section" style={{ marginTop: 28 }}>
          <div className="card">
            <div className="row space-between">
              <div>
                <h3>Cascading Constant-Time MultiSplitter Data Unions</h3>
                <p>
                  Market proceeds stream into the Tier-1 Root Union and cascade via{" "}
                  <code>AutoPullSplitter</code> to Panorama, Top News, and unlimited opted-in users
                  in O(1) gas.
                </p>
              </div>
              <span className="badge green">Constant-Time Splitting (CTS)</span>
            </div>

            <div className="tier-flow">
              {unions
                .filter((u) => !u.upstreamSplitterAddress)
                .map((root) => (
                  <div key={root.id} className="tier-box">
                    <div className="row space-between">
                      <div>
                        <strong>{root.name}</strong>
                        {root.splitterAddress && (
                          <div className="mono" style={{ color: "var(--muted)" }}>
                            EVM Splitter: {root.splitterAddress}
                          </div>
                        )}
                        {root.solana && (
                          <div className="mono" style={{ color: "var(--emerald)" }}>
                            Solana PDA ({root.solana.variant}): {root.solana.splitterPda}
                          </div>
                        )}
                      </div>
                      <div className="row">
                        <span className="badge purple">
                          {root.chainMode === "dual"
                            ? "Dual-Chain (EVM + Solana)"
                            : root.chainMode === "solana"
                            ? "Solana"
                            : "EVM"}
                        </span>
                        <span className="badge">{root.kind}</span>
                        <button className="btn secondary sm" onClick={() => runUnionMetering(root.id)}>
                          Run Metering
                        </button>
                        {root.splitterAddress && (
                          <button
                            className="btn emerald sm"
                            onClick={() => withdrawFromUnion(root.splitterAddress!)}
                          >
                            Claim EVM
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="tier-children">
                      <div className="tier-box">
                        <span className="badge purple">5% Protocol Share</span>
                        <h4 style={{ margin: "8px 0 4px" }}>FTDF Treasury</h4>
                        <div className="mono" style={{ color: "var(--muted)" }}>
                          Safe (EVM) + Squads (Solana)
                        </div>
                      </div>

                      {unions
                        .filter(
                          (sub) =>
                            root.splitterAddress &&
                            sub.upstreamSplitterAddress?.toLowerCase() ===
                              root.splitterAddress.toLowerCase()
                        )
                        .map((sub) => (
                          <div key={sub.id} className="tier-box">
                            <span className="badge green">
                              Tier-2 AutoPull {sub.chainMode === "dual" ? "• Dual-Chain" : ""}
                            </span>
                            <h4 style={{ margin: "8px 0 4px" }}>{sub.name}</h4>
                            {sub.splitterAddress && (
                              <div className="mono" style={{ color: "var(--muted)" }}>
                                EVM: {sub.splitterAddress}
                              </div>
                            )}
                            {sub.solana && (
                              <div className="mono" style={{ color: "var(--emerald)", marginBottom: 10 }}>
                                SOL: {sub.solana.splitterPda}
                              </div>
                            )}
                            <div className="row" style={{ marginTop: 8 }}>
                              <button
                                className="btn secondary sm"
                                onClick={() => runUnionMetering(sub.id)}
                              >
                                Meter Dual-Chain
                              </button>
                              {sub.splitterAddress && (
                                <button
                                  className="btn sm"
                                  onClick={() => withdrawFromUnion(sub.splitterAddress!)}
                                >
                                  Claim EVM
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: 18 }}>
            <div className="card">
              <h3>
                Metering Output (<code>setSharesMultiMeta</code> Payload)
              </h3>
              <p>
                Verified consented contribution weights ready for EIP-712 signing and on-chain share
                updates.
              </p>
              {meterResult ? (
                <pre className="code">{JSON.stringify(meterResult, null, 2)}</pre>
              ) : (
                <p style={{ color: "var(--muted)" }}>
                  Click &ldquo;Run Metering&rdquo; on any Data Union above to compute contributor
                  share weights.
                </p>
              )}
            </div>

            <div className="card">
              <h3>
                Payout Beneficiary Routing (<code>IBeneficiary</code>)
              </h3>
              <p>
                Route your Data Union rewards to a cold wallet or smart account without moving
                shares.
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                <input
                  value={beneficiaryInput}
                  onChange={(e) => setBeneficiaryInput(e.target.value)}
                  placeholder="0x... Cold Wallet / Safe Address"
                  style={{ flex: 1 }}
                />
                <button
                  className="btn"
                  onClick={() =>
                    setCustomBeneficiary(
                      unions[1]?.splitterAddress || unions[0]?.splitterAddress || ""
                    )
                  }
                >
                  Set Beneficiary
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ==================== MARKETPLACE ==================== */}
      {tab === "market" && (
        <section className="section" style={{ marginTop: 28 }}>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="row space-between">
              <div>
                <h3>FTDP Data Marketplace</h3>
                <p>
                  Every offer routes USDC / FTD / native payments directly into its Data Union
                  MultiSplitter beneficiary and atomically grants time-bounded{" "}
                  <code>AccessPermissions</code>.
                </p>
              </div>
              <div className="row">
                <span style={{ color: "var(--muted)", fontSize: 13 }}>Duration (days):</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={purchaseDays}
                  onChange={(e) => setPurchaseDays(Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: 90 }}
                />
              </div>
            </div>
          </div>

          <div className="grid">
            {offers.map((offer) => {
              const durationSec = BigInt(purchaseDays) * 86400n;
              const estCost = BigInt(offer.pricePerSecond || "0") * durationSec;
              const estUsdc = Number(estCost) / 1e6;
              return (
                <div key={offer.id} className="card">
                  <div className="row space-between">
                    <span className="badge">Offer #{offer.id}</span>
                    <span className="badge green">Required Flags: {offer.requiredFlags}</span>
                  </div>
                  <h3 style={{ marginTop: 12 }}>{offer.title}</h3>
                  <p>{offer.description}</p>
                  <div className="tier-box" style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Beneficiary (Tier-1 Data Union MultiSplitter)
                    </div>
                    <div className="mono" style={{ color: "var(--accent)", marginTop: 4 }}>
                      {offer.beneficiary}
                    </div>
                  </div>
                  <div className="row space-between">
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Estimated Cost ({purchaseDays}d)
                      </div>
                      <strong style={{ fontSize: 18 }}>${estUsdc.toLocaleString()} USDC</strong>
                    </div>
                    <button
                      className="btn emerald"
                      onClick={() =>
                        setStatusMsg({
                          text: wallet
                            ? `Ready to call Market.purchase([${offer.id}], recipientDeploymentId, ${durationSec.toString()}) on ${DEFAULT_MARKET_ADDR}`
                            : "Connect your EVM wallet to execute Market.purchase() on-chain.",
                          isError: !wallet,
                        })
                      }
                    >
                      License Dataset
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ==================== DEVELOPERS ==================== */}
      {tab === "developers" && (
        <section className="section" style={{ marginTop: 28 }}>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="row space-between">
              <div>
                <h3>1. Embed the FTDP Browser Snippet (<code>@ftdp/sdk</code>)</h3>
                <p>Stream consent-segregated records from any web app in under 10 lines.</p>
              </div>
              <div className="row">
                <input
                  value={nodeUrl}
                  onChange={(e) => setNodeUrl(e.target.value)}
                  style={{ width: 220 }}
                />
                <button className="btn secondary sm" onClick={refreshFromNode}>
                  Reconnect
                </button>
                <button className="btn sm" onClick={() => copyText("browser snippet", snippetCode)}>
                  Copy Snippet
                </button>
              </div>
            </div>
            <pre className="code">{snippetCode}</pre>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="row space-between">
                <h3>2. Run FTDP Node + defradb.rs</h3>
                <button
                  className="btn secondary sm"
                  onClick={() => copyText("Docker quickstart", defraComposeCode)}
                >
                  Copy
                </button>
              </div>
              <p>
                Uses Source Network&apos;s <strong>Apache-2.0 / MIT</strong> <code>defradb.rs</code>{" "}
                container with Local Zanzibar ACP and AES-256-GCM PII vault isolation.
              </p>
              <pre className="code">{defraComposeCode}</pre>
            </div>

            <div className="card">
              <h3>3. Protocol Contract Modules (MIT)</h3>
              <p>Auditable EVM v1 + v2 contracts (plus Solana Anchor programs in <code>contracts-solana/</code>):</p>
              <div className="tier-box mono" style={{ lineHeight: 1.8 }}>
                <div>• sls/ClientConfigManager.sol — Deployment keys &amp; EIP-712 roles</div>
                <div>• sls/AccessPermissions.sol — Merkle opt-in canRead() verifier</div>
                <div>• sls/Market.sol — Time-bounded licensing → Union beneficiary</div>
                <div>• DataUnionFactory.sol — Deterministic Tier-1 &amp; Tier-2 clones</div>
                <div>• splitter/AdminControlledSplitter.sol — O(1) CTS + AutoPull</div>
                <div>• splitter/VotesSplitterShare.sol — ERC20Votes dividend shares</div>
                <div>• v2/FtdToken.sol &amp; FtdAccessStaking.sol — FTD token &amp; Mobile Nodes</div>
                <div>• v2/DataUnionGovernor.sol — OpenZeppelin v5 DAO governance</div>
                <div>• v2/ComputeToDataEscrow.sol — Privacy-preserving AI compute escrow → Union payouts</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ==================== PRODUCTION FOOTER ==================== */}
      <footer className="footer">
        <div>
          <strong>Fair Trade Data Foundation (FTDF)</strong> — Open-Source Fair Trade Data Protocol
          (MIT).
        </div>
        <div className="footer-links">
          <button onClick={() => setTab("home")}>Home</button>
          <button onClick={() => setTab("dashboard")}>SLS Dashboard</button>
          <button onClick={() => setTab("unions")}>Data Unions</button>
          <button onClick={() => setTab("market")}>Marketplace</button>
          <button onClick={() => setTab("developers")}>Developers</button>
          <a href={GITHUB_ORG_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
