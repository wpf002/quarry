import { prisma } from '@quarry/db';
import { matches } from './matcher.js';
import { audit } from './audit.js';

/**
 * The single choke point for anything that would originate active traffic.
 * recon-active MUST call assertActiveScanAllowed() before every target.
 * Fails closed: ambiguity, missing approval, or expiry all return refusal.
 *
 * Layered checks (all must pass):
 *   1. A live, active Allowlist row whose pattern matches the target exactly
 *      (exact host / CIDR / url-prefix; wildcard only when allowWildcard).
 *   2. An APPROVED, unexpired ScanApproval pinned to that allowlist row.
 * Every pass is written to the append-only AuditLog. Every refusal throws.
 */
export async function assertActiveScanAllowed(
  programId: string,
  target: string,
): Promise<void> {
  // Load all active allowlist entries for the program and find one that the
  // matcher authorizes. We do NOT push matching into the DB query — the match
  // rules (CIDR containment, subdomain boundaries) live in one audited place.
  const candidates = await prisma.allowlist.findMany({
    where: { programId, active: true },
  });
  const entry = candidates.find((c) =>
    matches(c.pattern, target, c.allowWildcard),
  );

  if (!entry) {
    await audit({
      actor: 'core',
      action: 'scan.gate.refuse',
      programId,
      target,
      detail: { reason: 'no live allowlist match' },
    });
    throw new ScopeRefusal(`target not on live allowlist: ${target}`);
  }

  const approval = await prisma.scanApproval.findFirst({
    where: { programId, state: 'APPROVED', allowlistId: entry.id },
    orderBy: { approvedAt: 'desc' },
  });
  if (!approval) {
    await audit({
      actor: 'core',
      action: 'scan.gate.refuse',
      programId,
      target,
      detail: { reason: 'no APPROVED scan approval', allowlistId: entry.id },
    });
    throw new ScopeRefusal('no APPROVED scan approval');
  }
  if (approval.expiresAt && approval.expiresAt < new Date()) {
    await audit({
      actor: 'core',
      action: 'scan.gate.refuse',
      programId,
      target,
      detail: { reason: 'scan approval expired', approvalId: approval.id },
    });
    throw new ScopeRefusal('scan approval expired');
  }

  await audit({
    actor: 'core',
    action: 'scan.gate.pass',
    programId,
    target,
    detail: { allowlistId: entry.id, approvalId: approval.id },
  });
}

export class ScopeRefusal extends Error {}
