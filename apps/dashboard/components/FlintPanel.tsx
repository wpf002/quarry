'use client';
import { useState } from 'react';
import { apiPost } from '../lib/api';

type Analysis = {
  verdict: string;
  confidence: number;
  reasoning: string;
  exploitability: string;
  nextSteps: string[];
  reportDraft: string;
  model: string;
};

export function FlintPanel({ findingId }: { findingId: string }) {
  const [a, setA] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await apiPost<{ analysis: Analysis }>(`/findings/${findingId}/analyze`, {});
      setA(r.analysis);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const color = a?.verdict === 'likely-real' ? 'var(--accent)'
    : a?.verdict === 'likely-noise' ? 'var(--faint)' : 'var(--muted)';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{ fontSize: 15 }}>Flint Analysis</h3>
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={run}>
          {busy ? 'Analyzing…' : a ? 'Re-analyze' : 'Analyze with Flint'}
        </button>
      </div>
      {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{err}</div>}
      {!a && !busy && !err && (
        <div className="page-sub" style={{ marginTop: 8 }}>
          Judges real-vs-noise, exploitability, and next steps, and drafts a report. You confirm before acting.
        </div>
      )}
      {a && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <div>
            <span className="pill" style={{ background: 'transparent', border: '1px solid var(--border)', color }}>{a.verdict}</span>{' '}
            <span className="page-sub">confidence {Math.round(a.confidence * 100)}% · {a.model}</span>
          </div>
          <div><div className="scope-label">Reasoning</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>{a.reasoning}</div></div>
          {a.exploitability && <div><div className="scope-label">Exploitability</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>{a.exploitability}</div></div>}
          {a.nextSteps?.length > 0 && (
            <div>
              <div className="scope-label">Next steps</div>
              <ul style={{ margin: '4px 0 0 18px', color: 'var(--muted)', fontSize: 13 }}>
                {a.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {a.reportDraft && (
            <div>
              <div className="scope-label">Report draft</div>
              <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--muted)', fontSize: 12, margin: 0, fontFamily: 'var(--mono)' }}>{a.reportDraft}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
