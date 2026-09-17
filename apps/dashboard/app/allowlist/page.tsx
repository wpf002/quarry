import Link from 'next/link';
import { prisma, safe } from '../../lib/db';
import { EmptyState } from '../../components/ui';

export const dynamic = 'force-dynamic';

export default async function AllowlistPage() {
  const entries = await safe(
    () =>
      prisma.allowlist.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        include: { program: true },
        take: 200,
      }),
    [] as any[],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Allowlist</h1>
          <div className="page-sub">
            Every pattern a human confirmed in-scope. This is the only thing an
            active scan is allowed to touch.
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="Nothing Allowlisted Yet">
          Open a program and add confirmed in-scope patterns by hand.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Program</th>
                <th>Kind</th>
                <th>Added by</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{e.pattern}</td>
                  <td><Link href={`/programs/${e.programId}`}>{e.program?.handle}</Link></td>
                  <td>{e.allowWildcard ? <span className="pill pill-warn">wildcard</span> : <span className="pill pill-muted">exact</span>}</td>
                  <td className="mono" style={{ color: 'var(--muted)' }}>{e.addedBy}</td>
                  <td style={{ color: 'var(--faint)' }}>{e.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
