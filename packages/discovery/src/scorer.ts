import type { ScoreInputs, ScoreBreakdown } from './types.js';

// ProgramScorer — a weighted, tunable rank in 0..1. Higher is a better place to
// spend hunting time. Pure and deterministic so it can be tested and re-run.
export const DEFAULT_WEIGHTS = {
  reward: 0.35,
  scopeBreadth: 0.2,
  policyClarity: 0.2,
  responsiveness: 0.15,
  competition: 0.1,
} as const;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function scoreProgram(
  input: ScoreInputs,
  weights = DEFAULT_WEIGHTS,
): ScoreBreakdown {
  // Reward: log-ish scaling; $5k+ approaches the ceiling.
  const reward = input.maxBountyUsd
    ? clamp01(Math.log10(input.maxBountyUsd + 1) / Math.log10(10001))
    : 0.2;

  // Scope breadth: more concrete in-scope assets = more surface, capped at 10.
  const scopeBreadth = clamp01(input.inScopeCount / 10);

  // Policy clarity: parser confidence minus an ambiguity penalty.
  const policyClarity = clamp01(
    input.parseConfidence - input.ambiguityCount * 0.1,
  );

  // Responsiveness: platform stat, else a neutral prior.
  const responsiveness = clamp01(input.responseRate ?? 0.5);

  // Competition proxy: wide, well-known scope = more hunters = lower edge.
  // We reward NARROW, clear scope here.
  const competition = clamp01(input.hasWideScope ? 0.3 : 0.7);

  const total = clamp01(
    reward * weights.reward +
      scopeBreadth * weights.scopeBreadth +
      policyClarity * weights.policyClarity +
      responsiveness * weights.responsiveness +
      competition * weights.competition,
  );

  return {
    total: Number(total.toFixed(4)),
    reward: Number(reward.toFixed(4)),
    scopeBreadth: Number(scopeBreadth.toFixed(4)),
    policyClarity: Number(policyClarity.toFixed(4)),
    responsiveness: Number(responsiveness.toFixed(4)),
    competition: Number(competition.toFixed(4)),
  };
}
