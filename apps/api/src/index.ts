import Fastify from 'fastify';
import { prisma } from '@quarry/db';
import {
  audit,
  grantScanApproval,
  ApprovalRefusal,
  evaluate as evaluateMatch,
} from '@quarry/core';
import { recordOutcome, recomputeProgramScore } from '@quarry/feedback';
import { runActiveScan, KillSwitchEngaged, InfiltrError, TierRefusal } from '@quarry/recon-active';
import { ScopeRefusal } from '@quarry/core';
import { grantPreAuthorization, revokePreAuthorization, PreAuthRefusal, signCampaign, pauseCampaign, CampaignRefusal, liveVerify, refreshTier3Queue, listTier3Queue, approveAndRunTier3, dismissTier3, Tier3Refusal } from '@quarry/autonomy';

const app = Fastify({ logger: true });

// Minimal permissive CORS for the local dashboard (different port). Tighten for
// any real deployment.
app.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', process.env.DASHBOARD_ORIGIN ?? '*');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') reply.code(204).send();
});

app.get('/health', async () => ({ ok: true }));

// --- read models -----------------------------------------------------------
app.get('/programs', async () => {
  return prisma.program.findMany({
    orderBy: [{ score: 'desc' }],
    include: { _count: { select: { allowlist: true } } },
  });
});

app.get('/programs/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      allowlist: { orderBy: { createdAt: 'desc' } },
      approvals: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!program) return reply.code(404).send({ error: 'not found' });
  return program;
});

// --- allowlist builder (human) --------------------------------------------
// Whitelist only. Wildcards require an explicit toggle AND a note. There is no
// import-from-parsedScope shortcut, by design.
app.post('/programs/:id/allowlist', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { pattern, allowWildcard, addedBy, note } = (req.body ?? {}) as {
    pattern?: string;
    allowWildcard?: boolean;
    addedBy?: string;
    note?: string;
  };
  if (!pattern || !addedBy) return reply.code(400).send({ error: 'pattern and addedBy required' });

  const isWildcard = pattern.includes('*');
  if (isWildcard && !allowWildcard) {
    return reply.code(400).send({ error: 'wildcard pattern requires the allowWildcard toggle' });
  }
  if (isWildcard && !note) {
    return reply.code(400).send({ error: 'wildcard entries require a note' });
  }
  // Sanity: the pattern must be something the matcher can evaluate against a
  // probe without throwing. (Real validity is enforced at scan time by the gate.)
  try {
    evaluateMatch(pattern, 'probe.example', !!allowWildcard);
  } catch {
    return reply.code(400).send({ error: 'unparseable pattern' });
  }

  const entry = await prisma.allowlist.create({
    data: { programId: id, pattern, allowWildcard: !!allowWildcard, addedBy, note: note ?? null },
  });
  await audit({
    actor: `human:${addedBy}`,
    action: 'allowlist.add',
    programId: id,
    target: pattern,
    detail: { allowlistId: entry.id, allowWildcard: !!allowWildcard },
  });
  return entry;
});

app.post('/programs/:id/allowlist/:entryId/deactivate', async (req, reply) => {
  const { id, entryId } = req.params as { id: string; entryId: string };
  const { by } = (req.body ?? {}) as { by?: string };
  await prisma.allowlist.update({ where: { id: entryId }, data: { active: false } });
  await audit({
    actor: `human:${by ?? 'unknown'}`,
    action: 'allowlist.deactivate',
    programId: id,
    detail: { allowlistId: entryId },
  });
  return { ok: true };
});

// --- the gate: one-click approve ------------------------------------------
// Records a ScanApproval per active allowlist entry. It does NOT start a scan.
app.post('/programs/:id/approve-scan', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { approvedBy } = (req.body ?? {}) as { approvedBy?: string };
  if (!approvedBy) return reply.code(400).send({ error: 'approvedBy required' });
  try {
    const res = await grantScanApproval(id, approvedBy);
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof ApprovalRefusal) return reply.code(409).send({ error: e.message });
    req.log.error(e);
    return reply.code(500).send({ error: 'approval failed' });
  }
});

