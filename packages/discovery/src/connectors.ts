import type { Platform } from '@quarry/db';
import type { RawProgram } from './types.js';

// Read-only platform connectors. Each hits the PLATFORM's own API (or a public
// program page for self-hosted). None ever sends a packet at a target. HTTP is
// injectable so contract tests use recorded fixtures instead of live calls.

export type HttpFn = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const defaultHttp: HttpFn = (url, init) =>
  fetch(url, init as RequestInit) as unknown as ReturnType<HttpFn>;

export interface PlatformConnector {
  readonly platform: Platform;
  /** Returns null when creds are absent (connector is simply skipped). */
  fetchPrograms(): Promise<RawProgram[] | null>;
}

// --- HackerOne -------------------------------------------------------------
// GET https://api.hackerone.com/v1/hackers/programs  (HTTP Basic: user:token)
export function mapHackerOne(data: unknown): RawProgram[] {
  const rows = asArray((data as any)?.data);
  return rows.map((r: any) => ({
    platform: 'HACKERONE' as Platform,
    handle: str(r?.attributes?.handle ?? r?.id),
    name: str(r?.attributes?.name ?? r?.attributes?.handle),
    policyRaw: str(r?.attributes?.policy ?? ''),
    maxBountyUsd: num(r?.attributes?.max_bounty),
    url: r?.attributes?.handle
      ? `https://hackerone.com/${r.attributes.handle}`
      : undefined,
  }));
}

export class HackerOneConnector implements PlatformConnector {
  readonly platform: Platform = 'HACKERONE';
  constructor(
    private user = process.env.HACKERONE_API_USERNAME ?? '',
    private token = process.env.HACKERONE_API_TOKEN ?? '',
    private http: HttpFn = defaultHttp,
    private base = 'https://api.hackerone.com/v1',
  ) {}
  async fetchPrograms(): Promise<RawProgram[] | null> {
    if (!this.user || !this.token) return null;
    const auth = Buffer.from(`${this.user}:${this.token}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
    const out: RawProgram[] = [];
    let url: string | null = `${this.base}/hackers/programs?page[size]=100`;
    for (let pages = 0; url && pages < 20; pages++) {
      const res = await this.http(url, { headers });
      if (!res.ok) throw new Error(`hackerone ${res.status}`);
      const json = (await res.json()) as any;
      out.push(...mapHackerOne(json));
      url = json?.links?.next ?? null;
    }
    return out;
  }
}

// --- Bugcrowd --------------------------------------------------------------
// GET https://api.bugcrowd.com/programs  (Authorization: Token <token>)
export function mapBugcrowd(data: unknown): RawProgram[] {
  const rows = asArray((data as any)?.programs ?? (data as any)?.data);
  return rows.map((r: any) => ({
    platform: 'BUGCROWD' as Platform,
    handle: str(r?.code ?? r?.handle ?? r?.id),
    name: str(r?.name),
    policyRaw: str(r?.brief ?? r?.description ?? ''),
    maxBountyUsd: num(r?.max_reward),
    url: r?.code ? `https://bugcrowd.com/${r.code}` : undefined,
  }));
}

export class BugcrowdConnector implements PlatformConnector {
  readonly platform: Platform = 'BUGCROWD';
  constructor(
    private token = process.env.BUGCROWD_API_TOKEN ?? '',
    private http: HttpFn = defaultHttp,
    private base = 'https://api.bugcrowd.com',
  ) {}
  async fetchPrograms(): Promise<RawProgram[] | null> {
    if (!this.token) return null;
    const res = await this.http(`${this.base}/programs`, {
      headers: { Authorization: `Token ${this.token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`bugcrowd ${res.status}`);
    return mapBugcrowd(await res.json());
  }
}

// --- Intigriti -------------------------------------------------------------
export function mapIntigriti(data: unknown): RawProgram[] {
  const rows = asArray((data as any)?.records ?? data);
  return rows.map((r: any) => ({
    platform: 'INTIGRITI' as Platform,
    handle: str(r?.handle ?? r?.id),
    name: str(r?.name ?? r?.companyName),
    policyRaw: str(r?.description ?? ''),
    maxBountyUsd: num(r?.maxBounty?.value ?? r?.maxBounty),
    url: r?.handle ? `https://app.intigriti.com/researcher/programs/${r.handle}` : undefined,
  }));
}

export class IntigritiConnector implements PlatformConnector {
  readonly platform: Platform = 'INTIGRITI';
  constructor(
    private token = process.env.INTIGRITI_API_TOKEN ?? '',
    private http: HttpFn = defaultHttp,
    private base = 'https://api.intigriti.com/external/researcher/v1',
  ) {}
  async fetchPrograms(): Promise<RawProgram[] | null> {
    if (!this.token) return null;
    const res = await this.http(`${this.base}/programs?limit=500`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`intigriti ${res.status}`);
    return mapIntigriti(await res.json());
  }
}

// --- YesWeHack -------------------------------------------------------------
export function mapYesWeHack(data: unknown): RawProgram[] {
  const rows = asArray((data as any)?.items ?? data);
  return rows.map((r: any) => ({
    platform: 'YESWEHACK' as Platform,
    handle: str(r?.slug ?? r?.id),
    name: str(r?.title ?? r?.name),
    policyRaw: str(r?.description ?? r?.scopes_description ?? ''),
    maxBountyUsd: num(r?.max_bounty),
    url: r?.slug ? `https://yeswehack.com/programs/${r.slug}` : undefined,
  }));
}

export class YesWeHackConnector implements PlatformConnector {
  readonly platform: Platform = 'YESWEHACK';
  constructor(
    private token = process.env.YESWEHACK_API_TOKEN ?? '',
    private http: HttpFn = defaultHttp,
    private base = 'https://api.yeswehack.com',
  ) {}
  async fetchPrograms(): Promise<RawProgram[] | null> {
    if (!this.token) return null;
    const res = await this.http(`${this.base}/programs`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`yeswehack ${res.status}`);
    return mapYesWeHack(await res.json());
  }
}

// --- helpers ---------------------------------------------------------------
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function defaultConnectors(): PlatformConnector[] {
  return [
    new HackerOneConnector(),
    new BugcrowdConnector(),
    new IntigritiConnector(),
    new YesWeHackConnector(),
  ];
}
