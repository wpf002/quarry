import Fastify from 'fastify';
import { prisma } from '@quarry/db';
import {
  audit,
  grantScanApproval,
  ApprovalRefusal,
  evaluate as evaluateMatch,
} from '@quarry/core';

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

// --- ambiguity clearing (human) -------------------------------------------
app.post('/programs/:id/ambiguity/clear', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { flag, clearedBy } = (req.body ?? {}) as { flag?: string; clearedBy?: string };
  if (!flag || !clearedBy) return reply.code(400).send({ error: 'flag and clearedBy required' });

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return reply.code(404).send({ error: 'not found' });

  const remaining = program.ambiguityFlags.filter((f) => f !== flag);
  await prisma.program.update({ where: { id }, data: { ambiguityFlags: remaining } });
  await audit({
    actor: `human:${clearedBy}`,
    action: 'ambiguity.clear',
    programId: id,
    detail: { flag, remaining: remaining.length },
  });
  return { ok: true, remaining };
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

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
