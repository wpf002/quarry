'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../lib/api';

type Entry = {
  id: string;
  pattern: string;
  allowWildcard: boolean;
  active: boolean;
  note: string | null;
  addedBy: string;
  ownershipVerified: boolean;
};

export function GateActions({
  programId,
  allowlist,
  proposals = [],
}: {
  programId: string;
  allowlist: Entry[];
  proposals?: string[];
}) {
  const router = useRouter();
  const [who, setWho] = useState('will');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [scanTier, setScanTier] = useState<1 | 2>(1);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);

  const active = allowlist.filter((e) => e.active);
  const allVerified = active.length > 0 && active.every((e) => e.ownershipVerified);

  const run = async (key: string, fn: () => Promise<any>, okMsg?: string) => {
    setBusy(key); setErr(null); setOk(null);
    try {
      await fn();
      if (okMsg) setOk(okMsg);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* identity */}
      <div className="card">
        <div className="stat-label">Acting As (Human Identity)</div>
        <input
          className="input"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          style={{ marginTop: 8, maxWidth: 220 }}
        />
      </div>

      {/* allowlist + authorize (one card) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 15 }}>Targets</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="scope-label" style={{ margin: 0 }}>Scan tier</span>
            {[1, 2].map((t) => (
              <button
                key={t}
                className={`btn btn-sm${scanTier === t ? ' btn-primary' : ''}`}
                onClick={() => setScanTier(t as 1 | 2)}
                title={t === 1 ? 'Passive / safe checks' : 'Low-impact active checks'}
              >
                T{t}
              </button>
            ))}
          </div>
        </div>
        {active.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table className="table">
              <tbody>
                {active.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.pattern}</td>
                    <td>{e.allowWildcard ? <span className="pill pill-warn">wildcard</span> : <span className="pill pill-muted">exact</span>}</td>
                    <td style={{ color: 'var(--faint)' }}>{e.note}</td>
                    <td>
                      {e.ownershipVerified ? (
                        <span className="pill pill-accent">verified</span>
                      ) : (
                        <button className="btn btn-sm" disabled={busy != null}
                          onClick={() => run('ver' + e.id, () => apiPost(`/allowlist/${e.id}/verify-ownership`, { by: who }))}>
                          Verify
                        </button>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm btn-ghost" disabled={busy != null}
                        onClick={() => run('del' + e.id, () => apiPost(`/programs/${programId}/allowlist/${e.id}/deactivate`, { by: who }))}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {proposals.filter((p) => !active.some((e) => e.pattern === p)).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="page-sub" style={{ marginBottom: 6 }}>
              Confirm each host you know is in scope:
            </div>
            <div className="chip-row">
              {proposals
                .filter((p) => !active.some((e) => e.pattern === p))
                .map((p) => (
                  <button
                    key={p}
                    className="btn btn-sm"
                    disabled={busy != null}
                    onClick={() =>
                      run('add' + p, () =>
                        apiPost(`/programs/${programId}/allowlist`, {
                          pattern: p,
                          allowWildcard: false,
                          addedBy: who,
                        }),
                      )
                    }
                  >
                    + {p}
                  </button>
                ))}
            </div>
          </div>
        )}
        <AddPattern programId={programId} who={who} onDone={() => router.refresh()} />

        {(allVerified || ok || err) && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {allVerified && (
              <button
                className="btn btn-primary"
                disabled={busy != null}
                title="Run a scan on every verified target at the selected tier."
                onClick={async () => {
                  setBusy('scan'); setErr(null); setOk(null);
                  setProg({ done: 0, total: active.length });
                  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
                  // Authorize every verified target first (covers ones added later).
                  try {
                    await apiPost(`/programs/${programId}/authorize`, { by: who });
                  } catch (e) {
                    setBusy(null); setProg(null); setErr((e as Error).message); return;
                  }
                  // Infiltr rate-limits (429). Pace the batch and retry transient 429s.
                  const scanOne = async (target: string) => {
                    for (let attempt = 0; ; attempt++) {
                      try {
                        return await apiPost<{ assets: number; findings: number }>(
                          `/programs/${programId}/scan-target`, { target, tier: scanTier },
                        );
                      } catch (err) {
                        const msg = (err as Error).message;
                        if (msg.includes('429') && attempt < 3) { await sleep(3000 * (attempt + 1)); continue; }
                        throw err;
                      }
                    }
                  };
                  let findings = 0, assets = 0;
                  const fails: string[] = [];
                  for (let i = 0; i < active.length; i++) {
                    try {
                      const r = await scanOne(active[i].pattern);
                      findings += r.findings; assets += r.assets;
                    } catch (err) {
                      fails.push(`${active[i].pattern}: ${(err as Error).message}`);
                    }
                    setProg({ done: i + 1, total: active.length });
                    if (i < active.length - 1) await sleep(1500); // pace between targets
                  }
                  setBusy(null); setProg(null);
                  if (fails.length) setErr(fails.join(' · '));
                  setOk(`Scanned ${active.length - fails.length}/${active.length} target(s) at Tier ${scanTier}: ${findings} finding(s), ${assets} asset(s).`);
                  router.refresh();
                }}
              >
                {busy === 'scan' ? `Scanning… ${prog ? `${prog.done}/${prog.total}` : ''}` : 'Run Scan'}
              </button>
            )}
            {busy === 'scan' && prog && (
              <div style={{ flexBasis: '100%', height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%`, background: 'var(--accent)', transition: 'width 0.2s ease' }} />
              </div>
            )}
            {ok && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{ok}</span>}
            {err && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function AddPattern({ programId, who, onDone }: { programId: string; who: string; onDone: () => void }) {
  const [pattern, setPattern] = useState('');
  const [wild, setWild] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await apiPost(`/programs/${programId}/allowlist`, { pattern, allowWildcard: wild, addedBy: who, note });
      setPattern(''); setNote(''); setWild(false);
      onDone();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid" style={{ gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="input" placeholder="api.acme.com  /  10.0.0.0/24  /  https://api.acme.com/v2/"
          value={pattern} onChange={(e) => setPattern(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
        <button className="btn btn-primary" disabled={!pattern || busy} onClick={submit}>Add</button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
        <input type="checkbox" checked={wild} onChange={(e) => setWild(e.target.checked)} />
        Allow wildcard (requires a note)
      </label>
      {wild && (
        <input className="input" placeholder="Note: why this wildcard is justified"
          value={note} onChange={(e) => setNote(e.target.value)} />
      )}
      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
    </div>
  );
}
