import type { ReconSource } from '@quarry/db';

// A discovered asset from a PUBLIC-DATA source. verdict is always OUT_OF_SCOPE
// until a human confirms it into the Allowlist. Nothing here is treated as
// authorized-to-scan.
export interface PassiveAsset {
  value: string;
  source: ReconSource; // never ACTIVE_SCAN
  meta?: Record<string, unknown>;
}

export type HttpFn = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }>;

// A passive source enumerates public data about a domain. It must NOT scan the
// target: CT logs and passive DNS query third-party datasets; security.txt is a
// single published document fetch.
export interface PassiveSource {
  readonly source: ReconSource;
  enumerate(domain: string): Promise<PassiveAsset[]>;
}
