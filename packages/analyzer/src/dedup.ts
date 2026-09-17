import type { DupRiskInput } from './types.js';

// Duplicate-risk score in 0..1. Higher = more likely already reported by someone
// else. Driven by how common the vuln class is, how mature/picked-over the
// program is, how visible the asset is, and how many similar findings we already
// hold for the program.
const CLASS_COMMONALITY: Record<string, number> = {
  xss: 0.7,
  'open-redirect': 0.8,
  csrf: 0.6,
  'git-exposure': 0.5,
  'exposed-secret': 0.4,
  'public-bucket': 0.5,
  idor: 0.4,
  ssrf: 0.35,
  rce: 0.2,
  'chained-exploit': 0.15,
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function dupRisk(input: DupRiskInput): number {
  const base = CLASS_COMMONALITY[input.vulnClass] ?? 0.5;
  // Mature programs (older) are more picked over.
  const maturity = clamp01(input.programAgeDays / 730); // ~2y -> 1.0
  const visibility = { low: 0, medium: 0.15, high: 0.3 }[input.assetVisibility];
  const crowding = clamp01(input.similarFindingsInProgram * 0.1);

  const risk =
    base * 0.5 + maturity * 0.25 + visibility * 0.15 + crowding * 0.1;
  return Number(clamp01(risk).toFixed(4));
}
