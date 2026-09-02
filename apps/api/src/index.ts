import Fastify from 'fastify';
const app = Fastify({ logger: true });

app.get('/health', async () => ({ ok: true }));

// The gate endpoint the dashboard hits on the one-click approval.
// It records a ScanApproval; it does NOT itself start a scan.
app.post('/programs/:id/approve-scan', async (req, reply) => {
  // TODO: validate allowlist is non-empty, ambiguityFlags cleared,
  // write ScanApproval{ state: APPROVED, approvedBy, expiresAt }, audit it.
  return reply.code(501).send({ todo: 'approval handler' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen({ port }).catch((e) => { app.log.error(e); process.exit(1); });
