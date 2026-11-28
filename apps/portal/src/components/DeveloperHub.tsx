import React, { useMemo, useState } from "react";
import { DataUnion, Deployment, SOLANA_DEVNET_PROGRAMS } from "../demoData";
import { ProtocolFlowDiagram } from "./Graphics";

export interface DomainRecord {
  domain: string;
  deploymentId: string;
  txtHost: string;
  txtValue: string;
  verified: boolean;
  verifiedAt?: number;
}

interface DeveloperHubProps {
  nodeUrl: string;
  setNodeUrl: (u: string) => void;
  nodeOnline: boolean;
  defradbConnected: boolean;
  refreshFromNode: () => void;
  deployments: Deployment[];
  selectedDepId: string;
  setSelectedDepId: (id: string) => void;
  domains: DomainRecord[];
  activeDomain: DomainRecord | null;
  setActiveDomain: (d: DomainRecord | null) => void;
  domainInput: string;
  setDomainInput: (s: string) => void;
  registerDomainChallenge: (e: React.FormEvent) => void;
  verifyDomainChallenge: (domain: string) => void;
  flagBits: number[];
  setFlagBits: React.Dispatch<React.SetStateAction<number[]>>;
  merkleRoot: string;
  eventTopic: string;
  setEventTopic: (s: string) => void;
  emitSampleRecord: () => void;
  autoCapture: {
    pageViews: boolean;
    forms: boolean;
    clicks: boolean;
    cookies: boolean;
    scrollDepth: boolean;
  };
  setAutoCapture: React.Dispatch<
    React.SetStateAction<{
      pageViews: boolean;
      forms: boolean;
      clicks: boolean;
      cookies: boolean;
      scrollDepth: boolean;
    }>
  >;
  unions: DataUnion[];
  runUnionMetering: (unionId: string) => void;
  meterResult: Record<string, unknown> | null;
  copyText: (label: string, text: string) => void;
  githubUrl: string;
}

const CONSENT_FLAGS = [
  { bit: 0, label: "Analytics", desc: "De-identified app telemetry" },
  { bit: 1, label: "News Data Union", desc: "Share engagement & curation into shared Data Unions" },
  { bit: 2, label: "AI Training", desc: "License anonymized signals to AI labs" },
  { bit: 3, label: "Ad Personalization", desc: "Fair Trade Data Ad Network preferences" },
  { bit: 4, label: "Karma / Reputation", desc: "Web3 discussion board karma union" },
];

const API_ENDPOINTS = [
  { group: "Health & SDK", method: "GET", path: "/health", desc: "Node health, storageDriver ('defradb' | 'local'), and live defradbConnected status" },
  { group: "Health & SDK", method: "GET", path: "/sdk/ftdp-snippet.js", desc: "Hosted zero-dependency auto-capture <head> browser snippet (v1.1.0)" },
  { group: "Domain Lock", method: "POST", path: "/api/v1/deployments/:id/domains", desc: "Generate _ftdp-verify.<domain> DNS TXT ownership challenge" },
  { group: "Domain Lock", method: "POST", path: "/api/v1/deployments/:id/domains/verify", desc: "Verify DNS TXT (_ftdp-verify or apex) and enforce browser Origin lock" },
  { group: "Ingestion", method: "POST", path: "/v1/records", desc: "Ingest consent-segregated record into defradb.rs (anon + AES-256-GCM PII vault)" },
  { group: "Consent", method: "GET", path: "/api/v1/deployments/:id/merkle/root", desc: "Fetch latest opt-in consent Merkle root and leaf count" },
  { group: "Consent", method: "GET", path: "/api/v1/deployments/:id/merkle/proof/:uidHash", desc: "Fetch verifiable Merkle inclusion proof for a user's consent bitmask" },
  { group: "Access Gate", method: "POST", path: "/api/v1/deployments/:id/records/read", desc: "Serve strictly anonymized records after verifying consent flags & access grant" },
  { group: "Comment v1", method: "POST", path: "/api/v1/comments", desc: "Post comment, star rating, or vote anchored to a universal targetUri (news://, streamy://)" },
  { group: "Comment v1", method: "GET", path: "/api/v1/comments/thread?targetUri=...", desc: "Read threaded discussions, average ratings, and aggregate vote score" },
  { group: "Comment v1", method: "GET", path: "/api/v1/comments/karma/:uidHash", desc: "Query portable cross-app user karma across all participating deployments" },
  { group: "Data Unions", method: "GET / POST", path: "/api/v1/unions", desc: "List or register Solana / dual-chain MultiSplitter Data Unions" },
  { group: "Data Unions", method: "POST", path: "/api/v1/unions/:id/meter", desc: "Compute deterministic contributor share weights (Solana modify_shares & EVM EIP-712)" },
  { group: "Compute-to-Data", method: "POST", path: "/v1/compute/jobs", desc: "Run privacy-preserving aggregate analytics over opted-in anon records without exporting raw rows" },
];

