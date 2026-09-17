import { prisma } from '@quarry/db';
import { audit } from '@quarry/core';
import { computeOutcomeStats } from '@quarry/feedback';
import { grantPreAuthorization, revokePreAuthorization, ttlHoursUntil } from './preauth.js';
import { runAutoScans } from './scheduler.js';
import { runAutoSubmit, NEVER_AUTOSUBMIT } from './autosubmit.js';

export class CampaignRefusal extends Error {}

export interface CampaignLiveness {
  live: boolean;
  reason?: string;
}

export function evaluateCampaign(
  env: { paused: boolean; expiresAt: Date },
  now: Date,
): CampaignLiveness {
  if (env.paused) return { live: false, reason: 'paused' };
  if (env.expiresAt.getTime() <= now.getTime()) return { live: false, reason: 'expired' };
  return { live: true };
}

export interface AutopilotMetrics {
  oosHits: number;
  tier3Discovered: number;
  policyChanged: boolean;
  validRate: number;
  sample: number;
}

export interface AutopilotTrigger {
  pause: boolean;
  reason?: string;
}

// Any one of these halts the whole campaign. Fails toward pausing.
export function autopilotTriggers(m: AutopilotMetrics): AutopilotTrigger {
  if (m.tier3Discovered > 0) return { pause: true, reason: `${m.tier3Discovered} tier-3-class finding(s) — needs a human` };
  if (m.policyChanged) return { pause: true, reason: 'program policy changed' };
  if (m.oosHits > 0) return { pause: true, reason: `${m.oosHits} out-of-scope hit(s)` };
  if (m.sample >= 10 && m.validRate < 0.7) return { pause: true, reason: `valid-rate ${(m.validRate * 100).toFixed(0)}% below floor` };
  return { pause: false };
}

export interface SignCampaignOpts {
  tiers?: number[];
  expiresAt?: Date;
  maxTargetsPerDay?: number;
  rateLimitPerMin?: number;
  dailyBudgetUsd?: number;
  autoSubmit?: boolean;
  minConfidence?: number;
  maxDupRisk?: number;
  dailyCap?: number;
  now?: Date;
}

// Sign an campaign over a set of programs. Pre-validates every program is
// gate-ready and ownership-verified (fail-closed for the whole set), then
// provisions L2 pre-authorizations and, if enabled, L3 auto-submit policies,
// all aligned to the campaign expiry.
export async function signCampaign(
  programIds: string[],
  signedBy: string,
  opts: SignCampaignOpts = {},
): Promise<{ id: string; expiresAt: Date }> {
  if (!signedBy) throw new CampaignRefusal('signedBy required');
  if (!programIds.length) throw new CampaignRefusal('at least one program required');
  const now = opts.now ?? new Date();
  const expiresAt = opts.expiresAt ?? new Date(now.getTime() + 7 * 86_400_000);
  const tiers = (opts.tiers ?? [1, 2]).filter((t) => t === 1 || t === 2);

  // Pre-validate ALL programs before provisioning any.
  for (const programId of programIds) {
    const program = await prisma.program.findUniqueOrThrow({ where: { id: programId } });
    if (program.ambiguityFlags.length > 0) throw new CampaignRefusal(`${program.handle}: ambiguity flags remain`);
    const allowlist = await prisma.allowlist.findMany({ where: { programId, active: true } });
    if (allowlist.length === 0) throw new CampaignRefusal(`${program.handle}: allowlist empty`);
    if (allowlist.some((e) => !e.ownershipVerified)) throw new CampaignRefusal(`${program.handle}: unverified allowlist entries`);
  }

  // Provision.
  for (const programId of programIds) {
    await grantPreAuthorization(programId, signedBy, {
      tiers, expiresAt, now,
      maxTargetsPerDay: opts.maxTargetsPerDay,
      rateLimitPerMin: opts.rateLimitPerMin,
      dailyBudgetUsd: opts.dailyBudgetUsd,
    });
    if (opts.autoSubmit) {
      await prisma.autoSubmitPolicy.upsert({
        where: { programId },
        create: { programId, createdBy: signedBy, enabled: true, minConfidence: opts.minConfidence ?? 0.85, maxDupRisk: opts.maxDupRisk ?? 0.3, dailyCap: opts.dailyCap ?? 3, allowedVulnClasses: [] },
        update: { enabled: true, minConfidence: opts.minConfidence ?? 0.85, maxDupRisk: opts.maxDupRisk ?? 0.3, dailyCap: opts.dailyCap ?? 3 },
      });
    }
  }

  const env = await prisma.campaign.create({
    data: {
      signedBy, programIds, tiers, expiresAt,
      maxTargetsPerDay: opts.maxTargetsPerDay ?? 25,
      rateLimitPerMin: opts.rateLimitPerMin ?? 20,
      dailyBudgetUsd: opts.dailyBudgetUsd ?? 5,
      autoSubmit: opts.autoSubmit ?? false,
      minConfidence: opts.minConfidence ?? 0.85,
      maxDupRisk: opts.maxDupRisk ?? 0.3,
      dailyCap: opts.dailyCap ?? 3,
    },
  });
  await audit({ actor: `human:${signedBy}`, action: 'campaign.sign', detail: { campaignId: env.id, programIds, tiers, autoSubmit: env.autoSubmit, expiresAt: expiresAt.toISOString() } });
  return { id: env.id, expiresAt };
}

