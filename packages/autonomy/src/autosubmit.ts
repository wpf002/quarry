import { prisma, type SubmissionState } from '@quarry/db';
import { audit } from '@quarry/core';
import { computeOutcomeStats } from '@quarry/feedback';

// L3 auto-submit. Opt-in per program. A report goes out without a click only if
// its finding clears the policy bar AND is not high-impact. Reputation breaker
// pauses auto-submit when valid-rate falls.

// These never auto-submit, regardless of policy — they need a human read.
export const NEVER_AUTOSUBMIT = new Set([
  'rce', 'sqli', 'auth-bypass', 'authentication-bypass', 'account-takeover',
  'deserialization', 'ssrf', 'privilege-escalation', 'xxe', 'ssti', 'idor',
]);

export interface AutoSubmitPolicyView {
  enabled: boolean;
  minConfidence: number;
  maxDupRisk: number;
  allowedVulnClasses: string[];
  requireChain: boolean;
}

export interface AutoSubmitFinding {
  confidence: number;
  dupRisk: number;
  vulnClass: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  chainLen: number;
}

export interface Eligibility {
  ok: boolean;
  reason?: string;
}

export function eligibleForAutoSubmit(
  f: AutoSubmitFinding,
  p: AutoSubmitPolicyView,
): Eligibility {
  if (!p.enabled) return { ok: false, reason: 'auto-submit disabled' };
  if (f.severity === 'CRITICAL') return { ok: false, reason: 'critical severity never auto-submits' };
  if (NEVER_AUTOSUBMIT.has(f.vulnClass)) return { ok: false, reason: `${f.vulnClass} is high-impact; manual only` };
  if (f.confidence <= p.minConfidence) return { ok: false, reason: `confidence ${f.confidence.toFixed(2)} <= ${p.minConfidence}` };
  if (f.dupRisk >= p.maxDupRisk) return { ok: false, reason: `dupRisk ${f.dupRisk.toFixed(2)} >= ${p.maxDupRisk}` };
  if (p.allowedVulnClasses.length > 0 && !p.allowedVulnClasses.includes(f.vulnClass)) {
    return { ok: false, reason: `${f.vulnClass} not in allowed classes` };
  }
  if (p.requireChain && f.chainLen === 0) return { ok: false, reason: 'policy requires a chain' };
  return { ok: true };
}

export interface ReputationVerdict {
  ok: boolean;
  validRate: number;
  sample: number;
}

// Pause auto-submit if valid-rate falls below the floor over a big-enough
// sample. Too few decided outcomes -> allow (no evidence to pause on).
export function reputationOk(
  recentStates: SubmissionState[],
  floor = 0.7,
  minSample = 10,
): ReputationVerdict {
  const stats = computeOutcomeStats(recentStates);
  if (stats.decided < minSample) return { ok: true, validRate: stats.validRate, sample: stats.decided };
  return { ok: stats.validRate >= floor, validRate: stats.validRate, sample: stats.decided };
}

// DB orchestration. For each enabled program: check reputation, then submit
// eligible held reports up to the daily cap. Audited throughout.
export async function runAutoSubmit(
  opts: { now?: Date } = {},
): Promise<Array<{ programId: string; submitted: number; paused?: string }>> {
  const now = opts.now ?? new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const results: Array<{ programId: string; submitted: number; paused?: string }> = [];

  const policies = await prisma.autoSubmitPolicy.findMany({ where: { enabled: true } });
  for (const policy of policies) {
    const recent = await prisma.submission.findMany({
      where: { report: { finding: { programId: policy.programId } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { state: true },
    });
    const rep = reputationOk(recent.map((r) => r.state));
    if (!rep.ok) {
      await audit({ actor: 'autosubmit:v1', action: 'autosubmit.paused', programId: policy.programId, detail: { reason: 'valid-rate below floor', validRate: rep.validRate, sample: rep.sample } });
      results.push({ programId: policy.programId, submitted: 0, paused: `valid-rate ${(rep.validRate * 100).toFixed(0)}%` });
      continue;
    }

    const sentToday = await prisma.submission.count({
      where: { state: 'SUBMITTED', updatedAt: { gte: startOfDay }, report: { finding: { programId: policy.programId } } },
    });
    let budget = Math.max(0, policy.dailyCap - sentToday);

    const held = await prisma.submission.findMany({
      where: { state: 'HELD_FOR_REVIEW', report: { finding: { programId: policy.programId } } },
      include: { report: { include: { finding: true } } },
      orderBy: { createdAt: 'asc' },
    });

    let submitted = 0;
    for (const sub of held) {
      if (budget <= 0) break;
      const finding = sub.report?.finding;
      if (!finding) continue;
      const elig = eligibleForAutoSubmit(
        { confidence: finding.confidence, dupRisk: finding.dupRisk, vulnClass: finding.vulnClass, severity: finding.severity, chainLen: finding.chainOf.length },
        policy,
      );
      if (!elig.ok) continue;
      await prisma.submission.update({ where: { id: sub.id }, data: { state: 'SUBMITTED' } });
      await audit({ actor: 'autosubmit:v1', action: 'autosubmit.sent', programId: policy.programId, detail: { submissionId: sub.id, vulnClass: finding.vulnClass, confidence: finding.confidence } });
      submitted++;
      budget--;
    }
    results.push({ programId: policy.programId, submitted });
  }
  return results;
}
