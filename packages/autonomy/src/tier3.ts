import { prisma } from '@quarry/db';
import { runActiveScan, KillSwitchEngaged, InfiltrError } from '@quarry/recon-active';
import { audit } from '@quarry/core';

// The Tier-3 approval queue. Tier 3 is high-impact exploitation and is NEVER
// run unattended. The worker fills this queue from Tier 1/2 signals; a human
// approves a batch in one action, and only then does each candidate run —
// still through the per-target gate, with the batch approval standing in as the
// per-action confirmation Tier 3 requires.

// Vuln classes where a Tier-3 confirmation is worth a human's one click: a
// detected signal that a high-impact check would escalate or prove impact.
export const ESCALATABLE_CLASSES = new Set([
  'sqli', 'sql-injection', 'rce', 'command-injection', 'ssrf', 'idor',
  'auth-bypass', 'authz', 'broken-access-control', 'lfi', 'rfi', 'xxe',
  'deserialization', 'path-traversal', 'ssti', 'file-upload',
]);

export function isTier3Worthy(f: { vulnClass: string; confidence: number }): boolean {
  return ESCALATABLE_CLASSES.has(f.vulnClass.toLowerCase()) && f.confidence >= 0.5;
}

// Populate the queue from recent Tier-1/2 findings. Only for programs with a
// live standing authorization, and only for targets on the active,
// ownership-verified allowlist. Creates PENDING rows; runs NOTHING.
export async function refreshTier3Queue(now: Date = new Date()): Promise<{ added: number }> {
  const preauths = await prisma.preAuthorization.findMany({
    where: { revoked: false, expiresAt: { gt: now } },
    select: { programId: true },
  });
  const programIds = [...new Set(preauths.map((p) => p.programId))];
  let added = 0;

  for (const programId of programIds) {
    const verified = await prisma.allowlist.findMany({
      where: { programId, active: true, ownershipVerified: true },
      select: { pattern: true },
    });
    const verifiedSet = new Set(verified.map((v) => v.pattern));
    if (verifiedSet.size === 0) continue;

    const findings = await prisma.finding.findMany({
      where: { programId, target: { not: null }, humanConfirmed: false },
      select: { target: true, vulnClass: true, confidence: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const byTarget = new Map<string, Set<string>>();
    for (const f of findings) {
      if (!f.target || !verifiedSet.has(f.target)) continue;
      if (!isTier3Worthy(f)) continue;
      if (!byTarget.has(f.target)) byTarget.set(f.target, new Set());
      byTarget.get(f.target)!.add(f.vulnClass);
    }

    for (const [target, classes] of byTarget) {
      const existing = await prisma.tier3Candidate.findUnique({
        where: { programId_target: { programId, target } },
      });
      if (existing) continue; // keep any prior decision (PENDING/RAN/DISMISSED)
      await prisma.tier3Candidate.create({
        data: { programId, target, reason: [...classes].join(', ') },
      });
      added++;
    }
  }
  return { added };
}

export async function listTier3Queue() {
  return prisma.tier3Candidate.findMany({
    where: { state: 'PENDING' },
    include: { program: { select: { handle: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export class Tier3Refusal extends Error {}

export interface Tier3RunResult {
  id: string;
  target: string;
  ok: boolean;
  assets?: number;
  findings?: number;
  error?: string;
}

// Approve + run a batch of queued candidates in ONE human action. Each still
// passes the per-target gate. Never called by the scheduler.
export async function approveAndRunTier3(
  ids: string[],
  approvedBy: string,
): Promise<Tier3RunResult[]> {
  if (!approvedBy) throw new Tier3Refusal('approvedBy (human identity) required');
  const out: Tier3RunResult[] = [];

  for (const id of ids) {
    const c = await prisma.tier3Candidate.findUnique({ where: { id } });
    if (!c || c.state !== 'PENDING') {
      out.push({ id, target: c?.target ?? '?', ok: false, error: 'not a pending candidate' });
      continue;
    }
    try {
      const result = await runActiveScan({
        programId: c.programId,
        target: c.target,
        tier: 3,
        profile: { tiers: [3] },
        perActionConfirmed: true, // the human approved this batch
      });
      await prisma.tier3Candidate.update({
        where: { id },
        data: {
          state: 'RAN',
          assets: result.assets.length,
          findings: result.findings.length,
          decidedBy: approvedBy,
          decidedAt: new Date(),
        },
      });
      out.push({ id, target: c.target, ok: true, assets: result.assets.length, findings: result.findings.length });
    } catch (e) {
      const msg =
        e instanceof KillSwitchEngaged ? 'kill switch engaged'
          : e instanceof InfiltrError ? `infiltr ${e.status || 'timeout'}`
            : (e as Error).message;
      await prisma.tier3Candidate.update({
        where: { id },
        data: { state: 'FAILED', error: msg, decidedBy: approvedBy, decidedAt: new Date() },
      });
      out.push({ id, target: c.target, ok: false, error: msg });
    }
  }

  await audit({
    actor: `human:${approvedBy}`,
    action: 'tier3.approve_batch',
    detail: { count: out.length, ok: out.filter((o) => o.ok).length },
  });
  return out;
}

export async function dismissTier3(ids: string[], by: string): Promise<{ dismissed: number }> {
  const r = await prisma.tier3Candidate.updateMany({
    where: { id: { in: ids }, state: 'PENDING' },
    data: { state: 'DISMISSED', decidedBy: by, decidedAt: new Date() },
  });
  return { dismissed: r.count };
}
