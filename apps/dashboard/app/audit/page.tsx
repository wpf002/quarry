import { prisma, safe } from '../../lib/db';
import { EmptyState } from '../../components/ui';

export const dynamic = 'force-dynamic';

const ACTION_PILL = (action: string) => {
  if (action.includes('refuse') || action.includes('halted') || action.endsWith('.on')) return 'pill-danger';
  if (action.includes('pass') || action.includes('grant')) return 'pill-accent';
  if (action.includes('run') || action.includes('results')) return 'pill-info';
  return 'pill-muted';
};

export default async function AuditPage() {
  const rows = await safe(
    () => prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    [] as any[],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Audit</h1>
          <div className="page-sub">
            Append-only. Every scope verdict, gate pass/refusal, approval, and
            active run is recorded with actor and detail.
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No Audit Entries Yet">
          Scope decisions and gate checks appear here as the system runs.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>
                    {new Date(r.createdAt).toISOString().slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="mono" style={{ color: 'var(--muted)' }}>{r.actor}</td>
                  <td><span className={`pill ${ACTION_PILL(r.action)}`}>{r.action}</span></td>
                  <td className="mono" style={{ color: 'var(--muted)' }}>{r.target ?? '—'}</td>
                  <td className="mono" style={{ color: 'var(--faint)', fontSize: 11.5, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(r.detail)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
