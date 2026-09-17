'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../lib/api';

type Initial = {
  hasScanAuth: boolean;
  hasIdorHeaders: boolean;
  idorVictimId: string | null;
  idorIdParam: string | null;
  ssrfCanaryHost: string | null;
  ssrfWait: number | null;
};

function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) {
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k && v) out[k] = v;
    }
  }
  return out;
}

export function ScanContextForm({ programId, initial }: { programId: string; initial: Initial }) {
  const router = useRouter();
  const [authHeaders, setAuthHeaders] = useState('');
  const [headers, setHeaders] = useState('');
  const [victimId, setVictimId] = useState(initial.idorVictimId ?? '');
  const [idParam, setIdParam] = useState(initial.idorIdParam ?? '');
  const [canary, setCanary] = useState(initial.ssrfCanaryHost ?? '');
  const [wait, setWait] = useState(initial.ssrfWait ? String(initial.ssrfWait) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (payload: Record<string, unknown>, okMsg: string, clear = false) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await apiPost(`/programs/${programId}/scan-context`, { by: 'will', ...payload });
      setHeaders(''); setAuthHeaders('');
      if (clear) { setVictimId(''); setIdParam(''); }
      setMsg(okMsg);
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const save = () => {
    const parsedIdor = parseHeaders(headers);
    const parsedAuth = parseHeaders(authHeaders);
    const payload: Record<string, unknown> = {
      idorVictimId: victimId || null,
      idorIdParam: idParam || null,
      ssrfCanaryHost: canary || null,
      ssrfWait: wait ? Number(wait) : null,
    };
    // Only send headers when the user typed some; blank keeps the saved ones.
    if (Object.keys(parsedIdor).length > 0) payload.idorVictimHeaders = parsedIdor;
    if (Object.keys(parsedAuth).length > 0) payload.scanAuthHeaders = parsedAuth;
    run(payload, 'Saved.');
  };

  const clearIdor = () =>
    run(
      { idorVictimHeaders: null, idorVictimId: null, idorIdParam: null, ssrfCanaryHost: canary || null, ssrfWait: wait ? Number(wait) : null },
      'IDOR identity cleared.',
      true,
    );

  const clearAuth = () => run({ scanAuthHeaders: null }, 'Scan session cleared.');

  return (
    <details className="card">
      <summary className="scope-summary">IDOR / SSRF context (optional)</summary>
      <div className="page-sub" style={{ margin: '10px 0 14px' }}>
        Extra inputs some paid checks need. All stored locally, sent only to your Infiltr.
      </div>

      <div className="scope-label">
        Scan session — authenticated testing
        {initial.hasScanAuth && <span className="pill pill-accent" style={{ marginLeft: 6 }}>saved</span>}
      </div>
      <div className="page-sub" style={{ margin: '2px 0 4px' }}>
        A logged-in session applied to every check, so Quarry scans authenticated surface (where most paid bugs are).
      </div>
      <textarea
        className="input"
        rows={3}
        placeholder={initial.hasScanAuth
          ? 'A session is saved. Paste new headers to replace it, or leave blank to keep.'
          : 'One header per line, e.g.\nCookie: session=<your logged-in session>\nAuthorization: Bearer <token>'}
        value={authHeaders}
        onChange={(e) => setAuthHeaders(e.target.value)}
        style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 12, width: '100%' }}
      />

      <div className="scope-label" style={{ marginTop: 16 }}>
        IDOR — victim identity
        {initial.hasIdorHeaders && <span className="pill pill-accent" style={{ marginLeft: 6 }}>saved</span>}
      </div>
      <textarea
        className="input"
        rows={3}
        placeholder={initial.hasIdorHeaders
          ? 'A victim session is saved. Paste new headers to replace it, or leave blank to keep.'
          : 'One header per line, e.g.\nCookie: session=<victim session>\nAuthorization: Bearer <token>'}
        value={headers}
        onChange={(e) => setHeaders(e.target.value)}
        style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 12, width: '100%' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <input className="input" placeholder="Victim object id (e.g. 1042)" value={victimId} onChange={(e) => setVictimId(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <input className="input" placeholder="Id param (e.g. id)" value={idParam} onChange={(e) => setIdParam(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
      </div>

      <div className="scope-label" style={{ marginTop: 16 }}>SSRF — out-of-band canary</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <input className="input" placeholder="Canary host the target can reach Infiltr at" value={canary} onChange={(e) => setCanary(e.target.value)} style={{ flex: 2, minWidth: 220 }} />
        <input className="input" placeholder="Wait (s)" value={wait} onChange={(e) => setWait(e.target.value)} style={{ width: 100 }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Context'}</button>
        {initial.hasScanAuth && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={clearAuth}>Clear session</button>}
        {initial.hasIdorHeaders && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={clearIdor}>Clear IDOR identity</button>}
        {msg && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
      </div>
    </details>
  );
}