// --- L5: campaign (autopilot) --------------------------------------
app.post('/campaigns', async (req, reply) => {
  const b = (req.body ?? {}) as { programIds?: string[]; signedBy?: string; days?: number; tiers?: number[]; autoSubmit?: boolean; maxTargetsPerDay?: number; rateLimitPerMin?: number; dailyBudgetUsd?: number; minConfidence?: number; maxDupRisk?: number; dailyCap?: number };
  if (!b.signedBy || !Array.isArray(b.programIds) || b.programIds.length === 0) {
    return reply.code(400).send({ error: 'signedBy and programIds[] required' });
  }
  try {
    const expiresAt = b.days ? new Date(Date.now() + b.days * 86_400_000) : undefined;
    const res = await signCampaign(b.programIds, b.signedBy, {
      expiresAt, tiers: b.tiers, autoSubmit: b.autoSubmit,
      maxTargetsPerDay: b.maxTargetsPerDay, rateLimitPerMin: b.rateLimitPerMin, dailyBudgetUsd: b.dailyBudgetUsd,
      minConfidence: b.minConfidence, maxDupRisk: b.maxDupRisk, dailyCap: b.dailyCap,
    });
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof CampaignRefusal) return reply.code(409).send({ error: e.message });
    req.log.error(e);
    return reply.code(500).send({ error: 'sign failed' });
  }
});

app.post('/campaigns/:id/pause', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { by, reason } = (req.body ?? {}) as { by?: string; reason?: string };
  if (!by) return reply.code(400).send({ error: 'by required' });
  await pauseCampaign(id, reason ?? 'manual pause', by);
  return { ok: true };
});

// --- Manual single-target scan (gated) -----------------------------------
// Runs ONE authorized target through the same gate the autopilot uses. It
// refuses unless the target is on a live allowlist under a valid approval.
// Tier 3 (high-impact) is human-only: it requires an explicit per-scan
// confirmation and is NEVER run by the scheduler or a campaign.
app.post('/programs/:id/scan-target', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { target, tier, confirm } = (req.body ?? {}) as {
    target?: string; tier?: number; confirm?: boolean;
  };
  if (!target) return reply.code(400).send({ error: 'target required' });
  const t = tier === 3 ? 3 : tier === 2 ? 2 : 1;
  if (t === 3 && !confirm) {
    return reply.code(400).send({ error: 'Tier 3 requires an explicit per-scan confirmation' });
  }
  try {
    const result = await runActiveScan({
      programId: id,
      target,
      tier: t,
      profile: { tiers: [t] },
      perActionConfirmed: t === 3,
    });
    return { ok: true, assets: result.assets.length, findings: result.findings.length };
  } catch (e) {
    if (e instanceof KillSwitchEngaged) return reply.code(409).send({ error: 'kill switch engaged' });
    if (e instanceof TierRefusal) return reply.code(400).send({ error: e.message });
    if (e instanceof ScopeRefusal) return reply.code(403).send({ error: e.message });
    if (e instanceof InfiltrError) {
      // Infiltr's own policy rejected the request (e.g. Tier 3 not enabled on it).
      if (e.status === 400 || e.status === 403) {
        return reply.code(422).send({ error: `Infiltr refused this scan (status ${e.status}) — its own policy may not permit this tier.` });
      }
      return reply.code(502).send({ error: `infiltr ${e.status || 'timeout'}` });
    }
    req.log.error(e);
    return reply.code(500).send({ error: 'scan failed' });
  }
});

// --- Tier 3 approval queue ------------------------------------------------
// The autopilot fills this from Tier 1/2 signals; a human approves a batch in
// one action. Nothing here runs until approved, and each run still passes the
// per-target gate. Tier 3 is never run by the scheduler.
app.get('/tier3/queue', async () => {
  await refreshTier3Queue().catch(() => ({ added: 0 }));
  const queue = await listTier3Queue();
  return {
    queue: queue.map((c) => ({
      id: c.id,
      programId: c.programId,
      handle: c.program?.handle,
      target: c.target,
      reason: c.reason,
      createdAt: c.createdAt,
    })),
  };
});

app.post('/tier3/approve', async (req, reply) => {
  const { ids, by } = (req.body ?? {}) as { ids?: string[]; by?: string };
  if (!by) return reply.code(400).send({ error: 'by (human identity) required' });
  if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids required' });
  try {
    const results = await approveAndRunTier3(ids, by);
    return { ok: true, results };
  } catch (e) {
    if (e instanceof Tier3Refusal) return reply.code(400).send({ error: e.message });
    req.log.error(e);
    return reply.code(500).send({ error: 'tier 3 batch failed' });
  }
});

