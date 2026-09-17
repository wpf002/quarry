import { prisma } from '@quarry/db';
import { audit } from './audit.js';

// Approval logic for the human gate. evaluateApproval() is pure and testable;
// grantScanApproval() applies it against the DB and writes the ScanApproval
// rows that make an active scan legal.

export interface ApprovalCheck {
  activeAllowlistCount: number;
  liveApprovalTargets: number; // distinct programs already approved-and-live
  maxConcurrent: number;
}

export interface ApprovalDecision {
  ok: boolean;
  reason?: string;
}

export function evaluateApproval(c: ApprovalCheck): ApprovalDecision {
  if (c.activeAllowlistCount < 1) {
    return { ok: false, reason: 'allowlist is empty — add at least one confirmed in-scope pattern' };
  }
  if (c.liveApprovalTargets >= c.maxConcurrent) {
    return { ok: false, reason: `concurrency cap reached (${c.maxConcurrent} active targets)` };
  }
  return { ok: true };
}

export function approvalExpiry(now: Date, ttlHours: number): Date {
  return new Date(now.getTime() + ttlHours * 3_600_000);
}

async function countLiveApprovalTargets(now: Date): Promise<number> {
  const live = await prisma.scanApproval.findMany({
    where: { state: 'APPROVED', expiresAt: { gt: now } },
    select: { programId: true },
    distinct: ['programId'],
  });
  return live.length;
}

export class ApprovalRefusal extends Error {}

/**
 * Grant scan approval for a program. Validates the gate conditions, then pins
 * one APPROVED ScanApproval per active Allowlist entry with an expiry. Refuses
 * (throws ApprovalRefusal) if any condition fails. This is a reviewed-change
 * code path — see README non-negotiables.
 */
export async function grantScanApproval(
  programId: string,
  approvedBy: string,
  opts?: { ttlHours?: number; maxConcurrent?: number; now?: Date; scanProfile?: object },
): Promise<{ approvals: number; expiresAt: Date }> {
  if (!approvedBy) throw new ApprovalRefusal('approvedBy (human identity) is required');
  const now = opts?.now ?? new Date();
  const ttlHours = opts?.ttlHours ?? Number(process.env.SCAN_APPROVAL_TTL_HOURS ?? 24);
  const maxConcurrent =
    opts?.maxConcurrent ?? Number(process.env.MAX_CONCURRENT_ACTIVE_TARGETS ?? 5);

  await prisma.program.findUniqueOrThrow({ where: { id: programId } }); // existence check
  const allowlist = await prisma.allowlist.findMany({
    where: { programId, active: true },
  });
  const liveApprovalTargets = await countLiveApprovalTargets(now);

  const decision = evaluateApproval({
    activeAllowlistCount: allowlist.length,
    liveApprovalTargets,
    maxConcurrent,
  });
  if (!decision.ok) {
    await audit({
      actor: `human:${approvedBy}`,
      action: 'approval.refuse',
      programId,
      detail: { reason: decision.reason },
    });
    throw new ApprovalRefusal(decision.reason ?? 'approval refused');
  }

  const expiresAt = approvalExpiry(now, ttlHours);
  const scanProfile = opts?.scanProfile ?? { tiers: [1] };

  await prisma.scanApproval.createMany({
    data: allowlist.map((entry) => ({
      programId,
      allowlistId: entry.id,
      state: 'APPROVED' as const,
      approvedBy,
      approvedAt: now,
      expiresAt,
      scanProfile: scanProfile as object,
    })),
  });

  await audit({
    actor: `human:${approvedBy}`,
    action: 'approval.grant',
    programId,
    detail: { allowlistEntries: allowlist.length, expiresAt: expiresAt.toISOString(), ttlHours },
  });

  return { approvals: allowlist.length, expiresAt };
}
