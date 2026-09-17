'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../lib/api';

type Candidate = { id: string; handle: string; target: string; reason: string };
type RunResult = { id: string; target: string; ok: boolean; assets?: number; findings?: number; error?: string };

export function Tier3Queue() {
  const [queue, setQueue] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<RunResult[] | null>(null);

  const load = async () => {
    try {
      const r = await apiGet<{ queue: Candidate[] }>('/tier3/queue');
      setQueue(r.queue);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const ids = queue.filter((c) => picked[c.id]).map((c) => c.id);
  const allOn = queue.length > 0 && ids.length === queue.length;
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    if (!allOn) queue.forEach((c) => (next[c.id] = true));
    setPicked(next);
  };

  const approve = async () => {
    if (ids.length === 0) return;
    if (!window.confirm(
      `Approve and run ${ids.length} high-impact (Tier 3) check(s) now? Each runs one exploitation attempt against a host you own that the program authorizes.`,
    )) return;
    setBusy('approve'); setErr(null); setResults(null);
    try {
      const r = await apiPost<{ results: RunResult[] }>('/tier3/approve', { ids, by: 'will' });
      setResults(r.results);
      setPicked({});
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  const dismiss = async () => {
    if (ids.length === 0) return;
    setBusy('dismiss'); setErr(null);
    try {
      await apiPost('/tier3/dismiss', { ids, by: 'will' });
      setPicked({});
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="card" style={{ borderColor: 'var(--danger)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Tier 3 Queue</h3>
          <div className="page-sub" style={{ marginTop: 2 }}>
            High-impact checks the autopilot lined up. Approve a batch in one action.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-ghost" disabled={busy != null || ids.length === 0} onClick={dismiss}>
            {busy === 'dismiss' ? 'Dismissing…' : `Dismiss (${ids.length})`}
          </button>
          <button
            className="btn btn-sm btn-primary"
            style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#1a0e12' }}
            disabled={busy != null || ids.length === 0}
            onClick={approve}
          >
            {busy === 'approve' ? 'Running…' : `Approve & Run (${ids.length})`}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--faint)' }}>Loading…</div>
      ) : queue.length === 0 ? (
        <div style={{ color: 'var(--faint)' }}>
          Nothing queued. Candidates appear here as Tier 1/2 scans surface high-impact signals on authorized targets.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" checked={allOn} onChange={toggleAll} />
                </th>
                <th>Program</th>
                <th>Target</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!picked[c.id]}
                      onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.checked }))}
                    />
                  </td>
                  <td className="mono">{c.handle}</td>
                  <td className="mono">{c.target}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          {results.map((r) => (
            <div key={r.id} style={{ color: r.ok ? 'var(--accent)' : 'var(--danger)' }}>
              {r.ok
                ? `${r.target}: ${r.findings} finding(s), ${r.assets} asset(s)`
                : `${r.target}: ${r.error}`}
            </div>
          ))}
        </div>
      )}
      {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{err}</div>}
    </div>
  );
}
