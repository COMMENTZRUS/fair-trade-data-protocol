import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { FtdpStore } from "../store";
import { createFtdpServer } from "../server";

test("DNS TXT domain verification & Origin spoof enforcement protect website snippet streams", async () => {
  const store = new FtdpStore();

  // Controllable in-memory DNS TXT resolver
  const dnsZone = new Map<string, string[][]>();
  const txtResolver = async (hostname: string): Promise<string[][]> => {
    const entries = dnsZone.get(hostname.toLowerCase());
    if (!entries) throw new Error(`ENOTFOUND ${hostname}`);
    return entries;
  };

  const { fetchImpl } = createFtdpServer({
    store,
    txtResolver,
  });

  const base = "http://ftdp.local";
  const depId = ethers.keccak256(ethers.toUtf8Bytes("client-site-dep"));
  const uidHash = ethers.keccak256(ethers.toUtf8Bytes("example.com:user-1"));

  // 1. Hosted auto-capture browser snippet endpoint serves JS bundle
    const snippetRes = await fetchImpl(`${base}/sdk/ftdp-snippet.js`);
    assert.equal(snippetRes.status, 200);
    assert.match(snippetRes.headers.get("content-type") || "", /application\/javascript/i);
    const snippetBody = await snippetRes.text();
    assert.ok(snippetBody.includes("FTDP"));
    assert.ok(snippetBody.includes("classifyFormFields"));

    // 2. Invalid domain returns 400
    const badDomRes = await fetchImpl(`${base}/api/v1/deployments/${depId}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "not a domain!!" }),
    });
    assert.equal(badDomRes.status, 400);

    // 3. Register domain challenge for example.com
    const createRes = await fetchImpl(`${base}/api/v1/deployments/${depId}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "https://Example.com/signup" }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as {
      data: { domain: string; txtHost: string; txtValue: string; verified: boolean };
    };
    assert.equal(created.data.domain, "example.com");
    assert.equal(created.data.txtHost, "_ftdp-verify.example.com");
    assert.ok(created.data.txtValue.startsWith("ftdp-verify="));
    assert.equal(created.data.verified, false);

    // 4. Verify before DNS TXT is published -> 400
    const failVerify = await fetchImpl(`${base}/api/v1/deployments/${depId}/domains/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    });
    assert.equal(failVerify.status, 400);

    // 5. Publish TXT record at _ftdp-verify.example.com -> verify succeeds
    dnsZone.set("_ftdp-verify.example.com", [[created.data.txtValue]]);
    const okVerify = await fetchImpl(`${base}/api/v1/deployments/${depId}/domains/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    });
    assert.equal(okVerify.status, 200);
    const okBody = (await okVerify.json()) as { verified: boolean; matchedHost: string };
    assert.equal(okBody.verified, true);
    assert.equal(okBody.matchedHost, "_ftdp-verify.example.com");

    // 6. Register second domain and verify via apex <domain> TXT fallback
    const apexCreate = await fetchImpl(`${base}/api/v1/deployments/${depId}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "partner.org" }),
    });
    const apexRec = ((await apexCreate.json()) as { data: { txtValue: string } }).data;
    dnsZone.set("partner.org", [["v=spf1 include:_spf.partner.org ~all"], [apexRec.txtValue]]);
    const apexVerify = await fetchImpl(`${base}/api/v1/deployments/${depId}/domains/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "partner.org" }),
    });
    assert.equal(apexVerify.status, 200);
    const apexBody = (await apexVerify.json()) as { verified: boolean; matchedHost: string };
    assert.equal(apexBody.verified, true);
    assert.equal(apexBody.matchedHost, "partner.org");

    const makeRecord = (id: string) =>
      JSON.stringify({
        meta: {
          recordId: id,
          deploymentId: depId,
          uidHash,
          schemaVersion: "1.0.0",
          timestamp: Math.floor(Date.now() / 1000),
          source: "webSdk",
        },
        flags: "3",
        anon: { event: "form_submit", fields: { plan: "pro" } },
        pii: { email: "alice@example.com" },
      });

    // 7. Spoofed Origin is rejected with 403 on BOTH /v1/records and /api/v1/deployments/:id/records
    const spoofV1 = await fetchImpl(`${base}/v1/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.com" },
      body: makeRecord("rec-spoof-1"),
    });
    assert.equal(spoofV1.status, 403);

    const lookalikeV1 = await fetchImpl(`${base}/v1/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://not-example.com" },
      body: makeRecord("rec-spoof-2"),
    });
    assert.equal(lookalikeV1.status, 403);

    const spoofLegacy = await fetchImpl(`${base}/api/v1/deployments/${depId}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.com" },
      body: makeRecord("rec-spoof-3"),
    });
    assert.equal(spoofLegacy.status, 403);

    // 8. Verified domain and its subdomain succeed with 201
    const okSubdomain = await fetchImpl(`${base}/v1/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://app.example.com" },
      body: makeRecord("rec-ok-1"),
    });
    assert.equal(okSubdomain.status, 201);

    const okLegacy = await fetchImpl(`${base}/api/v1/deployments/${depId}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://partner.org" },
      body: makeRecord("rec-ok-2"),
    });
    assert.equal(okLegacy.status, 201);

    // 9. Localhost dev and server-to-server (no Origin) also succeed
    const okLocal = await fetchImpl(`${base}/v1/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: makeRecord("rec-ok-3"),
    });
    assert.equal(okLocal.status, 201);

    const okServer = await fetchImpl(`${base}/v1/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: makeRecord("rec-ok-4"),
    });
    assert.equal(okServer.status, 201);
});
