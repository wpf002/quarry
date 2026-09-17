'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../lib/api';

type Initial = {
  hasAutoLogin: boolean;
  authLoginUrl: string | null;
  authUsername: string | null;
  authUserField: string | null;
  authPassField: string | null;
  authCsrfField: string | null;
  authTokenPath: string | null;
  authJson: boolean;
  hasAuthPassword: boolean;
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

const lbl = { fontSize: 12.5, color: 'var(--muted)', display: 'block' } as const;

export function ScanContextForm({ programId, initial }: { programId: string; initial: Initial }) {
  const router = useRouter();
  // auto-login
  const [loginUrl, setLoginUrl] = useState(initial.authLoginUrl ?? '');
  const [username, setUsername] = useState(initial.authUsername ?? '');
  const [password, setPassword] = useState('');
  const [userField, setUserField] = useState(initial.authUserField ?? '');
  const [passField, setPassField] = useState(initial.authPassField ?? '');
  const [csrfField, setCsrfField] = useState(initial.authCsrfField ?? '');
  const [tokenPath, setTokenPath] = useState(initial.authTokenPath ?? '');
  const [json, setJson] = useState(initial.authJson);
  // fallbacks
  const [authHeaders, setAuthHeaders] = useState('');
  const [headers, setHeaders] = useState('');
  const [victimId, setVictimId] = useState(initial.idorVictimId ?? '');
  const [idParam, setIdParam] = useState(initial.idorIdParam ?? '');
  const [canary, setCanary] = useState(initial.ssrfCanaryHost ?? '');
  const [wait, setWait] = useState(initial.ssrfWait ? String(initial.ssrfWait) : '');

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const post = async (key: string, payload: Record<string, unknown>, okMsg: string) => {
    setBusy(key); setErr(null); setMsg(null);
    try {
      await apiPost(`/programs/${programId}/scan-context`, { by: 'will', ...payload });
      setPassword(''); setHeaders(''); setAuthHeaders('');
      setMsg(okMsg);
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  const save = () => {
    const parsedIdor = parseHeaders(headers);
    const parsedAuth = parseHeaders(authHeaders);
    const payload: Record<string, unknown> = {
      authLoginUrl: loginUrl || null,
      authUsername: username || null,
      authUserField: userField || null,
      authPassField: passField || null,
      authCsrfField: csrfField || null,
      authTokenPath: tokenPath || null,
      authJson: json,
      idorVictimId: victimId || null,
      idorIdParam: idParam || null,
      ssrfCanaryHost: canary || null,
      ssrfWait: wait ? Number(wait) : null,
    };
    if (password) payload.authPassword = password; // blank keeps existing
    if (Object.keys(parsedIdor).length > 0) payload.idorVictimHeaders = parsedIdor;
    if (Object.keys(parsedAuth).length > 0) payload.scanAuthHeaders = parsedAuth;
    post('save', payload, 'Saved.');
  };

  const testLogin = async () => {
    setBusy('test'); setErr(null); setMsg(null);
    try {
      // persist first so the server tests the latest config
      const payload: Record<string, unknown> = {
        by: 'will', authLoginUrl: loginUrl || null, authUsername: username || null,
        authUserField: userField || null, authPassField: passField || null,
        authCsrfField: csrfField || null, authTokenPath: tokenPath || null, authJson: json,
      };
      if (password) payload.authPassword = password;
      await apiPost(`/programs/${programId}/scan-context`, payload);
      const r = await apiPost<{ captured: string[] }>(`/programs/${programId}/test-login`, { by: 'will' });
      setPassword('');
      setMsg(`Logged in — captured ${r.captured.join(', ')}. Scans will use this automatically.`);
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  const canTest = !!loginUrl && !!username && (initial.hasAuthPassword || !!password);

  return (
    <details className="card">
      <summary className="scope-summary">
        Authenticated scanning
        {initial.hasAutoLogin && <span className="pill pill-accent" style={{ marginLeft: 8 }}>auto-login on</span>}
      </summary>

      <div className="page-sub" style={{ margin: '10px 0 12px' }}>
        Set credentials once — Quarry logs in, keeps the session fresh, and scans authenticated surface
        (where most paid bugs are). No header copying. Stored locally, sent only to your Infiltr.
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ ...lbl, gridColumn: '1 / -1' }}>Login URL
          <input className="input" value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)}
            placeholder="https://target.com/login" style={{ marginTop: 4 }} />
        </label>
        <label style={lbl}>Username / email
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={lbl}>Password {initial.hasAuthPassword && <span className="pill pill-accent" style={{ marginLeft: 4 }}>saved</span>}
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={initial.hasAuthPassword ? '•••••• (leave blank to keep)' : ''} style={{ marginTop: 4 }} />
        </label>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary className="page-sub" style={{ cursor: 'pointer' }}>Advanced (only if the defaults don&apos;t log in)</summary>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <label style={lbl}>Username field
            <input className="input" value={userField} onChange={(e) => setUserField(e.target.value)} placeholder="username" style={{ marginTop: 4 }} />
          </label>
          <label style={lbl}>Password field
            <input className="input" value={passField} onChange={(e) => setPassField(e.target.value)} placeholder="password" style={{ marginTop: 4 }} />
          </label>
          <label style={lbl}>CSRF field (hidden input)
            <input className="input" value={csrfField} onChange={(e) => setCsrfField(e.target.value)} placeholder="user_token" style={{ marginTop: 4 }} />
          </label>
          <label style={lbl}>Token JSON path (API login)
            <input className="input" value={tokenPath} onChange={(e) => setTokenPath(e.target.value)} placeholder="data.token" style={{ marginTop: 4 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, gridColumn: '1 / -1' }}>
            <input type="checkbox" checked={json} onChange={(e) => setJson(e.target.checked)} />
            Send credentials as JSON (for API logins)
          </label>
        </div>
      </details>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy != null} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        <button className="btn btn-sm" disabled={busy != null || !canTest} onClick={testLogin}
          title={canTest ? 'Log in now and confirm a session is captured' : 'Enter login URL, username and password first'}>
          {busy === 'test' ? 'Testing…' : 'Test Login'}
        </button>
        {msg && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
      </div>

      <details style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <summary className="page-sub" style={{ cursor: 'pointer' }}>
          Can&apos;t auto-login (MFA / OAuth / captcha)? Paste a session instead
        </summary>
        <div style={{ marginTop: 10 }}>
          <div className="scope-label">
            Scan session {initial.hasScanAuth && <span className="pill pill-accent" style={{ marginLeft: 6 }}>saved</span>}
          </div>
          <textarea className="input" rows={3}
            placeholder={initial.hasScanAuth ? 'A session is saved. Paste to replace, or leave blank to keep.' : 'Cookie: session=...\nAuthorization: Bearer ...'}
            value={authHeaders} onChange={(e) => setAuthHeaders(e.target.value)}
            style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 12, width: '100%' }} />
        </div>
      </details>

      <details style={{ marginTop: 12 }}>
        <summary className="page-sub" style={{ cursor: 'pointer' }}>IDOR / SSRF context (optional)</summary>
        <div style={{ marginTop: 10 }}>
          <div className="scope-label">IDOR — victim identity {initial.hasIdorHeaders && <span className="pill pill-accent" style={{ marginLeft: 6 }}>saved</span>}</div>
          <textarea className="input" rows={2}
            placeholder={initial.hasIdorHeaders ? 'A victim session is saved. Paste to replace, or leave blank to keep.' : 'Cookie: session=<victim session>'}
            value={headers} onChange={(e) => setHeaders(e.target.value)}
            style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 12, width: '100%' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input className="input" placeholder="Victim object id (e.g. 1042)" value={victimId} onChange={(e) => setVictimId(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
            <input className="input" placeholder="Id param (e.g. id)" value={idParam} onChange={(e) => setIdParam(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          </div>
          <div className="scope-label" style={{ marginTop: 14 }}>SSRF — out-of-band canary</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <input className="input" placeholder="Canary host the target can reach Infiltr at" value={canary} onChange={(e) => setCanary(e.target.value)} style={{ flex: 2, minWidth: 220 }} />
            <input className="input" placeholder="Wait (s)" value={wait} onChange={(e) => setWait(e.target.value)} style={{ width: 100 }} />
          </div>
        </div>
      </details>
    </details>
  );
}
