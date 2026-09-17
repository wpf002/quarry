import type { ReconSource } from '@quarry/db';
import type { HttpFn, PassiveAsset, PassiveSource } from './types.js';

const defaultHttp: HttpFn = (url, init) =>
  fetch(url, init as RequestInit) as unknown as ReturnType<HttpFn>;

// --- Certificate Transparency (crt.sh) -------------------------------------
// Queries the public CT log index, NOT the target. Returns subdomains seen in
// issued certificates.
export function parseCrtSh(json: unknown, root: string): PassiveAsset[] {
  const rows = Array.isArray(json) ? json : [];
  const hosts = new Set<string>();
  for (const r of rows as any[]) {
    const nameField = typeof r?.name_value === 'string' ? r.name_value : '';
    for (const raw of nameField.split(/\n+/)) {
      const h = raw.trim().toLowerCase().replace(/^\*\./, '');
      // Dot boundary so testexample.com does NOT match root example.com.
      if (h && (h === root || h.endsWith('.' + root)) && /^[a-z0-9.-]+$/.test(h)) {
        hosts.add(h);
      }
    }
  }
  return [...hosts].map((value) => ({
    value,
    source: 'CT_LOG' as ReconSource,
    meta: { via: 'crt.sh' },
  }));
}

export class CrtShSource implements PassiveSource {
  readonly source: ReconSource = 'CT_LOG';
  constructor(private http: HttpFn = defaultHttp) {}
  async enumerate(domain: string): Promise<PassiveAsset[]> {
    const res = await this.http(
      `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`,
    );
    if (!res.ok) throw new Error(`crt.sh ${res.status}`);
    return parseCrtSh(await res.json(), domain);
  }
}

// --- security.txt (RFC 9116) ----------------------------------------------
// A single fetch of a PUBLISHED document. Extracts contact + policy hints. Also
// records the host itself as a SECURITY_TXT-sourced asset.
export interface SecurityTxt {
  contact: string[];
  policy?: string;
  encryption?: string;
  raw: string;
}

export function parseSecurityTxt(raw: string): SecurityTxt {
  const out: SecurityTxt = { contact: [], raw };
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z-]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === 'contact') out.contact.push(val);
    else if (key === 'policy') out.policy = val;
    else if (key === 'encryption') out.encryption = val;
  }
  return out;
}

export class SecurityTxtSource implements PassiveSource {
  readonly source: ReconSource = 'SECURITY_TXT';
  constructor(private http: HttpFn = defaultHttp) {}
  async enumerate(domain: string): Promise<PassiveAsset[]> {
    for (const path of ['/.well-known/security.txt', '/security.txt']) {
      try {
        const res = await this.http(`https://${domain}${path}`);
        if (!res.ok) continue;
        const parsed = parseSecurityTxt(await res.text());
        return [
          {
            value: domain,
            source: 'SECURITY_TXT' as ReconSource,
            meta: { contact: parsed.contact, policy: parsed.policy },
          },
        ];
      } catch {
        continue;
      }
    }
    return [];
  }
}

export function defaultPassiveSources(): PassiveSource[] {
  return [new CrtShSource(), new SecurityTxtSource()];
}
