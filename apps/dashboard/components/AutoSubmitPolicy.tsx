'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../lib/api';

type Policy = {
  enabled: boolean;
  minConfidence: number;
  maxDupRisk: number;
  allowedVulnClasses: string[];
  dailyCap: number;
  requireChain: boolean;
} | null;

export function AutoSubmitPolicy({ programId, policy }: { programId: string; policy: Policy }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(policy?.enabled ?? false);
  const [minConf, setMinConf] = useState(String(policy?.minConfidence ?? 0.85));
  const [maxDup, setMaxDup] = useState(String(policy?.maxDupRisk ?? 0.3));
  const [cap, setCap] = useState(String(policy?.dailyCap ?? 3));
  const [classes, setClasses] = useState((policy?.allowedVulnClasses ?? []).join(', '));
  const [requireChain, setRequireChain] = useState(policy?.requireChain ?? false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await apiPost(`/programs/${programId}/autosubmit-policy`, {
        by: 'will',
        enabled,
        minConfidence: Number(minConf),
        maxDupRisk: Number(maxDup),
        dailyCap: Number(cap),
        requireChain,
        allowedVulnClasses: classes.split(',').map((c) => c.trim()).filter(Boolean),
      });
      setMsg('Policy saved.');
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ borderColor: enabled ? 'var(--accent-dim)' : 'var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 15 }}>Auto-Submit</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {enabled ? <span className="pill pill-accent">on</span> : <span className="pill pill-muted">off</span>}
        </label>
      </div>
      {!enabled ? null : (
      <>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Min Confidence
          <input className="input" value={minConf} onChange={(e) => setMinConf(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Max Dup Risk
          <input className="input" value={maxDup} onChange={(e) => setMaxDup(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Daily Cap
          <input className="input" value={cap} onChange={(e) => setCap(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Allowed Classes (Blank = Any Safe)
          <input className="input" value={classes} onChange={(e) => setClasses(e.target.value)} placeholder="git-exposure, public-bucket" style={{ marginTop: 4 }} />
        </label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, margin: '10px 0' }}>
        <input type="checkbox" checked={requireChain} onChange={(e) => setRequireChain(e.target.checked)} />
        Require a Chain
      </label>
      </>
      )}
      <button className="btn btn-primary" disabled={busy} onClick={save} style={{ marginTop: 12 }}>{busy ? 'Saving…' : 'Save Policy'}</button>
      {msg && <span className="zap" style={{ fontSize: 13, marginLeft: 10 }}>{msg}</span>}
      {err && <span style={{ color: 'var(--danger)', fontSize: 12, marginLeft: 10 }}>{err}</span>}
    </div>
  );
}
