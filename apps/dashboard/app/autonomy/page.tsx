import Link from 'next/link';
import { prisma, safe } from '../../lib/db';
import { EmptyState } from '../../components/ui';
import { RevokePreauth } from '../../components/RevokePreauth';

export const dynamic = 'force-dynamic';

export default async function AutonomyPage() {
  const preauths = await safe(
    () => prisma.preAuthorization.findMany({ orderBy: { createdAt: 'desc' }, include: { program: true }, take: 200 }),
    [] as any[],
  );
  const now = Date.now();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Autonomy <span className="tag">L2</span></h1>
          <div className="page-sub">
            Standing authorizations. The scheduler runs Tier 1/2 scans within
            these limits; any breaker trip revokes the auth.
          </div>
        </div>
      </div>

      {preauths.length === 0 ? (
        <EmptyState title="No standing authorizations">
          Sign one from a program page once its allowlist is ownership-verified.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Program</th><th>Status</th><th>Tiers</th><th>Budget/day</th>
                <th>Targets/day</th><th>Expires</th><th></th>
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
    </>
  );
}
