// Autonomous loop. Everything scheduled here is unattended and passive-safe.
// Active scanning is NOT scheduled here; it only runs from an approved gate.
import { discoverPrograms, persistDiscovered } from '@quarry/discovery';
import { runAutoScans } from '@quarry/autonomy';

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 60_000);

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
  } catch (e) {
    console.error('[tick] error', (e as Error).message);
  }
}

setInterval(() => {
  void tick();
}, TICK_MS);
console.log(`quarry worker up (passive/autonomous only), tick=${TICK_MS}ms`);
