// Autonomous loop. Everything scheduled here is unattended and passive-safe.
// Active scanning is NOT scheduled here; it only runs from an approved gate.
import { discoverPrograms, persistDiscovered } from '@quarry/discovery';
import { runAutoScans, runAutoSubmit, selectTopPrograms } from '@quarry/autonomy';
import { enumerateAssets, persistAssets } from '@quarry/recon-passive';
import { reportReadyFindings } from '@quarry/analyzer';
import { draftAndQueue } from '@quarry/reporter';
import { prisma } from '@quarry/db';
import { audit } from '@quarry/core';

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 60_000);

// L4 auto-onboarding: pick top-scored programs with no assets yet, run passive
// recon + draft their report-ready findings. Stops at the allowlist — never
// creates an allowlist or approval. Human confirms scope (digest -> program).
async function autoOnboard() {
  const programs = await prisma.program.findMany({
    select: { id: true, handle: true, score: true, active: true },
  });
  const top = selectTopPrograms(programs, {
    minScore: Number(process.env.ONBOARD_MIN_SCORE ?? 0.7),
    limit: Number(process.env.ONBOARD_LIMIT ?? 5),
  });
  for (const p of top) {
    if ((await prisma.asset.count({ where: { programId: p.id } })) > 0) continue; // already onboarded
    const full = await prisma.program.findUnique({ where: { id: p.id } });
    const scope = (full?.parsedScope ?? {}) as { inScope?: string[] };
    const apexes = (scope.inScope ?? []).filter((a) => !a.includes('*') && !a.includes('/'));
    const assets = [];
    for (const apex of apexes.slice(0, 5)) {
      try { assets.push(...(await enumerateAssets(apex))); } catch { /* source down */ }
    }
    if (assets.length) await persistAssets(p.id, assets);
    for (const fid of await reportReadyFindings()) {
      try { await draftAndQueue(fid); } catch { /* skip */ }
    }
    await audit({ actor: 'onboarder:v1', action: 'onboarding.done', programId: p.id, detail: { assets: assets.length } });
    console.log(`[onboard] ${p.handle}: ${assets.length} assets`);
  }
}

async function tick() {
  try {
    // Phase 1: discovery — pull programs from configured platforms, parse
    // policies, score, persist. Connectors with no creds are skipped.
    const discovered = await discoverPrograms();
    if (discovered.length > 0) {
      const res = await persistDiscovered(discovered);
      console.log(
        `[discovery] +${res.created} ~${res.updated} =${res.unchanged}`,
      );
    }
    // L4 auto-onboarding — OFF unless enabled. Passive + draft only; stops at
    // the allowlist for human sign-off.
    if ((process.env.QUARRY_AUTO_ONBOARD ?? '').toLowerCase() === 'on') {
      await autoOnboard();
    }

    // Phase 2+ (passive recon, analyze, report) hang off the same loop as they
    // land. None of them originate target traffic.

    // L2 autonomous scanning — OFF unless explicitly enabled. Even on, it only
    // touches programs with a live, human-signed PreAuthorization, and every
    // target still passes the per-target gate + kill switch.
    if ((process.env.QUARRY_AUTOSCAN ?? '').toLowerCase() === 'on') {
      const runs = await runAutoScans();
      for (const r of runs) {
        console.log(`[autoscan] ${r.programId}: ${r.scanned} scanned${r.revoked ? ` (revoked: ${r.revoked})` : ''}`);
      }
    }

    // L3 auto-submit — OFF unless enabled. Only submits reports that clear each
    // program's opt-in policy bar; high-impact/critical never auto-submit.
    if ((process.env.QUARRY_AUTOSUBMIT ?? '').toLowerCase() === 'on') {
      const sent = await runAutoSubmit();
      for (const r of sent) {
        console.log(`[autosubmit] ${r.programId}: ${r.submitted} sent${r.paused ? ` (paused: ${r.paused})` : ''}`);
      }
    }
  } catch (e) {
    console.error('[tick] error', (e as Error).message);
  }
}

setInterval(() => {
  void tick();
}, TICK_MS);
console.log(`quarry worker up (passive/autonomous only), tick=${TICK_MS}ms`);
