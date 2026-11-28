import React from "react";

/** Exact FontAwesome-Light style 45x45 thin-line icons matching original fairtradedata.org */
export function FeatureIcon({ kind }: { kind: "shield" | "nft" | "key" | "bars" }) {
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

/**
 * 4-Stage Horizontal End-to-End Flow Graphic (matching fairtradedata.org palette)
 * Explains: Website/App -> Privacy Firewall & DefraDB -> Consent Merkle Gate -> Solana O(1) Payouts
 */
export function ProtocolFlowDiagram({ dark = true }: { dark?: boolean }) {
  const cardFill = dark ? "#223440" : "#FFFFFF";
  const cardStroke = dark ? "rgba(146,186,211,0.45)" : "#D9D4C9";
  const heading = dark ? "#FFFFFF" : "#124E73";
  const sub = dark ? "rgba(255,255,255,0.78)" : "#2B4150";
  const accent = dark ? "#92BAD3" : "#325F7B";
  const pillFill = dark ? "rgba(146,186,211,0.16)" : "#F3EEE3";

  const steps = [
    {
      x: 12,
      badge: "STEP 1 • COLLECT",
      title: "Website / App",
      line1: "DNS TXT verified domain",
      line2: "1-tag <head> snippet",
      line3: "User chooses consent flags",
    },
    {
      x: 256,
      badge: "STEP 2 • SEGREGATE",
      title: "Source defradb.rs",
      line1: "Splits anon vs encrypted PII",
      line2: "Passwords/CVV hard-dropped",
      line3: "PII vault never replicated",
    },
    {
      x: 500,
      badge: "STEP 3 • VERIFY",
      title: "Consent Gate",
      line1: "Opt-in Merkle proof check",
      line2: "Time-bounded buyer grants",
      line3: "Auto-revoked on expiry",
    },
    {
      x: 744,
      badge: "STEP 4 • REWARD",
      title: "Solana Data Union",
      line1: "Buyer pays SOL / USDC",
      line2: "O(1) u128 MultiSplitter",
      line3: "Contributors claim anytime",
    },
  ];

  return (
    <svg
      viewBox="0 0 980 212"
      role="img"
      aria-label="Fair Trade Data Protocol 4-stage flow: Website Snippet to Source Network DefraDB to Consent Gate to Solana Data Union Payouts"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <marker id={dark ? "ftdArrowDark" : "ftdArrowLight"} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={accent} />
        </marker>
      </defs>

      {steps.map((s, i) => (
        <g key={s.title}>
          <rect
            x={s.x}
            y="14"
            width="224"
            height="182"
            rx="6"
            fill={cardFill}
            stroke={cardStroke}
            strokeWidth="1.5"
          />
          <rect x={s.x + 14} y="28" width="136" height="22" rx="11" fill={pillFill} />
          <text
            x={s.x + 24}
            y="43"
            fill={accent}
            fontFamily="Source Sans 3, sans-serif"
            fontSize="10.5"
            fontWeight="600"
            letterSpacing="0.5"
          >
            {s.badge}
          </text>
          <text
            x={s.x + 14}
            y="78"
            fill={heading}
            fontFamily="MuseoModerno, sans-serif"
            fontSize="19"
            fontWeight="500"
          >
            {s.title}
          </text>
          <text x={s.x + 14} y="108" fill={sub} fontFamily="Source Sans 3, sans-serif" fontSize="13">
            • {s.line1}
          </text>
          <text x={s.x + 14} y="132" fill={sub} fontFamily="Source Sans 3, sans-serif" fontSize="13">
            • {s.line2}
          </text>
          <text x={s.x + 14} y="156" fill={sub} fontFamily="Source Sans 3, sans-serif" fontSize="13">
            • {s.line3}
          </text>
          {i < steps.length - 1 && (
            <line
              x1={s.x + 226}
              y1="105"
              x2={s.x + 252}
              y2="105"
              stroke={accent}
              strokeWidth="2"
              markerEnd={`url(#${dark ? "ftdArrowDark" : "ftdArrowLight"})`}
            />
          )}
        </g>
      ))}
    </svg>
  );
}

/**
 * Layered Data Union Co-op Ecosystem Diagram (SVG)
 * Visualizes how everyday sites & apps pool anonymized signals into Solana O(1) Data Unions.
 */
export function DataUnionCoopDiagram() {
  return (
    <svg
      viewBox="0 0 960 360"
      role="img"
      aria-label="Fair Trade Data Union Cooperative Architecture"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <marker id="coopArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#325F7B" />
        </marker>
      </defs>

      {/* Top Row: Data Producers (Apps & Websites) */}
      <text x="16" y="22" fill="#124E73" fontFamily="Source Sans 3, sans-serif" fontSize="12" fontWeight="600" letterSpacing="1">
        1. CONSENTED DATA PRODUCERS (WEBSITES, APPS &amp; MOBILE NODES)
      </text>
      {[
        { x: 16, title: "Client Websites", sub: "DNS TXT + <head> snippet" },
        { x: 252, title: "Gaming & AI Coaching", sub: "Gameplay & strategy signals" },
        { x: 488, title: "Streamy Video & Ads", sub: "View receipts & ad choices" },
        { x: 724, title: "TTN / Comment Boards", sub: "Threads, votes & karma" },
      ].map((b) => (
        <g key={b.title}>
          <rect x={b.x} y="34" width="220" height="70" rx="5" fill="#FFFFFF" stroke="#D9D4C9" strokeWidth="1.5" />
          <text x={b.x + 14} y="62" fill="#124E73" fontFamily="MuseoModerno, sans-serif" fontSize="15.5" fontWeight="500">
            {b.title}
          </text>
          <text x={b.x + 14} y="85" fill="#2B4150" fontFamily="Source Sans 3, sans-serif" fontSize="12.5">
            {b.sub}
          </text>
          <line x1={b.x + 110} y1="104" x2={b.x + 110} y2="140" stroke="#325F7B" strokeWidth="1.8" markerEnd="url(#coopArrow)" />
        </g>
      ))}

      {/* Middle Band: Privacy Firewall + Source Network DefraDB */}
      <rect x="16" y="144" width="928" height="74" rx="6" fill="#2B4150" />
      <text x="36" y="174" fill="#FFFFFF" fontFamily="MuseoModerno, sans-serif" fontSize="18" fontWeight="500">
        FTDP Reference Node + Source Network defradb.rs (Apache-2.0 / MIT)
      </text>
      <text x="36" y="200" fill="#92BAD3" fontFamily="Source Sans 3, sans-serif" fontSize="13.5">
        Hard-blocks passwords/CVV/auth cookies  •  AES-256-GCM isolates PII locally  •  Pools only opted-in anonymized signals + Merkle proofs
      </text>

      {/* Arrows down to Solana Layer */}
      <line x1="250" y1="218" x2="250" y2="256" stroke="#325F7B" strokeWidth="2" markerEnd="url(#coopArrow)" />
      <line x1="710" y1="218" x2="710" y2="256" stroke="#325F7B" strokeWidth="2" markerEnd="url(#coopArrow)" />

      {/* Bottom Row: Solana MultiSplitter Data Unions + Buyers */}
      <rect x="16" y="260" width="452" height="86" rx="6" fill="#F3EEE3" stroke="#325F7B" strokeWidth="1.5" />
      <text x="34" y="288" fill="#124E73" fontFamily="MuseoModerno, sans-serif" fontSize="17" fontWeight="500">
        Solana O(1) MultiSplitter Data Unions (Live on Devnet)
      </text>
      <text x="34" y="312" fill="#2B4150" fontFamily="Source Sans 3, sans-serif" fontSize="13">
        Admin Union (u128 RPS) &amp; SPL Token-2022 Transfer-Hook Union
      </text>
      <text x="34" y="332" fill="#325F7B" fontFamily="Source Sans 3, sans-serif" fontSize="12.5" fontWeight="600">
        95% streams directly to contributors &amp; publishers • 5% FTDF public goods
      </text>

      <rect x="492" y="260" width="452" height="86" rx="6" fill="#FFFFFF" stroke="#D9D4C9" strokeWidth="1.5" />
      <text x="510" y="288" fill="#124E73" fontFamily="MuseoModerno, sans-serif" fontSize="17" fontWeight="500">
        Ethical Data Buyers (AI Labs, Advertisers, Agents)
      </text>
      <text x="510" y="312" fill="#2B4150" fontFamily="Source Sans 3, sans-serif" fontSize="13">
        License anonymized datasets or run privacy-safe Compute-to-Data jobs
      </text>
      <text x="510" y="332" fill="#325F7B" fontFamily="Source Sans 3, sans-serif" fontSize="12.5" fontWeight="600">
        Payments settle directly into the Data Union — zero middleman brokers
      </text>
    </svg>
  );
}
