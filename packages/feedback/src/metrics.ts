import { computeOutcomeStats, type OutcomeStats } from './outcomes.js';
import type { SubmissionState } from '@quarry/db';

export interface MetricFinding {
  programId: string;
  vulnClass: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface MetricSubmission {
  state: SubmissionState;
  payoutUsd?: number | null;
  vulnClass?: string;
}

export interface Metrics {
  totalFindings: number;
  findingsPerProgram: Record<string, number>;
  outcomes: OutcomeStats;
  revenueByClass: Record<string, number>;
  totalRevenueUsd: number;
}

export function computeMetrics(
  findings: MetricFinding[],
  submissions: MetricSubmission[],
): Metrics {
  const findingsPerProgram: Record<string, number> = {};
  for (const f of findings) {
    findingsPerProgram[f.programId] = (findingsPerProgram[f.programId] ?? 0) + 1;
  }

  const revenueByClass: Record<string, number> = {};
  let totalRevenueUsd = 0;
  for (const s of submissions) {
    if (s.state === 'RESOLVED' && s.payoutUsd) {
      const cls = s.vulnClass ?? 'unknown';
      revenueByClass[cls] = (revenueByClass[cls] ?? 0) + s.payoutUsd;
      totalRevenueUsd += s.payoutUsd;
    }
  }

  return {
    totalFindings: findings.length,
    findingsPerProgram,
    outcomes: computeOutcomeStats(submissions.map((s) => s.state)),
    revenueByClass,
    totalRevenueUsd,
  };
}
