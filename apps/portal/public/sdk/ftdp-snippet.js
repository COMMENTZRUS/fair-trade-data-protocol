/* Fair Trade Data Protocol (FTDP) Auto-Capture Browser Snippet v1.1.0 (MIT) */
(function (global) {
  var BLOCKED_FIELD_RE = /pass(word|wd)?|pwd|secret|token|csrf|cvv|cvc|ccnum|card.?num|credit.?card|iban|routing|ssn|social.?sec/i;
  var PII_FIELD_RE = /email|e-mail|phone|mobile|tel|first.?name|last.?name|full.?name|^name$|address|street|city|zip|postal|dob|birth/i;
  var BLOCKED_COOKIE_RE = /sess|token|jwt|auth|csrf|xsrf|sid|passwd|secret|key/i;

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

  function classifyFormFields(fields, extraPiiNames) {
    var anon = {};
    var pii = {};
    var customPii = {};
    (extraPiiNames || []).forEach(function (n) { customPii[String(n).toLowerCase()] = true; });

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f || !f.name) continue;
      if (f.ignore) continue;
      var type = String(f.type || "text").toLowerCase();
      var name = String(f.name);
      var nameLower = name.toLowerCase();

      // Hard blocklist: NEVER capture passwords, hidden secrets, payment CVV/card numbers, or ignored fields
      if (type === "password" || type === "file" || BLOCKED_FIELD_RE.test(nameLower)) {
        continue;
      }
      var val = f.value;
      if (val === undefined || val === null || val === "") continue;

      if (type === "email" || type === "tel" || PII_FIELD_RE.test(nameLower) || customPii[nameLower]) {
        pii[name] = val;
      } else {
        anon[name] = val;
      }
    }
    return { anon: anon, pii: pii };
  }

  function extractSafeCookies(cookieString, allowedCookies) {
    var result = { presentKeys: [], values: {} };
    if (!cookieString) return result;
    var allowSet = {};
    (allowedCookies || []).forEach(function (k) { allowSet[String(k)] = true; });

    var pairs = String(cookieString).split(";");
    for (var i = 0; i < pairs.length; i++) {
      var idx = pairs[i].indexOf("=");
      if (idx === -1) continue;
      var key = pairs[i].slice(0, idx).trim();
      var val = pairs[i].slice(idx + 1).trim();
      if (!key || BLOCKED_COOKIE_RE.test(key)) continue;
      result.presentKeys.push(key);
      if (allowSet[key]) {
        result.values[key] = decodeURIComponent(val);
      }
    }
    return result;
  }

  function extractUtmParams(searchStr) {
    var out = {};
    if (!searchStr) return out;
    try {
      var params = new URLSearchParams(searchStr);
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (k) {
        var v = params.get(k);
        if (v) out[k] = v;
      });
    } catch (_) {}
    return out;
  }

  var state = {
    endpoint: "",
    deploymentId: "",
    namespace: "web",
    userId: "",
    contributorWallet: "",
    contributorSolanaWallet: "",
    consentFlags: "0",
    apiKey: "",
    autoCapture: { pageViews: false, forms: false, clicks: false, cookies: false, scrollDepth: false },
    piiFieldNames: [],
    allowedCookies: [],
    listenersAttached: false,
    maxScrollPct: 0
  };

  function hasConsent() {
    try { return BigInt(state.consentFlags || "0") > 0n; } catch (_) { return false; }
  }

  async function sendRecord(eventName, anonPayload, piiPayload, dataId) {
    if (!state.endpoint || !state.deploymentId) {
      throw new Error("FTDP snippet not initialized: call FTDP.init({ endpoint, deploymentId })");
    }
    var uidHash = await sha256Hex(state.namespace + ":" + state.userId);
    var anonObj = Object.assign(
      { event: eventName },
      anonPayload || {},
      state.contributorWallet ? { contributorWallet: state.contributorWallet } : {},
      state.contributorSolanaWallet ? { contributorSolanaWallet: state.contributorSolanaWallet } : {}
    );
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
      anon: anonObj
    };
    if (piiPayload && Object.keys(piiPayload).length > 0) {
      body.pii = piiPayload;
    }

    var headers = { "Content-Type": "application/json" };
    if (state.apiKey) headers["x-ftdp-api-key"] = state.apiKey;

    var res = await global.fetch(
      state.endpoint + "/v1/records",
      { method: "POST", headers: headers, body: JSON.stringify(body), keepalive: true }
    );
    if (!res.ok) throw new Error("FTDP ingest failed: HTTP " + res.status);
    return res.json();
  }

  function attachBrowserAutoCapture() {
    if (state.listenersAttached || typeof document === "undefined") return;
    state.listenersAttached = true;

    if (state.autoCapture.pageViews && hasConsent()) {
      var loc = typeof location !== "undefined" ? location : { pathname: "/", search: "", hostname: "" };
      var cookieMeta = state.autoCapture.cookies
        ? extractSafeCookies(document.cookie, state.allowedCookies)
        : undefined;
      sendRecord("page_view", {
        path: loc.pathname,
        host: loc.hostname,
        referrer: document.referrer || "",
        utm: extractUtmParams(loc.search),
        ...(cookieMeta ? { cookies: cookieMeta } : {})
      }).catch(function () {});
    }

    if (state.autoCapture.forms) {
      document.addEventListener("submit", function (ev) {
        if (!hasConsent()) return;
        var form = ev.target;
        if (!form || !form.elements || form.hasAttribute("data-ftdp-ignore")) return;
        var rawFields = [];
        for (var i = 0; i < form.elements.length; i++) {
          var el = form.elements[i];
          if (!el || !el.name) continue;
          if (el.hasAttribute && el.hasAttribute("data-ftdp-ignore")) continue;
          if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
          rawFields.push({ name: el.name, type: el.type || "text", value: el.value, ignore: false });
        }
        var classified = classifyFormFields(rawFields, state.piiFieldNames);
        sendRecord(
          "form_submit",
          {
            formId: form.id || form.getAttribute("name") || "unnamed-form",
            path: typeof location !== "undefined" ? location.pathname : "/",
            fields: classified.anon
          },
          classified.pii
        ).catch(function () {});
      }, true);
    }

    if (state.autoCapture.clicks) {
      document.addEventListener("click", function (ev) {
        if (!hasConsent()) return;
        var target = ev.target && ev.target.closest ? ev.target.closest("a,button,[data-ftdp-track]") : null;
        if (!target || target.hasAttribute("data-ftdp-ignore")) return;
        sendRecord("ui_click", {
          tag: target.tagName.toLowerCase(),
          id: target.id || "",
          href: target.getAttribute("href") || "",
          label: target.getAttribute("data-ftdp-track") || (target.textContent || "").trim().slice(0, 64),
          path: typeof location !== "undefined" ? location.pathname : "/"
        }).catch(function () {});
      }, true);
    }

    if (state.autoCapture.scrollDepth && typeof window !== "undefined") {
      window.addEventListener("scroll", function () {
        var docH = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        var pct = Math.min(100, Math.round((window.scrollY / docH) * 100));
        if (pct > state.maxScrollPct) state.maxScrollPct = pct;
      }, { passive: true });
      window.addEventListener("pagehide", function () {
        if (!hasConsent() || state.maxScrollPct <= 0) return;
        sendRecord("scroll_depth", {
          maxScrollPct: state.maxScrollPct,
          path: typeof location !== "undefined" ? location.pathname : "/"
        }).catch(function () {});
      });
    }
  }

  var FTDP = {
    _classifyFormFields: classifyFormFields,
    _extractSafeCookies: extractSafeCookies,
    _extractUtmParams: extractUtmParams,
    init: function (cfg) {
      state.endpoint = (cfg.endpoint || "").replace(/\/+$/, "");
      state.deploymentId = cfg.deploymentId || "";
      state.namespace = cfg.namespace || (typeof location !== "undefined" && location.hostname) || "web";
      state.userId = cfg.userId || "anon-" + Math.random().toString(36).slice(2);
      state.contributorWallet = cfg.contributorWallet || "";
      state.contributorSolanaWallet = cfg.contributorSolanaWallet || "";
      state.consentFlags = String(cfg.consentFlags || "0");
      state.apiKey = cfg.apiKey || "";
      state.piiFieldNames = Array.isArray(cfg.piiFieldNames) ? cfg.piiFieldNames : [];
      state.allowedCookies = Array.isArray(cfg.allowedCookies) ? cfg.allowedCookies : [];
      if (cfg.autoCapture === true) {
        state.autoCapture = { pageViews: true, forms: true, clicks: true, cookies: true, scrollDepth: true };
      } else if (cfg.autoCapture && typeof cfg.autoCapture === "object") {
        state.autoCapture = Object.assign(
          { pageViews: false, forms: false, clicks: false, cookies: false, scrollDepth: false },
          cfg.autoCapture
        );
      }
      attachBrowserAutoCapture();
      return FTDP;
    },
    setConsent: function (flagsBitmask) {
      state.consentFlags = String(flagsBitmask);
      return FTDP;
    },
    setContributorWallet: function (walletAddress, solanaAddress) {
      if (walletAddress !== undefined) state.contributorWallet = walletAddress || "";
      if (solanaAddress !== undefined) state.contributorSolanaWallet = solanaAddress || "";
      return FTDP;
    },
    track: function (eventName, anonPayload, piiPayload, dataId) {
      return sendRecord(eventName, anonPayload, piiPayload, dataId);
    }
  };

  global.FTDP = FTDP;
})(typeof window !== "undefined" ? window : globalThis);
