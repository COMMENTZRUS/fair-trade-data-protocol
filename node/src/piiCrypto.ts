import crypto from "crypto";

export interface EncryptedPiiEnvelope {
  piiCiphertext: string;
  kmsKeyVersion: string;
}

/**
 * Per-deployment AES-256-GCM envelope encryption for FTDP PII compartments.
 * Derives an isolated 256-bit key per (masterKey, deploymentId, kmsKeyVersion) via HKDF-SHA256
 * and binds `deploymentId` as GCM Additional Authenticated Data (AAD) so ciphertext cannot be
 * replayed or decrypted across different Deployments.
 */
export class PiiEnvelopeCrypto {
  private readonly masterKey: Buffer;
  public readonly keyVersion: string;

  constructor(masterKeyHexOrUtf8?: string, keyVersion = "kms-v1") {
    this.keyVersion = keyVersion;
    if (masterKeyHexOrUtf8 && masterKeyHexOrUtf8.length > 0) {
      this.masterKey = crypto.createHash("sha256").update(masterKeyHexOrUtf8, "utf8").digest();
    } else {
      this.masterKey = crypto.randomBytes(32);
    }
  }

  private deriveDeploymentKey(deploymentId: string, version: string): Buffer {
    const salt = Buffer.from("ftdp-pii-vault-v1", "utf8");
    const info = Buffer.from(`${deploymentId.toLowerCase()}:${version}`, "utf8");
    return Buffer.from(crypto.hkdfSync("sha256", this.masterKey, salt, info, 32));
  }

  encrypt(deploymentId: string, pii: Record<string, unknown>): EncryptedPiiEnvelope {
    const key = this.deriveDeploymentKey(deploymentId, this.keyVersion);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(deploymentId.toLowerCase(), "utf8"));

    const plaintext = Buffer.from(JSON.stringify(pii), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      piiCiphertext: `v1:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`,
      kmsKeyVersion: this.keyVersion,
    };
  }

  decrypt(deploymentId: string, piiCiphertext: string, kmsKeyVersion = this.keyVersion): Record<string, unknown> {
    const parts = piiCiphertext.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") {
      throw new Error("Invalid PII ciphertext envelope format");
    }
    const [, ivHex, tagHex, ctHex] = parts;
    const key = this.deriveDeploymentKey(deploymentId, kmsKeyVersion);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAAD(Buffer.from(deploymentId.toLowerCase(), "utf8"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ctHex, "hex")),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8")) as Record<string, unknown>;
  }
}
