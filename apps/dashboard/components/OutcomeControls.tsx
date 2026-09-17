'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../lib/api';

const OUTCOMES: Array<{ state: string; label: string }> = [
  { state: 'SUBMITTED', label: 'Submitted' },
  { state: 'RESOLVED', label: 'Paid' },
  { state: 'DUPLICATE', label: 'Duplicate' },
  { state: 'OUT_OF_SCOPE', label: 'Out of scope' },
  { state: 'INFORMATIVE', label: 'Informative' },
];

export function OutcomeControls({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [payout, setPayout] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const mark = async (state: string) => {
    setBusy(true); setErr(null);
    try {
      await apiPost(`/submissions/${submissionId}/outcome`, {
        state,
        by: 'will',
        payoutUsd: state === 'RESOLVED' && payout ? Number(payout) : undefined,
      });
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="input" placeholder="$ payout" value={payout}
        onChange={(e) => setPayout(e.target.value.replace(/[^\d]/g, ''))}
        style={{ width: 90 }} />
      {OUTCOMES.map((o) => (
        <button key={o.state} className="btn btn-sm" disabled={busy} onClick={() => mark(o.state)}>
          {o.label}
        </button>
      ))}
      {err && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</span>}
    </div>
  );
}
