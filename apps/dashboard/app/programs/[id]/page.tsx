import Link from 'next/link';
import { prisma, safe } from '../../../lib/db';
import { PlatformPill, PriorityBar } from '../../../components/ui';
import { GateActions } from '../../../components/GateActions';
import { AutoSubmitPolicy } from '../../../components/AutoSubmitPolicy';

export const dynamic = 'force-dynamic';

export default async function ProgramDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const program = await safe(
    () =>
      prisma.program.findUnique({
        where: { id },
        include: {
          allowlist: { orderBy: { createdAt: 'desc' } },
          assets: { orderBy: { createdAt: 'desc' }, take: 60 },
          autoSubmit: true,
        },
      }),
    null,
  );

  if (!program) {
    return (
      <>
        <div className="crumb">
          <Link href="/programs">← Programs</Link>
        </div>
        <div className="callout">
          Program not found, or the database is offline. Seed and run the API to
          use the gate.
        </div>
      </>
    );
  }

  const scope = (program.parsedScope ?? {}) as {
    inScope?: string[];
    outOfScope?: string[];
    prohibited?: string[];
  };

  return (
    <>
      <div className="crumb">
        <Link href="/programs">← Programs</Link>
      </div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{program.name}</h1>
          <div className="page-sub">
            <span className="mono">{program.handle}</span>{' '}
            <PlatformPill platform={program.platform} />
          </div>
        </div>
        <div style={{ minWidth: 180 }}>
          <PriorityBar value={program.score} />
        </div>
      </div>

      <div className="grid" style={{ gap: 16, maxWidth: 760 }}>
        <GateActions
          programId={program.id}
          flags={program.ambiguityFlags}
          allowlist={program.allowlist as any}
          proposals={(scope.inScope ?? []).filter((a) => !a.includes('*'))}
        />
        <AutoSubmitPolicy programId={program.id} policy={program.autoSubmit as any} />

        {(scope.outOfScope?.length || program.assets.length > 0) && (
          <details className="card">
            <summary className="scope-summary">Scope reference</summary>
            {!!scope.outOfScope?.length && (
              <div style={{ marginTop: 12 }}>
                <div className="scope-label">Out of scope</div>
                <div className="chip-row">
                  {scope.outOfScope.map((s) => <span key={s} className="tag">{s}</span>)}
                </div>
              </div>
            )}
            {program.assets.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="scope-label">Passive assets ({program.assets.length})</div>
                <div className="chip-row">
                  {program.assets.map((a) => <span key={a.id} className="tag" title={a.source}>{a.value}</span>)}
                </div>
              </div>
            )}
          </details>
        )}
      </div>
    </>
  );
}
