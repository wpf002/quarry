// Scope provenance. Before the autonomous scheduler scans a DISCOVERED asset, it
// must prove that asset genuinely belongs to a human-confirmed apex — not a
// lookalike. Pure; the cert fetch is injected.

export type ProvenanceMethod = 'SUBDOMAIN_OF_APEX' | 'CERT_SAN_MATCH' | 'NONE';

export interface ProvenanceResult {
  verified: boolean;
  method: ProvenanceMethod;
  reason: string;
}

/** Returns the TLS certificate SAN dns names for a host. Injected in tests. */
export type CertFetcher = (host: string) => Promise<string[]>;

function host(v: string): string {
  let h = v.trim().toLowerCase();
  try {
    if (/^[a-z]+:\/\//.test(h)) h = new URL(h).hostname;
  } catch {
    /* keep as-is */
  }
  return h.replace(/\.$/, '').replace(/:\d+$/, '');
}

function isUnderApex(h: string, apex: string): boolean {
  return h === apex || h.endsWith('.' + apex); // boundary; evil-acme.com fails
}

export async function verifyProvenance(
  target: string,
  apexes: string[],
  opts: { certFetcher?: CertFetcher } = {},
): Promise<ProvenanceResult> {
  const h = host(target);
  const cleanApexes = apexes.map(host).filter(Boolean);
  if (!h || cleanApexes.length === 0) {
    return { verified: false, method: 'NONE', reason: 'no target or apex' };
  }

  for (const apex of cleanApexes) {
    if (isUnderApex(h, apex)) {
      return { verified: true, method: 'SUBDOMAIN_OF_APEX', reason: `under ${apex}` };
    }
  }

  if (opts.certFetcher) {
    let sans: string[];
    try {
      sans = (await opts.certFetcher(h)).map(host);
    } catch {
      return { verified: false, method: 'NONE', reason: 'cert fetch failed' };
    }
    // The cert must cover the target AND a confirmed apex (ties them together).
    const coversTarget = sans.some((s) => s === h || (s.startsWith('*.') && isUnderApex(h, s.slice(2))));
    const coversApex = sans.some((s) =>
      cleanApexes.some((apex) => s === apex || (s.startsWith('*.') && (apex === s.slice(2) || isUnderApex(apex, s.slice(2))))),
    );
    if (coversTarget && coversApex) {
      return { verified: true, method: 'CERT_SAN_MATCH', reason: 'cert SAN ties target to a confirmed apex' };
    }
  }

  return { verified: false, method: 'NONE', reason: `${h} not provably under any confirmed apex` };
}
