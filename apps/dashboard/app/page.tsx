import Link from 'next/link';
import { prisma, safe } from '../lib/db';
import { Stat } from '../components/ui';
import { selectTopPrograms, proposeAllowlist, buildDigest } from '@quarry/autonomy';

export const dynamic = 'force-dynamic';

export default async function Overview() {
  const programs = await safe(
    () => prisma.program.findMany({ select: { id: true, handle: true, score: true, active: true } }),
    [] as any[],
  );
  const top = selectTopPrograms(programs as any, { minScore: 0.7, limit: 5 });

  const withAssets = await safe(
    () =>
      prisma.program.findMany({
        where: { assets: { some: {} } },
        select: {
          id: true,
          handle: true,
          parsedScope: true,
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
    if (apexes.length === 0) {
      proposalsByProgram.push({ handle: p.handle, id: p.id, count: 0 });
      continue;
    }
    const props = await proposeAllowlist({ assets: p.assets, apexes });
    const existing = new Set(p.allowlist.map((a: any) => a.pattern));
    proposalsByProgram.push({ handle: p.handle, id: p.id, count: props.filter((pr) => !existing.has(pr.value)).length });
  }

  const [total, active, findings, queued, submitted, revenueRows] = await Promise.all([
    safe(() => prisma.program.count(), 0),
    safe(() => prisma.program.count({ where: { active: true } }), 0),
    safe(() => prisma.finding.count(), 0),
    safe(() => prisma.submission.count({ where: { state: 'HELD_FOR_REVIEW' } }), 0),
    safe(() => prisma.submission.count({ where: { state: 'SUBMITTED' } }), 0),
    safe(() => prisma.submission.findMany({ where: { state: 'RESOLVED' }, select: { payoutUsd: true } }), [] as any[]),
  ]);
  const revenueUsd = revenueRows.reduce((n: number, r: any) => n + (r.payoutUsd ?? 0), 0);

  const digest = buildDigest({
    newTopPrograms: top.map((p) => ({ handle: p.handle, score: p.score ?? 0 })),
    proposalsByProgram: proposalsByProgram.map((p) => ({ handle: p.handle, count: p.count })),
    queuedReports: queued,
    autoSubmittedToday: submitted,
    pausedAuths: [],
    revenueUsd,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Overview</h1>
          <div className="page-sub">
            Discovery and reporting run on their own. Active scanning stays behind
            the human gate.
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Stat label="Programs Discovered" value={total} hint="across all platforms" />
        <Stat label="Active Programs" value={active} hint="you turned on" />
        <Stat label="Findings" value={findings} hint="passive and analyzed" />
        <Stat label="Awaiting Review" value={queued} hint="held, never auto-sent" />
      </div>

      <div
        className="callout"
        style={{ borderColor: digest.needsYou > 0 ? 'var(--warn)' : 'var(--accent-dim)', marginBottom: 20 }}
      >
        <span>{digest.needsYou > 0 ? '▲' : '◆'}</span>
        <div><strong>{digest.headline}</strong></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Top Programs</h3>
          {top.length === 0 ? (
            <div style={{ color: 'var(--faint)' }}>None above the score bar yet.</div>
          ) : (
            top.map((p) => (
              <Link key={p.id} href={`/programs/${p.id}`} className="callout" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text)' }}>{p.handle}</span>
                <span className="mono zap">{(p.score ?? 0).toFixed(2)}</span>
              </Link>
            ))
          )}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Allowlists to Confirm</h3>
          {proposalsByProgram.filter((p) => p.count > 0).length === 0 ? (
            <div style={{ color: 'var(--faint)' }}>Nothing waiting on you.</div>
          ) : (
            proposalsByProgram
              .filter((p) => p.count > 0)
              .map((p) => (
                <Link key={p.id} href={`/programs/${p.id}`} className="callout" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: 'var(--text)' }}>{p.handle}</span>
                  <span className="pill pill-warn">{p.count} proposed</span>
                </Link>
              ))
          )}
        </div>
      </div>

      <div className="callout" style={{ marginTop: 20 }}>
        <span>◆</span>
        <div>
          <strong>The autonomy boundary.</strong> Everything up to sending an
          active packet runs unattended. Building the allowlist, approving a scan,
          and final submission stay with you, per program.
        </div>
      </div>
    </>
  );
}
