'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPost } from '../lib/api';
import { SeverityPill, PlatformPill } from './ui';

type Prog = { id: string; name: string; handle: string; platform: string; allowlistCount: number };
type Pending = { id: string; name: string; handle: string; flags: number };
type Rep = { id: string; title: string; vulnClass: string; severity: string; handle: string };

export function InboxClient({
  ready,
  pending,
  reports,
}: {
  ready: Prog[];
  pending: Pending[];
  reports: Rep[];
}) {
  const router = useRouter();
  const [who, setWho] = useState('will');
  const [progSel, setProgSel] = useState<Set<string>>(new Set());
  const [repSel, setRepSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (set: Set<string>, id: string, upd: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    upd(n);
  };

  const approveSelected = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await apiPost<{ results: any[] }>('/programs/approve-batch', { programIds: [...progSel], approvedBy: who });
      const ok = r.results.filter((x) => x.ok).length;
      const failed = r.results.filter((x) => !x.ok);
      setMsg(`Approved ${ok}/${r.results.length}.`);
      if (failed.length) setErr(failed.map((f) => `${f.programId}: ${f.error}`).join(' · '));
      setProgSel(new Set());
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const submitSelected = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await apiPost<{ results: any[] }>('/submissions/submit-batch', { submissionIds: [...repSel], by: who });
      const ok = r.results.filter((x) => x.ok).length;
      setMsg(`Submitted ${ok}/${r.results.length}.`);
      setRepSel(new Set());
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const reject = async (id: string) => {
    setBusy(true); setErr(null);
    try { await apiPost(`/submissions/${id}/reject`, { by: who }); router.refresh(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="stat-label">Acting as</span>
        <input className="input" value={who} onChange={(e) => setWho(e.target.value)} style={{ maxWidth: 180 }} />
        {msg && <span className="zap" style={{ fontSize: 13 }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</span>}
      </div>

      {/* programs ready to approve */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 15 }}>Ready to Approve <span className="tag">{ready.length}</span></h3>
          <button className="btn btn-primary btn-sm" disabled={busy || progSel.size === 0} onClick={approveSelected}>
            Approve {progSel.size || ''} scan{progSel.size === 1 ? '' : 's'}
          </button>
        </div>
        {ready.length === 0 ? (
          <div style={{ color: 'var(--faint)' }}>Nothing gate-ready. Confirm allowlists on programs below.</div>
        ) : ready.map((p) => (
          <label key={p.id} className="callout" style={{ alignItems: 'center', marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={progSel.has(p.id)} onChange={() => toggle(progSel, p.id, setProgSel)} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
              <div className="mono" style={{ color: 'var(--faint)', fontSize: 11.5 }}>{p.handle} · {p.allowlistCount} allowlisted</div>
            </div>
            <PlatformPill platform={p.platform} />
          </label>
        ))}
      </div>

      {/* reports held for review */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 15 }}>Held Reports <span className="tag">{reports.length}</span></h3>
          <button className="btn btn-primary btn-sm" disabled={busy || repSel.size === 0} onClick={submitSelected}>
            Submit {repSel.size || ''}
          </button>
        </div>
        {reports.length === 0 ? (
          <div style={{ color: 'var(--faint)' }}>No reports in the trap yet.</div>
        ) : reports.map((r) => (
          <div key={r.id} className="callout" style={{ alignItems: 'center', marginBottom: 8 }}>
            <input type="checkbox" checked={repSel.has(r.id)} onChange={() => toggle(repSel, r.id, setRepSel)} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.title}</div>
              <div style={{ marginTop: 2 }}>
                <span className="tag">{r.vulnClass}</span> <span className="tag">{r.handle}</span>
              </div>
            </div>
            <SeverityPill severity={r.severity} />
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => reject(r.id)}>Reject</button>
          </div>
        ))}
      </div>

      {/* needs attention */}
      {pending.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Needs Your Confirmation <span className="tag">{pending.length}</span></h3>
          <div className="page-sub" style={{ marginBottom: 12 }}>Clear flags and confirm in-scope assets before these can be approved.</div>
          {pending.map((p) => (
            <Link key={p.id} href={`/programs/${p.id}`} className="callout" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--text)' }}>{p.name} <span className="mono" style={{ color: 'var(--faint)' }}>· {p.handle}</span></span>
              <span className="pill pill-warn">{p.flags} flag{p.flags === 1 ? '' : 's'}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
