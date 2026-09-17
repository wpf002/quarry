import Link from 'next/link';
import { prisma, safe } from '../../lib/db';
import { Stat } from '../../components/ui';
import { selectTopPrograms, proposeAllowlist, buildDigest } from '@quarry/autonomy';

export const dynamic = 'force-dynamic';

export default async function DigestPage() {
  const programs = await safe(
    () => prisma.program.findMany({ select: { id: true, handle: true, score: true, active: true } }),
    [] as any[],
  );
  const top = selectTopPrograms(programs as any, { minScore: 0.7, limit: 5 });

  const withAssets = await safe(
    () => prisma.program.findMany({
      where: { assets: { some: {} } },
      select: {
        id: true, handle: true, parsedScope: true,
        assets: { select: { value: true }, take: 200 },
        allowlist: { where: { active: true }, select: { pattern: true } },
      },
      take: 50,
    }),
    [] as any[],
  );

  const proposalsByProgram: Array<{ handle: string; id: string; count: number }> = [];
  for (const p of withAssets) {
    const scope = (p.parsedScope ?? {}) as { inScope?: string[] };
    const apexes = p.allowlist.length
      ? p.allowlist.map((a: any) => a.pattern)
      : (scope.inScope ?? []).filter((a) => !a.includes('*') && !a.includes('/'));
    if (apexes.length === 0) { proposalsByProgram.push({ handle: p.handle, id: p.id, count: 0 }); continue; }
    const props = await proposeAllowlist({ assets: p.assets, apexes });
    const existing = new Set(p.allowlist.map((a: any) => a.pattern));
    proposalsByProgram.push({ handle: p.handle, id: p.id, count: props.filter((pr) => !existing.has(pr.value)).length });
  }

  const [queuedReports, autoSubmittedToday, revoked, revenueRows] = await Promise.all([
    safe(() => prisma.submission.count({ where: { state: 'HELD_FOR_REVIEW' } }), 0),
    safe(() => prisma.submission.count({ where: { state: 'SUBMITTED' } }), 0),
    safe(() => prisma.preAuthorization.findMany({ where: { revoked: true }, include: { program: true }, orderBy: { createdAt: 'desc' }, take: 10 }), [] as any[]),
    safe(() => prisma.submission.findMany({ where: { state: 'RESOLVED' }, select: { payoutUsd: true } }), [] as any[]),
  ]);
  const revenueUsd = revenueRows.reduce((n: number, r: any) => n + (r.payoutUsd ?? 0), 0);
  const pausedAuths = revoked.map((r: any) => ({ handle: r.program?.handle ?? '—', reason: r.revokedReason ?? 'revoked' }));

  const digest = buildDigest({
    newTopPrograms: top.map((p) => ({ handle: p.handle, score: p.score ?? 0 })),
    proposalsByProgram: proposalsByProgram.map((p) => ({ handle: p.handle, count: p.count })),
    queuedReports,
    autoSubmittedToday,
    pausedAuths,
    revenueUsd,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Digest <span className="tag">L4</span></h1>
          <div className="page-sub">One read: what ran itself, and what needs your sign-off.</div>
        </div>
      </div>

      <div className="callout" style={{ borderColor: digest.needsYou > 0 ? 'var(--warn)' : 'var(--accent-dim)', marginBottom: 20 }}>
        <span>{digest.needsYou > 0 ? '▲' : '◆'}</span>
        <div><strong>{digest.headline}</strong></div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <Stat label="Reports in review" value={queuedReports} />
        <Stat label="Auto-submitted" value={autoSubmittedToday} hint="total" />
        <Stat label="Paused auths" value={pausedAuths.length} />
        <Stat label="Revenue" value={`$${revenueUsd.toLocaleString()}`} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>New top programs</h3>
          {top.length === 0 ? <div style={{ color: 'var(--faint)' }}>None above the score bar yet.</div> :
            top.map((p) => (
              <Link key={p.id} href={`/programs/${p.id}`} className="callout" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text)' }}>{p.handle}</span>
                <span className="mono zap">{(p.score ?? 0).toFixed(2)}</span>
              </Link>
            ))}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Allowlists to confirm</h3>
          {proposalsByProgram.filter((p) => p.count > 0).length === 0 ? <div style={{ color: 'var(--faint)' }}>Nothing awaiting sign-off.</div> :
            proposalsByProgram.filter((p) => p.count > 0).map((p) => (
              <Link key={p.id} href={`/programs/${p.id}`} className="callout" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text)' }}>{p.handle}</span>
                <span className="pill pill-warn">{p.count} proposed</span>
              </Link>
            ))}
        </div>
      </div>
    </>
  );
}
