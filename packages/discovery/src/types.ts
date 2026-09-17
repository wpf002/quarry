import type { Platform } from '@quarry/db';

// Platform-agnostic normalized program, emitted by every connector before
// parsing/scoring. Connectors are read-only: they hit the PLATFORM's own API,
// never a target.
export interface RawProgram {
  platform: Platform;
  handle: string;
  name: string;
  policyRaw: string;
  maxBountyUsd?: number;
  url?: string;
  meta?: Record<string, unknown>;
}

export interface ScoreInputs {
  maxBountyUsd?: number;
  inScopeCount: number;
  parseConfidence: number; // 0..1 policy clarity proxy
  ambiguityCount: number;
  hasWideScope: boolean; // wildcards / open-ended language
  responseRate?: number; // 0..1, platform stat if available
  avgDaysToBounty?: number; // lower is better
}

export interface ScoreBreakdown {
  total: number; // 0..1
  reward: number;
  scopeBreadth: number;
  policyClarity: number;
  responsiveness: number;
  competition: number;
}
