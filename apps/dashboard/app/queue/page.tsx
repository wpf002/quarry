import { prisma, safe } from '../../lib/db';
import { EmptyState } from '../../components/ui';

export const dynamic = 'force-dynamic';

const STATE_PILL: Record<string, string> = {
  QUEUED: 'pill-muted',
  HELD_FOR_REVIEW: 'pill-warn',
  SUBMITTED: 'pill-info',
  TRIAGED: 'pill-info',
  RESOLVED: 'pill-accent',
  DUPLICATE: 'pill-muted',
  OUT_OF_SCOPE: 'pill-danger',
  INFORMATIVE: 'pill-muted',
};

export default async function Queue() {
  const subs = await safe(
    () =>
      prisma.submission.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { report: { include: { finding: { include: { program: true } } } } },
      }),
    [] as any[],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Report queue</h1>
          <div className="page-sub">
            Everything lands held for review. Nothing auto-submits — a human
            reads every report before it goes out.
          </div>
        </div>
      </div>

      {subs.length === 0 ? (
        <EmptyState title="Queue is empty">
          Drafted reports appear here as findings clear the quality gate.
        </EmptyState>
      ) : (
        <div className="grid" style={{ gap: 12 }}>
          {subs.map((s) => {
            const f = s.report?.finding;
            return (
              <div className="card" key={s.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{f?.title ?? 'Untitled finding'}</div>
                    <div className="page-sub" style={{ marginTop: 2 }}>
                      <span className="tag">{f?.vulnClass ?? '—'}</span>{' '}
                      <span className="tag">{f?.severity ?? '—'}</span>{' '}
                      {f?.program ? <span className="tag">{f.program.platform.toLowerCase()}</span> : null}
                    </div>
                  </div>
                  <span className={`pill ${STATE_PILL[s.state] ?? 'pill-muted'}`}>
                    {s.state.toLowerCase().replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
