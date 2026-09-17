import { prisma, safe } from '../../lib/db';
import Link from 'next/link';
import { SeverityPill, Meter, EmptyState } from '../../components/ui';

export const dynamic = 'force-dynamic';

const GATE = { minConfidence: 0.8, maxDupRisk: 0.4 };

export default async function Findings() {
  const findings = await safe(
    () =>
      prisma.finding.findMany({
        orderBy: [{ severity: 'desc' }, { confidence: 'desc' }],
        take: 200,
        include: { program: true },
      }),
    [] as any[],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Findings</h1>
          <div className="page-sub">
            Ranked by severity and confidence. The quality gate needs confidence
            &gt; 0.80, dup risk &lt; 0.40, and human confirmation before a report
            is drafted.
          </div>
        </div>
      </div>

      {findings.length === 0 ? (
        <EmptyState title="No findings yet">
          Passive findings appear here once the analyzer has triaged them.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Finding</th>
                <th>Severity</th>
                <th style={{ width: 150 }}>Confidence</th>
                <th style={{ width: 150 }}>Dup risk</th>
                <th>Gate</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => {
                const pass =
                  f.confidence > GATE.minConfidence &&
                  f.dupRisk < GATE.maxDupRisk &&
                  f.humanConfirmed;
                return (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/findings/${f.id}`}>
                        <div style={{ fontWeight: 600 }}>{f.title}</div>
                        <div className="page-sub" style={{ marginTop: 2 }}>
                          <span className="tag">{f.vulnClass}</span>{' '}
                          <span className="tag">{f.program?.handle}</span>
                        </div>
                      </Link>
                    </td>
                    <td><SeverityPill severity={f.severity} /></td>
                    <td><Meter value={f.confidence} /></td>
                    <td><Meter value={f.dupRisk} invert /></td>
                    <td>
                      {pass ? (
                        <span className="pill pill-accent">report-ready</span>
                      ) : f.humanConfirmed ? (
                        <span className="pill pill-warn">below gate</span>
                      ) : (
                        <span className="pill pill-muted">needs confirm</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
