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
  flags,
  allowlist,
  proposals = [],
}: {
  programId: string;
  flags: string[];
  allowlist: Entry[];
  proposals?: string[];
}) {
  const router = useRouter();
  const [who, setWho] = useState('will');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const active = allowlist.filter((e) => e.active);
  const ready = flags.length === 0 && active.length > 0;
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

      {/* ambiguity */}
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Ambiguity Flags</h3>
        <div className="page-sub" style={{ marginBottom: 12 }}>
          Clear each before you can approve.
        </div>
        {flags.length === 0 ? (
          <span className="pill pill-accent">all clear</span>
        ) : (
          <div className="grid" style={{ gap: 8 }}>
            {flags.map((f) => (
              <div key={f} className="callout" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{f}</span>
                <button
                  className="btn btn-sm"
                  disabled={busy != null}
                  onClick={() => run('flag' + f, () => apiPost(`/programs/${programId}/ambiguity/clear`, { flag: f, clearedBy: who }))}
                >
                  Clear
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* allowlist */}
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Allowlist</h3>
        <div className="page-sub" style={{ marginBottom: 12 }}>
          Whitelist only. Wildcards need the toggle and a note.
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
      </div>

      {/* approve */}
      <div className="card" style={{ borderColor: ready ? 'var(--accent-dim)' : 'var(--border)' }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Approve Scan</h3>
        <div className="page-sub" style={{ marginBottom: 12 }}>
          One click, per program. Expires; does not start a scan.
        </div>
        <button
          className="btn btn-primary"
          disabled={!ready || busy != null}
          onClick={() => run('approve', () => apiPost(`/programs/${programId}/approve-scan`, { approvedBy: who }), 'Scan approved.')}
        >
          {busy === 'approve' ? 'Approving…' : ready ? 'Approve Scan' : 'Clear Flags to Approve'}
        </button>
        {ok && <div style={{ color: 'var(--accent)', marginTop: 10, fontSize: 13 }}>{ok}</div>}
        {err && <div style={{ color: 'var(--danger)', marginTop: 10, fontSize: 13 }}>{err}</div>}
      </div>

      {/* L2 standing authorization */}
      <div className="card" style={{ borderColor: allVerified && ready ? 'var(--accent-dim)' : 'var(--border)' }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Standing Authorization</h3>
        <div className="page-sub" style={{ marginBottom: 12 }}>
          Runs Tier 1–2 within limits until it expires. Every entry must be verified.
        </div>
        <button
          className="btn btn-primary"
          disabled={!ready || !allVerified || busy != null}
          onClick={() => run('preauth', () => apiPost(`/programs/${programId}/preauth`, { signedBy: who }), 'Standing authorization signed.')}
        >
          {busy === 'preauth' ? 'Signing…' : allVerified && ready ? 'Sign Standing Authorization' : 'Verify Every Entry First'}
        </button>
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
