import { prisma, safe } from '../../lib/db';
import { InboxClient } from '../../components/InboxClient';

export const dynamic = 'force-dynamic';

export default async function Inbox() {
  const [programs, held] = await Promise.all([
    safe(
      () => prisma.program.findMany({
        where: { active: false },
        include: { _count: { select: { allowlist: true } }, allowlist: { where: { active: true }, select: { id: true } } },
        orderBy: { score: 'desc' },
        take: 200,
      }),
      [] as any[],
    ),
    safe(
      () => prisma.submission.findMany({
        where: { state: 'HELD_FOR_REVIEW' },
        include: { report: { include: { finding: { include: { program: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      [] as any[],
    ),
  ]);

  const ready = programs
    .filter((p) => p.ambiguityFlags.length === 0 && p.allowlist.length > 0)
    .map((p) => ({ id: p.id, name: p.name, handle: p.handle, platform: p.platform, allowlistCount: p.allowlist.length }));
  const pending = programs
    .filter((p) => p.ambiguityFlags.length > 0 || p.allowlist.length === 0)
    .map((p) => ({ id: p.id, name: p.name, handle: p.handle, flags: p.ambiguityFlags.length }));
  const reports = held.map((s) => ({
    id: s.id,
    title: s.report?.finding?.title ?? 'Untitled',
    vulnClass: s.report?.finding?.vulnClass ?? '—',
    severity: s.report?.finding?.severity ?? 'INFO',
    handle: s.report?.finding?.program?.handle ?? '—',
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Review inbox</h1>
          <div className="page-sub">
            One place to give consent. Discovery finds and drafts; you approve
            scans and release reports in bulk.
          </div>
        </div>
      </div>
      <InboxClient ready={ready} pending={pending} reports={reports} />
    </>
  );
}
