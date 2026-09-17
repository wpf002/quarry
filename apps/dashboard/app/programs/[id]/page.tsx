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

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.1fr', gap: 20, alignItems: 'stretch' }}>
        {/* left: scope reference (read-only) */}
        <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Scope</h3>
            <div className="scope-label">In scope</div>
            <div className="chip-row" style={{ marginBottom: 14 }}>
              {(scope.inScope ?? []).map((s) => <span key={s} className="tag">{s}</span>)}
              {!scope.inScope?.length && <span style={{ color: 'var(--faint)' }}>—</span>}
            </div>
            {!!scope.outOfScope?.length && (
              <>
                <div className="scope-label">Out of scope</div>
                <div className="chip-row">
                  {scope.outOfScope.map((s) => <span key={s} className="tag">{s}</span>)}
                </div>
              </>
            )}
          </div>
          {program.assets.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>Passive Assets</h3>
              <div className="page-sub" style={{ marginBottom: 12 }}>
                {program.assets.length} found. Out of scope until you allowlist them.
              </div>
              <div className="chip-row">
                {program.assets.map((a) => (
                  <span key={a.id} className="tag" title={a.source}>{a.value}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* right: the human gate */}
        <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
          <GateActions
            programId={program.id}
            flags={program.ambiguityFlags}
            allowlist={program.allowlist as any}
            proposals={(scope.inScope ?? []).filter((a) => !a.includes('*'))}
          />
          <AutoSubmitPolicy programId={program.id} policy={program.autoSubmit as any} />
        </div>
      </div>
    </>
  );
}
