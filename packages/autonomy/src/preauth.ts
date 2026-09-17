import { prisma } from '@quarry/db';
import { audit, grantScanApproval } from '@quarry/core';

export interface PreAuthLiveness {
  live: boolean;
  reason?: string;
}

export function evaluatePreAuth(
  p: { revoked: boolean; expiresAt: Date },
  now: Date,
): PreAuthLiveness {
  if (p.revoked) return { live: false, reason: 'revoked' };
  if (p.expiresAt.getTime() <= now.getTime()) return { live: false, reason: 'expired' };
  return { live: true };
}

export function ttlHoursUntil(expiresAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 3_600_000));
}

export class PreAuthRefusal extends Error {}

export interface GrantPreAuthOpts {
  tiers?: number[];
  expiresAt?: Date;
  maxTargetsPerDay?: number;
  rateLimitPerMin?: number;
  dailyBudgetUsd?: number;
  now?: Date;
}

// Sign a standing authorization. Stricter than a one-off approval: it ALSO
// requires every active allowlist entry to be ownership-verified, because the
// scheduler will act on it unattended. Tier 3 is never allowed here.
export async function grantPreAuthorization(
  programId: string,
  signedBy: string,
  opts: GrantPreAuthOpts = {},
): Promise<{ id: string; expiresAt: Date }> {
  if (!signedBy) throw new PreAuthRefusal('signedBy (human identity) required');
  const now = opts.now ?? new Date();
  const expiresAt = opts.expiresAt ?? new Date(now.getTime() + 7 * 86_400_000);
  const tiers = (opts.tiers ?? [1, 2]).filter((t) => t === 1 || t === 2);
  if (tiers.length === 0) throw new PreAuthRefusal('tiers must include 1 and/or 2 (never 3)');

  const program = await prisma.program.findUniqueOrThrow({ where: { id: programId } });
  if (program.ambiguityFlags.length > 0) {
    throw new PreAuthRefusal(`${program.ambiguityFlags.length} ambiguity flag(s) must be cleared`);
  }
  const allowlist = await prisma.allowlist.findMany({ where: { programId, active: true } });
  if (allowlist.length === 0) throw new PreAuthRefusal('allowlist is empty');
  const unverified = allowlist.filter((e) => !e.ownershipVerified);
  if (unverified.length > 0) {
    throw new PreAuthRefusal(
      `${unverified.length} allowlist entr(y/ies) not ownership-verified — standing auth requires provenance`,
    );
  }

  // Create the approval rows the per-target gate reads, aligned to this expiry.
  await grantScanApproval(programId, signedBy, {
    ttlHours: ttlHoursUntil(expiresAt, now),
    now,
    scanProfile: { tiers },
  });

  const pre = await prisma.preAuthorization.create({
    data: {
      programId,
      signedBy,
      tiers,
      maxTargetsPerDay: opts.maxTargetsPerDay ?? 25,
      rateLimitPerMin: opts.rateLimitPerMin ?? 20,
      dailyBudgetUsd: opts.dailyBudgetUsd ?? 5,
      expiresAt,
    },
  });
  await audit({
    actor: `human:${signedBy}`,
    action: 'preauth.grant',
    programId,
    detail: { preauthId: pre.id, tiers, expiresAt: expiresAt.toISOString(), maxTargetsPerDay: pre.maxTargetsPerDay, dailyBudgetUsd: pre.dailyBudgetUsd },
  });
  return { id: pre.id, expiresAt };
}

export async function revokePreAuthorization(
  id: string,
  reason: string,
  by = 'system',
): Promise<void> {
  const pre = await prisma.preAuthorization.update({
    where: { id },
    data: { revoked: true, revokedReason: reason },
  });
  await audit({
    actor: by === 'system' ? 'breaker' : `human:${by}`,
    action: 'preauth.revoke',
    programId: pre.programId,
    detail: { preauthId: id, reason },
  });
}

export async function livePreAuthorizations(now: Date) {
  return prisma.preAuthorization.findMany({
    where: { revoked: false, expiresAt: { gt: now } },
  });
}
