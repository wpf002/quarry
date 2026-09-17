'use client';
import { useState } from 'react';
import { apiPost } from '../lib/api';

export function KillSwitch({ initialEngaged }: { initialEngaged: boolean }) {
  const [engaged, setEngaged] = useState(initialEngaged);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await apiPost<{ engaged: boolean }>('/killswitch', { on: !engaged, by: 'will' });
      setEngaged(r.engaged);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ borderColor: engaged ? 'var(--danger)' : 'var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600 }}>
          Global kill switch{' '}
          {engaged ? <span className="pill pill-danger">engaged</span> : <span className="pill pill-accent">off</span>}
        </div>
        <div className="page-sub" style={{ marginTop: 2 }}>
          When engaged, recon-active halts before every target. Active work stops
          immediately.
        </div>
        {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      </div>
      <button className={engaged ? 'btn btn-primary' : 'btn btn-ghost'} disabled={busy} onClick={toggle}>
        {busy ? '…' : engaged ? 'Disengage' : 'Engage kill switch'}
      </button>
    </div>
  );
}
