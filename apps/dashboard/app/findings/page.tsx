import Link from 'next/link';
import { prisma, safe } from '../../lib/db';
import { SeverityPill, Meter, EmptyState, ConfidenceBand } from '../../components/ui';
import { OutcomeControls } from '../../components/OutcomeControls';

export const dynamic = 'force-dynamic';

const GATE = { minConfidence: 0.8, maxDupRisk: 0.4 };

const STATE_PILL: Record<string, string> = {
  QUEUED: 'pill-muted',
  HELD_FOR_REVIEW: 'pill-warn',
  SUBMITTED: 'pill-info',
  TRIAGED: 'pill-info',
  RESOLVED: 'pill-accent',
  DUPLICATE: 'pill-muted',
  OUT_OF_SCOPE: 'pill-danger',
  INFORMATIVE: 'pill-muted',
  REJECTED: 'pill-danger',
};

export default async function Findings() {
  const [findings, subs] = await Promise.all([
    safe(
      () =>
        prisma.finding.findMany({
          orderBy: [{ severity: 'desc' }, { confidence: 'desc' }],
          take: 200,
          include: { program: true },
        }),
      [] as any[],
    ),
    safe(
      () =>
        prisma.submission.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { report: { include: { finding: { include: { program: true } } } } },
        }),
      [] as any[],
    ),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Findings</h1>
          <div className="page-sub">
            What Quarry found, and the reports drafted from it. Nothing goes out
            until it clears the gate and you release it.
          </div>
        </div>
      </div>

      {findings.length === 0 ? (
        <EmptyState title="No Findings Yet">
          Findings appear here once the analyzer has triaged them.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Finding</th>
                <th>Severity</th>
                <th style={{ width: 150 }}>Confidence</th>
                <th style={{ width: 150 }}>Dup Risk</th>
                <th>Gate</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => {
                const pass = f.confidence > GATE.minConfidence && f.dupRisk < GATE.maxDupRisk && f.humanConfirmed;
                return (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/findings/${f.id}`}>
                        <div style={{ fontWeight: 600 }}>{f.title}</div>
                        <div className="page-sub" style={{ marginTop: 2 }}>
                          <span className="tag">{f.vulnClass}</span> <span className="tag">{f.program?.handle}</span>
                        </div>
                      </Link>
                    </td>
                    <td><SeverityPill severity={f.severity} /></td>
                    <td><ConfidenceBand value={f.confidence} /></td>
                    <td><Meter value={f.dupRisk} invert /></td>
                    <td>
                      {pass ? <span className="pill pill-accent">report-ready</span>
                        : f.humanConfirmed ? <span className="pill pill-warn">below gate</span>
                        : <span className="pill pill-muted">needs confirm</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ fontSize: 15, margin: '32px 0 14px' }}>Reports</h3>
      {subs.length === 0 ? (
        <EmptyState title="No Reports Yet">
          Drafted reports land here held for review. Record the platform outcome
          once you have sent one.
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
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <OutcomeControls submissionId={s.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
