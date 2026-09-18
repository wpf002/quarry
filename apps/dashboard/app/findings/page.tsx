import Link from 'next/link';
import { prisma, safe } from '../../lib/db';
import { SeverityPill, EmptyState, ConfidenceBand, Pager } from '../../components/ui';
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

const PAGE_SIZE = 50;
const fmt = (d: Date) => new Date(d).toISOString().slice(0, 16).replace('T', ' ');

// Vuln classes bounty programs actually pay for. This is an allowlist, not a
// denylist — anything not on it (headers, endpoints, fingerprints, TLS info,
// WAF/library detection, scan notes) is treated as informational and hidden
// unless "Show all". CVEs match by `cve*` prefix separately.
const PAYABLE_CLASSES = [
  'secret-exposure', 'sensitive-file-exposure', 'git-exposure', 'env-exposure', 'exposed-secret', 'exposed-api-key', 'exposed-key',
  'subdomain-takeover',
  'public-bucket', 'open-bucket', 's3-exposure',
  'idor', 'bola', 'broken-access-control', 'access-control', 'parameter-tampering',
  'auth-bypass', 'auth-weakness', 'broken-auth', 'account-takeover',
  'ssrf', 'sqli', 'sql-injection', 'rce', 'command-injection',
  'xss', 'stored-xss', 'reflected-xss', 'dom-xss',
  'open-redirect', 'cors-misconfig', 'cors-misconfiguration', 'csrf',
  'ssti', 'xxe', 'lfi', 'rfi', 'deserialization', 'path-traversal', 'file-upload',
  'exposed-panel',
  'graphql-introspection', 'jwt-weakness', 'exposed-api-docs',
  'zap-alert', // ZAP active-scan alerts: real vuln classes (xss, injection, …)
];

function statusPill(f: { confidence: number; dupRisk: number; humanConfirmed: boolean }) {
  if (f.humanConfirmed && f.confidence > GATE.minConfidence && f.dupRisk < GATE.maxDupRisk) return <span className="pill pill-accent">Ready to send</span>;
  if (f.humanConfirmed) return <span className="pill pill-warn">Low confidence</span>;
  return <span className="pill pill-muted">Needs review</span>;
}

export default async function Findings({ searchParams }: { searchParams: Promise<{ page?: string; all?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page ?? '1') || 1);
  const showAll = sp?.all === '1';
  const payable = showAll
    ? {}
    : { OR: [{ vulnClass: { in: PAYABLE_CLASSES } }, { vulnClass: { startsWith: 'cve' } }] };
  const [totalRuns, allTotal, runs, subs] = await Promise.all([
    safe(() => prisma.scanRun.count(), 0),
    safe(() => prisma.finding.count(), 0),
    safe(
      () =>
        prisma.scanRun.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: {
            program: { select: { handle: true } },
            findings: { where: payable, orderBy: [{ severity: 'desc' }, { confidence: 'desc' }], take: 100 },
          },
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
  const totalPages = Math.max(1, Math.ceil(totalRuns / PAGE_SIZE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Findings</h1>
          <div className="page-sub">
            {showAll
              ? 'One result per scan, everything shown (including low-value noise).'
              : 'One result per scan, payable-class candidates only.'}
          </div>
        </div>
        <Link className="btn btn-sm" href={showAll ? '/findings' : '/findings?all=1'}>
          {showAll ? 'Payable only' : `Show all (${allTotal.toLocaleString()})`}
        </Link>
      </div>

      {runs.length === 0 ? (
        <EmptyState title="No Scans Yet">
          Each scan appears here as one result you can expand. Run a scan from a program page.
        </EmptyState>
      ) : (
        <>
          <div className="grid" style={{ gap: 10 }}>
            {runs.map((run) => {
              const shown = run.findings.length;
              return (
                <details className="card" key={run.id} open={shown > 0 && shown <= 8}>
                  <summary className="scope-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span>
                      <span className="mono" style={{ fontWeight: 600 }}>{run.target}</span>
                      <span className="tag" style={{ marginLeft: 8 }}>Tier {run.tier}</span>
                      <span className="tag" style={{ marginLeft: 6 }}>{run.program?.handle}</span>
                    </span>
                    <span className="page-sub" style={{ whiteSpace: 'nowrap' }}>
                      {shown} payable · {run.findingsCount} findings · {run.assetsCount} assets · {fmt(run.createdAt)}
                    </span>
                  </summary>
                  {shown === 0 ? (
                    <div className="page-sub" style={{ marginTop: 10 }}>No payable-class findings in this scan.</div>
                  ) : (
                    <div className="table-wrap" style={{ marginTop: 10 }}>
                      <table className="table">
                        <tbody>
                          {run.findings.map((f: any) => (
                            <tr key={f.id}>
                              <td>
                                <Link href={`/findings/${f.id}`}>
                                  <div style={{ fontWeight: 600 }}>{f.title}</div>
                                  <div className="page-sub" style={{ marginTop: 2 }}><span className="tag">{f.vulnClass}</span></div>
                                </Link>
                              </td>
                              <td><SeverityPill severity={f.severity} /></td>
                              <td><ConfidenceBand value={f.confidence} /></td>
                              <td>{statusPill(f)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>
              );
            })}
          </div>
          <Pager page={page} totalPages={totalPages} basePath="/findings" extraQuery={showAll ? '&all=1' : ''} total={totalRuns} pageSize={PAGE_SIZE} />
        </>
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
