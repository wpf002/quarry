import { prisma, safe } from '../../lib/db';
import { Stat } from '../../components/ui';
import { computeMetrics, strategicReviewTrigger } from '@quarry/feedback';

export const dynamic = 'force-dynamic';

export default async function MetricsPage() {
  const [findings, submissions] = await Promise.all([
    safe(
      () => prisma.finding.findMany({ select: { programId: true, vulnClass: true, severity: true, createdAt: true } }),
      [] as any[],
    ),
    safe(
      () =>
        prisma.submission.findMany({
          select: { state: true, payoutUsd: true, report: { select: { finding: { select: { vulnClass: true } } } } },
        }),
      [] as any[],
    ),
  ]);

  const metrics = computeMetrics(
    findings.map((f) => ({ programId: f.programId, vulnClass: f.vulnClass, severity: f.severity })),
    submissions.map((s) => ({ state: s.state, payoutUsd: s.payoutUsd, vulnClass: s.report?.finding?.vulnClass })),
  );
  const strategic = strategicReviewTrigger(
    findings.map((f) => ({ severity: f.severity, createdAt: new Date(f.createdAt) })),
    new Date(),
  );

  const revenue = Object.entries(metrics.revenueByClass).sort((a, b) => b[1] - a[1]);
  const maxRev = Math.max(1, ...revenue.map(([, v]) => v));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Metrics</h1>
          <div className="page-sub">
            Outcomes feed the scorer and the duplicate-risk model. This is where
            you see whether the account is earning its keep.
          </div>
        </div>
      </div>

      {strategic.flagged && (
        <div className="callout" style={{ borderColor: 'var(--warn)', marginBottom: 18 }}>
          <span>▲</span>
          <div>
            <strong>Strategic review.</strong> {strategic.reason}. Rethink target
            selection instead of grinding.
          </div>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <Stat label="Total findings" value={metrics.totalFindings} />
        <Stat label="Valid rate" value={`${Math.round(metrics.outcomes.validRate * 100)}%`} hint={`${metrics.outcomes.decided} decided`} />
        <Stat label="Duplicate rate" value={`${Math.round(metrics.outcomes.dupRate * 100)}%`} hint="lower is better" />
        <Stat label="Total revenue" value={`$${metrics.totalRevenueUsd.toLocaleString()}`} hint="resolved payouts" />
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Revenue by vuln class</h3>
        {revenue.length === 0 ? (
          <div style={{ color: 'var(--faint)' }}>No payouts recorded yet.</div>
        ) : (
          <div className="grid" style={{ gap: 10 }}>
            {revenue.map(([cls, val]) => (
              <div key={cls} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px', alignItems: 'center', gap: 12 }}>
                <span className="mono" style={{ fontSize: 12.5 }}>{cls}</span>
                <div className="score-track" style={{ height: 10 }}>
                  <div className="score-fill" style={{ width: `${(val / maxRev) * 100}%` }} />
                </div>
                <span className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>${val.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
