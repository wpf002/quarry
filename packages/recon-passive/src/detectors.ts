// Passive exposure detectors. These run over data ALREADY PUBLIC (indexed URLs
// from CT/Wayback/GitHub search, public bucket listings) — they do not fetch or
// probe the target. Each returns a finding candidate for the analyzer.

export interface PublicSignal {
  url: string;
  /** How the URL surfaced: 'wayback' | 'ct' | 'github' | 'index'. */
  via: string;
  snippet?: string;
}

export interface PassiveFinding {
  title: string;
  vulnClass: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence: Record<string, unknown>;
}

const RULES: Array<{
  re: RegExp;
  vulnClass: string;
  severity: PassiveFinding['severity'];
  title: (u: string) => string;
}> = [
  { re: /\/\.git\/(config|HEAD)|\/\.git\/?$/i, vulnClass: 'git-exposure', severity: 'MEDIUM', title: (u) => `Exposed .git directory: ${host(u)}` },
  { re: /\/\.env(\.|$)|\/\.env\b/i, vulnClass: 'exposed-secret', severity: 'HIGH', title: (u) => `Publicly indexed .env: ${host(u)}` },
  { re: /\.s3\.amazonaws\.com\/?$|storage\.googleapis\.com/i, vulnClass: 'public-bucket', severity: 'MEDIUM', title: (u) => `Public cloud bucket listing: ${host(u)}` },
  { re: /\/(id_rsa|id_ed25519|\.pem|\.p12)(\?|$)/i, vulnClass: 'exposed-secret', severity: 'HIGH', title: (u) => `Exposed private key: ${host(u)}` },
  { re: /\/wp-config\.php(\.bak|~|\.save)/i, vulnClass: 'exposed-config', severity: 'HIGH', title: (u) => `Exposed backup config: ${host(u)}` },
];

export function detectExposures(signals: PublicSignal[]): PassiveFinding[] {
  const out: PassiveFinding[] = [];
  const seen = new Set<string>();
  for (const s of signals) {
    for (const rule of RULES) {
      if (!rule.re.test(s.url)) continue;
      const key = `${rule.vulnClass}:${s.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        title: rule.title(s.url),
        vulnClass: rule.vulnClass,
        severity: rule.severity,
        evidence: { url: s.url, via: s.via, snippet: s.snippet ?? null },
      });
    }
  }
  return out;
}

function host(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}
