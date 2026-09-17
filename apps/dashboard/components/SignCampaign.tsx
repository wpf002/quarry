'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../lib/api';

type Eligible = { id: string; handle: string };

export function SignCampaign({ eligible }: { eligible: Eligible[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (id: string) => {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  };

  const sign = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await apiPost<{ expiresAt: string }>('/campaigns', {
        programIds: [...sel], signedBy: 'will', days: Number(days), autoSubmit,
      });
      setMsg(`Signed — expires ${new Date(r.expiresAt).toISOString().slice(0, 16).replace('T', ' ')}.`);
      setSel(new Set());
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Sign a New Campaign</h3>
      <div className="page-sub" style={{ marginBottom: 12 }}>
        Only programs with a verified allowlist show up here. Signing runs them
        until the campaign expires or a breaker trips.
      </div>
      {eligible.length === 0 ? (
        <div style={{ color: 'var(--faint)' }}>No eligible programs. Verify allowlists first.</div>
      ) : (
        <>
          <div className="grid" style={{ gap: 6, marginBottom: 12 }}>
            {eligible.map((p) => (
              <label key={p.id} className="callout" style={{ alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
                <span style={{ color: 'var(--text)' }}>{p.handle}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
              <input type="checkbox" checked={autoSubmit} onChange={(e) => setAutoSubmit(e.target.checked)} /> Auto-Submit
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
              expires in <input className="input" value={days} onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ''))} style={{ width: 60 }} /> days
            </label>
            <button className="btn btn-primary" disabled={busy || sel.size === 0} onClick={sign}>
              {busy ? 'Signing…' : `Sign Campaign (${sel.size})`}
            </button>
          </div>
          {msg && <div className="zap" style={{ fontSize: 13, marginTop: 10 }}>{msg}</div>}
          {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 10 }}>{err}</div>}
        </>
      )}
    </div>
  );
}
