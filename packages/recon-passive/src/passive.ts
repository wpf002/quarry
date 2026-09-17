import { prisma } from '@quarry/db';
import { audit } from '@quarry/core';
import type { PassiveAsset, PassiveSource } from './types.js';
import { defaultPassiveSources } from './sources.js';

// AUTONOMOUS. Enumerate public-data assets for a domain across all sources and
// dedup. No target scanning — CT logs / passive DNS query third-party datasets.
export async function enumerateAssets(
  domain: string,
  sources: PassiveSource[] = defaultPassiveSources(),
): Promise<PassiveAsset[]> {
  const byValue = new Map<string, PassiveAsset>();
  for (const s of sources) {
    let assets: PassiveAsset[];
    try {
      assets = await s.enumerate(domain);
    } catch {
      continue; // one source failing must not sink the sweep
    }
    for (const a of assets) {
      if (a.source === 'ACTIVE_SCAN') continue; // guard: never here
      if (!byValue.has(a.value)) byValue.set(a.value, a);
    }
  }
  return [...byValue.values()];
}

// Persist assets. verdict is ALWAYS OUT_OF_SCOPE and verdictBy is the parser —
// discovery/recon never authorize scanning; a human builds the Allowlist.
export async function persistAssets(
  programId: string,
  assets: PassiveAsset[],
  verdictBy = 'parser:v1',
): Promise<{ written: number }> {
  let written = 0;
  for (const a of assets) {
    await prisma.asset.upsert({
      where: { programId_value: { programId, value: a.value } },
      create: {
        programId,
        value: a.value,
        verdict: 'OUT_OF_SCOPE',
        verdictBy,
        source: a.source,
        meta: (a.meta ?? {}) as object,
      },
      update: { source: a.source, meta: (a.meta ?? {}) as object },
    });
    written++;
  }
  await audit({
    actor: verdictBy,
    action: 'recon.passive.enrich',
    programId,
    detail: { count: written, sources: [...new Set(assets.map((a) => a.source))] },
  });
  return { written };
}
