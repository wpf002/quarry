import { prisma } from '@quarry/db';

// Credentialed auto-login. Set login config once per program; Quarry performs the
// login, captures the resulting session, caches it, and re-auths on expiry — so
// the user never copies headers. Falls back to a manually-pasted session when no
// login config is set (MFA/OAuth/captcha cases). Read-only against the login
// endpoint; the captured session is stored locally and sent only to Infiltr.

export interface LoginConfig {
  loginUrl: string;
  username: string;
  password: string;
  userField?: string;
  passField?: string;
  csrfField?: string;
  tokenPath?: string;
  json?: boolean;
  extra?: Record<string, string>; // static form fields (submit buttons, hidden inputs)
}

const SESSION_TTL_MS = 30 * 60 * 1000; // re-auth every 30 min

export class LoginError extends Error {}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function capture(jar: Record<string, string>, res: Response): void {
  // Node 20+/undici exposes getSetCookie(); fall back to a single header.
  const list: string[] =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);
  for (const c of list) {
    const m = /^\s*([^=;]+)=([^;]*)/.exec(c);
    const k = m?.[1]?.trim();
    if (k) jar[k] = (m?.[2] ?? '').trim();
  }
}

export async function performLogin(cfg: LoginConfig): Promise<Record<string, string>> {
  if (!cfg.loginUrl || !cfg.username) throw new LoginError('login URL and username are required');
  const jar: Record<string, string> = {};

  let csrf: string | undefined;
  if (cfg.csrfField) {
    const g = await fetch(cfg.loginUrl, { redirect: 'manual' as RequestRedirect }).catch(() => null);
    if (g) {
      capture(jar, g);
      const body = await g.text().catch(() => '');
      const f = cfg.csrfField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(
        `name=["']${f}["'][^>]*value=["']([^"']+)["']|value=["']([^"']+)["'][^>]*name=["']${f}["']`,
        'i',
      );
      const m = re.exec(body);
      csrf = m?.[1] ?? m?.[2];
    }
  }

  const fields: Record<string, string> = {
    [cfg.userField || 'username']: cfg.username,
    [cfg.passField || 'password']: cfg.password,
    ...(cfg.extra ?? {}),
    ...(csrf && cfg.csrfField ? { [cfg.csrfField]: csrf } : {}),
  };
  const headers: Record<string, string> = { cookie: cookieHeader(jar) };
  let body: string;
  if (cfg.json) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(fields);
  } else {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(fields).toString();
  }

  const res = await fetch(cfg.loginUrl, {
    method: 'POST', headers, body, redirect: 'manual' as RequestRedirect,
  }).catch((e) => { throw new LoginError(`login request failed: ${(e as Error).message}`); });
  capture(jar, res);

  const out: Record<string, string> = {};
  if (Object.keys(jar).length > 0) out.Cookie = cookieHeader(jar);
  if (cfg.tokenPath) {
    try {
      const j = (await res.clone().json()) as Record<string, unknown>;
      const tok = cfg.tokenPath.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], j);
      if (typeof tok === 'string' && tok) out.Authorization = `Bearer ${tok}`;
    } catch { /* not JSON / no token */ }
  }
  if (Object.keys(out).length === 0) {
    throw new LoginError('login produced no session — check the credentials, field names, or token path');
  }
  return out;
}

// Return a fresh-or-cached session for a program's auto-login config, or undefined
// if no login config is set. `force` re-auths regardless of the cache.
export async function ensureSession(programId: string, force = false): Promise<Record<string, string> | undefined> {
  const c = await prisma.scanContext.findUnique({ where: { programId } });
  if (!c?.authLoginUrl || !c.authUsername) return undefined; // no auto-login configured
  const cached = (c.scanAuthHeaders ?? null) as Record<string, string> | null;
  const hasCached = !!cached && Object.keys(cached).length > 0;
  const fresh = c.authCachedAt && Date.now() - new Date(c.authCachedAt).getTime() < SESSION_TTL_MS;
  if (!force && hasCached && fresh) return cached!;

  let headers: Record<string, string>;
  try {
    headers = await performLogin({
      loginUrl: c.authLoginUrl,
      username: c.authUsername,
      password: c.authPassword ?? '',
      userField: c.authUserField ?? undefined,
      passField: c.authPassField ?? undefined,
      csrfField: c.authCsrfField ?? undefined,
      tokenPath: c.authTokenPath ?? undefined,
      json: c.authJson,
      extra: (c.authExtraFields ?? undefined) as Record<string, string> | undefined,
    });
  } catch (e) {
    // Re-login failed (stale password, endpoint changed, target down). If we still
    // hold a cached session, use it — it may well be valid, and an expired token
    // just yields 401s at scan time rather than blocking the scan outright. Don't
    // bump authCachedAt, so the next scan retries the login. Only hard-fail when
    // there's no cached session to fall back to.
    if (hasCached) return cached!;
    throw e;
  }
  await prisma.scanContext.update({
    where: { programId },
    data: { scanAuthHeaders: headers, authCachedAt: new Date() },
  });
  return headers;
}
