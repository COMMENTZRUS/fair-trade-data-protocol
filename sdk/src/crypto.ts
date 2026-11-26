import crypto from "crypto";

export interface EncryptedDatasetEnvelope {
  version: "ftdp-enc-v1";
  algorithm: "aes-256-gcm";
  context: string;
  ivHex: string;
  authTagHex: string;
  ciphertextHex: string;
}

/**
 * Generates a fresh 256-bit symmetric dataset key (hex string).
 */
export function generateDatasetKeyHex(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Derives a deterministic 256-bit subkey scoped to `(masterSecret, deploymentId, dataId)` via HKDF-SHA256.
 */
export function deriveScopedDatasetKeyHex(
  masterSecret: string,
  deploymentId: string,
  dataId: string
): string {
  const master = crypto.createHash("sha256").update(masterSecret, "utf8").digest();
  const key = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      master,
      Buffer.from("ftdp-dataset-envelope-v1", "utf8"),
      Buffer.from(`${deploymentId.toLowerCase()}:${dataId.toLowerCase()}`, "utf8"),
      32
    )
  );
  return key.toString("hex");
}

/**
 * Client-side AES-256-GCM encryption for FTDP datasets stored on IPFS / Filecoin / DefraDB.
 * Binds `context` (e.g., `${deploymentId}:${dataId}`) as Additional Authenticated Data (AAD).
 */
export function encryptDatasetPayload(
  payload: unknown,
  keyHex: string,
  context: string
): EncryptedDatasetEnvelope {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("AES-256-GCM key must be 32 bytes (64 hex chars)");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));

  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    version: "ftdp-enc-v1",
    algorithm: "aes-256-gcm",
    context,
    ivHex: iv.toString("hex"),
    authTagHex: cipher.getAuthTag().toString("hex"),
    ciphertextHex: encrypted.toString("hex"),
  };
}

/**
 * Decrypts and authenticates an FTDP client-side encrypted dataset envelope.
 */
export function decryptDatasetPayload<T = unknown>(
  envelope: EncryptedDatasetEnvelope,
  keyHex: string,
  expectedContext: string
): T {
  if (envelope.version !== "ftdp-enc-v1" || envelope.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported FTDP encryption envelope");
  }
  if (envelope.context !== expectedContext) {
    throw new Error("Context mismatch on encrypted FTDP envelope");
  }
  const key = Buffer.from(keyHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.ivHex, "hex"));
  decipher.setAAD(Buffer.from(expectedContext, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.authTagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}
