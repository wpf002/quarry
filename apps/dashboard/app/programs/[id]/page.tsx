import Link from 'next/link';
import { prisma, safe } from '../../../lib/db';
import { PlatformPill, ScoreBar } from '../../../components/ui';
import { GateActions } from '../../../components/GateActions';

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
          <ScoreBar value={program.score} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.2fr', gap: 20, alignItems: 'start' }}>
        {/* left: advisory parsed scope */}
        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Parsed scope</h3>
            <div className="page-sub" style={{ marginBottom: 12 }}>
              Advisory only. The parser proposes; it never authorizes a scan.
            </div>
            <dl className="kv">
              <dt>In scope</dt>
              <dd className="chip-row">
                {(scope.inScope ?? []).map((s) => <span key={s} className="tag">{s}</span>)}
                {!scope.inScope?.length && <span style={{ color: 'var(--faint)' }}>—</span>}
              </dd>
              <dt>Out of scope</dt>
              <dd className="chip-row">
                {(scope.outOfScope ?? []).map((s) => <span key={s} className="tag">{s}</span>)}
                {!scope.outOfScope?.length && <span style={{ color: 'var(--faint)' }}>—</span>}
              </dd>
              <dt>Prohibited</dt>
              <dd className="chip-row">
                {(scope.prohibited ?? []).map((s) => <span key={s} className="pill pill-danger">{s}</span>)}
                {!scope.prohibited?.length && <span style={{ color: 'var(--faint)' }}>—</span>}
              </dd>
              <dt>Confidence</dt>
              <dd className="mono">{Math.round((program.parseConfidence ?? 0) * 100)}%</dd>
            </dl>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Policy (captured)</h3>
            <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--muted)', fontSize: 12.5, margin: 0, fontFamily: 'var(--mono)' }}>
              {program.policyRaw || '—'}
            </pre>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Attack surface</h3>
            <div className="page-sub" style={{ marginBottom: 12 }}>
              {program.assets.length} asset(s) from passive recon. All default
              out-of-scope until allowlisted.
            </div>
            {program.assets.length === 0 ? (
              <div style={{ color: 'var(--faint)' }}>No assets discovered yet.</div>
            ) : (
              <div className="chip-row">
                {program.assets.map((a) => (
                  <span key={a.id} className="tag" title={a.source}>{a.value}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* right: the human gate */}
        <GateActions
          programId={program.id}
          flags={program.ambiguityFlags}
          allowlist={program.allowlist as any}
        />
      </div>
    </>
  );
}
