import Link from 'next/link';
import { prisma, safe } from '../../lib/db';
import { EmptyState } from '../../components/ui';
import { KillSwitch } from '../../components/KillSwitch';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const approvals = await safe(
    () =>
      prisma.scanApproval.findMany({
        orderBy: { createdAt: 'desc' },
        include: { program: true, allowlist: true },
        take: 200,
      }),
    [] as any[],
  );
  const killRow = await safe(
    () =>
      prisma.auditLog.findFirst({
        where: { actor: 'operator', action: { in: ['killswitch.on', 'killswitch.off'] } },
        orderBy: { createdAt: 'desc' },
      }),
    null,
  );
  const killed = killRow?.action === 'killswitch.on';
  const now = Date.now();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Scan approvals</h1>
          <div className="page-sub">
            Each approval pins one allowlist entry, the human, and an expiry.
            Expired approvals cannot scan.
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <KillSwitch initialEngaged={killed} />
      </div>

      {approvals.length === 0 ? (
        <EmptyState title="No approvals yet">
          Approvals are created from a program page once the gate conditions pass.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Pattern</th>
                <th>State</th>
                <th>Approved by</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => {
                const expired = a.expiresAt && new Date(a.expiresAt).getTime() < now;
                const live = a.state === 'APPROVED' && !expired;
                return (
                  <tr key={a.id}>
                    <td><Link href={`/programs/${a.programId}`}>{a.program?.handle}</Link></td>
                    <td className="mono">{a.allowlist?.pattern}</td>
                    <td>
                      {live ? <span className="pill pill-accent">live</span>
                        : expired ? <span className="pill pill-danger">expired</span>
                        : <span className="pill pill-muted">{a.state.toLowerCase()}</span>}
                    </td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{a.approvedBy ?? '—'}</td>
                    <td className="mono" style={{ color: 'var(--faint)' }}>
                      {a.expiresAt ? new Date(a.expiresAt).toISOString().slice(0, 16).replace('T', ' ') : '—'}
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
