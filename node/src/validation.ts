import { FtdpRecord } from "@ftdp/sdk";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const UINT_RE = /^(0x[0-9a-fA-F]+|[0-9]+)$/;
const ALLOWED_SOURCES = new Set(["webSdk", "mobileNode", "serverApi", "csvImport", "webhook"]);

export function validateFtdpRecord(input: unknown, expectedDeploymentId: string): { ok: true; record: FtdpRecord } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Record must be a JSON object" };
  const obj = input as Record<string, unknown>;

  if (!obj.meta || typeof obj.meta !== "object") return { ok: false, error: "Missing meta object" };
  const meta = obj.meta as Record<string, unknown>;

  if (typeof meta.recordId !== "string" || meta.recordId.trim().length === 0) {
    return { ok: false, error: "meta.recordId must be a non-empty string" };
  }
  if (typeof meta.deploymentId !== "string" || !BYTES32_RE.test(meta.deploymentId)) {
    return { ok: false, error: "meta.deploymentId must be a valid bytes32 hex string" };
  }
  if (meta.deploymentId.toLowerCase() !== expectedDeploymentId.toLowerCase()) {
    return { ok: false, error: "meta.deploymentId does not match route deploymentId" };
  }
  if (typeof meta.uidHash !== "string" || !BYTES32_RE.test(meta.uidHash)) {
    return { ok: false, error: "meta.uidHash must be a valid bytes32 hex string" };
  }
  if (meta.dataId !== undefined && (typeof meta.dataId !== "string" || !BYTES32_RE.test(meta.dataId))) {
    return { ok: false, error: "meta.dataId must be a valid bytes32 hex string when provided" };
  }
  if (meta.schemaVersion !== "1.0.0") {
    return { ok: false, error: 'meta.schemaVersion must equal "1.0.0"' };
  }
  if (typeof meta.timestamp !== "number" || !Number.isInteger(meta.timestamp) || meta.timestamp < 0) {
    return { ok: false, error: "meta.timestamp must be a non-negative integer" };
  }
  if (meta.source !== undefined && (typeof meta.source !== "string" || !ALLOWED_SOURCES.has(meta.source))) {
    return { ok: false, error: "meta.source is invalid" };
  }

  if (typeof obj.flags !== "string" || !UINT_RE.test(obj.flags)) {
    return { ok: false, error: "flags must be a uint256 decimal or hex string" };
  }
  if (!obj.anon || typeof obj.anon !== "object" || Array.isArray(obj.anon)) {
    return { ok: false, error: "anon must be a JSON object" };
  }
  if (obj.pii !== undefined && (typeof obj.pii !== "object" || obj.pii === null || Array.isArray(obj.pii))) {
    return { ok: false, error: "pii must be a JSON object when provided" };
  }

  return { ok: true, record: obj as unknown as FtdpRecord };
}
