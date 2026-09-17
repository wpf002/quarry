import { prisma } from '@quarry/db';
import { audit } from '@quarry/core';
import { HeuristicPolicyParser, type PolicyParser, type ParsedScope } from '@quarry/ai';
import type { RawProgram } from './types.js';
import type { EarnabilityScore as ScoreBreakdown } from './scorer.js';
import type { PlatformConnector } from './connectors.js';
import { defaultConnectors } from './connectors.js';
import { scoreEarnability, countScannableAssets } from './scorer.js';

export interface DiscoveredProgram {
  raw: RawProgram;
  parsedScope: ParsedScope;
  parseConfidence: number;
  ambiguityFlags: string[];
  score: ScoreBreakdown;
  scannableAssets: number;
}

// AUTONOMOUS. Pull programs from every configured connector, parse each policy,
// and score it. No target traffic — only platform APIs. Pure aside from the
// connectors' own network calls; returns data, persistence is separate.
export async function discoverPrograms(
  connectors: PlatformConnector[] = defaultConnectors(),
  parser: PolicyParser = new HeuristicPolicyParser(),
): Promise<DiscoveredProgram[]> {
  const out: DiscoveredProgram[] = [];
  for (const c of connectors) {
    let raws: RawProgram[] | null;
    try {
      raws = await c.fetchPrograms();
    } catch {
      // A single platform being down must not sink the whole run.
      continue;
    }
    if (!raws) continue; // connector had no creds
    for (const raw of raws) {
      const parsed = parser.parsePolicy(raw.policyRaw);
      const scannable = countScannableAssets(parsed.scope.inScope);
      const score = scoreEarnability({
        offersBounty: raw.offersBounty ?? false,
        isOpen: (raw.platformStatus ?? 'open') === 'open',
        maxBountyUsd: raw.maxBountyUsd,
        scannableAssets: scannable,
        programAgeDays: raw.startedAt
          ? Math.floor((Date.now() - raw.startedAt.getTime()) / 86_400_000)
          : undefined,
      });
      out.push({
        raw,
        parsedScope: parsed.scope,
        parseConfidence: parsed.confidence,
        ambiguityFlags: parsed.ambiguityFlags,
        score,
        scannableAssets: scannable,
      });
    }
  }
  return out;
}

/** parseConfidence at or above this means scope came from enrichment, not the heuristic. */
export const ENRICHED_CONFIDENCE = 0.9;

/** True when a connector actually returned policy text worth re-parsing. */
export function carriesPolicy(policyRaw: string | null | undefined): boolean {
  return (policyRaw ?? '').trim().length > 0;
}

// Persist discovery output. Upserts Program rows and re-parses only when the
// policy text actually changed (diff). Writes an AuditLog row per parse. This
// NEVER flips `active` and NEVER marks an asset authoritatively in-scope.
export async function persistDiscovered(
  discovered: DiscoveredProgram[],
): Promise<{ created: number; updated: number; unchanged: number }> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const d of discovered) {
    const existing = await prisma.program.findUnique({
      where: {
        platform_handle: { platform: d.raw.platform, handle: d.raw.handle },
      },
    });

    // Enrichment is authoritative. Once a program has real, fetched scope, a
    // discovery poll must never downgrade it back to the heuristic parse --
    // otherwise the two fight each other on every tick.
    if (existing && existing.parseConfidence >= ENRICHED_CONFIDENCE) {
      await prisma.program.update({
        where: { id: existing.id },
        data: {
          name: d.raw.name,
          maxBountyUsd: d.raw.maxBountyUsd ?? existing.maxBountyUsd,
          offersBounty: d.raw.offersBounty ?? existing.offersBounty,
          platformStatus: d.raw.platformStatus ?? existing.platformStatus,
          bountyCurrency: d.raw.bountyCurrency ?? existing.bountyCurrency,
        },
      });
      unchanged++;
      continue;
    }

    // A list-level poll carries no policy text, so there is nothing new to
    // parse. Refresh only the cheap list fields.
    if (existing && !carriesPolicy(d.raw.policyRaw)) {
      await prisma.program.update({
        where: { id: existing.id },
        data: {
          name: d.raw.name,
          maxBountyUsd: d.raw.maxBountyUsd ?? existing.maxBountyUsd,
        },
      });
      unchanged++;
      continue;
    }

    if (existing && existing.policyRaw === d.raw.policyRaw) {
      unchanged++;
      continue;
    }

    const data = {
      name: d.raw.name,
      policyRaw: d.raw.policyRaw,
      parsedScope: d.parsedScope as object,
      parseConfidence: d.parseConfidence,
      ambiguityFlags: d.ambiguityFlags,
      maxBountyUsd: d.raw.maxBountyUsd ?? null,
      bountyCurrency: d.raw.bountyCurrency ?? null,
      offersBounty: d.raw.offersBounty ?? false,
      platformStatus: d.raw.platformStatus ?? null,
      startedAt: d.raw.startedAt ?? null,
      scannableAssets: d.scannableAssets,
      score: d.score.total,
    };

    const row = await prisma.program.upsert({
      where: {
        platform_handle: { platform: d.raw.platform, handle: d.raw.handle },
      },
      create: { platform: d.raw.platform, handle: d.raw.handle, ...data },
      update: data,
    });

    if (existing) updated++;
    else created++;

    await audit({
      actor: 'parser:heuristic-v1',
      action: 'scope.parse',
      programId: row.id,
      detail: {
        confidence: d.parseConfidence,
        ambiguityFlags: d.ambiguityFlags,
        inScopeProposed: d.parsedScope.inScope,
        note: 'advisory only; does not authorize scanning',
      },
    });
  }

  return { created, updated, unchanged };
}
