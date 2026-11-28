import React, { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  DataUnion,
  DEMO_DEPLOYMENTS,
  DEMO_UNIONS,
  Deployment,
  SOLANA_DEVNET_PROGRAMS,
} from "./demoData";
import { FeatureIcon, ProtocolFlowDiagram } from "./components/Graphics";
import { LearnPages, LearnTopic } from "./components/LearnPages";
import { DeveloperHub, DomainRecord } from "./components/DeveloperHub";

type ViewMode = "home" | "learn" | "developers";

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
  {
    q: "Does Fair Trade Data ever capture or sell passwords, credit cards, or private emails?",
    a: "Never. Passwords, CVV/card numbers, SSNs, file inputs, and auth/session/JWT cookies are hard-blocked inside the browser before any request is sent. Personal fields like email or name are automatically encrypted per website with AES-256-GCM inside a local-only Source Network defradb.rs vault that buyers cannot read or replicate.",
  },
  {
    q: "How does a Data Union pay thousands of contributors without huge blockchain fees?",
    a: "FTDP uses Constant-Time MultiSplitter programs on Solana (live on Devnet using checked u128 fixed-point precision). Each contributor claims their exact share in one O(1) transaction regardless of how many thousands of members are in the union, with zero retroactive dilution for early contributors.",
  },
  {
    q: "Do I need to be a crypto developer to connect my website?",
    a: "No. Verify your domain with a single DNS TXT record and paste one <script> tag into your website's <head>. Everything else—consent segregation, privacy filtering, Source Network storage, and Data Union metering—runs automatically.",
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
    blurb: "Players pool opted-in match signals to train AI coaching agents and split licensing payouts.",
  },
  {
    image: "/images/market-streamy.webp",
    alt: "Fair Trade Data Ad Network + Video Streaming via Decentralized Storage",
    title: "Fair Trade Data Ad Network + Video Streaming via Decentralized Storage",
    blurb: "Consented video view receipts and ethical ad choices backed by Source Network defradb.rs.",
  },
  {
    image: "/images/market-ttn.png",
    alt: "Web 3 Native Discussion Boards for zk Voting + User Karma Data Unions via TTN",
    title: "Web 3 Native Discussion Boards for zk Voting + User Karma Data Unions via TTN",
    blurb: "Open discussion threads, star ratings, and portable user karma shared across apps.",
  },
];

/** Exact Gamma scroll-reveal physics: opacity 0->1, translateY(20px)->0 over 1s cubic-bezier(0.22, 1, 0.36, 1) */
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
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" }
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

