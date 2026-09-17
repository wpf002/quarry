import type { AnalyzableFinding, Severity } from './types.js';

// Chain detection. Combine 2+ findings into a higher-severity chain. PoC steps
// are read-only descriptions only — never executable exploit payloads.
export interface Chain {
  title: string;
  components: string[]; // finding ids
  severity: Severity;
  rationale: string;
  readOnlyPoc: string[];
}

interface ChainRule {
  a: string;
  b: string;
  severity: Severity;
  title: string;
  rationale: string;
  poc: string[];
}

const RULES: ChainRule[] = [
  {
    a: 'xss', b: 'csrf', severity: 'HIGH',
    title: 'CSRF-delivered XSS',
    rationale: 'Reflected/self XSS becomes exploitable when a CSRF vector delivers it to a victim session.',
    poc: ['Observe XSS sink accepts unsanitized input.', 'Observe state-changing endpoint lacks CSRF token.', 'Describe (do not execute) how one delivers the other.'],
  },
  {
    a: 'ssrf', b: 'exposed-secret', severity: 'CRITICAL',
    title: 'SSRF to metadata/secret disclosure',
    rationale: 'SSRF reaching an internal metadata endpoint combined with weak secret handling yields credential disclosure.',
    poc: ['Confirm SSRF can address internal ranges.', 'Confirm a secret is retrievable via that path.', 'Describe the chained read-only path.'],
  },
  {
    a: 'idor', b: 'exposed-secret', severity: 'HIGH',
    title: 'IDOR-driven data exposure',
    rationale: 'IDOR over an object that returns sensitive fields escalates a low finding to real data exposure.',
    poc: ['Enumerate object ids with own accounts only.', 'Show a sensitive field returned for a non-owned id.'],
  },
];

const sevRank: Record<Severity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export function detectChains(findings: AnalyzableFinding[]): Chain[] {
  const byClass = new Map<string, AnalyzableFinding[]>();
  for (const f of findings) {
    const arr = byClass.get(f.vulnClass) ?? [];
    arr.push(f);
    byClass.set(f.vulnClass, arr);
  }
  const chains: Chain[] = [];
  for (const rule of RULES) {
    const as = byClass.get(rule.a) ?? [];
    const bs = byClass.get(rule.b) ?? [];
    for (const fa of as) {
      for (const fb of bs) {
        if (fa.id === fb.id) continue;
        chains.push({
          title: rule.title,
          components: [fa.id, fb.id],
          severity: rule.severity,
          rationale: rule.rationale,
          readOnlyPoc: rule.poc,
        });
      }
    }
  }
  return chains;
}

export function maxSeverity(a: Severity, b: Severity): Severity {
  return sevRank[a] >= sevRank[b] ? a : b;
}