app.post('/tier3/dismiss', async (req, reply) => {
  const { ids, by } = (req.body ?? {}) as { ids?: string[]; by?: string };
  if (!by) return reply.code(400).send({ error: 'by required' });
  if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids required' });
  return dismissTier3(ids, by);
});

// --- L3: auto-submit policy -----------------------------------------------
app.post('/programs/:id/autosubmit-policy', async (req, reply) => {
  const { id } = req.params as { id: string };
  const b = (req.body ?? {}) as {
    enabled?: boolean; minConfidence?: number; maxDupRisk?: number;
    allowedVulnClasses?: string[]; dailyCap?: number; requireChain?: boolean; by?: string;
  };
  if (!b.by) return reply.code(400).send({ error: 'by required' });
  const data = {
    enabled: b.enabled ?? false,
    minConfidence: b.minConfidence ?? 0.85,
    maxDupRisk: b.maxDupRisk ?? 0.3,
    allowedVulnClasses: b.allowedVulnClasses ?? [],
    dailyCap: b.dailyCap ?? 3,
    requireChain: b.requireChain ?? false,
  };
  const policy = await prisma.autoSubmitPolicy.upsert({
    where: { programId: id },
    create: { programId: id, createdBy: b.by, ...data },
    update: data,
  });
  await audit({ actor: `human:${b.by}`, action: 'autosubmit.policy', programId: id, detail: { ...data } });
  return { ok: true, policy };
});

// --- L2: ownership verification + standing authorizations -----------------
app.post('/allowlist/:id/verify-ownership', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { by, force } = (req.body ?? {}) as { by?: string; force?: boolean };
  if (!by) return reply.code(400).send({ error: 'by required' });
  const entry = await prisma.allowlist.findUnique({ where: { id } });
  if (!entry) return reply.code(404).send({ error: 'not found' });

  // Authentic check: live TLS certificate SAN + DNS resolution.
  const result = await liveVerify(entry.pattern);
  if (!result.verified && !force) {
    await audit({ actor: `human:${by}`, action: 'ownership.verify.fail', programId: entry.programId, target: entry.pattern, detail: { reason: result.reason, evidence: result.evidence } });
    return reply.code(422).send({ ok: false, error: result.reason, evidence: result.evidence });
  }
  const method = result.verified ? result.method : 'HUMAN_OVERRIDE';
  await prisma.allowlist.update({ where: { id }, data: { ownershipVerified: true, ownershipMethod: method } });
  await audit({ actor: `human:${by}`, action: 'ownership.verify', programId: entry.programId, target: entry.pattern, detail: { allowlistId: id, method, verified: result.verified, evidence: result.evidence } });
  return { ok: true, method, evidence: result.evidence };
});

app.post('/programs/:id/preauth', async (req, reply) => {
  const { id } = req.params as { id: string };
  const b = (req.body ?? {}) as { signedBy?: string; days?: number; tiers?: number[]; maxTargetsPerDay?: number; rateLimitPerMin?: number; dailyBudgetUsd?: number };
  if (!b.signedBy) return reply.code(400).send({ error: 'signedBy required' });
  try {
    const expiresAt = b.days ? new Date(Date.now() + b.days * 86_400_000) : undefined;
    const res = await grantPreAuthorization(id, b.signedBy, {
      expiresAt, tiers: b.tiers, maxTargetsPerDay: b.maxTargetsPerDay,
      rateLimitPerMin: b.rateLimitPerMin, dailyBudgetUsd: b.dailyBudgetUsd,
    });
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof PreAuthRefusal) return reply.code(409).send({ error: e.message });
    req.log.error(e);
    return reply.code(500).send({ error: 'preauth failed' });
  }
});

app.post('/preauth/:id/revoke', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { by, reason } = (req.body ?? {}) as { by?: string; reason?: string };
  if (!by) return reply.code(400).send({ error: 'by required' });
  await revokePreAuthorization(id, reason ?? 'revoked by human', by);
  return { ok: true };
});

