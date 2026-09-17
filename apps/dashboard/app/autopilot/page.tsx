import { prisma, safe } from '../../lib/db';
import { EmptyState } from '../../components/ui';
import { KillSwitch } from '../../components/KillSwitch';
import { SignEnvelope } from '../../components/SignEnvelope';
import { PauseEnvelope } from '../../components/PauseEnvelope';

export const dynamic = 'force-dynamic';

export default async function Autopilot() {
  const [envelopes, programs, killRow] = await Promise.all([
    safe(() => prisma.policyEnvelope.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }), [] as any[]),
    safe(() => prisma.program.findMany({
      include: { allowlist: { where: { active: true }, select: { ownershipVerified: true } } },
      take: 300,
    }), [] as any[]),
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
          <div className="page-sub">Lights-out inside a signed envelope. Any pause trigger halts the whole envelope.</div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}><KillSwitch initialEngaged={killed} /></div>

      <div className="grid" style={{ gap: 18 }}>
        <SignEnvelope eligible={eligible} />

        {envelopes.length === 0 ? (
          <EmptyState title="No Envelopes Signed">Sign one above to run the autopilot.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Status</th><th>Programs</th><th>Tiers</th><th>Auto-submit</th><th>Expires</th><th></th></tr>
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
      </div>
    </>
  );
}
