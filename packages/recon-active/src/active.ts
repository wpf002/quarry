import { prisma } from '@quarry/db';
import { assertActiveScanAllowed, audit } from '@quarry/core';
import type { InfiltrClient, InfiltrResult, ScanTargetInput } from './types.js';
import { HttpInfiltrClient } from './infiltr.js';
import { isKilled } from './killswitch.js';
import { assertTierRunnable } from './tiers.js';

export class KillSwitchEngaged extends Error {}

export interface ActiveDeps {
  /** Defaults to the real core gate. Injected in tests. */
  assertAllowed?: (programId: string, target: string) => Promise<void>;
  infiltr?: InfiltrClient;
  killed?: () => Promise<boolean>;
  /** Persist results. Defaults to the DB writer below. */
  persist?: (programId: string, result: InfiltrResult) => Promise<void>;
}

// Run ONE active target. Order is deliberate and non-negotiable:
//   1. kill switch      2. tier permission     3. THE GATE (fails closed)
//   4. delegate to Infiltr   5. persist + audit
// The gate is checked for every single target. There is no batch bypass.
export async function runActiveScan(
  input: ScanTargetInput,
  deps: ActiveDeps = {},
): Promise<InfiltrResult> {
  const killed = deps.killed ?? isKilled;
  const assertAllowed = deps.assertAllowed ?? assertActiveScanAllowed;
  const infiltr = deps.infiltr ?? new HttpInfiltrClient();
  const persist = deps.persist ?? persistActiveResult;

  if (await killed()) {
    await safeAudit({
      actor: 'recon-active',
      action: 'scan.halted',
      programId: input.programId,
      target: input.target,
      detail: { reason: 'kill switch engaged' },
    });
    throw new KillSwitchEngaged('kill switch engaged; all active work halted');
  }

  // Tier gating before the network gate — cheap refusal first.
  assertTierRunnable(input.tier, input.profile, !!input.perActionConfirmed);

  // THE GATE. Throws ScopeRefusal if the target is not on a live allowlist
  // under a valid, unexpired approval. This is the choke point.
  await assertAllowed(input.programId, input.target);

  await safeAudit({
    actor: 'recon-active',
    action: 'scan.run',
    programId: input.programId,
    target: input.target,
    detail: { tier: input.tier, profile: input.profile },
  });

  const result = await infiltr.scan(input.target, input.profile, input.context);
  await persist(input.programId, result);
  return result;
}

// Sequential batch. EACH target is independently gated by runActiveScan; a
// refusal on one target does not authorize the next. Tier 3 is rejected in
// batch mode (needs per-action confirmation, done one at a time elsewhere).
export async function runActiveScanBatch(
  inputs: ScanTargetInput[],
  deps: ActiveDeps = {},
): Promise<Array<{ target: string; ok: boolean; error?: string }>> {
  const out: Array<{ target: string; ok: boolean; error?: string }> = [];
  for (const input of inputs) {
    if (input.tier === 3) {
      out.push({ target: input.target, ok: false, error: 'tier 3 not allowed in batch' });
      continue;
    }
    try {
      await runActiveScan(input, deps);
      out.push({ target: input.target, ok: true });
    } catch (e) {
      out.push({ target: input.target, ok: false, error: (e as Error).message });
    }
  }
  return out;
}

// Classes that are enumeration, not vulnerabilities. Infiltr sometimes emits a
// "finding" per discovered URL; those belong in assets, not the findings list.
const ENDPOINT_CLASSES = new Set(['discovered-endpoint']);

// Results flow back as ACTIVE_SCAN assets and Finding rows, ready for the
// analyzer + quality gate.
async function persistActiveResult(
  programId: string,
  result: InfiltrResult,
): Promise<void> {
  // Route endpoint-enumeration "findings" into assets so they don't flood the
  // findings list; keep only real findings.
  const realFindings = result.findings.filter((f) => !ENDPOINT_CLASSES.has(f.vulnClass));
  const endpointUrls = result.findings
    .filter((f) => ENDPOINT_CLASSES.has(f.vulnClass))
    .map((f) => (f.evidence as { url?: unknown })?.url)
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
  const assetValues = [...new Set([...result.assets, ...endpointUrls])];

  // Bulk insert — one round-trip each, not one per row.
  if (assetValues.length > 0) {
    await prisma.asset.createMany({
      data: assetValues.map((value) => ({
        programId, value, verdict: 'OUT_OF_SCOPE' as const, verdictBy: 'infiltr', source: 'ACTIVE_SCAN' as const,
      })),
      skipDuplicates: true,
    });
  }
  if (realFindings.length > 0) {
    await prisma.finding.createMany({
      data: realFindings.map((f) => ({
        programId,
        title: f.title,
        vulnClass: f.vulnClass,
        severity: f.severity,
        // Trust Infiltr's confidence; it drives the report-ready gate (>= 0.8).
        confidence: typeof f.confidence === 'number' ? f.confidence : 0.5,
        dupRisk: 0.5,
        evidence: f.evidence as object,
        target: result.target,
      })),
    });
  }
  await audit({
    actor: 'infiltr',
    action: 'scan.results',
    programId,
    target: result.target,
    detail: { assets: assetValues.length, findings: realFindings.length, endpointsRerouted: endpointUrls.length },
  });
}

async function safeAudit(entry: Parameters<typeof audit>[0]): Promise<void> {
  try {
    await audit(entry);
  } catch {
    /* auditing must not mask the primary refusal */
  }
}