// --- feedback: submission outcomes ---------------------------------------
app.post('/submissions/:id/outcome', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { state, payoutUsd, by } = (req.body ?? {}) as { state?: string; payoutUsd?: number; by?: string };
  const allowed = ['SUBMITTED', 'TRIAGED', 'RESOLVED', 'DUPLICATE', 'OUT_OF_SCOPE', 'INFORMATIVE'];
  if (!state || !allowed.includes(state) || !by) {
    return reply.code(400).send({ error: `state (${allowed.join('|')}) and by required` });
  }
  const sub = await prisma.submission.findUnique({
    where: { id },
    select: { report: { select: { finding: { select: { programId: true } } } } },
  });
  if (!sub) return reply.code(404).send({ error: 'not found' });
  await recordOutcome(id, { state: state as any, payoutUsd });
  const programId = sub.report?.finding?.programId;
  let score: number | undefined;
  if (programId) score = await recomputeProgramScore(programId);
  return { ok: true, score };
});

// --- audit trail ----------------------------------------------------------
app.get('/audit', async (req) => {
  const limit = Math.min(Number((req.query as any)?.limit ?? 100), 500);
  return prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
});

// --- global kill switch ---------------------------------------------------
// Engaging it halts ALL active work immediately (recon-active checks it before
// every target). Stored as an append-only AuditLog sentinel.
app.get('/killswitch', async () => {
  const latest = await prisma.auditLog.findFirst({
    where: { actor: 'operator', action: { in: ['killswitch.on', 'killswitch.off'] } },
    orderBy: { createdAt: 'desc' },
  });
  return { engaged: latest?.action === 'killswitch.on' };
});

app.post('/killswitch', async (req, reply) => {
  const { on, by } = (req.body ?? {}) as { on?: boolean; by?: string };
  if (typeof on !== 'boolean' || !by) return reply.code(400).send({ error: 'on (boolean) and by required' });
  await audit({ actor: 'operator', action: on ? 'killswitch.on' : 'killswitch.off', detail: { by } });
  return { engaged: on };
});

// --- L1: batch human ops (review inbox) -----------------------------------
app.post('/programs/approve-batch', async (req, reply) => {
  const { programIds, approvedBy } = (req.body ?? {}) as { programIds?: string[]; approvedBy?: string };
  if (!Array.isArray(programIds) || !approvedBy) {
    return reply.code(400).send({ error: 'programIds[] and approvedBy required' });
  }
  const results = [];
  for (const id of programIds) {
    try {
      const res = await grantScanApproval(id, approvedBy);
      results.push({ programId: id, ok: true, approvals: res.approvals });
    } catch (e) {
      results.push({ programId: id, ok: false, error: (e as Error).message });
    }
  }
  return { results };
});

app.post('/submissions/submit-batch', async (req, reply) => {
  const { submissionIds, by } = (req.body ?? {}) as { submissionIds?: string[]; by?: string };
  if (!Array.isArray(submissionIds) || !by) {
    return reply.code(400).send({ error: 'submissionIds[] and by required' });
  }
  const results = [];
  for (const id of submissionIds) {
    // Only a held report can be submitted. Never downgrade a decided one.
    const sub = await prisma.submission.findUnique({ where: { id }, select: { state: true, report: { select: { finding: { select: { programId: true } } } } } });
    if (!sub) { results.push({ id, ok: false, error: 'not found' }); continue; }
    if (sub.state !== 'HELD_FOR_REVIEW') { results.push({ id, ok: false, error: `not held (${sub.state})` }); continue; }
    await prisma.submission.update({ where: { id }, data: { state: 'SUBMITTED' } });
    await audit({ actor: `human:${by}`, action: 'submission.submit', programId: sub.report?.finding?.programId ?? null, detail: { submissionId: id } });
    results.push({ id, ok: true });
  }
  return { results };
});

app.post('/submissions/:id/reject', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { by } = (req.body ?? {}) as { by?: string };
  if (!by) return reply.code(400).send({ error: 'by required' });
  const sub = await prisma.submission.findUnique({ where: { id }, select: { report: { select: { findingId: true, finding: { select: { programId: true } } } } } });
  if (!sub) return reply.code(404).send({ error: 'not found' });
  await prisma.submission.update({ where: { id }, data: { state: 'REJECTED' } });
  // pull the finding back below the quality gate so it will not re-queue
  if (sub.report?.findingId) {
    await prisma.finding.update({ where: { id: sub.report.findingId }, data: { humanConfirmed: false } });
  }
  await audit({ actor: `human:${by}`, action: 'submission.reject', programId: sub.report?.finding?.programId ?? null, detail: { submissionId: id } });
  return { ok: true };
});

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
