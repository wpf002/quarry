import { verifyProvenance, type CertFetcher, type ProvenanceMethod } from './provenance.js';

// L4 program selection. Pick the best-scored programs that aren't active yet —
// these are the ones worth auto-onboarding (passive recon + drafts). Pure.
export interface SelectableProgram {
  id: string;
  handle: string;
  score: number | null;
  active: boolean;
}

export function selectTopPrograms(
  programs: SelectableProgram[],
  opts: { minScore?: number; limit?: number } = {},
): SelectableProgram[] {
  const minScore = opts.minScore ?? 0.7;
  const limit = opts.limit ?? 5;
  return programs
    .filter((p) => !p.active && (p.score ?? 0) >= minScore)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

export interface AllowlistProposal {
  value: string;
  method: ProvenanceMethod;
}

// Propose allowlist entries from discovered assets, keeping only those provably
// under a confirmed apex. These are PROPOSALS — a human still confirms each into
// the real allowlist (no auto-import, by design). Wildcards are never proposed.
export async function proposeAllowlist(params: {
  assets: { value: string }[];
  apexes: string[];
  certFetcher?: CertFetcher;
}): Promise<AllowlistProposal[]> {
  const out: AllowlistProposal[] = [];
  const seen = new Set<string>();
  for (const a of params.assets) {
    if (a.value.includes('*') || seen.has(a.value)) continue;
    const p = await verifyProvenance(a.value, params.apexes, { certFetcher: params.certFetcher });
    if (p.verified) {
      seen.add(a.value);
      out.push({ value: a.value, method: p.method });
    }
  }
  return out;
}
