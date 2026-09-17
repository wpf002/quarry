import type { InfiltrClient, InfiltrResult, ScanProfile } from './types.js';

type HttpFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const defaultHttp: HttpFn = (url, init) =>
  fetch(url, init as RequestInit) as unknown as ReturnType<HttpFn>;

// Errors Quarry must tell apart. `transient` (429 rate-limit / timeout) means
// "try again later" — it must NOT trip the breaker. `scopeRejected` (403) is a
// real scope problem and should. Everything else is a hard failure.
export class InfiltrError extends Error {
  constructor(
    readonly status: number,
    readonly transient: boolean,
    readonly scopeRejected: boolean,
  ) {
    super(`infiltr ${status}`);
  }
}

export class HttpInfiltrClient implements InfiltrClient {
  constructor(
    private baseUrl = process.env.INFILTR_BASE_URL ?? '',
    private apiKey = process.env.INFILTR_API_KEY ?? '',
    private http: HttpFn = defaultHttp,
    private timeoutMs = Number(process.env.INFILTR_TIMEOUT_MS ?? 130_000),
  ) {}

  async scan(target: string, profile: ScanProfile): Promise<InfiltrResult> {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('Infiltr is not configured (INFILTR_BASE_URL / INFILTR_API_KEY)');
    }
    // Infiltr's sync scan blocks up to 120s; give it a little headroom, then
    // treat an abort as transient rather than scope drift.
    const signal = AbortSignal.timeout(this.timeoutMs);
    let res;
    try {
      res = await this.http(`${this.baseUrl}/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ target, profile }),
        signal,
      });
    } catch (e) {
      if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') {
        throw new InfiltrError(0, true, false); // timeout -> transient
      }
      throw e;
    }
    if (!res.ok) {
      throw new InfiltrError(res.status, res.status === 429, res.status === 403);
    }
    const json = (await res.json()) as Partial<InfiltrResult>;
    return {
      target,
      assets: Array.isArray(json.assets) ? json.assets : [],
      findings: Array.isArray(json.findings) ? json.findings : [],
    };
  }
}
