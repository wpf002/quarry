import Link from 'next/link';
import { safe } from '../../../lib/db';
import { getFindingTrace } from '@quarry/analyzer';
import { SeverityPill, Meter } from '../../../components/ui';

export const dynamic = 'force-dynamic';

const STEP_DOT = (action: string) =>
  action.includes('refuse') || action.includes('halt') ? 'var(--danger)'
  : action.includes('grant') || action.includes('pass') || action.includes('queued') ? 'var(--accent)'
  : 'var(--info)';

export default async function FindingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trace = await safe(() => getFindingTrace(id), null);

  if (!trace) {
    return (
      <>
        <div className="crumb"><Link href="/findings">← Findings</Link></div>
        <div className="callout">Finding not found, or the database is offline.</div>
      </>
    );
  }
  const { finding, chained, steps } = trace;
  const evidence = (finding.evidence ?? {}) as Record<string, unknown>;

  return (
    <>
      <div className="crumb"><Link href="/findings">← Findings</Link></div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{finding.title}</h1>
          <div className="page-sub">
            <span className="tag">{finding.vulnClass}</span>{' '}
            <SeverityPill severity={finding.severity} />{' '}
            <span className="tag">{finding.program?.handle}</span>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr', gap: 20, alignItems: 'start' }}>
        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Reproducible Trace</h3>
            {steps.length === 0 ? (
              <div style={{ color: 'var(--faint)' }}>No recorded steps yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 0 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: STEP_DOT(s.action), marginTop: 5 }} />
                      {i < steps.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--border)' }} />}
                    </div>
                    <div style={{ paddingBottom: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.action}</div>
                      <div className="mono" style={{ color: 'var(--faint)', fontSize: 11.5 }}>
                        {new Date(s.at).toISOString().slice(0, 19).replace('T', ' ')} · {s.actor}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Evidence</h3>
            <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--muted)', fontSize: 12, margin: 0, fontFamily: 'var(--mono)' }}>
              {JSON.stringify(evidence, null, 2)}
            </pre>
          </div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Assessment</h3>
            <dl className="kv">
              <dt>Confidence</dt><dd><Meter value={finding.confidence} /></dd>
              <dt>Dup risk</dt><dd><Meter value={finding.dupRisk} invert /></dd>
              <dt>Confirmed</dt><dd>{finding.humanConfirmed ? <span className="pill pill-accent">yes</span> : <span className="pill pill-muted">no</span>}</dd>
            </dl>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Chained With</h3>
            {chained.length === 0 ? (
              <div style={{ color: 'var(--faint)' }}>Standalone finding.</div>
            ) : (
              <div className="grid" style={{ gap: 8 }}>
                {chained.map((c) => (
                  <Link key={c.id} href={`/findings/${c.id}`} className="callout" style={{ justifyContent: 'space-between' }}>
                    <span>{c.title}</span>
                    <SeverityPill severity={c.severity} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
