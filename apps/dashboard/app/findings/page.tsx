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
  'secret-exposure', 'git-exposure', 'env-exposure', 'exposed-secret', 'exposed-api-key', 'exposed-key',
  'subdomain-takeover',
  'public-bucket', 'open-bucket', 's3-exposure',
  'idor', 'bola', 'broken-access-control', 'access-control',
  'auth-bypass', 'auth-weakness', 'broken-auth', 'account-takeover',
  'ssrf', 'sqli', 'sql-injection', 'rce', 'command-injection',
  'xss', 'stored-xss', 'reflected-xss', 'dom-xss',
  'open-redirect', 'cors-misconfig', 'cors-misconfiguration', 'csrf',
  'ssti', 'xxe', 'lfi', 'rfi', 'deserialization', 'path-traversal', 'file-upload',
  'exposed-panel',
];

export default async function Findings({ searchParams }: { searchParams: Promise<{ page?: string; all?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page ?? '1') || 1);
  const showAll = sp?.all === '1';
  const where = showAll
    ? {}
    : { OR: [{ vulnClass: { in: PAYABLE_CLASSES } }, { vulnClass: { startsWith: 'cve' } }] };
  const [total, allTotal, findings, subs] = await Promise.all([
    safe(() => prisma.finding.count({ where }), 0),
    safe(() => prisma.finding.count(), 0),
    safe(
      () =>
        prisma.finding.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Findings</h1>
          <div className="page-sub">
            {showAll
              ? 'Showing everything, including low-value informational findings.'
              : 'Showing payable-class candidates. Header/endpoint/fingerprint noise is hidden.'}
          </div>
        </div>
        <Link className="btn btn-sm" href={showAll ? '/findings' : '/findings?all=1'}>
          {showAll ? 'Payable only' : `Show all (${allTotal.toLocaleString()})`}
        </Link>
      </div>

      {findings.length === 0 ? (
        <EmptyState title={showAll ? 'No Findings Yet' : 'No Payable-Class Candidates Yet'}>
          {showAll
            ? 'Findings appear here once the analyzer has triaged them.'
            : `Nothing payable so far. ${allTotal.toLocaleString()} low-value findings are hidden — the current Infiltr profile emits mostly headers and endpoints. Add real vuln modules to Infiltr to get paid-class results.`}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Finding</th>
                <th>Found</th>
                <th>Severity</th>
                <th>Confidence</th>
                <th>Status</th>
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
                    <td className="mono" style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{fmt(f.createdAt)}</td>
                    <td><SeverityPill severity={f.severity} /></td>
                    <td><ConfidenceBand value={f.confidence} /></td>
                    <td>
                      {pass ? <span className="pill pill-accent">Ready to send</span>
                        : f.humanConfirmed ? <span className="pill pill-warn">Low confidence</span>
                        : <span className="pill pill-muted">Needs review</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager page={page} totalPages={totalPages} basePath="/findings" extraQuery={showAll ? '&all=1' : ''} total={total} pageSize={PAGE_SIZE} />
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
