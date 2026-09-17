import type { InfiltrClient, InfiltrResult, ScanProfile } from './types.js';

type HttpFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const defaultHttp: HttpFn = (url, init) =>
  fetch(url, init as RequestInit) as unknown as ReturnType<HttpFn>;

// Delegates approved scans to Infiltr's API. Quarry NEVER execs subfinder /
// httpx / nuclei itself — Infiltr is the out-of-process executor.
export class HttpInfiltrClient implements InfiltrClient {
  constructor(
    private baseUrl = process.env.INFILTR_BASE_URL ?? '',
    private apiKey = process.env.INFILTR_API_KEY ?? '',
    private http: HttpFn = defaultHttp,
  ) {}

  async scan(target: string, profile: ScanProfile): Promise<InfiltrResult> {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('Infiltr is not configured (INFILTR_BASE_URL / INFILTR_API_KEY)');
    }
    const res = await this.http(`${this.baseUrl}/scan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ target, profile }),
    });
    if (!res.ok) throw new Error(`infiltr ${res.status}`);
    const json = (await res.json()) as Partial<InfiltrResult>;
    return {
      target,
      assets: Array.isArray(json.assets) ? json.assets : [],
      findings: Array.isArray(json.findings) ? json.findings : [],
    };
  }
}
