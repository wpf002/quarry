import Link from 'next/link';
import { prisma, safe } from '../../../lib/db';
import { PlatformPill } from '../../../components/ui';
import { GateActions } from '../../../components/GateActions';
import { AutoSubmitPolicy } from '../../../components/AutoSubmitPolicy';
import { ScanContextForm } from '../../../components/ScanContextForm';

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
          scanContext: true,
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

  const scannableHost = (a: string) => {
    const v = (a || '').toLowerCase().trim();
    if (!v || /\s/.test(v)) return false;                 // "Dropbox Desktop Application"
    if (/^\d+$/.test(v)) return false;                    // numeric asset ids
    if (v.startsWith('com.') || v.includes('play.google.com') || v.includes('apps.apple.com')) return false;
    if (v.includes('github.com') || v.includes('gitlab.com')) return false;
    if (/\.(apk|ipa)$/.test(v)) return false;
    return /[a-z0-9.-]+\.[a-z]{2,}/.test(v) || /^\d{1,3}(\.\d{1,3}){3}/.test(v) || v.startsWith('http');
  };
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
      </div>

      <div className="grid" style={{ gap: 16 }}>
        <GateActions
          programId={program.id}
          allowlist={program.allowlist as any}
          proposals={(scope.inScope ?? []).filter((a) => !a.includes('*') && scannableHost(a))}
        />
        <AutoSubmitPolicy programId={program.id} policy={program.autoSubmit as any} />

        <ScanContextForm
          programId={program.id}
          initial={{
            hasScanAuth: !!(program.scanContext?.scanAuthHeaders && Object.keys(program.scanContext.scanAuthHeaders as object).length > 0),
            hasIdorHeaders: !!(program.scanContext?.idorVictimHeaders && Object.keys(program.scanContext.idorVictimHeaders as object).length > 0),
            idorVictimId: program.scanContext?.idorVictimId ?? null,
            idorIdParam: program.scanContext?.idorIdParam ?? null,
            ssrfCanaryHost: program.scanContext?.ssrfCanaryHost ?? null,
            ssrfWait: program.scanContext?.ssrfWait ?? null,
          }}
        />

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