/** Interactive Plain-English Privacy Firewall Sandbox ("Show, Don't Tell") */
function LivePrivacyFirewallWidget({ onOpenDevelopers }: { onOpenDevelopers: () => void }) {
  const [sampleEmail, setSampleEmail] = useState("alice@example.com");
  const [sampleTopic, setSampleTopic] = useState("ai-coaching");
  const [samplePlan, setSamplePlan] = useState("community-member");
  const [samplePassword, setSamplePassword] = useState("MySecretPassword!");
  const [sampleCvv, setSampleCvv] = useState("842");
  const [userConsented, setUserConsented] = useState(true);

  return (
    <section className="ftd-section ftd-sand-band">
      <div className="ftd-container">
        <Reveal>
          <div className="ftd-row ftd-between" style={{ marginBottom: "0.75em" }}>
            <div>
              <span className="ftd-badge live">Try It Live — Plain-English Privacy Firewall</span>
              <h2 style={{ fontSize: "2.05em", margin: "0.35em 0 0.25em", color: "var(--ftd-heading-light)" }}>
                See Exactly How FTDP Sorts &amp; Protects Form Data
              </h2>
              <p style={{ maxWidth: 740, marginBottom: 0 }}>
                Edit any field below to see what FTDP&apos;s <code>&lt;head&gt;</code> snippet does{" "}
                <em>before</em> a single byte leaves your visitor&apos;s browser.
              </p>
            </div>
            <label className="ftd-flag-row" style={{ marginBottom: 0 }}>
              <span style={{ fontSize: "0.86rem", fontWeight: 600 }}>Visitor Opted In (Consent = ON)</span>
              <input
                type="checkbox"
                checked={userConsented}
                onChange={(e) => setUserConsented(e.target.checked)}
              />
            </label>
          </div>

          <div className="ftd-card-box" style={{ marginBottom: "1em" }}>
            <div className="ftd-row" style={{ gap: "0.8em" }}>
              <label style={{ flex: 1, minWidth: 160, fontSize: "0.8rem" }}>
                Email (Personal Info)
                <input className="ftd-input" style={{ width: "100%", marginTop: 4 }} value={sampleEmail} onChange={(e) => setSampleEmail(e.target.value)} />
              </label>
              <label style={{ flex: 1, minWidth: 150, fontSize: "0.8rem" }}>
                Interest Topic (Non-PII)
                <input className="ftd-input" style={{ width: "100%", marginTop: 4 }} value={sampleTopic} onChange={(e) => setSampleTopic(e.target.value)} />
              </label>
              <label style={{ flex: 1, minWidth: 140, fontSize: "0.8rem" }}>
                Plan Tier (Non-PII)
                <input className="ftd-input" style={{ width: "100%", marginTop: 4 }} value={samplePlan} onChange={(e) => setSamplePlan(e.target.value)} />
              </label>
              <label style={{ flex: 1, minWidth: 140, fontSize: "0.8rem" }}>
                Password (Secret)
                <input className="ftd-input" type="password" style={{ width: "100%", marginTop: 4 }} value={samplePassword} onChange={(e) => setSamplePassword(e.target.value)} />
              </label>
              <label style={{ width: 100, fontSize: "0.8rem" }}>
                Card CVV
                <input className="ftd-input" style={{ width: "100%", marginTop: 4 }} value={sampleCvv} onChange={(e) => setSampleCvv(e.target.value)} />
              </label>
            </div>
          </div>

          <div className="ftd-firewall-grid">
            <div className="ftd-card-box">
              <span className="ftd-badge live">1. Anonymized Signal (Earns Rewards)</span>
              <p style={{ fontSize: "0.84rem", color: "var(--ftd-text-light-muted)", margin: "0.5em 0" }}>
                Pooled into the Data Union only when consent is ON. Zero personal identifiers.
              </p>
              <pre className="ftd-code">
                {userConsented
                  ? JSON.stringify(
                      {
                        event: "form_submit",
                        consentFlags: "7",
                        anon: { topic: sampleTopic, plan: samplePlan },
                      },
                      null,
                      2
                    )
                  : "// Consent is OFF — nothing is streamed."}
              </pre>
            </div>

            <div className="ftd-card-box">
              <span className="ftd-badge solana">2. Locked Personal Vault (AES-256-GCM)</span>
              <p style={{ fontSize: "0.84rem", color: "var(--ftd-text-light-muted)", margin: "0.5em 0" }}>
                Encrypted per website inside local <code>FtdpPiiVault</code>. Hard-blocked from buyers &amp; P2P sync.
              </p>
              <pre className="ftd-code">
                {userConsented
                  ? JSON.stringify(
                      {
                        collection: "FtdpPiiVault (Local Only)",
                        fields: ["email"],
                        ciphertext: "v1:aes256gcm:8f9c...e21a",
                      },
                      null,
                      2
                    )
                  : "// Consent is OFF — vault untouched."}
              </pre>
            </div>

            <div className="ftd-card-box">
              <span className="ftd-badge" style={{ background: "rgba(185, 28, 28, 0.1)", color: "#991b1b" }}>
                3. Hard-Blocked in Browser (Never Sent)
              </span>
              <p style={{ fontSize: "0.84rem", color: "var(--ftd-text-light-muted)", margin: "0.5em 0" }}>
                Passwords, payment cards, CVV, SSNs, and auth/session/JWT cookies are shredded locally.
              </p>
              <pre className="ftd-code">
                {JSON.stringify(
                  {
                    droppedFields: [
                      samplePassword ? "password (BLOCKED)" : null,
                      sampleCvv ? "cvv (BLOCKED)" : null,
                    ].filter(Boolean),
                    droppedCookies: ["session_id", "jwt", "csrf_token"],
                    bytesTransmitted: 0,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>

          <div className="ftd-btn-group" style={{ marginTop: "1.2em" }}>
            <button type="button" className="ftd-btn ftd-btn-primary ftd-btn-sm" onClick={onOpenDevelopers}>
              Generate This Snippet for Your Website →
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** Interactive Plain-English Economics Calculator (modeled after panoramaprotocol.com in FTDP's warm style) */
function DataEconomicsCalculator({ onOpenDataUnions }: { onOpenDataUnions: () => void }) {
  const [role, setRole] = useState<"publisher" | "buyer">("publisher");
  const [monthlyValue, setMonthlyValue] = useState(25000);

  const web2BrokerCut = Math.round(monthlyValue * 0.45);
  const web2UserShare = 0;
  const web2PublisherKeep = Math.round(monthlyValue * 0.55);

  const ftdCommunityShare = Math.round(monthlyValue * 0.95);
  const ftdTreasuryCut = Math.round(monthlyValue * 0.05);
  const recoveredValue = ftdCommunityShare - web2PublisherKeep;

  return (
    <section className="ftd-section ftd-section-light">
      <div className="ftd-container">
        <Reveal>
          <span className="ftd-badge">TRANSPARENT ECONOMICS</span>
          <h2 className="ftd-section-title" style={{ marginTop: "0.35em", marginBottom: "0.35em" }}>
            Where Does Data Licensing Value Actually Go?
          </h2>
          <p style={{ maxWidth: 760 }}>
            Today&apos;s data brokers quietly take 35%–50% while paying everyday contributors{" "}
            <strong>$0</strong>. Slide the monthly dataset value below to compare legacy brokers
            against an open Fair Trade Data Union on Solana.
          </p>

          <div className="ftd-row ftd-between" style={{ margin: "1.2em 0" }}>
            <div className="ftd-row">
              <button
                type="button"
                className={`ftd-btn ftd-btn-sm ${role === "publisher" ? "ftd-btn-primary" : "ftd-btn-outline"}`}
                onClick={() => setRole("publisher")}
              >
                I&apos;m a Publisher / Community
              </button>
              <button
                type="button"
                className={`ftd-btn ftd-btn-sm ${role === "buyer" ? "ftd-btn-primary" : "ftd-btn-outline"}`}
                onClick={() => setRole("buyer")}
              >
                I&apos;m an AI Lab / Data Buyer
              </button>
            </div>
            <div className="ftd-row" style={{ flex: 1, maxWidth: 420 }}>
              <span style={{ fontSize: "0.88rem", whiteSpace: "nowrap" }}>
                Monthly Dataset Budget: <strong className="mono">${monthlyValue.toLocaleString()}/mo</strong>
              </span>
              <input
                type="range"
                min={1000}
                max={100000}
                step={1000}
                value={monthlyValue}
                onChange={(e) => setMonthlyValue(Number(e.target.value))}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="ftd-grid-2">
            <div className="ftd-card-box">
              <span className="ftd-badge" style={{ background: "rgba(185, 28, 28, 0.1)", color: "#991b1b" }}>
                Legacy Data Brokers &amp; Scrapers
              </span>
              <div className="ftd-econ-metric" style={{ color: "#7f1d1d" }}>
                ~55% <span style={{ fontSize: "0.48em", fontFamily: "var(--ftd-font-body)" }}>reaches originators</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)" }}>
                {role === "publisher"
                  ? `Brokers & intermediaries extract ~$${web2BrokerCut.toLocaleString()}/mo; individual opted-in users receive $${web2UserShare}.`
                  : `You pay ~$${web2BrokerCut.toLocaleString()}/mo in opaque broker markups with zero cryptographic proof of user consent.`}
              </p>
              <div className="ftd-sub-box" style={{ fontSize: "0.84rem" }}>
                • Payout timing: Net-60 to Net-90 invoices + disputes<br />
                • Consent provenance: Unverifiable &ldquo;trust me&rdquo; PDFs<br />
                • PII liability: Raw personal data frequently commingled
              </div>
            </div>

            <div className="ftd-card-box" style={{ borderColor: "var(--ftd-accent)", borderWidth: 2 }}>
              <span className="ftd-badge live">Fair Trade Data Union (Solana O(1) Split)</span>
              <div className="ftd-econ-metric" style={{ color: "var(--ftd-heading-light)" }}>
                95% <span style={{ fontSize: "0.48em", fontFamily: "var(--ftd-font-body)" }}>direct to contributors &amp; apps</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)" }}>
                {role === "publisher"
                  ? `$${ftdCommunityShare.toLocaleString()}/mo flows directly to your app & contributors (+$${recoveredValue.toLocaleString()}/mo recovered), with $${ftdTreasuryCut.toLocaleString()}/mo (5%) funding open-source FTDF public goods.`
                  : `$${ftdCommunityShare.toLocaleString()}/mo goes straight to verified opted-in contributors & publishers with cryptographic Merkle consent proofs and zero PII exposure.`}
              </p>
              <div className="ftd-sub-box" style={{ fontSize: "0.84rem" }}>
                • Payout timing: Real-time on-chain O(1) claim anytime<br />
                • Consent provenance: Verifiable Merkle proof + Zanzibar ACP<br />
                • PII liability: Zero PII in buyer streams (strictly segregated)
              </div>
            </div>
          </div>

          <div className="ftd-btn-group" style={{ marginTop: "1.2em" }}>
            <button type="button" className="ftd-btn ftd-btn-outline ftd-btn-sm" onClick={onOpenDataUnions}>
              Try the Interactive O(1) Data Union Payout Simulator →
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<ViewMode>("home");
  const [learnTopic, setLearnTopic] = useState<LearnTopic>("how-it-works");
  const [learnMenuOpen, setLearnMenuOpen] = useState(false);
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

  // Mobile node modal state
  const [optInAddress, setOptInAddress] = useState("");
  const [referralCode, setReferralCode] = useState("");

  // Developer Hub & Website Onboarding state
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

  function notify(text: string, isError = false) {
    setStatusMsg({ text, isError });
  }

  function openLearn(topic: LearnTopic) {
    setLearnTopic(topic);
    setView("learn");
    setLearnMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openDevelopers() {
    setView("developers");
    setLearnMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    const activeMask = flagBits.reduce((acc, b) => acc | (1n << BigInt(b)), 0n);
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
          flags: activeMask.toString(),
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
    setLearnMenuOpen(false);
    if (view !== "home") {
      setView("home");
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      }, 60);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <>
      {/* ==================== TOP NAVBAR (Exact 75px Gamma Bar + Clean Learn Dropdown) ==================== */}
      <header className="ftd-navbar">
        <div className="ftd-navbar-inner">
          <button
            type="button"
            className="ftd-logo-btn"
            aria-label="Fair Trade Data Foundation Home"
            onClick={() => {
              setView("home");
              setLearnMenuOpen(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <img src="/images/hero-logo.png" alt="Fair Trade Data Foundation" className="ftd-logo-img" />
          </button>

          <nav className="ftd-nav-actions" aria-label="Primary navigation">
            <button
              type="button"
              className={`ftd-nav-link ${view === "home" ? "active" : ""}`}
              onClick={() => {
                setView("home");
                setLearnMenuOpen(false);
              }}
            >
              Home
            </button>

            <div className="ftd-dropdown">
              <button
                type="button"
                className={`ftd-nav-link ${view === "learn" && learnTopic !== "roadmap" ? "active" : ""}`}
                onClick={() => setLearnMenuOpen((o) => !o)}
              >
                Learn ▾
              </button>
              {learnMenuOpen && (
                <div className="ftd-dropdown-menu">
                  <button type="button" className="ftd-dropdown-item" onClick={() => openLearn("how-it-works")}>
                    <strong>How It Works (Plain English)</strong>
                    <span>Everyday analogy, 4-stage flow &amp; what changes</span>
                  </button>
                  <button type="button" className="ftd-dropdown-item" onClick={() => openLearn("data-unions")}>
                    <strong>Data Unions &amp; O(1) Payouts</strong>
                    <span>Solana Devnet programs + interactive split simulator</span>
                  </button>
                  <button type="button" className="ftd-dropdown-item" onClick={() => openLearn("privacy-defradb")}>
                    <strong>Privacy &amp; Source defradb.rs</strong>
                    <span>What&apos;s pooled vs. hard-blocked &amp; encrypted</span>
                  </button>
                  <button type="button" className="ftd-dropdown-item" onClick={() => openLearn("ecosystem")}>
                    <strong>Ecosystem &amp; Comment Protocol</strong>
                    <span>Gaming AI, Streamy video/ads &amp; TTN boards</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className={`ftd-nav-link ${view === "developers" ? "active" : ""}`}
              onClick={openDevelopers}
            >
              Developers &amp; API
            </button>

            <button
              type="button"
              className={`ftd-nav-link ${view === "learn" && learnTopic === "roadmap" ? "active" : ""}`}
              onClick={() => openLearn("roadmap")}
            >
              Roadmap
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

      {/* ==================== HOME VIEW (Exact 7-Section Clone + Plain-English Interactive Guides) ==================== */}
      {view === "home" && (
        <main onClick={() => learnMenuOpen && setLearnMenuOpen(false)}>
          {/* SECTION 1: HERO (Exact fairtradedata.org Light #FFFCF5) */}
          <section id="home" className="ftd-section ftd-section-light">
            <div className="ftd-container">
              <div className="ftd-hero-grid">
                <Reveal className="ftd-hero-copy">
                  <div className="ftd-hero-status-pill">
                    <span className="ftd-live-dot" />
                    <span>Live on Solana Devnet · Powered by Source Network defradb.rs</span>
                  </div>
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
                      onClick={openDevelopers}
                    >
                      For Developers
                    </button>
                    <button
                      type="button"
                      className="ftd-btn ftd-btn-outline"
                      onClick={() => openLearn("how-it-works")}
                    >
                      How It Works
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

          {/* SECTION 2: TRANSPARENCY & SECURITY FEATURES (Exact fairtradedata.org Light #FFFCF5) */}
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

          {/* SECTION 2B: INTERACTIVE PLAIN-ENGLISH PRIVACY FIREWALL SANDBOX */}
          <LivePrivacyFirewallWidget onOpenDevelopers={openDevelopers} />

          {/* SECTION 3: MOBILE NODE CTA BANNER (Exact fairtradedata.org Light #FFFCF5) */}
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

          {/* SECTION 4: WHY FAIR TRADE DATA + ANIMATED FAQ (Exact fairtradedata.org Dark #2B4150) */}
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

          {/* SECTION 4B: INTERACTIVE ECONOMICS COMPARISON CALCULATOR */}
          <DataEconomicsCalculator onOpenDataUnions={() => openLearn("data-unions")} />

          {/* SECTION 5: FTD USER ROADMAP (Exact fairtradedata.org Watermark + Chevrons) */}
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

          {/* SECTION 5B: VISUAL PROTOCOL ARCHITECTURE DIAGRAM (Dark #2B4150) */}
          <section className="ftd-section ftd-section-dark">
            <div className="ftd-container">
              <Reveal>
                <div className="ftd-row ftd-between" style={{ marginBottom: "1em" }}>
                  <div>
                    <span className="ftd-badge" style={{ background: "rgba(146,186,211,0.18)", color: "#92BAD3" }}>
                      HOW THE PROTOCOL WORKS UNDER THE HOOD
                    </span>
                    <h2 className="ftd-section-title" style={{ marginTop: "0.35em", marginBottom: "0.2em" }}>
                      Four Steps From Consent to Solana Payout
                    </h2>
                  </div>
                  <div className="ftd-row">
                    <button type="button" className="ftd-btn ftd-btn-dark-outline ftd-btn-sm" onClick={() => openLearn("privacy-defradb")}>
                      Privacy &amp; DefraDB Deep Dive
                    </button>
                    <button type="button" className="ftd-btn ftd-btn-primary ftd-btn-sm" onClick={openDevelopers}>
                      Open Developer Docs
                    </button>
                  </div>
                </div>
                <ProtocolFlowDiagram dark />
              </Reveal>
            </div>
          </section>

          {/* SECTION 6: COMMUNITY DRIVEN MARKETPLACES (Exact fairtradedata.org Light #FFFCF5) */}
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
                      onClick={() => openLearn("ecosystem")}
                    >
                      <div className="ftd-market-img-wrap">
                        <img src={card.image} alt={card.alt} className="ftd-market-img" />
                      </div>
                      <h4>{card.title}</h4>
                      <p style={{ fontSize: "0.88rem", color: "var(--ftd-text-light-muted)", marginTop: "0.45em", marginBottom: 0 }}>
                        {card.blurb}
                      </p>
                    </button>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        </main>
      )}

      {/* ==================== LEARN & ROADMAP PAGES ==================== */}
      {view === "learn" && (
        <div onClick={() => learnMenuOpen && setLearnMenuOpen(false)}>
          <LearnPages
            topic={learnTopic}
            onSelectTopic={(t) => {
              setLearnTopic(t);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onOpenDevelopers={openDevelopers}
            onOpenOptIn={() => setOptInModal("optin")}
          />
        </div>
      )}

      {/* ==================== DEVELOPER HUB & API DOCS ==================== */}
      {view === "developers" && (
        <div onClick={() => learnMenuOpen && setLearnMenuOpen(false)}>
          <DeveloperHub
            nodeUrl={nodeUrl}
            setNodeUrl={setNodeUrl}
            nodeOnline={nodeOnline}
            defradbConnected={defradbConnected}
            refreshFromNode={refreshFromNode}
            deployments={deployments}
            selectedDepId={selectedDepId}
            setSelectedDepId={setSelectedDepId}
            domains={domains}
            activeDomain={activeDomain}
            setActiveDomain={setActiveDomain}
            domainInput={domainInput}
            setDomainInput={setDomainInput}
            registerDomainChallenge={registerDomainChallenge}
            verifyDomainChallenge={verifyDomainChallenge}
            flagBits={flagBits}
            setFlagBits={setFlagBits}
            merkleRoot={merkleRoot}
            eventTopic={eventTopic}
            setEventTopic={setEventTopic}
            emitSampleRecord={emitSampleRecord}
            autoCapture={autoCapture}
            setAutoCapture={setAutoCapture}
            unions={unions}
            runUnionMetering={runUnionMetering}
            meterResult={meterResult}
            copyText={copyText}
            githubUrl={GITHUB_URL}
          />
        </div>
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
              <button type="button" className="ftd-footer-link" onClick={() => openLearn("how-it-works")}>
                I how it works
              </button>
              <button type="button" className="ftd-footer-link" onClick={() => openLearn("data-unions")}>
                I data unions
              </button>
              <button type="button" className="ftd-footer-link" onClick={() => openLearn("roadmap")}>
                I roadmap
              </button>
              <button type="button" className="ftd-footer-link" onClick={() => jumpToSection("community")}>
                I community
              </button>
              <button type="button" className="ftd-footer-link" onClick={openDevelopers}>
                I developer docs &amp; api
              </button>
              <a
                className="ftd-footer-link"
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "none" }}
              >
                I github (mit open source)
              </a>
            </Reveal>

            <Reveal staggerIndex={1}>
              <p className="ftd-footer-mission">
                The Fair Trade Data Foundation aims to develop a protocol that enables the ethical
                and equitable exchange of data, creating a transparent mechanism for tracking data
                production, consumption, and monetization across humans, bots, advertisers, and
                enterprises
              </p>
              <p style={{ fontSize: "0.78rem", color: "var(--ftd-text-dark-muted)", marginTop: "1.1em", marginBottom: 0 }}>
                Fair Trade Data Protocol · Standalone Solana MultiSplitter Data Unions · Open HTTP API · Source Network defradb.rs (Apache-2.0 / MIT) · Zero PII Shared
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
