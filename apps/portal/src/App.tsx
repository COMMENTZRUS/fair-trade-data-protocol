import React, { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  DataUnion,
  DEMO_DEPLOYMENTS,
  DEMO_OFFERS,
  DEMO_UNIONS,
  Deployment,
  MarketOffer,
  SOLANA_DEVNET_PROGRAMS,
} from "./demoData";

type ViewMode = "home" | "developers" | "unions";

interface DomainRecord {
  domain: string;
  deploymentId: string;
  txtHost: string;
  txtValue: string;
  verified: boolean;
  verifiedAt?: number;
}

const DEFAULT_NODE_URL =
  (import.meta.env.VITE_FTDP_NODE_URL as string) || "https://ftdp-node-production.up.railway.app";
const GITHUB_URL =
  (import.meta.env.VITE_FTDP_GITHUB_URL as string) ||
  "https://github.com/COMMENTZRUS/fair-trade-data-protocol";

const FAQ_ITEMS = [
  {
    q: "How do I start earning rewards as a Fair Trade Data Producer?",
    a: "Add a code snippet from FTDP to secure anonymized data records from your website , run an FTD node to help secure the network.",
  },
  {
    q: "Who can use the Fair Trade Data Protocol?",
    a: "Humans , bots , advertisers and enterprises.",
  },
  {
    q: "How are tokens valued?",
    a: "FTD protocol revenue is correlated to the aggregate data consumption on our network of data unions and fair trade data applications, the FTD token is required to read or write data to and from the network",
  },
];

const ROADMAP_STEPS = [
  {
    num: 1,
    title: "Stream Data",
    desc: "Secure your data via the Fair Trade Data Protocol for verified consent records and granular cryptographic access controls",
  },
  {
    num: 2,
    title: "Earn Rewards",
    desc: "Receive FTD tokens each time your anonymized datasets are referenced by compute-over-data users",
  },
  {
    num: 3,
    title: "Optimize",
    desc: "Automate day to day processes of data production and consumption with FTDP",
  },
  {
    num: 4,
    title: "Grow",
    desc: "Build your fair trade data footprint and grow your piece of the network",
  },
];

const MARKETPLACE_CARDS = [
  {
    image: "/images/market-gaming.jpg",
    alt: "Open Knowledgebase for Gaming Community + Agentic AI Coaching",
    title: "Open Knowledgebase for Gaming Community + Agentic AI Coaching",
  },
  {
    image: "/images/market-streamy.webp",
    alt: "Fair Trade Data Ad Network + Video Streaming via Decentralized Storage",
    title: "Fair Trade Data Ad Network + Video Streaming via Decentralized Storage",
  },
  {
    image: "/images/market-ttn.png",
    alt: "Web 3 Native Discussion Boards for zk Voting + User Karma Data Unions via TTN",
    title: "Web 3 Native Discussion Boards for zk Voting + User Karma Data Unions via TTN",
  },
];

const CONSENT_FLAGS = [
  { bit: 0, label: "Analytics", desc: "De-identified app telemetry" },
  { bit: 1, label: "News Data Union", desc: "Share engagement & curation into shared Data Unions" },
  { bit: 2, label: "AI Training", desc: "License anonymized signals to AI labs" },
  { bit: 3, label: "Ad Personalization", desc: "Fair Trade Data Ad Network preferences" },
  { bit: 4, label: "Karma / Reputation", desc: "Web3 discussion board karma union" },
];

/** Exact FontAwesome-Light style 45x45 thin-line icons matching fairtradedata.org */
function FeatureIcon({ kind }: { kind: "shield" | "nft" | "key" | "bars" }) {
  if (kind === "shield") {
    return (
      <svg className="ftd-feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M24 5.5L39 11.2V22.4C39 32.3 32.5 39.7 24 43C15.5 39.7 9 32.3 9 22.4V11.2L24 5.5Z" />
      </svg>
    );
  }
  if (kind === "nft") {
    return (
      <svg className="ftd-feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M24 4.5L40.5 14V34L24 43.5L7.5 34V14L24 4.5Z" />
        <text x="24" y="27.5" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="Source Sans 3, sans-serif" fontWeight="600" fontSize="11.5" letterSpacing="0.5">
          NFT
        </text>
      </svg>
    );
  }
  if (kind === "key") {
    return (
      <svg className="ftd-feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="30" cy="18" r="9.5" />
        <circle cx="32.5" cy="15.5" r="2" fill="currentColor" stroke="none" />
        <path d="M23 25L9 39V43H15V39H19V35H23L25.5 32.5" />
      </svg>
    );
  }
  return (
    <svg className="ftd-feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="25" width="7" height="16" rx="1.8" />
      <rect x="20.5" y="9" width="7" height="32" rx="1.8" />
      <rect x="33" y="17" width="7" height="24" rx="1.8" />
    </svg>
  );
}

