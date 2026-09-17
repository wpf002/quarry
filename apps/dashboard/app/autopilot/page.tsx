import Link from 'next/link';
import { prisma, safe } from '../../lib/db';
import { EmptyState } from '../../components/ui';
import { KillSwitch } from '../../components/KillSwitch';
import { SignEnvelope } from '../../components/SignEnvelope';
import { PauseEnvelope } from '../../components/PauseEnvelope';
import { RevokePreauth } from '../../components/RevokePreauth';

export const dynamic = 'force-dynamic';

export default async function Autopilot() {
  const [envelopes, programs, preauths, approvals, killRow] = await Promise.all([
    safe(() => prisma.policyEnvelope.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }), [] as any[]),
    safe(() => prisma.program.findMany({ include: { allowlist: { where: { active: true }, select: { ownershipVerified: true } } }, take: 300 }), [] as any[]),
    safe(() => prisma.preAuthorization.findMany({ orderBy: { createdAt: 'desc' }, include: { program: true }, take: 100 }), [] as any[]),
    safe(() => prisma.scanApproval.findMany({ orderBy: { createdAt: 'desc' }, include: { program: true, allowlist: true }, take: 100 }), [] as any[]),
    safe(() => prisma.auditLog.findFirst({ where: { actor: 'operator', action: { in: ['killswitch.on', 'killswitch.off'] } }, orderBy: { createdAt: 'desc' } }), null),
  ]);
  const killed = killRow?.action === 'killswitch.on';
  const now = Date.now();

  const eligible = programs
    .filter((p) => p.ambiguityFlags.length === 0 && p.allowlist.length > 0 && p.allowlist.every((a: any) => a.ownershipVerified))
    .map((p) => ({ id: p.id, handle: p.handle }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Autopilot</h1>
          <div className="page-sub">
            Turn autonomous scanning on or off, and see what is authorized
            to run.
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}><KillSwitch initialEngaged={killed} /></div>

      <SignEnvelope eligible={eligible} />

      <h3 style={{ fontSize: 15, margin: '32px 0 14px' }}>Envelopes</h3>
      {envelopes.length === 0 ? (
        <EmptyState title="No Envelopes Signed">Sign one above to run the autopilot.</EmptyState>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 26 }}>
          <table className="table">
            <thead>
              <tr><th>Status</th><th>Programs</th><th>Tiers</th><th>Auto-Submit</th><th>Expires</th><th></th></tr>
            </thead>
            <tbody>
              {envelopes.map((e) => {
                const expired = new Date(e.expiresAt).getTime() < now;
                const live = !e.paused && !expired;
                return (
                  <tr key={e.id}>
                    <td>
                      {live ? <span className="pill pill-accent">live</span>
                        : e.paused ? <span className="pill pill-danger">paused</span>
                        : <span className="pill pill-muted">expired</span>}
                      {e.paused && e.pausedReason && <div className="mono" style={{ color: 'var(--faint)', fontSize: 11 }}>{e.pausedReason}</div>}
                    </td>
                    <td className="mono">{e.programIds.length}</td>
                    <td className="mono">{(e.tiers ?? []).join(', ')}</td>
                    <td>{e.autoSubmit ? <span className="pill pill-warn">on</span> : <span className="pill pill-muted">off</span>}</td>
                    <td className="mono" style={{ color: 'var(--faint)' }}>{new Date(e.expiresAt).toISOString().slice(0, 16).replace('T', ' ')}</td>
                    <td style={{ textAlign: 'right' }}>{live && <PauseEnvelope id={e.id} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ fontSize: 15, margin: '32px 0 14px' }}>Standing Authorizations</h3>
      {preauths.length === 0 ? (
        <EmptyState title="No Standing Authorizations">Sign an envelope, or authorize a single program from its page.</EmptyState>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 26 }}>
          <table className="table">
            <thead>
              <tr><th>Program</th><th>Status</th><th>Tiers</th><th>Budget/Day</th><th>Targets/Day</th><th>Expires</th><th></th></tr>
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

      <h3 style={{ fontSize: 15, margin: '32px 0 14px' }}>Scan Approvals</h3>
      {approvals.length === 0 ? (
        <EmptyState title="No Approvals Yet">Approvals are created when you approve a program or sign an envelope.</EmptyState>
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
                    <td className="mono" style={{ color: 'var(--faint)' }}>{a.expiresAt ? new Date(a.expiresAt).toISOString().slice(0, 16).replace('T', ' ') : '—'}</td>
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
