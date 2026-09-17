import Fastify from 'fastify';
import { prisma } from '@quarry/db';
import {
  audit,
  grantScanApproval,
  ApprovalRefusal,
  evaluate as evaluateMatch,
} from '@quarry/core';
import { recordOutcome, recomputeProgramScore } from '@quarry/feedback';
import { runActiveScan, KillSwitchEngaged, InfiltrError } from '@quarry/recon-active';
import { ScopeRefusal } from '@quarry/core';
import { grantPreAuthorization, revokePreAuthorization, PreAuthRefusal, signCampaign, pauseCampaign, CampaignRefusal, liveVerify } from '@quarry/autonomy';
import { ensureSession, LoginError } from './autologin.js';

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

// Verification is the human sign-off. Ensure every active, ownership-verified
// target has a live scan approval (idempotent — only fills the gaps) and that a
// standing authorization exists. Covers targets added after an earlier auth.
async function ensureAuthorized(programId: string, by: string): Promise<{ approved: number }> {
  const now = new Date();
  const entries = await prisma.allowlist.findMany({
    where: { programId, active: true, ownershipVerified: true },
  });
  if (entries.length === 0) return { approved: 0 };
  const live = await prisma.scanApproval.findMany({
    where: { programId, state: 'APPROVED', expiresAt: { gt: now } },
    select: { allowlistId: true },
  });
  const covered = new Set(live.map((a) => a.allowlistId));
  const missing = entries.filter((e) => !covered.has(e.id));
  const expiresAt = new Date(now.getTime() + 7 * 86_400_000);
  if (missing.length > 0) {
    await prisma.scanApproval.createMany({
      data: missing.map((e) => ({
        programId,
        allowlistId: e.id,
        state: 'APPROVED' as const,
        approvedBy: by,
        approvedAt: now,
        expiresAt,
        scanProfile: { tiers: [1, 2] } as object,
      })),
    });
  }
  const livePre = await prisma.preAuthorization.findFirst({
    where: { programId, revoked: false, expiresAt: { gt: now } },
  });
  if (!livePre) {
    await prisma.preAuthorization.create({
      data: { programId, signedBy: by, tiers: [1, 2], expiresAt },
    });
  }
  return { approved: missing.length };
}

// Self-healing authorize: called before a manual scan so every verified target
// is covered, even ones added after the last authorization.
app.post('/programs/:id/authorize', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { by } = (req.body ?? {}) as { by?: string };
  if (!by) return reply.code(400).send({ error: 'by required' });
  const r = await ensureAuthorized(id, by);
  await audit({ actor: `human:${by}`, action: 'authorize.ensure', programId: id, detail: r });
  return { ok: true, ...r };
});

// Build the optional Infiltr context (IDOR 2nd identity / SSRF canary) from a
// program's saved ScanContext. Returns undefined when nothing useful is set.
async function loadScanContext(programId: string) {
  const c = await prisma.scanContext.findUnique({ where: { programId } });
  if (!c) return undefined;
  const ctx: { idor?: Record<string, unknown>; ssrf?: Record<string, unknown>; auth?: Record<string, unknown> } = {};
  const scanAuth = (c.scanAuthHeaders ?? null) as Record<string, string> | null;
  if (scanAuth && Object.keys(scanAuth).length > 0) {
    ctx.auth = { headers: scanAuth };
  }
  const headers = (c.idorVictimHeaders ?? null) as Record<string, string> | null;
  if (headers && Object.keys(headers).length > 0) {
    ctx.idor = {
      victim_headers: headers,
      ...(c.idorVictimId ? { victim_id: c.idorVictimId } : {}),
      ...(c.idorIdParam ? { id_param: c.idorIdParam } : {}),
    };
  }
  if (c.ssrfCanaryHost) {
    ctx.ssrf = { canary_host: c.ssrfCanaryHost, ...(c.ssrfWait ? { wait: c.ssrfWait } : {}) };
  }
  return Object.keys(ctx).length > 0 ? ctx : undefined;
}

// --- Manual single-target scan (gated) -----------------------------------
// Runs ONE authorized target through the same gate the autopilot uses. It
// refuses unless the target is on a live allowlist under a valid approval.
app.post('/programs/:id/scan-target', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { target, tier, tools } = (req.body ?? {}) as { target?: string; tier?: number; tools?: string[] };
  if (!target) return reply.code(400).send({ error: 'target required' });
  const t: 1 | 2 = tier === 2 ? 2 : 1;
  const profile = { tiers: [t] as (1 | 2)[], ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}) };
  try {
    // Refresh the auto-login session (no-op if not configured) before scanning.
    try { await ensureSession(id); }
    catch (e) { if (e instanceof LoginError) return reply.code(400).send({ error: `auto-login failed: ${e.message}` }); throw e; }
    const context = await loadScanContext(id);
    const result = await runActiveScan({ programId: id, target, tier: t, profile, context });
    return { ok: true, assets: result.assets.length, findings: result.findings.length };
  } catch (e) {
    if (e instanceof KillSwitchEngaged) return reply.code(409).send({ error: 'kill switch engaged' });
    if (e instanceof ScopeRefusal) return reply.code(403).send({ error: e.message });
    if (e instanceof InfiltrError) return reply.code(502).send({ error: `infiltr ${e.status || 'timeout'}` });
    req.log.error(e);
    return reply.code(500).send({ error: 'scan failed' });
  }
});

