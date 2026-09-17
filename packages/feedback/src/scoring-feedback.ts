import type { OutcomeStats } from './outcomes.js';

// Outcomes feed back into ranking. A program that pays out raises its score; one
// that mostly returns duplicates or out-of-scope lowers it. Pure multiplier in
// roughly [0.5, 1.5].
export function scoreMultiplier(stats: OutcomeStats): number {
  if (stats.decided === 0) return 1;
  const m = 1 + stats.validRate * 0.5 - stats.dupRate * 0.4 - (stats.oos / stats.decided) * 0.3;
  return Number(Math.max(0.5, Math.min(1.5, m)).toFixed(4));
}

// Historical duplicate rate nudges the dup-risk base for a program's future
// findings. Returns an additive adjustment in [0, 0.2].
export function dupRiskAdjustment(stats: OutcomeStats): number {
  if (stats.decided === 0) return 0;
  return Number(Math.min(0.2, stats.dupRate * 0.2).toFixed(4));
}
