import Link from 'next/link';
import { prisma, safe } from '../../lib/db';
import { EmptyState, Pager, Stat, money } from '../../components/ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const OUTCOME_PILL: Record<string, string> = {
  RESOLVED: 'pill-accent',
  SUBMITTED: 'pill-info',
  TRIAGED: 'pill-info',
  DUPLICATE: 'pill-muted',
  INFORMATIVE: 'pill-muted',
  OUT_OF_SCOPE: 'pill-danger',
  REJECTED: 'pill-danger',
  HELD_FOR_REVIEW: 'pill-warn',
  QUEUED: 'pill-muted',
};

const DECIDED = ['RESOLVED', 'DUPLICATE', 'INFORMATIVE', 'OUT_OF_SCOPE', 'SUBMITTED', 'TRIAGED'];

export default async function History({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams)?.page ?? 1) || 1);

  const [total, rows, paidRows] = await Promise.all([
    safe(() => prisma.submission.count({ where: { state: { in: DECIDED as any } } }), 0),
    safe(
      () =>
        prisma.submission.findMany({
          where: { state: { in: DECIDED as any } },
          orderBy: [{ resolvedAt: 'desc' }, { updatedAt: 'desc' }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { report: { include: { finding: { include: { program: true } } } } },
        }),
      [] as any[],
    ),
    safe(
      () => prisma.submission.findMany({ where: { state: 'RESOLVED' }, select: { payoutUsd: true } }),
      [] as any[],
    ),
  ]);

  const earned = paidRows.reduce((n: number, r: any) => n + (r.payoutUsd ?? 0), 0);
  const paidCount = paidRows.length;
  const avg = paidCount ? Math.round(earned / paidCount) : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">History</h1>
          <div className="page-sub">What you have submitted and what it paid.</div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Stat label="Total Earned" value={money(earned, 'usd')} />
        <Stat label="Bounties Paid" value={paidCount} />
        <Stat label="Average Bounty" value={money(avg, 'usd')} />
        <Stat label="Submissions" value={total} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nothing Submitted Yet">
          Reports you send appear here with their outcome and payout.
        </EmptyState>
      ) : (
        <>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Program</th><th>Finding</th><th>Outcome</th><th>Payout</th></tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const f = s.report?.finding;
                const when = s.resolvedAt ?? s.updatedAt;
                return (
                  <tr key={s.id}>
                    <td className="mono" style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>
                      {when ? new Date(when).toISOString().slice(0, 10) : '—'}
                    </td>
                    <td>
                      {f?.program
                        ? <Link href={`/programs/${f.programId}`}>{f.program.handle}</Link>
                        : '—'}
                    </td>
                    <td>
                      {f ? <Link href={`/findings/${f.id}`}>{f.title}</Link> : 'Untitled'}
                    </td>
                    <td><span className={`pill ${OUTCOME_PILL[s.state] ?? 'pill-muted'}`}>{s.state.toLowerCase().replace(/_/g, ' ')}</span></td>
                    <td className="mono">{s.state === 'RESOLVED' ? money(s.payoutUsd, 'usd') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={totalPages} basePath="/history" />
        </>
      )}
    </>
  );
}
