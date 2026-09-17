import { prisma, type SubmissionState } from '@quarry/db';
import { audit } from '@quarry/core';
import { scoreEarnability } from '@quarry/discovery';
import { computeOutcomeStats } from './outcomes.js';
import { scoreMultiplier } from './scoring-feedback.js';

// Record a platform outcome on a submission and audit it. Terminal outcomes may
// carry a payout.
export async function recordOutcome(
  submissionId: string,
  outcome: { state: SubmissionState; payoutUsd?: number; resolvedAt?: Date },
): Promise<void> {
  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      state: outcome.state,
      payoutUsd: outcome.payoutUsd ?? null,
      resolvedAt: outcome.resolvedAt ?? (outcome.state === 'RESOLVED' ? new Date() : null),
    },
  });
  await audit({
    actor: 'feedback:v1',
    action: 'submission.outcome',
    detail: { submissionId, state: outcome.state, payoutUsd: outcome.payoutUsd ?? null },
  });
}

// Recompute a program's score from its base signals, then apply the outcome
// multiplier so historical performance feeds ranking.
export async function recomputeProgramScore(programId: string): Promise<number> {
  const program = await prisma.program.findUniqueOrThrow({ where: { id: programId } });
  const scope = (program.parsedScope ?? {}) as { inScope?: string[] };
  const inScope = scope.inScope ?? [];

  const base = scoreEarnability({
    offersBounty: program.offersBounty,
    isOpen: (program.platformStatus ?? 'open') === 'open',
    maxBountyUsd: program.maxBountyUsd ?? undefined,
    scannableAssets: program.scannableAssets,
    programAgeDays: program.startedAt
      ? Math.floor((Date.now() - program.startedAt.getTime()) / 86_400_000)
      : undefined,
  });

  const submissions = await prisma.submission.findMany({
    where: { report: { finding: { programId } } },
    select: { state: true },
  });
  const stats = computeOutcomeStats(submissions.map((s) => s.state));
  const adjusted = Number(Math.max(0, Math.min(1, base.total * scoreMultiplier(stats))).toFixed(4));

  await prisma.program.update({ where: { id: programId }, data: { score: adjusted } });
  await audit({
    actor: 'feedback:v1',
    action: 'score.recompute',
    programId,
    detail: { base: base.total, multiplier: scoreMultiplier(stats), adjusted, validRate: stats.validRate, dupRate: stats.dupRate },
  });
  return adjusted;
}
