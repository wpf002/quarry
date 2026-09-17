import { prisma, safe } from '../../lib/db';
import Link from 'next/link';
import { ScoreBar, PlatformPill, EmptyState, ConfidenceBand, Pager } from '../../components/ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function Programs({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams)?.page ?? 1) || 1);
  const [total, programs] = await Promise.all([
    safe(() => prisma.program.count(), 0),
    safe(
      () =>
        prisma.program.findMany({
          orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
      [] as any[],
    ),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Programs</h1>
          <div className="page-sub">
            Ranked by the scorer. Ambiguity flags must be cleared by a human
            before a program can be scanned.
          </div>
        </div>
      </div>

      {programs.length === 0 ? (
        <EmptyState title="No Programs Yet">
          Run the worker to poll platforms, or seed the database with{' '}
          <code>pnpm --filter @quarry/db seed</code>.
        </EmptyState>
      ) : (
        <>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Platform</th>
                <th>Max bounty</th>
                <th style={{ width: 160 }}>Score</th>
                <th>Confidence</th>
                <th>Flags</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/programs/${p.id}`}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="mono" style={{ color: 'var(--faint)' }}>
                        {p.handle}
                      </div>
                    </Link>
                  </td>
                  <td>
                    <PlatformPill platform={p.platform} />
                  </td>
                  <td className="mono">
                    {p.maxBountyUsd ? `$${p.maxBountyUsd.toLocaleString()}` : '—'}
                  </td>
                  <td>
                    <ScoreBar value={p.score} />
                  </td>
                  <td><ConfidenceBand value={p.parseConfidence} /></td>
                  <td>
                    {p.ambiguityFlags?.length ? (
                      <span className="pill pill-warn">
                        {p.ambiguityFlags.length} to clear
                      </span>
                    ) : (
                      <span className="pill pill-muted">clear</span>
                    )}
                  </td>
                  <td>
                    {p.active ? (
                      <span className="pill pill-accent">active</span>
                    ) : (
                      <span className="pill pill-muted">discovered</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={totalPages} basePath="/programs" />
        </>
      )}
    </>
  );
}
