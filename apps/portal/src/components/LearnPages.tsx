import React, { useState } from "react";
import { DataUnionCoopDiagram, ProtocolFlowDiagram } from "./Graphics";
import { SOLANA_DEVNET_PROGRAMS } from "../demoData";

export type LearnTopic = "how-it-works" | "data-unions" | "privacy-defradb" | "ecosystem" | "roadmap";

interface LearnProps {
  topic: LearnTopic;
  onSelectTopic: (t: LearnTopic) => void;
  onOpenDevelopers: () => void;
  onOpenOptIn: () => void;
}

const LEARN_TABS: Array<{ id: LearnTopic; label: string }> = [
  { id: "how-it-works", label: "How It Works" },
  { id: "data-unions", label: "Data Unions & Splits" },
  { id: "privacy-defradb", label: "Privacy & Source DefraDB" },
  { id: "ecosystem", label: "Ecosystem & Comment Protocol" },
  { id: "roadmap", label: "Delivery Roadmap" },
];

/** Interactive O(1) Constant-Time MultiSplitter Simulator (in layman's terms!) */
function MultiSplitterSimulator() {
  const [poolRevenue, setPoolRevenue] = useState(0);
  const [aliceShares, setAliceShares] = useState(500);
  const [bobShares, setBobShares] = useState(300);
  const [carolJoined, setCarolJoined] = useState(false);
  const [aliceAccrued, setAliceAccrued] = useState(0);
  const [bobAccrued, setBobAccrued] = useState(0);
  const [carolAccrued, setCarolAccrued] = useState(0);
  const [ftdfTreasury, setFtdfTreasury] = useState(0);
  const [claimedTotal, setClaimedTotal] = useState(0);
  const [log, setLog] = useState<string[]>([
    "Pool initialized with Alice (500 shares), Bob (300 shares), and 5% FTDF public-goods treasury.",
  ]);

  function dropPayment(amount: number) {
    const treasuryCut = amount * 0.05;
    const distributable = amount - treasuryCut;
    const totalShares = aliceShares + bobShares + (carolJoined ? 200 : 0);
    if (totalShares <= 0) return;
    const aGain = (distributable * aliceShares) / totalShares;
    const bGain = (distributable * bobShares) / totalShares;
    const cGain = carolJoined ? (distributable * 200) / totalShares : 0;

    setPoolRevenue((v) => v + amount);
    setFtdfTreasury((v) => v + treasuryCut);
    setAliceAccrued((v) => v + aGain);
    setBobAccrued((v) => v + bGain);
    setCarolAccrued((v) => v + cGain);
    setLog((prev) => [
      `Buyer licensed dataset for $${amount.toLocaleString()} USDC -> Alice +$${aGain.toFixed(2)}, Bob +$${bGain.toFixed(2)}${
        carolJoined ? `, Carol +$${cGain.toFixed(2)}` : ""
      }, FTDF +$${treasuryCut.toFixed(2)}.`,
      ...prev.slice(0, 4),
    ]);
  }

  function joinCarol() {
    if (carolJoined) return;
    setCarolJoined(true);
    setLog((prev) => [
      "Carol joined with 200 shares! Zero retroactive dilution: Alice & Bob keep 100% of past revenue; Carol earns on all future licenses.",
      ...prev.slice(0, 4),
    ]);
  }

  function claimAll() {
    const payout = aliceAccrued + bobAccrued + carolAccrued;
    if (payout <= 0) return;
    setClaimedTotal((v) => v + payout);
    setAliceAccrued(0);
    setBobAccrued(0);
    setCarolAccrued(0);
    setLog((prev) => [
      `Claimed $${payout.toFixed(2)} USDC in O(1) constant compute — zero loops over shareholders.`,
      ...prev.slice(0, 4),
    ]);
  }

  return (
    <div className="ftd-card-box" style={{ marginTop: "1.5em" }}>
      <div className="ftd-row ftd-between" style={{ marginBottom: "0.75em" }}>
        <div>
          <span className="ftd-badge solana">Interactive O(1) MultiSplitter Simulator</span>
          <h3 style={{ margin: "0.4em 0 0.2em" }}>Try a Data Union Payout Right Here</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)", marginBottom: 0 }}>
            Drop a buyer payment, add a late joiner (Carol), and verify that past contributors are
            never diluted.
          </p>
        </div>
        <div className="ftd-row">
          <button type="button" className="ftd-btn ftd-btn-primary ftd-btn-sm" onClick={() => dropPayment(10000)}>
            + Drop $10,000 License
          </button>
          <button
            type="button"
            className="ftd-btn ftd-btn-outline ftd-btn-sm"
            disabled={carolJoined}
            onClick={joinCarol}
          >
            {carolJoined ? "Carol Joined (200 shares)" : "+ Add Late Joiner (Carol)"}
          </button>
          <button type="button" className="ftd-btn ftd-btn-outline ftd-btn-sm" onClick={claimAll}>
            Claim All Payouts
          </button>
        </div>
      </div>

      <div className="ftd-grid-2" style={{ marginTop: "1em" }}>
        <div className="ftd-sub-box">
          <div className="ftd-row ftd-between" style={{ marginBottom: "0.6em" }}>
            <strong>Alice (Website Contributor)</strong>
            <span className="mono" style={{ color: "var(--ftd-heading-light)", fontWeight: 600 }}>
              Claimable: ${aliceAccrued.toFixed(2)}
            </span>
          </div>
          <label className="ftd-row" style={{ fontSize: "0.85rem" }}>
            <span>Shares: {aliceShares}</span>
            <input
              type="range"
              min={100}
              max={1000}
              step={50}
              value={aliceShares}
              onChange={(e) => setAliceShares(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </label>

          <div className="ftd-row ftd-between" style={{ margin: "0.9em 0 0.6em" }}>
            <strong>Bob (Mobile Node / Reader)</strong>
            <span className="mono" style={{ color: "var(--ftd-heading-light)", fontWeight: 600 }}>
              Claimable: ${bobAccrued.toFixed(2)}
            </span>
          </div>
          <label className="ftd-row" style={{ fontSize: "0.85rem" }}>
            <span>Shares: {bobShares}</span>
            <input
              type="range"
              min={100}
              max={1000}
              step={50}
              value={bobShares}
              onChange={(e) => setBobShares(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </label>

          {carolJoined && (
            <div className="ftd-row ftd-between" style={{ marginTop: "0.9em", paddingTop: "0.6em", borderTop: "1px solid var(--ftd-border-light)" }}>
              <strong>Carol (Late Joiner • 200 shares)</strong>
              <span className="mono" style={{ color: "#166534", fontWeight: 600 }}>
                Claimable: ${carolAccrued.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="ftd-sub-box">
          <div className="ftd-row ftd-between" style={{ marginBottom: "0.4em", fontSize: "0.9rem" }}>
            <span>Total Licensed Volume</span>
            <strong className="mono">${poolRevenue.toLocaleString()} USDC</strong>
          </div>
          <div className="ftd-row ftd-between" style={{ marginBottom: "0.4em", fontSize: "0.9rem" }}>
            <span>5% FTDF Public Goods Treasury</span>
            <strong className="mono">${ftdfTreasury.toFixed(2)} USDC</strong>
          </div>
          <div className="ftd-row ftd-between" style={{ marginBottom: "0.8em", fontSize: "0.9rem" }}>
            <span>Total Claimed by Contributors</span>
            <strong className="mono" style={{ color: "#166534" }}>${claimedTotal.toFixed(2)} USDC</strong>
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--ftd-text-light-muted)" }}>
            <strong>Ledger Event Log:</strong>
            {log.map((entry, idx) => (
              <div key={idx} style={{ marginTop: "0.35em" }}>
                • {entry}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LearnPages({ topic, onSelectTopic, onOpenDevelopers, onOpenOptIn }: LearnProps) {
  return (
    <main className="ftd-section ftd-section-light ftd-portal-panel">
      <div className="ftd-container">
        {/* Topic Sub-Navigation */}
        <div className="ftd-row" style={{ marginBottom: "1.6em", borderBottom: "1px solid var(--ftd-border-light)", paddingBottom: "0.9em" }}>
          {LEARN_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ftd-btn ftd-btn-sm ${topic === t.id ? "ftd-btn-primary" : "ftd-btn-outline"}`}
              onClick={() => onSelectTopic(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ==================== 1. HOW IT WORKS (PLAIN ENGLISH) ==================== */}
        {topic === "how-it-works" && (
          <div>
            <span className="ftd-badge">PLAIN-ENGLISH GUIDE • HOW IT WORKS</span>
            <h1 className="ftd-section-title" style={{ marginTop: "0.35em" }}>
              Like Fair-Trade Coffee — But for Digital Data
            </h1>
            <p style={{ fontSize: "1.12rem", maxWidth: 820 }}>
              When you browse a website, fill out a form, rate a video, or discuss news online, Big
              Tech quietly collects those patterns and sells them for billions.{" "}
              <strong>Fair Trade Data Protocol (FTDP)</strong> flips that model: websites prove
              ownership, users choose exactly what they are comfortable sharing, private info stays
              locked away, and buyers pay the community directly.
            </p>

            {/* Everyday Analogy Box */}
            <div className="ftd-sub-box" style={{ margin: "1.4em 0", borderLeft: "4px solid var(--ftd-accent)" }}>
              <h4 style={{ marginBottom: "0.3em" }}>Think of it like a sealed safety deposit box + a co-op bank account</h4>
              <p style={{ marginBottom: 0 }}>
                Imagine filling out a form on your favorite site. Normally, the whole form goes into
                one big corporate bucket. With FTDP, a tiny script in the page header acts like a
                smart mail sorter: your <strong>password or credit card is shredded immediately</strong>{" "}
                before leaving your browser; your <strong>email or name goes into a locked personal vault</strong>{" "}
                that buyers can never open; and only your <strong>anonymous preferences</strong> (like
                &ldquo;interested in open-source AI&rdquo;) go into the community Data Union to earn
                you rewards.
              </p>
            </div>

            <div className="ftd-card-box" style={{ margin: "1.5em 0", background: "#2B4150", borderColor: "#2B4150" }}>
              <h3 style={{ color: "#FFFFFF", marginBottom: "0.75em" }}>
                End-to-End Flow: From Website Click to Contributor Payout
              </h3>
              <ProtocolFlowDiagram dark />
            </div>

            <h2 style={{ fontSize: "1.85em", marginTop: "1.4em", marginBottom: "0.6em" }}>
              What Breaks Today vs. What Changes With FTDP
            </h2>
            <div className="ftd-grid-2">
              <div className="ftd-card-box">
                <span className="ftd-badge" style={{ background: "rgba(185, 28, 28, 0.1)", color: "#991b1b" }}>
                  Today&apos;s Grey-Market Data Brokers
                </span>
                <ul style={{ paddingLeft: "1.2em", marginBottom: 0 }}>
                  <li>Silent scraping and hidden third-party trackers with no clear consent log.</li>
                  <li>Personal details (email, phone, IP) bundled together and resold endlessly.</li>
                  <li>AI labs and advertisers pay middlemen 30%–50% while users and publishers get $0.</li>
                  <li>No way to verify whether a user actually opted in or later revoked permission.</li>
                </ul>
              </div>
              <div className="ftd-card-box">
                <span className="ftd-badge live">Fair Trade Data Protocol (FTDP)</span>
                <ul style={{ paddingLeft: "1.2em", marginBottom: 0 }}>
                  <li>Granular opt-in consent flags committed to a cryptographic Merkle root.</li>
                  <li>Strict PII separation: passwords/CVV dropped at browser; email/name encrypted in a private vault.</li>
                  <li>Buyers pay directly into a Solana Data Union — 95% goes to contributors &amp; publishers.</li>
                  <li>Time-bounded access grants automatically expire and revoke via Source Network Zanzibar ACP.</li>
                </ul>
              </div>
            </div>

            <div className="ftd-btn-group" style={{ marginTop: "1.8em" }}>
              <button type="button" className="ftd-btn ftd-btn-primary" onClick={onOpenDevelopers}>
                Add FTDP to Your Website (3 Steps)
              </button>
              <button type="button" className="ftd-btn ftd-btn-outline" onClick={() => onSelectTopic("data-unions")}>
                Explore Data Unions &amp; Payouts
              </button>
            </div>
          </div>
        )}

        {/* ==================== 2. DATA UNIONS & O(1) SPLITS ==================== */}
        {topic === "data-unions" && (
          <div>
            <span className="ftd-badge solana">SOLANA DEVNET LIVE • DATA UNIONS</span>
            <h1 className="ftd-section-title" style={{ marginTop: "0.35em" }}>
              Data Unions: A Cooperative for Digital Signals
            </h1>
            <p style={{ fontSize: "1.12rem", maxWidth: 840 }}>
              One person&apos;s browsing data isn&apos;t worth much on its own. Ten thousand people
              pooling anonymized signals together is worth millions to AI labs, researchers, and
              ethical advertisers. A <strong>Data Union</strong> lets communities pool their signals
              and automatically split every dollar earned — fairly, transparently, and in real time.
            </p>

            <div className="ftd-card-box" style={{ margin: "1.4em 0" }}>
              <DataUnionCoopDiagram />
            </div>

            <div className="ftd-grid-2">
              <div className="ftd-card-box">
                <h4>How O(1) Constant-Time Splitting Works (No Math Degree Needed)</h4>
                <p>
                  Normally, paying 50,000 contributors on a blockchain would require looping through
                  50,000 wallets and paying huge fees. FTDP&apos;s{" "}
                  <strong>Constant-Time MultiSplitter</strong> tracks a single running{" "}
                  <em>&ldquo;reward per share&rdquo;</em> odometer using ultra-precise{" "}
                  <code>u128</code> fixed-point math (18 decimal places, zero floating-point drift).
                </p>
                <p style={{ marginBottom: 0 }}>
                  When any contributor clicks <strong>Claim</strong>, the Solana program checks the
                  odometer difference since their last claim and sends their exact share in one tiny,
                  fixed-cost transaction — whether the union has 10 members or 1,000,000.
                </p>
              </div>
              <div className="ftd-card-box">
                <h4>Live Standalone Solana Devnet Programs</h4>
                <p style={{ fontSize: "0.9rem" }}>
                  Deployed under FTDP&apos;s own open-source MIT / Apache-2.0 Anchor codebase:
                </p>
                <div className="ftd-sub-box mono" style={{ fontSize: "0.78rem", wordBreak: "break-all", marginBottom: "0.75em" }}>
                  <strong>Admin MultiSplitter Union (Anchor 0.30.1):</strong>
                  <div>{SOLANA_DEVNET_PROGRAMS.adminUnion.programId}</div>
                  <a href={SOLANA_DEVNET_PROGRAMS.adminUnion.solscanUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ftd-accent)" }}>
                    Inspect on Solscan Devnet →
                  </a>
                </div>
                <div className="ftd-sub-box mono" style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>
                  <strong>SPL Token-2022 Transfer-Hook Union (Anchor 0.32.1):</strong>
                  <div>{SOLANA_DEVNET_PROGRAMS.splUnion.programId}</div>
                  <a href={SOLANA_DEVNET_PROGRAMS.splUnion.solscanUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ftd-accent)" }}>
                    Inspect on Solscan Devnet →
                  </a>
                </div>
              </div>
            </div>

            <MultiSplitterSimulator />
          </div>
        )}

        {/* ==================== 3. PRIVACY & SOURCE NETWORK DEFRADB ==================== */}
        {topic === "privacy-defradb" && (
          <div>
            <span className="ftd-badge live">LIVE ON RAILWAY • SOURCE NETWORK DEFRADB.RS</span>
            <h1 className="ftd-section-title" style={{ marginTop: "0.35em" }}>
              Privacy by Architecture — Not by Pinky Promise
            </h1>
            <p style={{ fontSize: "1.12rem", maxWidth: 840 }}>
              Most platforms ask you to trust their privacy policy. FTDP enforces privacy at{" "}
              <strong>three independent technical walls</strong>: inside the browser snippet, inside
              the DNS-locked ingestion gateway, and inside Source Network&apos;s open-source{" "}
              <strong>defradb.rs</strong> (Apache-2.0 / MIT) storage engine.
            </p>

            <div className="ftd-grid-2" style={{ margin: "1.5em 0" }}>
              <div className="ftd-card-box">
                <span className="ftd-badge live" style={{ marginBottom: "0.6em" }}>
                  What FTDP Proves &amp; Pools (Anonymized Only)
                </span>
                <ul style={{ paddingLeft: "1.2em", marginBottom: 0 }}>
                  <li><strong>Consent Bitmask</strong>: exact permissions you toggled on (Analytics, Data Union, AI Training, Ads, Karma).</li>
                  <li><strong>Hashed Pseudonym (<code>uidHash</code>)</strong>: one-way SHA-256 hash — cannot be reversed into your email or name.</li>
                  <li><strong>Non-PII Behavioral Signals</strong>: page path, UTM tags, topic selections, ratings, scroll depth, and allowlisted theme/locale cookies.</li>
                  <li><strong>Cryptographic Merkle Proof</strong>: proves your opt-in status before any buyer query is answered.</li>
                </ul>
              </div>
              <div className="ftd-card-box">
                <span className="ftd-badge" style={{ background: "rgba(185, 28, 28, 0.1)", color: "#991b1b", marginBottom: "0.6em" }}>
                  Hard-Blocked or Isolated (Never Exposed to Buyers)
                </span>
                <ul style={{ paddingLeft: "1.2em", marginBottom: 0 }}>
                  <li><strong>Passwords, PINs, CVV, Card Numbers, SSNs, File Uploads</strong>: hard-dropped inside the browser before any network request is made.</li>
                  <li><strong>Auth / Session / JWT / CSRF Cookies</strong>: automatically stripped by regex blocklist — never captured.</li>
                  <li><strong>Email, Name, Phone, Street Address</strong>: auto-routed into <code>FtdpPiiVault</code>, encrypted per-deployment with AES-256-GCM (HKDF + AAD), and hard-blocked from P2P replication.</li>
                  <li><strong>Spoofed Websites</strong>: blocked with <code>HTTP 403</code> unless the browser <code>Origin</code> matches a DNS TXT verified domain.</li>
                </ul>
              </div>
            </div>

            <div className="ftd-sub-box">
              <h4>Why Source Network <code>defradb.rs</code>?</h4>
              <p style={{ marginBottom: 0 }}>
                FTDP runs on Source Network&apos;s pure-Rust <strong>defradb.rs v0.20.0</strong>{" "}
                (dual-licensed Apache-2.0 / MIT — avoiding restrictive BSL licenses). Every
                anonymized document gets a content-addressed IPFS CID in Regolith storage, supports
                peer-to-peer libp2p replication across Data Union nodes, enforces Local Zanzibar
                Access Control Policies (ACP), and evolves schemas non-destructively via compiled
                WebAssembly (LensVM) transforms.
              </p>
            </div>
          </div>
        )}

        {/* ==================== 4. ECOSYSTEM & COMMENT PROTOCOL ==================== */}
        {topic === "ecosystem" && (
          <div>
            <span className="ftd-badge">OPEN ECOSYSTEM • LAYER 1 &amp; LAYER 2 APPS</span>
            <h1 className="ftd-section-title" style={{ marginTop: "0.35em" }}>
              Community Marketplaces Built on Fair Trade Data
            </h1>
            <p style={{ fontSize: "1.12rem", maxWidth: 840 }}>
              FTDP is an open base layer anyone can plug into. Apps keep their own brand, UI, and
              proprietary business logic while connecting to shared Data Unions and portable
              reputation through the public <code>@ftdp/sdk</code>.
            </p>

            <div className="ftd-market-grid" style={{ marginTop: "1.5em" }}>
              <div className="ftd-card-box">
                <div className="ftd-market-img-wrap" style={{ marginBottom: "0.8em" }}>
                  <img src="/images/market-gaming.jpg" alt="Game Genus" className="ftd-market-img" />
                </div>
                <span className="ftd-badge" style={{ marginBottom: "0.5em" }}>Gaming + Agentic AI</span>
                <h4>Open Knowledgebase for Gaming Community + Agentic AI Coaching</h4>
                <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)", marginBottom: 0 }}>
                  Players opt in to share match telemetry, loadouts, and tactics. AI coaching agents
                  license the anonymized union dataset and split payouts back to top contributors.
                </p>
              </div>

              <div className="ftd-card-box">
                <div className="ftd-market-img-wrap" style={{ marginBottom: "0.8em" }}>
                  <img src="/images/market-streamy.webp" alt="Streamy" className="ftd-market-img" />
                </div>
                <span className="ftd-badge" style={{ marginBottom: "0.5em" }}>Video + Ethical Ad Network</span>
                <h4>Fair Trade Data Ad Network + Video Streaming via Decentralized Storage</h4>
                <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)", marginBottom: 0 }}>
                  Video files stay fast on CDN/IPFS while consented view receipts (<code>streamy://&lt;cid&gt;</code>)
                  and ad preferences stream through FTDP — rewarding both creators and opted-in viewers.
                </p>
              </div>

              <div className="ftd-card-box">
                <div className="ftd-market-img-wrap" style={{ marginBottom: "0.8em" }}>
                  <img src="/images/market-ttn.png" alt="TTN Discussion Boards" className="ftd-market-img" />
                </div>
                <span className="ftd-badge" style={{ marginBottom: "0.5em" }}>Comment Protocol v1</span>
                <h4>Web 3 Native Discussion Boards for zk Voting + User Karma Data Unions via TTN</h4>
                <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)", marginBottom: 0 }}>
                  Reusable discussion threads, star ratings, and upvotes anchored by universal{" "}
                  <code>targetUri</code> links (<code>news://</code>, <code>streamy://</code>) with
                  portable cross-app user karma.
                </p>
              </div>
            </div>

            <div className="ftd-btn-group" style={{ marginTop: "1.8em" }}>
              <button type="button" className="ftd-btn ftd-btn-primary" onClick={onOpenOptIn}>
                Join the FTD Mobile Node Program
              </button>
              <button type="button" className="ftd-btn ftd-btn-outline" onClick={onOpenDevelopers}>
                Read Developer Docs &amp; API
              </button>
            </div>
          </div>
        )}

        {/* ==================== 5. HONEST DELIVERY ROADMAP ==================== */}
        {topic === "roadmap" && (
          <div>
            <span className="ftd-badge live">TRANSPARENT DELIVERY TRACKER</span>
            <h1 className="ftd-section-title" style={{ marginTop: "0.35em" }}>
              Where Fair Trade Data Protocol Stands Today
            </h1>
            <p style={{ fontSize: "1.1rem", maxWidth: 820 }}>
              An honest, verifiable look at what is already shipped and live today, what is running
              on testnet, and what comes next before Mainnet-Beta launch.
            </p>

            {/* Visual Progress Bar */}
            <div className="ftd-card-box" style={{ margin: "1.4em 0" }}>
              <div className="ftd-row ftd-between" style={{ marginBottom: "0.5em" }}>
                <strong>Overall Mainnet Readiness</strong>
                <span className="mono" style={{ color: "var(--ftd-heading-light)", fontWeight: 600 }}>
                  4 of 6 Milestones Shipped / Live on Staging &amp; Devnet
                </span>
              </div>
              <div style={{ height: 12, background: "#E8E2D5", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: "72%", height: "100%", background: "var(--ftd-accent)", borderRadius: 999 }} />
              </div>
            </div>

            <div className="ftd-grid-2">
              {[
                {
                  badge: "COMPLETE",
                  live: true,
                  title: "M1: Open-Source Protocol Suite & Automated CI",
                  items: [
                    "MIT / Apache-2.0 monorepo published on GitHub (COMMENTZRUS/fair-trade-data-protocol).",
                    "All 6 GitHub Actions CI jobs green (Solidity + 60-step fuzz, SDK 5/5, Node 7/7, E2E + Examples, Rust LensVM WASM, Solana Anchor check, Portal build).",
                  ],
                },
                {
                  badge: "LIVE NOW",
                  live: true,
                  title: "M2: Live Node, Source Network defradb.rs & Portal",
                  items: [
                    "ftdp-node + Source Network defradb.rs v0.20.0 live on Railway with 6 bootstrapped collections.",
                    "DNS TXT domain ownership lock + auto-capture <head> snippet live at /sdk/ftdp-snippet.js.",
                    "Standalone Gamma-free site live on Vercel and bound to fairtradedata.xyz.",
                  ],
                },
                {
                  badge: "LIVE ON DEVNET",
                  live: true,
                  title: "M3: Standalone Solana Devnet Data Unions",
                  items: [
                    `Admin MultiSplitter (u128 RPS): ${SOLANA_DEVNET_PROGRAMS.adminUnion.programId}`,
                    `SPL Token-2022 Transfer-Hook Union (u128 RPS): ${SOLANA_DEVNET_PROGRAMS.splUnion.programId}`,
                    "Compiled with synced declare_id!() and on-chain Anchor IDL.",
                  ],
                },
                {
                  badge: "IN PROGRESS",
                  live: false,
                  title: "M4–M6: npm Publish, External Audit & Mainnet-Beta",
                  items: [
                    "Publish @ftdp/sdk@1.0.0 tarball (13.1 kB, packed & verified) to npm.",
                    "External security audit covering Solana u128 splitters + privacy firewall (docs/SECURITY-AUDIT-BRIEF.md).",
                    "Solana Mainnet-Beta launch behind FTDF Squads v4 Multisig.",
                  ],
                },
              ].map((m) => (
                <div key={m.title} className="ftd-card-box">
                  <span className={`ftd-badge ${m.live ? "live" : ""}`} style={{ marginBottom: "0.5em" }}>
                    {m.badge}
                  </span>
                  <h4 style={{ marginBottom: "0.5em" }}>{m.title}</h4>
                  <ul style={{ paddingLeft: "1.15em", marginBottom: 0, fontSize: "0.9rem" }}>
                    {m.items.map((it) => (
                      <li key={it} style={{ marginBottom: "0.35em", wordBreak: "break-word" }}>
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
