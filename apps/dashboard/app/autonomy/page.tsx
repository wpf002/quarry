import Link from 'next/link';
import { prisma, safe } from '../../lib/db';
import { EmptyState } from '../../components/ui';
import { KillSwitch } from '../../components/KillSwitch';
import { RevokePreauth } from '../../components/RevokePreauth';

export const dynamic = 'force-dynamic';

export default async function AuthorizationsPage() {
  const [preauths, approvals, killRow] = await Promise.all([
    safe(() => prisma.preAuthorization.findMany({ orderBy: { createdAt: 'desc' }, include: { program: true }, take: 200 }), [] as any[]),
    safe(() => prisma.scanApproval.findMany({ orderBy: { createdAt: 'desc' }, include: { program: true, allowlist: true }, take: 200 }), [] as any[]),
    safe(() => prisma.auditLog.findFirst({ where: { actor: 'operator', action: { in: ['killswitch.on', 'killswitch.off'] } }, orderBy: { createdAt: 'desc' } }), null),
  ]);
  const killed = killRow?.action === 'killswitch.on';
  const now = Date.now();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Authorizations</h1>
          <div className="page-sub">
            What is cleared to be scanned, and until when. Standing authorizations
            run Tier 1 and 2 within their limits; a breaker trip revokes them.
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <KillSwitch initialEngaged={killed} />
      </div>

      <h3 style={{ fontSize: 15, margin: '0 0 12px' }}>Standing Authorizations</h3>
      {preauths.length === 0 ? (
        <EmptyState title="No Standing Authorizations">
          Sign one from a program page once its allowlist is ownership-verified.
        </EmptyState>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 26 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Program</th><th>Status</th><th>Tiers</th><th>Budget/Day</th>
                <th>Targets/Day</th><th>Expires</th><th></th>
              </tr>
            </thead>
            <tbody>
              {preauths.map((p) => {
                const expired = new Date(p.expiresAt).getTime() < now;
                const live = !p.revoked && !expired;
                return (
                  <tr key={p.id}>
                    <td><Link href={`/programs/${p.programId}`}>{p.program?.handle}</Link></td>
                    <td>
                      {live ? <span className="pill pill-accent">live</span>
                        : p.revoked ? <span className="pill pill-danger">revoked</span>
                        : <span className="pill pill-muted">expired</span>}
                      {p.revoked && p.revokedReason && <div className="mono" style={{ color: 'var(--faint)', fontSize: 11 }}>{p.revokedReason}</div>}
                    </td>
                    <td className="mono">{(p.tiers ?? []).join(', ')}</td>
                    <td className="mono">${p.dailyBudgetUsd}</td>
                    <td className="mono">{p.maxTargetsPerDay}</td>
                    <td className="mono" style={{ color: 'var(--faint)' }}>{new Date(p.expiresAt).toISOString().slice(0, 16).replace('T', ' ')}</td>
                    <td style={{ textAlign: 'right' }}>{live && <RevokePreauth id={p.id} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ fontSize: 15, margin: '0 0 12px' }}>Scan Approvals</h3>
      {approvals.length === 0 ? (
        <EmptyState title="No Approvals Yet">
          Approvals are created from a program page once the gate conditions pass.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Program</th><th>Pattern</th><th>State</th><th>Approved By</th><th>Expires</th></tr>
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
