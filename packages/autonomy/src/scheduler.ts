import { prisma } from '@quarry/db';
import { audit } from '@quarry/core';
import { runActiveScan, KillSwitchEngaged, type ScanProfile } from '@quarry/recon-active';
import { verifyProvenance, type CertFetcher } from './provenance.js';
import { evaluateBreaker } from './breaker.js';
import { livePreAuthorizations, revokePreAuthorization } from './preauth.js';

// Pick discovered assets that provably belong to a confirmed apex, capped by the
// remaining daily target budget. Pure aside from the injected cert fetch.
export async function selectAutoScanTargets(params: {
  assets: { value: string }[];
  apexes: string[];
  limit: number;
  certFetcher?: CertFetcher;
}): Promise<string[]> {
  const out: string[] = [];
  for (const a of params.assets) {
    if (out.length >= params.limit) break;
    const p = await verifyProvenance(a.value, params.apexes, { certFetcher: params.certFetcher });
    if (p.verified) out.push(a.value);
  }
  return out;
}

export interface AutoScanDeps {
  certFetcher?: CertFetcher;
  now?: Date;
  /** nominal cost per scan for budget accounting until Infiltr returns real cost */
  costPerScanUsd?: number;
}

// L2 autonomous scan loop. For each LIVE pre-authorization it scans a bounded
// set of provenance-verified targets. Every target still passes through
// runActiveScan -> assertActiveScanAllowed (the per-target gate). Any refusal,
// rate breach, or budget breach trips the breaker and REVOKES the auth.
export async function runAutoScans(deps: AutoScanDeps = {}): Promise<
  Array<{ programId: string; scanned: number; revoked?: string }>
> {
  const now = deps.now ?? new Date();
  const cost = deps.costPerScanUsd ?? 0;
  const results: Array<{ programId: string; scanned: number; revoked?: string }> = [];

  for (const pre of await livePreAuthorizations(now)) {
    const allowlist = await prisma.allowlist.findMany({
      where: { programId: pre.programId, active: true },
    });
    const apexes = allowlist.map((a) => a.pattern);
    const assets = await prisma.asset.findMany({
      where: { programId: pre.programId, source: { not: 'ACTIVE_SCAN' } },
      select: { value: true },
    });

    const targets = await selectAutoScanTargets({
      assets,
      apexes,
      limit: pre.maxTargetsPerDay,
      certFetcher: deps.certFetcher,
    });

    let scanned = 0;
    let oosHits = 0;
    let spent = 0;
    const tier = (pre.tiers.includes(2) ? 2 : 1) as 1 | 2;
    const profile: ScanProfile = { tiers: pre.tiers as (1 | 2)[] };

    for (const target of targets) {
      try {
        await runActiveScan({ programId: pre.programId, target, tier, profile });
        scanned++;
        spent += cost;
      } catch (e) {
        if (e instanceof KillSwitchEngaged) {
          results.push({ programId: pre.programId, scanned, revoked: 'kill switch' });
          return results; // global halt
        }
        oosHits++; // a gate refusal here means the auth's scope drifted
      }

      const verdict = evaluateBreaker(
        { oosHits, scansThisMinute: scanned, spentUsdToday: spent, policyChanged: false },
        { rateLimitPerMin: pre.rateLimitPerMin, dailyBudgetUsd: pre.dailyBudgetUsd },
      );
      if (verdict.trip) {
        await revokePreAuthorization(pre.id, verdict.reason ?? 'breaker tripped');
        results.push({ programId: pre.programId, scanned, revoked: verdict.reason });
        break;
      }
    }

    if (!results.some((r) => r.programId === pre.programId)) {
      await audit({
        actor: 'scheduler:v1',
        action: 'autoscan.run',
        programId: pre.programId,
        detail: { preauthId: pre.id, scanned, targets: targets.length },
      });
      results.push({ programId: pre.programId, scanned });
    }
  }
  return results;
}