// --- Scan context (IDOR 2nd identity / SSRF canary) -----------------------
// Sensitive: idorVictimHeaders holds a victim session. Stored locally and sent
// only to your Infiltr. Omitting idorVictimHeaders on update keeps the saved
// headers, so the secret is never round-tripped through the client.
app.post('/programs/:id/scan-context', async (req, reply) => {
  const { id } = req.params as { id: string };
  const b = (req.body ?? {}) as {
    by?: string;
    scanAuthHeaders?: Record<string, string> | null;
    idorVictimHeaders?: Record<string, string> | null;
    idorVictimId?: string | null;
    idorIdParam?: string | null;
    ssrfCanaryHost?: string | null;
    ssrfWait?: number | null;
    authLoginUrl?: string | null;
    authUsername?: string | null;
    authPassword?: string | null;
    authUserField?: string | null;
    authPassField?: string | null;
    authCsrfField?: string | null;
    authTokenPath?: string | null;
    authJson?: boolean;
    authExtraFields?: Record<string, string> | null;
  };
  if (!b.by) return reply.code(400).send({ error: 'by required' });

  // Changing login config invalidates any cached session so the next scan re-auths.
  const loginTouched = ['authLoginUrl', 'authUsername', 'authPassword', 'authUserField',
    'authPassField', 'authCsrfField', 'authTokenPath', 'authJson', 'authExtraFields'].some((k) => k in b);

  const data = {
    idorVictimId: b.idorVictimId ?? null,
    idorIdParam: b.idorIdParam ?? null,
    ssrfCanaryHost: b.ssrfCanaryHost ?? null,
    ssrfWait: typeof b.ssrfWait === 'number' ? b.ssrfWait : null,
    updatedBy: b.by,
    ...(b.authLoginUrl !== undefined ? { authLoginUrl: b.authLoginUrl ?? null } : {}),
    ...(b.authUsername !== undefined ? { authUsername: b.authUsername ?? null } : {}),
    ...(b.authUserField !== undefined ? { authUserField: b.authUserField ?? null } : {}),
    ...(b.authPassField !== undefined ? { authPassField: b.authPassField ?? null } : {}),
    ...(b.authCsrfField !== undefined ? { authCsrfField: b.authCsrfField ?? null } : {}),
    ...(b.authExtraFields !== undefined ? { authExtraFields: b.authExtraFields ?? undefined } : {}),
    ...(b.authTokenPath !== undefined ? { authTokenPath: b.authTokenPath ?? null } : {}),
    ...(typeof b.authJson === 'boolean' ? { authJson: b.authJson } : {}),
    ...(loginTouched ? { authCachedAt: null } : {}),
    // Secrets: only overwrite when the client actually sends them.
    ...(b.authPassword !== undefined ? { authPassword: b.authPassword ?? null } : {}),
    ...(b.idorVictimHeaders !== undefined ? { idorVictimHeaders: b.idorVictimHeaders ?? undefined } : {}),
    ...(b.scanAuthHeaders !== undefined ? { scanAuthHeaders: b.scanAuthHeaders ?? undefined } : {}),
  };
  const saved = await prisma.scanContext.upsert({
    where: { programId: id },
    create: { programId: id, ...data } as any,
    update: data as any,
  });
  await audit({ actor: `human:${b.by}`, action: 'scan-context.save', programId: id, detail: { autoLogin: !!saved.authLoginUrl, auth: !!saved.scanAuthHeaders, idor: !!saved.idorVictimHeaders, ssrf: !!saved.ssrfCanaryHost } });
  return {
    ok: true,
    hasAutoLogin: !!(saved.authLoginUrl && saved.authUsername),
    hasScanAuth: !!saved.scanAuthHeaders,
    hasIdorHeaders: !!saved.idorVictimHeaders,
    idorVictimId: saved.idorVictimId,
    idorIdParam: saved.idorIdParam,
    ssrfCanaryHost: saved.ssrfCanaryHost,
    ssrfWait: saved.ssrfWait,
  };
});

// Test the configured auto-login now and report what session it captured (header
// names only — never the values). Primes the cache on success.
app.post('/programs/:id/test-login', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { by } = (req.body ?? {}) as { by?: string };
  if (!by) return reply.code(400).send({ error: 'by required' });
  try {
    const headers = await ensureSession(id, true);
    if (!headers) return reply.code(400).send({ error: 'no auto-login configured (set a login URL + username)' });
    await audit({ actor: `human:${by}`, action: 'scan-context.test_login', programId: id, detail: { captured: Object.keys(headers) } });
    return { ok: true, captured: Object.keys(headers) };
  } catch (e) {
    if (e instanceof LoginError) return reply.code(400).send({ error: e.message });
    req.log.error(e);
    return reply.code(500).send({ error: 'test login failed' });
  }
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

  // Verifying ownership is the human sign-off: authorize this target right away
  // so it can be scanned, no separate step. Idempotent and per-entry, so targets
  // added later get authorized too.
  let authorized = false;
  try { await ensureAuthorized(entry.programId, by); authorized = true; }
  catch (e) { req.log.error(e); }
  return { ok: true, method, authorized, evidence: result.evidence };
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
