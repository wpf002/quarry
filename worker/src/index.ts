// Autonomous loop. Everything scheduled here is unattended and passive-safe.
// Active scanning is NOT scheduled here; it only runs from an approved gate.
import { discoverPrograms, persistDiscovered } from '@quarry/discovery';

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
  } catch (e) {
    console.error('[tick] error', (e as Error).message);
  }
}

setInterval(() => {
  void tick();
}, TICK_MS);
console.log(`quarry worker up (passive/autonomous only), tick=${TICK_MS}ms`);
