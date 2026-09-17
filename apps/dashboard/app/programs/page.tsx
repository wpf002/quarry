import Link from 'next/link';
import { prisma, safe } from '../../lib/db';
import { PriorityBar, PlatformPill, EmptyState, Pager, SortHeader, StatusPill, PaysPill, money } from '../../components/ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const SORTABLE: Record<string, string> = {
  name: 'name',
  platform: 'platform',
  platformStatus: 'platformStatus',
  offersBounty: 'offersBounty',
  maxBountyUsd: 'maxBountyUsd',
  score: 'score',
};

export default async function Programs({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page ?? 1) || 1);
  const sort = SORTABLE[sp?.sort ?? ''] ? (sp!.sort as string) : 'score';
  const dir = sp?.dir === 'asc' ? 'asc' : 'desc';

  const [total, programs] = await Promise.all([
    safe(() => prisma.program.count(), 0),
    safe(
      () =>
        prisma.program.findMany({
          orderBy: [{ [sort]: { sort: dir, nulls: 'last' } } as any],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
      [] as any[],
    ),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = `&sort=${sort}&dir=${dir}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Programs</h1>
          <div className="page-sub">
            {total.toLocaleString()} programs. Priority ranks targets by payout and
            testable surface. It is not a prediction that Quarry will find a bug.
          </div>
        </div>
      </div>

      {programs.length === 0 ? (
        <EmptyState title="No Programs Yet">
          Add platform API keys and let the worker poll.
        </EmptyState>
      ) : (
        <>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <SortHeader label="Program" field="name" sort={sort} dir={dir} basePath="/programs" />
                <SortHeader label="Platform" field="platform" sort={sort} dir={dir} basePath="/programs" />
                <SortHeader label="Status" field="platformStatus" sort={sort} dir={dir} basePath="/programs" />
                <SortHeader label="Pays" field="offersBounty" sort={sort} dir={dir} basePath="/programs" />
                <SortHeader label="Max Bounty" field="maxBountyUsd" sort={sort} dir={dir} basePath="/programs" />
                <SortHeader label="Priority" field="score" sort={sort} dir={dir} basePath="/programs" width={170} />
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/programs/${p.id}`}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="mono" style={{ color: 'var(--faint)' }}>{p.handle}</div>
                    </Link>
                  </td>
                  <td><PlatformPill platform={p.platform} /></td>
                  <td><StatusPill status={p.platformStatus} /></td>
                  <td><PaysPill offersBounty={p.offersBounty} /></td>
                  <td className="mono">
                    {money(p.maxBountyUsd, p.bountyCurrency, p.platform === 'HACKERONE')}
                  </td>
                  <td><PriorityBar value={p.score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ color: 'var(--faint)', fontSize: 11.5, marginTop: 8 }}>
          HackerOne publishes no bounty amount; those figures are read from policy text and marked ~.
        </div>
        <Pager page={page} totalPages={totalPages} basePath={`/programs`} extraQuery={qs} />
        </>
      )}
    </>
  );
}