// Pause an campaign: stop the autopilot AND revoke its programs' standing auths
// and auto-submit. Nothing keeps running once paused.
export async function pauseCampaign(id: string, reason: string, by = 'system'): Promise<void> {
  const env = await prisma.campaign.update({ where: { id }, data: { paused: true, pausedReason: reason } });
  const preauths = await prisma.preAuthorization.findMany({ where: { programId: { in: env.programIds }, revoked: false } });
  for (const p of preauths) await revokePreAuthorization(p.id, `campaign paused: ${reason}`);
  await prisma.autoSubmitPolicy.updateMany({ where: { programId: { in: env.programIds } }, data: { enabled: false } });
  await audit({ actor: by === 'system' ? 'autopilot' : `human:${by}`, action: 'campaign.pause', detail: { campaignId: id, reason } });
}

export async function liveCampaigns(now: Date) {
  return prisma.campaign.findMany({ where: { paused: false, expiresAt: { gt: now } } });
}

// The lights-out loop. Per live campaign: check pause triggers; if clear, the
// shared executors run scans + submits (which act on the provisioned preauths /
// policies). Each target still passes the per-target gate + kill switch.
export async function runAutopilot(
  deps: { now?: Date; certFetcher?: import('./provenance.js').CertFetcher } = {},
): Promise<Array<{ campaignId: string; paused?: string }>> {
  const now = deps.now ?? new Date();
  const out: Array<{ campaignId: string; paused?: string }> = [];

  for (const env of await liveCampaigns(now)) {
    const tier3Discovered = (
      await prisma.finding.findMany({
        where: { programId: { in: env.programIds }, createdAt: { gt: env.createdAt } },
        select: { vulnClass: true },
      })
    ).filter((f) => NEVER_AUTOSUBMIT.has(f.vulnClass)).length;

    const policyChanged =
      (await prisma.auditLog.count({
        where: { action: 'scope.parse', programId: { in: env.programIds }, createdAt: { gt: env.createdAt } },
      })) > 0;

    const recent = await prisma.submission.findMany({
      where: { report: { finding: { programId: { in: env.programIds } } } },
      orderBy: { updatedAt: 'desc' }, take: 20, select: { state: true },
    });
    const stats = computeOutcomeStats(recent.map((r) => r.state));

    const trig = autopilotTriggers({ oosHits: 0, tier3Discovered, policyChanged, validRate: stats.validRate, sample: stats.decided });
    if (trig.pause) {
      await pauseCampaign(env.id, trig.reason ?? 'autopilot trigger');
      out.push({ campaignId: env.id, paused: trig.reason });
    } else {
      out.push({ campaignId: env.id });
    }
  }

  // Shared executors act on whatever authorizations remain live.
  await runAutoScans({ certFetcher: deps.certFetcher });
  await runAutoSubmit({ now });
  await audit({ actor: 'autopilot', action: 'autopilot.run', detail: { campaigns: out.length } });
  return out;
}
