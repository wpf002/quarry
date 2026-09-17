import tls from 'node:tls';
import { promises as dns } from 'node:dns';
import type { CertFetcher } from './provenance.js';

// Live ownership verification from authentic sources: the host's real TLS
// certificate (a single handshake, like loading the site) and DNS resolution.
// No third-party API. Pure helpers are split out for testing.

export function patternToHost(pattern: string): string | null {
  const p = pattern.trim();
  if (/\/\d{1,3}$/.test(p) && /^\d{1,3}(\.\d{1,3}){3}\//.test(p)) return null; // CIDR
  try {
    if (/^https?:\/\//i.test(p)) return new URL(p).hostname.toLowerCase();
  } catch {
    return null;
  }
  const noPort = p.replace(/:\d+$/, '');
  return /^[a-z0-9.-]+$/i.test(noPort) ? noPort.toLowerCase() : null;
}

/** Does any SAN cover this host (exact or a direct wildcard)? Pure. */
export function sanCovers(host: string, sans: string[]): boolean {
  const h = host.toLowerCase();
  return sans.some((raw) => {
    const s = raw.toLowerCase().trim();
    if (s === h) return true;
    if (s.startsWith('*.')) {
      const base = s.slice(2);
      return h.endsWith('.' + base) && h.slice(0, -(base.length + 1)).indexOf('.') === -1;
    }
    return false;
  });
}

export interface CertInfo {
  sans: string[];
  issuer: string;
  validTo: string;
}

/** Open a TLS connection and read the peer certificate's SAN list. */
export function fetchCert(host: string, port = 443, timeoutMs = 6000): Promise<CertInfo> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port, servername: host, timeout: timeoutMs, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || Object.keys(cert).length === 0) {
          reject(new Error('no certificate'));
          return;
        }
        const sans = (cert.subjectaltname ?? '')
          .split(',')
          .map((s) => s.trim().replace(/^DNS:/i, ''))
          .filter(Boolean);
        const issuerRaw = cert.issuer?.O ?? cert.issuer?.CN ?? 'unknown';
        const issuer = Array.isArray(issuerRaw) ? issuerRaw.join(', ') : issuerRaw;
        resolve({ sans, issuer, validTo: cert.valid_to ?? '' });
      },
    );
    socket.on('timeout', () => { socket.destroy(); reject(new Error('tls timeout')); });
    socket.on('error', reject);
  });
}

export const liveCertFetcher: CertFetcher = async (host) => (await fetchCert(host)).sans;

export interface LiveVerifyResult {
  verified: boolean;
  method: 'CERT_SAN' | 'DNS_ONLY' | 'NONE';
  reason: string;
  evidence: {
    host: string | null;
    sans?: string[];
    issuer?: string;
    validTo?: string;
    ips?: string[];
    cname?: string[];
  };
}

// Verify an allowlist entry against live data. Strong pass: the host presents a
// TLS cert whose SAN covers it. Falls back to DNS-resolves (weaker) as evidence
// but NOT a pass on its own.
export async function liveVerify(pattern: string): Promise<LiveVerifyResult> {
  const host = patternToHost(pattern);
  if (!host) {
    return { verified: false, method: 'NONE', reason: 'pattern is not a verifiable host (CIDR?)', evidence: { host: null } };
  }

  const ips = await dns.resolve4(host).catch(() => [] as string[]);
  const cname = await dns.resolveCname(host).catch(() => [] as string[]);

  let cert: CertInfo | null = null;
  try {
    cert = await fetchCert(host);
  } catch (e) {
    if (ips.length > 0) {
      return { verified: false, method: 'DNS_ONLY', reason: `resolves but TLS cert unreadable (${(e as Error).message})`, evidence: { host, ips, cname } };
    }
    return { verified: false, method: 'NONE', reason: `no DNS and no cert (${(e as Error).message})`, evidence: { host } };
  }

  if (sanCovers(host, cert.sans)) {
    return {
      verified: true,
      method: 'CERT_SAN',
      reason: `live cert SAN covers ${host}`,
      evidence: { host, sans: cert.sans, issuer: cert.issuer, validTo: cert.validTo, ips, cname },
    };
  }
  return {
    verified: false,
    method: 'NONE',
    reason: `cert SANs do not cover ${host}`,
    evidence: { host, sans: cert.sans, issuer: cert.issuer, ips, cname },
  };
}
