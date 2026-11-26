import crypto from "crypto";
import dns from "dns";

export interface DomainVerificationRecord {
  domain: string;
  deploymentId: string;
  txtHost: string;
  txtValue: string;
  verified: boolean;
  createdAt: number;
  verifiedAt?: number;
}

export type TxtResolver = (hostname: string) => Promise<string[][]>;

const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeDomain(input: string): string {
  let cleaned = input.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//, "");
  cleaned = cleaned.split("/")[0].split(":")[0].replace(/\.$/, "");
  if (!HOSTNAME_RE.test(cleaned)) {
    throw new Error(`Invalid domain name: "${input}"`);
  }
  return cleaned;
}

export function createDomainChallenge(deploymentId: string, rawDomain: string): DomainVerificationRecord {
  const domain = normalizeDomain(rawDomain);
  const token = crypto.randomBytes(16).toString("hex");
  return {
    domain,
    deploymentId,
    txtHost: `_ftdp-verify.${domain}`,
    txtValue: `ftdp-verify=${token}`,
    verified: false,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Verifies domain ownership by querying DNS TXT records at `_ftdp-verify.<domain>`
 * (with fallback to apex `<domain>` for DNS providers that prefer root TXT records).
 */
export async function verifyDomainTxtRecord(
  record: DomainVerificationRecord,
  resolver: TxtResolver = (host) => dns.promises.resolveTxt(host)
): Promise<{ verified: boolean; matchedHost?: string }> {
  const hostsToCheck = [record.txtHost, record.domain];
  for (const host of hostsToCheck) {
    try {
      const txtRecords = await resolver(host);
      for (const chunks of txtRecords) {
        const joined = chunks.join("").trim();
        if (joined === record.txtValue || joined.includes(record.txtValue)) {
          return { verified: true, matchedHost: host };
        }
      }
    } catch {
      // NXDOMAIN / ENODATA on one candidate host — try fallback
    }
  }
  return { verified: false };
}

/**
 * Checks whether an HTTP `Origin` header matches a verified domain (or subdomain of a verified domain).
 */
export function isOriginAllowedForDeployment(
  originHeader: string | undefined,
  domains: DomainVerificationRecord[]
): boolean {
  const verifiedDomains = domains.filter((d) => d.verified);
  if (verifiedDomains.length === 0) return true; // No verified domain lock configured yet
  if (!originHeader) return true; // Non-browser server-to-server call

  try {
    const host = new URL(originHeader).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    return verifiedDomains.some((d) => host === d.domain || host.endsWith(`.${d.domain}`));
  } catch {
    return false;
  }
}
