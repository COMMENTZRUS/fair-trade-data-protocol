const fs = require("fs");
const path = require("path");

const outDir = path.resolve(__dirname, "..", "dist");
fs.mkdirSync(outDir, { recursive: true });

// Zero-dependency embeddable browser snippet (<script src="ftdp-snippet.js">)
const snippetSource = `/* Fair Trade Data Protocol (FTDP) Browser Snippet v1.0.0 */
(function (global) {
  function toHex(buf) {
    return "0x" + Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  async function sha256Hex(str) {
    var data = new TextEncoder().encode(str);
    var digest = await global.crypto.subtle.digest("SHA-256", data);
    return toHex(digest);
  }

  var state = {
    endpoint: "",
    deploymentId: "",
    namespace: "web",
    userId: "",
    contributorWallet: "",
    consentFlags: "0",
    apiKey: ""
  };

  var FTDP = {
    init: function (cfg) {
      state.endpoint = (cfg.endpoint || "").replace(/\\/+$/, "");
      state.deploymentId = cfg.deploymentId || "";
      state.namespace = cfg.namespace || "web";
      state.userId = cfg.userId || "anon-" + Math.random().toString(36).slice(2);
      state.contributorWallet = cfg.contributorWallet || "";
      state.consentFlags = String(cfg.consentFlags || "0");
      state.apiKey = cfg.apiKey || "";
      return FTDP;
    },
    setConsent: function (flagsBitmask) {
      state.consentFlags = String(flagsBitmask);
      return FTDP;
    },
    setContributorWallet: function (walletAddress) {
      state.contributorWallet = walletAddress || "";
      return FTDP;
    },
    track: async function (eventName, anonPayload, piiPayload, dataId) {
      if (!state.endpoint || !state.deploymentId) {
        throw new Error("FTDP snippet not initialized: call FTDP.init({ endpoint, deploymentId })");
      }
      var uidHash = await sha256Hex(state.namespace + ":" + state.userId);
      var body = {
        meta: {
          recordId: Date.now() + "-" + Math.random().toString(36).slice(2, 10),
          deploymentId: state.deploymentId,
          uidHash: uidHash,
          dataId: dataId,
          schemaVersion: "1.0.0",
          timestamp: Math.floor(Date.now() / 1000),
          source: "webSdk"
        },
        flags: state.consentFlags,
        anon: Object.assign(
          { event: eventName },
          anonPayload || {},
          state.contributorWallet ? { contributorWallet: state.contributorWallet } : {}
        )
      };
      if (piiPayload) body.pii = piiPayload;

      var headers = { "Content-Type": "application/json" };
      if (state.apiKey) headers["x-ftdp-api-key"] = state.apiKey;

      var res = await global.fetch(
        state.endpoint + "/api/v1/deployments/" + encodeURIComponent(state.deploymentId) + "/records",
        { method: "POST", headers: headers, body: JSON.stringify(body) }
      );
      if (!res.ok) throw new Error("FTDP ingest failed: HTTP " + res.status);
      return res.json();
    }
  };

  global.FTDP = FTDP;
})(typeof window !== "undefined" ? window : globalThis);
`;

fs.writeFileSync(path.join(outDir, "ftdp-snippet.js"), snippetSource, "utf8");
console.log("Built embeddable browser snippet:", path.join(outDir, "ftdp-snippet.js"));