type DevTab = "onboarding" | "api" | "architecture";

export function DeveloperHub(props: DeveloperHubProps) {
  const [devTab, setDevTab] = useState<DevTab>("onboarding");

  const activeFlagMask = useMemo(
    () => props.flagBits.reduce((acc, b) => acc | (1n << BigInt(b)), 0n),
    [props.flagBits]
  );

  const cleanNodeUrl = props.nodeUrl.replace(/\/+$/, "");
  const snippetHost =
    typeof window !== "undefined" && window.location.origin.startsWith("http")
      ? window.location.origin
      : "https://fairtradedata.xyz";

  const snippetCode = `<!-- 1. Verify DNS TXT ownership, then paste inside <head> -->
<script src="${snippetHost}/sdk/ftdp-snippet.js"></script>
<script>
  FTDP.init({
    endpoint: "${cleanNodeUrl}",
    deploymentId: "${props.selectedDepId}",
    namespace: "${props.activeDomain?.domain || "your-site.com"}",
    consentFlags: "${activeFlagMask.toString()}", // set after user opt-in
    contributorSolanaWallet: currentUser?.solanaWallet || "",
    autoCapture: {
      pageViews: ${props.autoCapture.pageViews},
      forms: ${props.autoCapture.forms},
      clicks: ${props.autoCapture.clicks},
      cookies: ${props.autoCapture.cookies},
      scrollDepth: ${props.autoCapture.scrollDepth}
    },
    allowedCookies: ["theme", "locale"] // passwords, CVV & auth cookies are hard-blocked
  });
</script>`;

  const curlQuickstart = `# 1. Verify live node + Source Network defradb.rs connection
curl -s ${cleanNodeUrl}/health

# 2. Generate a DNS TXT ownership challenge for your domain
curl -s -X POST ${cleanNodeUrl}/api/v1/deployments/${props.selectedDepId}/domains \\
  -H "Content-Type: application/json" \\
  -d '{"domain":"your-site.com"}'

# 3. Ingest a consent-segregated record (anon -> FtdpAnonRecord, pii -> encrypted FtdpPiiVault)
curl -s -X POST ${cleanNodeUrl}/v1/records \\
  -H "Content-Type: application/json" \\
  -d '{
    "meta": {
      "recordId": "demo-001",
      "deploymentId": "${props.selectedDepId}",
      "uidHash": "0x1111111111111111111111111111111111111111111111111111111111111111",
      "schemaVersion": "1.0.0",
      "timestamp": 1795795084,
      "source": "webSdk"
    },
    "flags": "${activeFlagMask.toString()}",
    "anon": { "event": "article_read", "topic": "${props.eventTopic}" },
    "pii": { "email": "alice@example.com" }
  }'`;

  const sdkQuickstart = `import { FtdpClient, CommentProtocolClient, SolanaDataUnionClient, STANDARD_CONSENT_FLAGS } from "@ftdp/sdk";

// 1. Stream consented events to ftdp-node + Source Network defradb.rs
const ftdp = new FtdpClient({ baseUrl: "${cleanNodeUrl}" });
await ftdp.trackEvent({
  deploymentId: "${props.selectedDepId}",
  namespace: "your-site.com",
  userId: "user-42",
  flags: STANDARD_CONSENT_FLAGS.ANALYTICS | STANDARD_CONSENT_FLAGS.NEWS_DATA_UNION,
  contributorSolanaWallet: "YourContributorSolanaPubkey...",
  anon: { event: "guide_published", category: "ai-coaching" },
  pii: { email: "alice@example.com" } // AES-256-GCM encrypted into FtdpPiiVault
});

// 2. Build Solana Devnet MultiSplitter instructions (checked u128 fixed-point RPS)
const solUnion = new SolanaDataUnionClient({
  cluster: "devnet",
  programId: "${SOLANA_DEVNET_PROGRAMS.adminUnion.programId}",
  splitterPda: "${SOLANA_DEVNET_PROGRAMS.adminUnion.programId}",
  variant: "admin"
});
const plans = solUnion.buildAdminShareUpdates("${SOLANA_DEVNET_PROGRAMS.deployer}", [
  { shareholder: "ContributorSolanaPubkey...", shares: "500" }
]);`;

  const asciiArchitecture = `┌──────────────────────────────────────────────────────────────────────────────────┐
│  1. CLIENT WEBSITE / APP (DNS TXT verified domain + <head> ftdp-snippet.js)      │
│     • Hard-drops password, CVV, card, SSN, file inputs & auth/session/JWT cookies│
│     • Auto-routes email/name/phone/address -> pii; behavioral telemetry -> anon  │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ HTTPS POST /v1/records (Origin locked)
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  2. FTDP REFERENCE NODE (node/ • Port 4000 • Live on Railway)                    │
│     • Validates schema + verifies Origin against DNS TXT verified domains        │
│     • Encrypts pii per-Deployment (HKDF + AES-256-GCM + AAD)                     │
│     • Maintains Consent Merkle Tree + GrantExpirationReaper + Metering Workers   │
└───────────────┬─────────────────────────────────────────┬────────────────────────┘
                │ GraphQL /api/v0 (private internal net)  │ Solana Anchor RPC
                ▼                                         ▼
┌─────────────────────────────────────────┐ ┌──────────────────────────────────────┐
│ 3. SOURCE NETWORK defradb.rs v0.20.0    │ │ 4. SOLANA DEVNET DATA UNIONS (u128)  │
│    (Apache-2.0 / MIT • Regolith + P2P)  │ │  • Admin Union (Anchor 0.30.1):      │
│  • FtdpAnonRecord (P2P Merkle-CRDT)     │ │    ERFSmNHga5Dn56fVtqrrJ4bF4z9tk...  │
│  • FtdpPiiVault (LOCAL ONLY — no P2P)   │ │  • SPL Transfer-Hook (Anchor 0.32.1):│
│  • CommentRecord / Rating / Vote        │ │    9qYPc7fP7Veb2MRhXTXJo3gDjjG2Z...  │
│  • LensVM WASM schema evolution (20 KB) │ │  • O(1) claim cost, 0% retro dilution│
└─────────────────────────────────────────┘ └──────────────────────────────────────┘`;

  return (
    <main className="ftd-section ftd-section-light ftd-portal-panel">
      <div className="ftd-container">
        {/* Header + Live Infrastructure Status Strip */}
        <div className="ftd-row ftd-between" style={{ marginBottom: "1.2em" }}>
          <div>
            <div className="ftd-row" style={{ marginBottom: "0.45em" }}>
              <span className={`ftd-badge ${props.nodeOnline ? "live" : ""}`}>
                {props.nodeOnline ? "● ftdp-node Live" : "○ Node Offline"}
              </span>
              <span className={`ftd-badge ${props.defradbConnected ? "live" : ""}`}>
                {props.defradbConnected ? "● Source defradb.rs v0.20.0 Connected" : "○ Local Store"}
              </span>
              <span className="ftd-badge solana">● Solana Devnet Live (2 Programs)</span>
            </div>
            <h1 className="ftd-section-title" style={{ marginBottom: "0.2em" }}>
              Developer Documentation &amp; Live Sandbox
            </h1>
            <p style={{ marginBottom: 0 }}>
              Open HTTP API, embeddable <code>&lt;head&gt;</code> auto-capture snippet, Source
              Network <code>defradb.rs</code> schemas, and standalone Solana Anchor Data Unions.
            </p>
          </div>
          <div className="ftd-row">
            <a className="ftd-btn ftd-btn-outline ftd-btn-sm" href={props.githubUrl} target="_blank" rel="noreferrer">
              GitHub Monorepo (MIT)
            </a>
            <a
              className="ftd-btn ftd-btn-outline ftd-btn-sm"
              href={SOLANA_DEVNET_PROGRAMS.adminUnion.solscanUrl}
              target="_blank"
              rel="noreferrer"
            >
              Solscan Devnet
            </a>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="ftd-row" style={{ marginBottom: "1.5em", borderBottom: "1px solid var(--ftd-border-light)", paddingBottom: "0.9em" }}>
          <button
            type="button"
            className={`ftd-btn ftd-btn-sm ${devTab === "onboarding" ? "ftd-btn-primary" : "ftd-btn-outline"}`}
            onClick={() => setDevTab("onboarding")}
          >
            1. Website Onboarding &amp; Live Sandbox
          </button>
          <button
            type="button"
            className={`ftd-btn ftd-btn-sm ${devTab === "api" ? "ftd-btn-primary" : "ftd-btn-outline"}`}
            onClick={() => setDevTab("api")}
          >
            2. HTTP API Reference &amp; curl
          </button>
          <button
            type="button"
            className={`ftd-btn ftd-btn-sm ${devTab === "architecture" ? "ftd-btn-primary" : "ftd-btn-outline"}`}
            onClick={() => setDevTab("architecture")}
          >
            3. Architecture, @ftdp/sdk &amp; Self-Hosting
          </button>
        </div>

        {/* ==================== SUB-TAB 1: ONBOARDING & LIVE SANDBOX ==================== */}
        {devTab === "onboarding" && (
          <>
            <div className="ftd-grid-2">
              <div className="ftd-card-box">
                <h3 style={{ marginBottom: "0.35em" }}>Step 1 &amp; 2: Domain Ownership (DNS TXT)</h3>
                <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)" }}>
                  Prove domain ownership with one DNS TXT record. Once verified, browser{" "}
                  <code>Origin</code> spoofing from any other domain is rejected with{" "}
                  <code>403</code>.
                </p>

                <div className="ftd-sub-box" style={{ marginBottom: "1em" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--ftd-text-light-muted)" }}>Active FTDP Node Endpoint</div>
                  <div className="ftd-row" style={{ marginTop: "0.4em" }}>
                    <input
                      className="ftd-input"
                      value={props.nodeUrl}
                      onChange={(e) => props.setNodeUrl(e.target.value)}
                      style={{ flex: 1, minWidth: 200 }}
                    />
                    <button type="button" className="ftd-btn ftd-btn-outline ftd-btn-sm" onClick={props.refreshFromNode}>
                      Reconnect
                    </button>
                  </div>
                </div>

                <form onSubmit={props.registerDomainChallenge} className="ftd-row" style={{ marginBottom: "1em" }}>
                  <input
                    className="ftd-input"
                    value={props.domainInput}
                    onChange={(e) => props.setDomainInput(e.target.value)}
                    placeholder="example.com"
                    style={{ flex: 1, minWidth: 180 }}
                  />
                  <button type="submit" className="ftd-btn ftd-btn-primary ftd-btn-sm">
                    Generate DNS TXT
                  </button>
                </form>

                {props.domains.length > 0 && (
                  <div className="ftd-row" style={{ marginBottom: "0.9em" }}>
                    {props.domains.map((d) => (
                      <button
                        key={d.domain}
                        type="button"
                        className={`ftd-btn ftd-btn-sm ${
                          props.activeDomain?.domain === d.domain ? "ftd-btn-primary" : "ftd-btn-outline"
                        }`}
                        onClick={() => props.setActiveDomain(d)}
                      >
                        {d.domain} {d.verified ? "✓" : "•"}
                      </button>
                    ))}
                  </div>
                )}

                {props.activeDomain && (
                  <div className="ftd-sub-box">
                    <div style={{ fontSize: "0.78rem", color: "var(--ftd-text-light-muted)" }}>
                      TXT Host (or apex {props.activeDomain.domain})
                    </div>
                    <div className="mono" style={{ fontSize: "0.84rem", color: "var(--ftd-heading-light)", marginBottom: "0.5em" }}>
                      {props.activeDomain.txtHost}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--ftd-text-light-muted)" }}>TXT Value</div>
                    <div className="mono" style={{ fontSize: "0.82rem", wordBreak: "break-all", marginBottom: "0.75em" }}>
                      {props.activeDomain.txtValue}
                    </div>
                    <div className="ftd-row">
                      <button
                        type="button"
                        className="ftd-btn ftd-btn-outline ftd-btn-sm"
                        onClick={() => props.copyText("DNS TXT value", props.activeDomain!.txtValue)}
                      >
                        Copy TXT Value
                      </button>
                      <button
                        type="button"
                        className="ftd-btn ftd-btn-primary ftd-btn-sm"
                        onClick={() => props.verifyDomainChallenge(props.activeDomain!.domain)}
                      >
                        {props.activeDomain.verified ? "Verified ✓ (Re-Check)" : "Verify DNS TXT"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="ftd-card-box">
                <h3 style={{ marginBottom: "0.35em" }}>Live Ingestion Tester (<code>POST /v1/records</code>)</h3>
                <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)" }}>
                  Toggle consent flags and write a real record into live Railway{" "}
                  <code>ftdp-node</code> + Source Network <code>defradb.rs</code>.
                </p>

                <div style={{ marginBottom: "0.8em" }}>
                  <select
                    className="ftd-input"
                    style={{ width: "100%" }}
                    value={props.selectedDepId}
                    onChange={(e) => props.setSelectedDepId(e.target.value)}
                  >
                    {props.deployments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.id.slice(0, 12)}...)
                      </option>
                    ))}
                  </select>
                </div>

                {CONSENT_FLAGS.map((f) => {
                  const checked = props.flagBits.includes(f.bit);
                  return (
                    <label key={f.bit} className="ftd-flag-row">
                      <div>
                        <strong style={{ fontSize: "0.88rem" }}>
                          Bit {f.bit}: {f.label}
                        </strong>
                        <div style={{ fontSize: "0.76rem", color: "var(--ftd-text-light-muted)" }}>{f.desc}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          props.setFlagBits((prev) =>
                            checked ? prev.filter((b) => b !== f.bit) : [...prev, f.bit]
                          )
                        }
                      />
                    </label>
                  );
                })}

                <div className="ftd-row ftd-between" style={{ marginTop: "0.85em" }}>
                  <span className="mono" style={{ fontSize: "0.84rem" }}>
                    Mask: <strong>{activeFlagMask.toString()}</strong>
                  </span>
                  <div className="ftd-row">
                    <input
                      className="ftd-input"
                      value={props.eventTopic}
                      onChange={(e) => props.setEventTopic(e.target.value)}
                      style={{ width: 145 }}
                    />
                    <button type="button" className="ftd-btn ftd-btn-primary ftd-btn-sm" onClick={props.emitSampleRecord}>
                      Send Live Record
                    </button>
                  </div>
                </div>

                <div className="ftd-sub-box" style={{ marginTop: "0.85em" }}>
                  <div style={{ fontSize: "0.76rem", color: "var(--ftd-text-light-muted)" }}>Latest Opt-In Merkle Root</div>
                  <div className="mono" style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>
                    {props.merkleRoot}
                  </div>
                </div>
              </div>
            </div>

            <div className="ftd-card-box" style={{ marginTop: "1.4em" }}>
              <div className="ftd-row ftd-between">
                <div>
                  <h3 style={{ marginBottom: "0.2em" }}>Step 3: Paste Auto-Capture &lt;head&gt; Snippet</h3>
                  <p style={{ fontSize: "0.88rem", color: "var(--ftd-text-light-muted)", marginBottom: "0.6em" }}>
                    Hard-blocks passwords, CVV/card/SSN inputs, and auth/session/JWT cookies.
                    Auto-routes PII fields into the AES-256-GCM encrypted <code>FtdpPiiVault</code>.
                  </p>
                </div>
                <button
                  type="button"
                  className="ftd-btn ftd-btn-primary ftd-btn-sm"
                  onClick={() => props.copyText("HTML <head> snippet", snippetCode)}
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
                      checked={props.autoCapture[key]}
                      onChange={() =>
                        props.setAutoCapture((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <pre className="ftd-code">{snippetCode}</pre>
            </div>
          </>
        )}

        {/* ==================== SUB-TAB 2: HTTP API REFERENCE & CURL ==================== */}
        {devTab === "api" && (
          <>
            <div className="ftd-card-box" style={{ marginBottom: "1.4em" }}>
              <div className="ftd-row ftd-between" style={{ marginBottom: "0.8em" }}>
                <div>
                  <h3 style={{ marginBottom: "0.2em" }}>Core HTTP API Endpoints</h3>
                  <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)", marginBottom: 0 }}>
                    Base URL: <code className="mono">{cleanNodeUrl}</code> (open JSON REST API; optional{" "}
                    <code>x-ftdp-api-key</code> header for operator endpoints).
                  </p>
                </div>
                <button
                  type="button"
                  className="ftd-btn ftd-btn-outline ftd-btn-sm"
                  onClick={() => props.copyText("Base URL", cleanNodeUrl)}
                >
                  Copy Base URL
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="ftd-api-table">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Method</th>
                      <th>Endpoint</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {API_ENDPOINTS.map((ep) => (
                      <tr key={`${ep.method}-${ep.path}`}>
                        <td><span className="ftd-badge">{ep.group}</span></td>
                        <td className="mono" style={{ fontWeight: 600, color: "var(--ftd-heading-light)" }}>{ep.method}</td>
                        <td className="mono" style={{ fontSize: "0.82rem" }}>{ep.path}</td>
                        <td style={{ fontSize: "0.88rem" }}>{ep.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ftd-card-box">
              <div className="ftd-row ftd-between">
                <h3 style={{ marginBottom: 0 }}>Quick <code>curl</code> Examples</h3>
                <button
                  type="button"
                  className="ftd-btn ftd-btn-primary ftd-btn-sm"
                  onClick={() => props.copyText("curl quickstart", curlQuickstart)}
                >
                  Copy curl Commands
                </button>
              </div>
              <pre className="ftd-code">{curlQuickstart}</pre>
            </div>
          </>
        )}

        {/* ==================== SUB-TAB 3: ARCHITECTURE, SDK & SELF-HOSTING ==================== */}
        {devTab === "architecture" && (
          <>
            <div className="ftd-card-box" style={{ marginBottom: "1.4em", background: "#2B4150", borderColor: "#2B4150" }}>
              <h3 style={{ color: "#FFFFFF", marginBottom: "0.75em" }}>End-to-End Protocol Flow</h3>
              <ProtocolFlowDiagram dark />
            </div>

            <div className="ftd-card-box" style={{ marginBottom: "1.4em" }}>
              <h3>System Architecture &amp; Ports</h3>
              <pre className="ftd-code" style={{ fontSize: "0.75rem" }}>{asciiArchitecture}</pre>
            </div>

            <div className="ftd-grid-2">
              <div className="ftd-card-box">
                <div className="ftd-row ftd-between">
                  <h3 style={{ marginBottom: 0 }}>TypeScript SDK (<code>@ftdp/sdk</code>)</h3>
                  <button
                    type="button"
                    className="ftd-btn ftd-btn-outline ftd-btn-sm"
                    onClick={() => props.copyText("@ftdp/sdk example", sdkQuickstart)}
                  >
                    Copy Code
                  </button>
                </div>
                <pre className="ftd-code">{sdkQuickstart}</pre>
              </div>

              <div className="ftd-card-box">
                <h3>Self-Host FTDP Node + Source <code>defradb.rs</code></h3>
                <p style={{ fontSize: "0.9rem", color: "var(--ftd-text-light-muted)" }}>
                  Run your own sovereign node with automatic Let&apos;s Encrypt TLS and Apache-2.0/MIT{" "}
                  <code>sourcenetwork/defradb.rs v0.20.0</code>:
                </p>
                <pre className="ftd-code">{`git clone ${props.githubUrl}.git
cd fair-trade-data-protocol/node
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`}</pre>

                <h4 style={{ marginTop: "1.2em", marginBottom: "0.4em" }}>Live Solana Devnet Metering Test</h4>
                <div className="ftd-row">
                  <button
                    type="button"
                    className="ftd-btn ftd-btn-primary ftd-btn-sm"
                    onClick={() => props.runUnionMetering(props.unions[0]?.id || "ftdp-admin-data-union-devnet")}
                  >
                    Run Live Union Metering
                  </button>
                  <a
                    className="ftd-btn ftd-btn-outline ftd-btn-sm"
                    href={SOLANA_DEVNET_PROGRAMS.splUnion.solscanUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    SPL Union on Solscan
                  </a>
                </div>
                {props.meterResult && (
                  <pre className="ftd-code" style={{ maxHeight: 180 }}>
                    {JSON.stringify(props.meterResult, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