/** Exact Gamma scroll-reveal wrapper: opacity 0->1, translateY(20px)->0 over 1s cubic-bezier(0.22, 1, 0.36, 1) */
function Reveal({
  children,
  className = "",
  staggerIndex,
}: {
  children: React.ReactNode;
  className?: string;
  staggerIndex?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -30px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const style =
    staggerIndex !== undefined
      ? ({ ["--stagger-index" as string]: staggerIndex } as React.CSSProperties)
      : undefined;

  return (
    <div
      ref={ref}
      style={style}
      className={`ftd-reveal ${staggerIndex !== undefined ? "ftd-stagger" : ""} ${
        visible ? "is-visible" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<ViewMode>("home");
  const [openFaqs, setOpenFaqs] = useState<Record<number, boolean>>({});
  const [optInModal, setOptInModal] = useState<null | "optin" | "refer">(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // Live node & Solana state
  const [nodeUrl, setNodeUrl] = useState(DEFAULT_NODE_URL);
  const [nodeOnline, setNodeOnline] = useState(false);
  const [defradbConnected, setDefradbConnected] = useState(false);
  const [solanaWallet, setSolanaWallet] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>(DEMO_DEPLOYMENTS);
  const [unions, setUnions] = useState<DataUnion[]>(DEMO_UNIONS);
  const [offers, setOffers] = useState<MarketOffer[]>(DEMO_OFFERS);

  // Mobile node modal state
  const [optInAddress, setOptInAddress] = useState("");
  const [referralCode, setReferralCode] = useState("");

  // Developer / SLS Dashboard & Website Onboarding state
  const [selectedDepId, setSelectedDepId] = useState<string>(DEMO_DEPLOYMENTS[0].id);
  const [flagBits, setFlagBits] = useState<number[]>([0, 1, 2]);
  const [merkleRoot, setMerkleRoot] = useState<string>("Connect ftdp-node for live committed root");
  const [eventTopic, setEventTopic] = useState<string>("fair-trade-data");
  const [domainInput, setDomainInput] = useState<string>("your-site.com");
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [activeDomain, setActiveDomain] = useState<DomainRecord | null>(null);
  const [autoCapture, setAutoCapture] = useState({
    pageViews: true,
    forms: true,
    clicks: true,
    cookies: true,
    scrollDepth: true,
  });
  const [meterResult, setMeterResult] = useState<Record<string, unknown> | null>(null);

  const activeFlagMask = useMemo(
    () => flagBits.reduce((acc, b) => acc | (1n << BigInt(b)), 0n),
    [flagBits]
  );

  function notify(text: string, isError = false) {
    setStatusMsg({ text, isError });
  }

  async function refreshFromNode() {
    const clean = nodeUrl.replace(/\/+$/, "");
    try {
      const healthRes = await fetch(`${clean}/health`);
      if (!healthRes.ok) throw new Error("offline");
      const health = (await healthRes.json()) as { defradbConnected?: boolean };
      setNodeOnline(true);
      setDefradbConnected(Boolean(health.defradbConnected));

      const [depRes, unionRes] = await Promise.all([
        fetch(`${clean}/api/v1/deployments`).then((r) => r.json()),
        fetch(`${clean}/api/v1/unions`).then((r) => r.json()),
      ]);
      if (Array.isArray(depRes.data) && depRes.data.length > 0) {
        setDeployments(depRes.data);
        setSelectedDepId(depRes.data[0].id);
      }
      if (Array.isArray(unionRes.data) && unionRes.data.length > 0) {
        setUnions([...DEMO_UNIONS, ...unionRes.data.filter((u: DataUnion) => !DEMO_UNIONS.some((d) => d.id === u.id))]);
      }
    } catch {
      setNodeOnline(false);
      setDefradbConnected(false);
    }
  }

  useEffect(() => {
    refreshFromNode();
  }, [nodeUrl]);

  useEffect(() => {
    if (!nodeOnline || !selectedDepId) return;
    const clean = nodeUrl.replace(/\/+$/, "");
    fetch(`${clean}/api/v1/deployments/${encodeURIComponent(selectedDepId)}/merkle/root`)
      .then((r) => r.json())
      .then((d) => {
        if (d.merkleRoot) setMerkleRoot(`${d.merkleRoot} (${d.leafCount} leaves)`);
      })
      .catch(() => {});

    fetch(`${clean}/api/v1/deployments/${encodeURIComponent(selectedDepId)}/domains`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.data)) {
          setDomains(d.data);
          setActiveDomain(d.data[0] || null);
        }
      })
      .catch(() => {});
  }, [nodeOnline, selectedDepId, nodeUrl]);

  async function connectSolanaWallet() {
    const sol = (
      window as unknown as {
        solana?: { connect: () => Promise<{ publicKey: { toString: () => string } }> };
      }
    ).solana;
    if (!sol) {
      notify("No Solana wallet detected. Install Phantom or Solflare to connect on Solana Devnet.", true);
      return;
    }
    try {
      const res = await sol.connect();
      const pubkey = res.publicKey.toString();
      setSolanaWallet(pubkey);
      setOptInAddress(pubkey);
      notify(`Connected Solana wallet ${pubkey.slice(0, 6)}...${pubkey.slice(-4)}`);
    } catch (err) {
      notify(`Solana wallet connection cancelled: ${String(err)}`, true);
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`Copied ${label} to clipboard.`);
    } catch {
      notify(`Select and copy ${label} manually.`, true);
    }
  }

  function submitOptIn(e: React.FormEvent) {
    e.preventDefault();
    const id = (optInAddress || solanaWallet).trim();
    if (!id) {
      notify("Enter your Solana wallet address or email to opt in.", true);
      return;
    }
    const code = "FTD-" + ethers.keccak256(ethers.toUtf8Bytes(id)).slice(2, 10).toUpperCase();
    setReferralCode(code);
    notify(`Opt-in confirmed! Your referral code is ${code}.`);
  }

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
      notify("Enter a valid domain name (e.g. app.example.com).", true);
      return;
    }
    const clean = nodeUrl.replace(/\/+$/, "");
    try {
      const res = await fetch(`${clean}/api/v1/deployments/${encodeURIComponent(selectedDepId)}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: cleaned }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to create DNS TXT challenge");
      const rec = payload.data as DomainRecord;
      setDomains((prev) => [rec, ...prev.filter((d) => d.domain !== rec.domain)]);
      setActiveDomain(rec);
      notify(`DNS TXT record ready: add ${rec.txtValue} at ${rec.txtHost}`);
    } catch (err) {
      notify(String(err), true);
    }
  }

  async function verifyDomainChallenge(targetDomain: string) {
    const clean = nodeUrl.replace(/\/+$/, "");
    try {
      const res = await fetch(
        `${clean}/api/v1/deployments/${encodeURIComponent(selectedDepId)}/domains/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: targetDomain }),
        }
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "DNS TXT record not found yet");
      const rec = payload.data as DomainRecord;
      setDomains((prev) => prev.map((d) => (d.domain === rec.domain ? rec : d)));
      setActiveDomain(rec);
      notify(`Verified ${rec.domain} via ${payload.matchedHost || rec.txtHost}!`);
    } catch (err) {
      notify(String(err), true);
    }
  }

  async function emitSampleRecord() {
    const clean = nodeUrl.replace(/\/+$/, "");
    try {
      const uidHash = ethers.keccak256(ethers.toUtf8Bytes(`portal:${solanaWallet || "demo-user"}`));
      const res = await fetch(`${clean}/v1/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: {
            recordId: `ftdp-${Date.now()}`,
            deploymentId: selectedDepId,
            uidHash,
            schemaVersion: "1.0.0",
            timestamp: Math.floor(Date.now() / 1000),
            source: "webSdk",
          },
          flags: activeFlagMask.toString(),
          anon: {
            event: "producer_signal",
            topic: eventTopic,
            contributorSolanaWallet: solanaWallet || SOLANA_DEVNET_PROGRAMS.deployer,
          },
          pii: { hint: "aes-256-gcm-encrypted-in-defradb-pii-vault" },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingest failed");
      setMerkleRoot(`${data.merkleRoot} (${data.leafCount} leaves)`);
      notify(
        data.defraDocId
          ? `Committed live to Source Network defradb.rs (${data.defraDocId})!`
          : `Ingested record ${data.recordId} and updated Merkle root!`
      );
    } catch (err) {
      notify(String(err), true);
    }
  }

  async function runUnionMetering(unionId: string) {
    const clean = nodeUrl.replace(/\/+$/, "");
    try {
      const res = await fetch(`${clean}/api/v1/unions/${encodeURIComponent(unionId)}/meter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiredFlags: "2" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMeterResult({
          unionId,
          chainMode: "solana",
          cluster: "devnet",
          programId: SOLANA_DEVNET_PROGRAMS.adminUnion.programId,
          solanaUpdates: [
            { shareholder: solanaWallet || SOLANA_DEVNET_PROGRAMS.deployer, shares: "1000" },
          ],
        });
        notify(`Previewed Solana Devnet metering for ${unionId}.`);
        return;
      }
      setMeterResult(data);
      notify(`Metered ${data.totalConsentedRecords} consented records for ${unionId}.`);
    } catch (err) {
      notify(String(err), true);
    }
  }

  function jumpToSection(sectionId: string) {
    if (view !== "home") {
      setView("home");
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      }, 60);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
    }
  }

  const cleanNodeUrl = nodeUrl.replace(/\/+$/, "");
  const snippetHost =
    typeof window !== "undefined" && window.location.origin.startsWith("http")
      ? window.location.origin
      : "https://fairtradedata.xyz";

  const snippetCode = `<!-- Paste inside <head> after verifying DNS TXT ownership -->
<script src="${snippetHost}/sdk/ftdp-snippet.js"></script>
<script>
  FTDP.init({
    endpoint: "${cleanNodeUrl}",
    deploymentId: "${selectedDepId}",
    namespace: "${activeDomain?.domain || "your-site.com"}",
    consentFlags: "${activeFlagMask.toString()}", // set after user opt-in
    contributorSolanaWallet: currentUser?.solanaWallet || "",
    autoCapture: {
      pageViews: ${autoCapture.pageViews},
      forms: ${autoCapture.forms},
      clicks: ${autoCapture.clicks},
      cookies: ${autoCapture.cookies},
      scrollDepth: ${autoCapture.scrollDepth}
    },
    allowedCookies: ["theme", "locale"] // passwords, CVV & auth cookies are hard-blocked
  });
</script>`;

  return (
    <>
      {/* ==================== TOP NAVBAR (Exact 75px Gamma Bar) ==================== */}
      <header className="ftd-navbar">
        <div className="ftd-navbar-inner">
          <button
            type="button"
            className="ftd-logo-btn"
            aria-label="Fair Trade Data Foundation Home"
            onClick={() => {
              setView("home");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <img src="/images/hero-logo.png" alt="Fair Trade Data Foundation" className="ftd-logo-img" />
          </button>

          <nav className="ftd-nav-actions" aria-label="Protocol navigation">
            <button
              type="button"
              className={`ftd-nav-link ${view === "home" ? "active" : ""}`}
              onClick={() => setView("home")}
            >
              Home
            </button>
            <button
              type="button"
              className={`ftd-nav-link ${view === "developers" ? "active" : ""}`}
              onClick={() => setView("developers")}
            >
              Developers &amp; Snippet
            </button>
            <button
              type="button"
              className={`ftd-nav-link ${view === "unions" ? "active" : ""}`}
              onClick={() => setView("unions")}
            >
              Solana Data Unions
            </button>
            <button
              type="button"
              className="ftd-btn ftd-btn-outline ftd-btn-sm"
              onClick={connectSolanaWallet}
            >
              {solanaWallet ? `SOL ${solanaWallet.slice(0, 4)}...${solanaWallet.slice(-4)}` : "Connect Solana"}
            </button>
          </nav>
        </div>
      </header>

      {/* ==================== HOME VIEW (Exact 7-Section Clone of fairtradedata.org) ==================== */}
      {view === "home" && (
        <main>
          {/* SECTION 1: HERO (Light #FFFCF5) */}
          <section id="home" className="ftd-section ftd-section-light">
            <div className="ftd-container">
              <div className="ftd-hero-grid">
                <Reveal className="ftd-hero-copy">
                  <h1 className="ftd-hero-title">
                    Fair Trade Data
                    <br />
                    Foundation
                  </h1>
                  <p>
                    The Fair Trade Data Foundation aims to develop a protocol that enables the
                    ethical and equitable exchange of data, creating a transparent mechanism for
                    tracking data production, consumption, and monetization across humans, bots,
                    advertisers, and enterprises
                  </p>
                  <p>
                    The FTD token transforms enterprise grade consumer data into a community-owned
                    digital asset, offering both privacy and transparency to previously opaque data
                    marketplaces
                  </p>
                  <div className="ftd-btn-group">
                    <button
                      type="button"
                      className="ftd-btn ftd-btn-primary"
                      onClick={() => setOptInModal("optin")}
                    >
                      Join the FTD Community
                    </button>
                    <button
                      type="button"
                      className="ftd-btn ftd-btn-outline"
                      onClick={() => {
                        setView("developers");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      For Developers
                    </button>
                  </div>
                </Reveal>

                <Reveal staggerIndex={1}>
                  <div className="ftd-hero-visual">
                    <img
                      src="/images/hero-logo.png"
                      alt=""
                      aria-hidden="true"
                      className="ftd-hero-blur-bg"
                    />
                    <img
                      src="/images/hero-logo.png"
                      alt="Fair Trade Data Foundation Emblem"
                      className="ftd-hero-logo-fg"
                    />
                  </div>
                </Reveal>
              </div>
            </div>
          </section>

          {/* SECTION 2: TRANSPARENCY & SECURITY FEATURES (Light #FFFCF5) */}
          <section id="features" className="ftd-section ftd-section-light">
            <div className="ftd-container">
              <div className="ftd-features-grid">
                <Reveal>
                  <img
                    src="/images/features-servers.png"
                    alt="Secure Distributed Data Infrastructure"
                    className="ftd-features-photo"
                  />
                </Reveal>

                <div>
                  <Reveal>
                    <h1 className="ftd-section-title">
                      Transparency and Security for Consumer Data
                    </h1>
                  </Reveal>

                  <div className="ftd-features-cards">
                    <Reveal staggerIndex={0} className="ftd-feature-item">
                      <FeatureIcon kind="shield" />
                      <h4>Futureproof Data Protections</h4>
                      <p>Cutting edge cryptography keeps your customer information secure</p>
                    </Reveal>

                    <Reveal staggerIndex={1} className="ftd-feature-item">
                      <FeatureIcon kind="nft" />
                      <h4>Traditional Web + Distributed Ledger Technology</h4>
                      <p>Immutable data records , trustless data unions</p>
                    </Reveal>

                    <Reveal staggerIndex={2} className="ftd-feature-item">
                      <FeatureIcon kind="key" />
                      <h4>Granular Access Controls</h4>
                      <p>Manage your data sharing preferences with precision</p>
                    </Reveal>

                    <Reveal staggerIndex={3} className="ftd-feature-item">
                      <FeatureIcon kind="bars" />
                      <h4>Real-time Data Unions</h4>
                      <p>Track your data&apos;s impact and value in real time</p>
                    </Reveal>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: MOBILE NODE CTA BANNER (Light #FFFCF5) */}
          <section id="community" className="ftd-section ftd-section-light">
            <div className="ftd-container ftd-cta-section">
              <Reveal>
                <h1 className="ftd-cta-title">
                  Opt In to the FTD Mobile Node Program to Fight Spam and Prevent Data Abuse
                </h1>
                <div className="ftd-btn-group centered">
                  <button
                    type="button"
                    className="ftd-btn ftd-btn-primary"
                    onClick={() => setOptInModal("optin")}
                  >
                    Opt-In
                  </button>
                  <button
                    type="button"
                    className="ftd-btn ftd-btn-outline"
                    onClick={() => setOptInModal("refer")}
                  >
                    Refer a Friend
                  </button>
                </div>
              </Reveal>
            </div>
          </section>

          {/* SECTION 4: WHY FAIR TRADE DATA + COLLAPSIBLE FAQ (Dark #2B4150) */}
          <section id="why" className="ftd-section ftd-section-dark">
            <div className="ftd-container">
              <Reveal className="ftd-why-copy">
                <h1 className="ftd-section-title">Why Fair Trade Data ?</h1>
                <p>
                  Data lakes currently generate billions for a small number of tech companies
                  without direct producer benefit. Personal information is bought and sold without
                  clear consent or understanding, and the practices of most data marketplaces are
                  opaque. Fair Trade Data Protocol creates a model where data transactions have
                  provenance , and data producers are incentivized to pool their digital
                  interactions for shared intelligence.
                </p>
                <p>
                  The key paradigm shift in today&apos;s data markets is that big data is evolving
                  from a private corporate asset to a community-owned resource, potentially
                  redistributing significant digital economic power. Our work at FTDF establishes
                  standards that prioritize data producer rights over unchecked data brokers ,
                  centralized intermediaries , and other grey market actors in the big data
                  ecosystem.
                </p>

                <div className="ftd-faq-list">
                  {FAQ_ITEMS.map((item, idx) => {
                    const isOpen = Boolean(openFaqs[idx]);
                    return (
                      <div key={item.q} className="ftd-faq-item" data-open={isOpen ? "true" : "false"}>
                        <button
                          type="button"
                          className="ftd-faq-trigger"
                          aria-expanded={isOpen}
                          onClick={() =>
                            setOpenFaqs((prev) => ({ ...prev, [idx]: !prev[idx] }))
                          }
                        >
                          <svg className="ftd-faq-triangle" viewBox="0 0 12 12" aria-hidden="true">
                            <path d="M3 1.5L10 6L3 10.5Z" />
                          </svg>
                          <span>{item.q}</span>
                        </button>
                        <div className="ftd-faq-panel">
                          <div className="ftd-faq-panel-inner">
                            <div className="ftd-faq-answer">{item.a}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Reveal>
            </div>
          </section>

          {/* SECTION 5: FTD USER ROADMAP (Light #FFFCF5 + Watermark Veil + Interlocking Chevrons) */}
          <section id="roadmap" className="ftd-section ftd-section-light ftd-roadmap-section">
            <img
              src="/images/roadmap-bg.png"
              alt=""
              aria-hidden="true"
              className="ftd-roadmap-bg-img"
            />
            <div className="ftd-roadmap-veil" aria-hidden="true" />
            <div className="ftd-container">
              <Reveal>
                <h1 className="ftd-section-title">FTD User Roadmap</h1>
              </Reveal>

              <div className="ftd-roadmap-steps">
                {ROADMAP_STEPS.map((step, idx) => (
                  <Reveal key={step.num} staggerIndex={idx} className="ftd-roadmap-cell">
                    <div className="ftd-chevron-wrap">
                      <svg
                        className="ftd-chevron-svg"
                        viewBox="0 0 258.75 72"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M 240.75 0 L 258.75 36 L 240.75 72 L 0 72 L 18 36 L 0 0 Z"
                          fill="#F3EEE3"
                        />
                      </svg>
                      <span className="ftd-chevron-num">{step.num}</span>
                    </div>
                    <h4>{step.title}</h4>
                    <p>{step.desc}</p>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* SECTION 6: COMMUNITY DRIVEN MARKETPLACES (Light #FFFCF5) */}
          <section id="marketplaces" className="ftd-section ftd-section-light">
            <div className="ftd-container">
              <Reveal>
                <h1 className="ftd-section-title">
                  Community Driven Fair Trade Data Marketplaces
                </h1>
              </Reveal>

              <div className="ftd-market-grid">
                {MARKETPLACE_CARDS.map((card, idx) => (
                  <Reveal key={card.title} staggerIndex={idx}>
                    <button
                      type="button"
                      className="ftd-market-card"
                      onClick={() => {
                        setView("unions");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <div className="ftd-market-img-wrap">
                        <img src={card.image} alt={card.alt} className="ftd-market-img" />
                      </div>
                      <h4>{card.title}</h4>
                    </button>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        </main>
      )}

      {/* ==================== DEVELOPERS & WEBSITE ONBOARDING VIEW ==================== */}
      {view === "developers" && (
        <main className="ftd-section ftd-section-light ftd-portal-panel">
          <div className="ftd-container">
            <div className="ftd-row ftd-between" style={{ marginBottom: "1.4em" }}>
              <div>
                <div className="ftd-row" style={{ marginBottom: "0.4em" }}>
                  <span className={`ftd-badge ${nodeOnline ? "live" : ""}`}>
                    {nodeOnline ? "FTDP Node Live" : "Node Offline"}
                  </span>
                  <span className={`ftd-badge ${defradbConnected ? "live" : ""}`}>
                    {defradbConnected ? "Source Network defradb.rs Connected" : "Local Store Mode"}
                  </span>
                  <span className="ftd-badge solana">Solana Devnet Live</span>
                </div>
                <h1 className="ftd-section-title" style={{ marginBottom: "0.2em" }}>
                  Developers &amp; Website Onboarding
                </h1>
                <p style={{ marginBottom: 0 }}>
                  Verify domain ownership via DNS TXT, paste one <code>&lt;head&gt;</code> snippet,
                  and stream consent-segregated records into Source Network <code>defradb.rs</code>{" "}
                  and Solana Data Unions.
                </p>
              </div>
              <div className="ftd-row">
                <a className="ftd-btn ftd-btn-outline ftd-btn-sm" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  GitHub Repo
                </a>
                <button type="button" className="ftd-btn ftd-btn-primary ftd-btn-sm" onClick={() => setView("home")}>
                  Back to Home
                </button>
              </div>
            </div>

            <div className="ftd-grid-2">
              {/* Left: Domain DNS TXT Onboarding */}
              <div className="ftd-card-box">
                <h3 style={{ marginBottom: "0.35em" }}>1. Verify Domain Ownership (DNS TXT)</h3>
                <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)" }}>
                  Locks browser <code>Origin</code> ingestion so only your verified domain(s) can
                  stream records into this deployment.
                </p>

                <div className="ftd-sub-box" style={{ marginBottom: "1em" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--ftd-text-light-muted)" }}>Active FTDP Node Endpoint</div>
                  <div className="ftd-row" style={{ marginTop: "0.4em" }}>
                    <input
                      className="ftd-input"
                      value={nodeUrl}
                      onChange={(e) => setNodeUrl(e.target.value)}
                      style={{ flex: 1, minWidth: 200 }}
                    />
                    <button type="button" className="ftd-btn ftd-btn-outline ftd-btn-sm" onClick={refreshFromNode}>
                      Reconnect
                    </button>
                  </div>
                </div>

                <form onSubmit={registerDomainChallenge} className="ftd-row" style={{ marginBottom: "1em" }}>
                  <input
                    className="ftd-input"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder="example.com"
                    style={{ flex: 1, minWidth: 180 }}
                  />
                  <button type="submit" className="ftd-btn ftd-btn-primary ftd-btn-sm">
                    Generate DNS TXT
                  </button>
                </form>

                {domains.length > 0 && (
                  <div className="ftd-row" style={{ marginBottom: "0.9em" }}>
                    {domains.map((d) => (
                      <button
                        key={d.domain}
                        type="button"
                        className={`ftd-btn ftd-btn-sm ${
                          activeDomain?.domain === d.domain ? "ftd-btn-primary" : "ftd-btn-outline"
                        }`}
                        onClick={() => setActiveDomain(d)}
                      >
                        {d.domain} {d.verified ? "✓" : "•"}
                      </button>
                    ))}
                  </div>
                )}

                {activeDomain && (
                  <div className="ftd-sub-box">
                    <div style={{ fontSize: "0.78rem", color: "var(--ftd-text-light-muted)" }}>
                      TXT Host (or apex {activeDomain.domain})
                    </div>
                    <div className="mono" style={{ fontSize: "0.84rem", color: "var(--ftd-heading-light)", marginBottom: "0.5em" }}>
                      {activeDomain.txtHost}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--ftd-text-light-muted)" }}>TXT Value</div>
                    <div className="mono" style={{ fontSize: "0.82rem", wordBreak: "break-all", marginBottom: "0.75em" }}>
                      {activeDomain.txtValue}
                    </div>
                    <div className="ftd-row">
                      <button
                        type="button"
                        className="ftd-btn ftd-btn-outline ftd-btn-sm"
                        onClick={() => copyText("DNS TXT value", activeDomain.txtValue)}
                      >
                        Copy TXT Value
                      </button>
                      <button
                        type="button"
                        className="ftd-btn ftd-btn-primary ftd-btn-sm"
                        onClick={() => verifyDomainChallenge(activeDomain.domain)}
                      >
                        {activeDomain.verified ? "Verified ✓ (Re-Check)" : "Verify DNS TXT"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Consent Flags + Live Ingestion */}
              <div className="ftd-card-box">
                <h3 style={{ marginBottom: "0.35em" }}>2. Consent Flags &amp; Live DefraDB Ingest</h3>
                <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)" }}>
                  Test live ingestion directly into Railway <code>ftdp-node</code> + Source Network{" "}
                  <code>defradb.rs</code>.
                </p>

                <div style={{ marginBottom: "0.9em" }}>
                  <select
                    className="ftd-input"
                    style={{ width: "100%" }}
                    value={selectedDepId}
                    onChange={(e) => setSelectedDepId(e.target.value)}
                  >
                    {deployments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.id.slice(0, 12)}...)
                      </option>
                    ))}
                  </select>
                </div>

                {CONSENT_FLAGS.map((f) => {
                  const checked = flagBits.includes(f.bit);
                  return (
                    <label key={f.bit} className="ftd-flag-row">
                      <div>
                        <strong style={{ fontSize: "0.9rem" }}>
                          Bit {f.bit}: {f.label}
                        </strong>
                        <div style={{ fontSize: "0.78rem", color: "var(--ftd-text-light-muted)" }}>{f.desc}</div>
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

                <div className="ftd-row ftd-between" style={{ marginTop: "0.9em" }}>
                  <span className="mono" style={{ fontSize: "0.85rem" }}>
                    Mask: <strong>{activeFlagMask.toString()}</strong>
                  </span>
                  <div className="ftd-row">
                    <input
                      className="ftd-input"
                      value={eventTopic}
                      onChange={(e) => setEventTopic(e.target.value)}
                      style={{ width: 150 }}
                    />
                    <button type="button" className="ftd-btn ftd-btn-primary ftd-btn-sm" onClick={emitSampleRecord}>
                      Emit Live Record
                    </button>
                  </div>
                </div>

                <div className="ftd-sub-box" style={{ marginTop: "0.9em" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--ftd-text-light-muted)" }}>Opt-In Merkle Root</div>
                  <div className="mono" style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>
                    {merkleRoot}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Auto-Capture <head> Snippet */}
            <div className="ftd-card-box" style={{ marginTop: "1.4em" }}>
              <div className="ftd-row ftd-between">
                <div>
                  <h3 style={{ marginBottom: "0.2em" }}>3. Paste Auto-Capture &lt;head&gt; Snippet</h3>
                  <p style={{ fontSize: "0.88rem", color: "var(--ftd-text-light-muted)", marginBottom: "0.6em" }}>
                    Passwords, CVV/card/SSN inputs, and auth/session/JWT cookies are hard-blocked.
                    Email/name/phone/address fields auto-route into the AES-256-GCM encrypted{" "}
                    <code>pii</code> vault.
                  </p>
                </div>
                <button
                  type="button"
                  className="ftd-btn ftd-btn-primary ftd-btn-sm"
                  onClick={() => copyText("HTML <head> snippet", snippetCode)}
                >
                  Copy Snippet
                </button>
              </div>

              <div className="ftd-row" style={{ gap: "1em" }}>
                {(
                  [
                    ["pageViews", "Page Views & UTM"],
                    ["forms", "Form Submissions"],
                    ["clicks", "UI Clicks"],
                    ["cookies", "Safe Cookie Meta"],
                    ["scrollDepth", "Scroll Depth"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="ftd-row" style={{ fontSize: "0.88rem", cursor: "pointer" }}>
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
              <pre className="ftd-code">{snippetCode}</pre>
            </div>
          </div>
        </main>
      )}

      {/* ==================== LIVE SOLANA DEVNET DATA UNIONS & MARKETPLACES VIEW ==================== */}
      {view === "unions" && (
        <main className="ftd-section ftd-section-light ftd-portal-panel">
          <div className="ftd-container">
            <div className="ftd-row ftd-between" style={{ marginBottom: "1.4em" }}>
              <div>
                <div className="ftd-row" style={{ marginBottom: "0.4em" }}>
                  <span className="ftd-badge live">Solana Devnet Live</span>
                  <span className="ftd-badge">Checked u128 Fixed-Point RPS (1e18)</span>
                </div>
                <h1 className="ftd-section-title" style={{ marginBottom: "0.2em" }}>
                  Solana Data Unions &amp; Marketplaces
                </h1>
                <p style={{ marginBottom: 0 }}>
                  Standalone FTDP Anchor MultiSplitter Data Unions deployed on Solana Devnet with
                  O(1) constant-time revenue splitting.
                </p>
              </div>
              <button type="button" className="ftd-btn ftd-btn-primary ftd-btn-sm" onClick={() => setView("home")}>
                Back to Home
              </button>
            </div>

            <div className="ftd-grid-2" style={{ marginBottom: "1.4em" }}>
              <div className="ftd-card-box">
                <span className="ftd-badge live" style={{ marginBottom: "0.6em" }}>
                  Deployed on Solana Devnet • Anchor 0.30.1
                </span>
                <h3>FTDP Admin MultiSplitter Union</h3>
                <div className="ftd-sub-box mono" style={{ fontSize: "0.8rem", wordBreak: "break-all", marginBottom: "0.9em" }}>
                  <div>Program ID: {SOLANA_DEVNET_PROGRAMS.adminUnion.programId}</div>
                </div>
                <div className="ftd-row">
                  <a
                    className="ftd-btn ftd-btn-outline ftd-btn-sm"
                    href={SOLANA_DEVNET_PROGRAMS.adminUnion.solscanUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Solscan
                  </a>
                  <button
                    type="button"
                    className="ftd-btn ftd-btn-primary ftd-btn-sm"
                    onClick={() => runUnionMetering(unions[0]?.id || "ftdp-admin-data-union-devnet")}
                  >
                    Run Solana Metering
                  </button>
                </div>
              </div>

              <div className="ftd-card-box">
                <span className="ftd-badge live" style={{ marginBottom: "0.6em" }}>
                  Deployed on Solana Devnet • Anchor 0.32.1 Token-2022
                </span>
                <h3>FTDP SPL Transfer-Hook Union</h3>
                <div className="ftd-sub-box mono" style={{ fontSize: "0.8rem", wordBreak: "break-all", marginBottom: "0.9em" }}>
                  <div>Program ID: {SOLANA_DEVNET_PROGRAMS.splUnion.programId}</div>
                </div>
                <div className="ftd-row">
                  <a
                    className="ftd-btn ftd-btn-outline ftd-btn-sm"
                    href={SOLANA_DEVNET_PROGRAMS.splUnion.solscanUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Solscan
                  </a>
                  <button
                    type="button"
                    className="ftd-btn ftd-btn-primary ftd-btn-sm"
                    onClick={() => runUnionMetering(unions[1]?.id || "ftdp-spl-transfer-hook-union-devnet")}
                  >
                    Run Solana Metering
                  </button>
                </div>
              </div>
            </div>

            {meterResult && (
              <div className="ftd-card-box" style={{ marginBottom: "1.4em" }}>
                <h3>Latest Solana Metering Payload</h3>
                <pre className="ftd-code">{JSON.stringify(meterResult, null, 2)}</pre>
              </div>
            )}

            <div className="ftd-market-grid">
              {offers.map((offer, idx) => (
                <div key={offer.id} className="ftd-card-box">
                  <span className="ftd-badge" style={{ marginBottom: "0.6em" }}>
                    Marketplace #{idx + 1} • Flags {offer.requiredFlags}
                  </span>
                  <h4 style={{ fontSize: "1.1em", marginBottom: "0.4em" }}>{offer.title}</h4>
                  <p style={{ fontSize: "0.88rem", color: "var(--ftd-text-light-muted)" }}>
                    {offer.description}
                  </p>
                  <div className="ftd-sub-box mono" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
                    Solana Beneficiary: {offer.beneficiary}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* ==================== SECTION 7: FOOTER (Exact 3-Column Dark #2B4150) ==================== */}
      <footer id="contact" className="ftd-section ftd-section-dark">
        <div className="ftd-container">
          <div className="ftd-footer-grid">
            <Reveal className="ftd-footer-nav">
              <div className="ftd-footer-brand">Fair Trade Data Foundation</div>
              <button type="button" className="ftd-footer-link" onClick={() => jumpToSection("home")}>
                I home
              </button>
              <button type="button" className="ftd-footer-link" onClick={() => jumpToSection("roadmap")}>
                I roadmap
              </button>
              <button type="button" className="ftd-footer-link" onClick={() => jumpToSection("community")}>
                I community
              </button>
              <button
                type="button"
                className="ftd-footer-link"
                onClick={() => {
                  setView("developers");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                I contact us
              </button>
            </Reveal>

            <Reveal staggerIndex={1}>
              <p className="ftd-footer-mission">
                The Fair Trade Data Foundation aims to develop a protocol that enables the ethical
                and equitable exchange of data, creating a transparent mechanism for tracking data
                production, consumption, and monetization across humans, bots, advertisers, and
                enterprises
              </p>
            </Reveal>

            <Reveal staggerIndex={2} className="ftd-footer-emblem-wrap">
              <img
                src="/images/footer-emblem.webp"
                alt="Fair Trade Data Foundation Balance Scale Emblem"
                className="ftd-footer-emblem"
              />
            </Reveal>
          </div>
        </div>
      </footer>

      {/* ==================== MOBILE NODE OPT-IN / REFERRAL MODAL ==================== */}
      {optInModal && (
        <div className="ftd-modal-backdrop" onClick={() => setOptInModal(null)}>
          <div className="ftd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ftd-row ftd-between" style={{ marginBottom: "0.8em" }}>
              <h3 style={{ margin: 0 }}>
                {optInModal === "refer"
                  ? "Refer a Friend to FTD Mobile Nodes"
                  : "Opt In to the FTD Mobile Node Program"}
              </h3>
              <button
                type="button"
                className="ftd-btn ftd-btn-outline ftd-btn-sm"
                onClick={() => setOptInModal(null)}
              >
                Close
              </button>
            </div>
            <p style={{ fontSize: "0.92rem", color: "var(--ftd-text-light-muted)" }}>
              Connect your Solana wallet or enter an address/email to join the FTD Mobile Node
              network and generate your shareable referral link.
            </p>
            <form onSubmit={submitOptIn}>
              <div className="ftd-row" style={{ marginBottom: "0.9em" }}>
                <input
                  className="ftd-input"
                  value={optInAddress}
                  onChange={(e) => setOptInAddress(e.target.value)}
                  placeholder={solanaWallet || "Solana Wallet Address or Email"}
                  style={{ flex: 1, minWidth: 220 }}
                />
                <button type="submit" className="ftd-btn ftd-btn-primary ftd-btn-sm">
                  {optInModal === "refer" ? "Generate Referral" : "Confirm Opt-In"}
                </button>
              </div>
            </form>
            {referralCode && (
              <div className="ftd-sub-box">
                <div style={{ fontSize: "0.8rem", color: "var(--ftd-text-light-muted)" }}>
                  Your FTD Referral Link
                </div>
                <div className="mono" style={{ fontSize: "0.84rem", margin: "0.3em 0 0.6em" }}>
                  https://fairtradedata.xyz/?ref={referralCode}
                </div>
                <button
                  type="button"
                  className="ftd-btn ftd-btn-outline ftd-btn-sm"
                  onClick={() => copyText("referral link", `https://fairtradedata.xyz/?ref=${referralCode}`)}
                >
                  Copy Referral Link
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TOAST NOTIFICATION ==================== */}
      {statusMsg && (
        <div className={`ftd-status-toast ${statusMsg.isError ? "error" : ""}`}>
          <span>{statusMsg.text}</span>
          <button
            type="button"
            className="ftd-btn ftd-btn-dark-outline ftd-btn-sm"
            onClick={() => setStatusMsg(null)}
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
