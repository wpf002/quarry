// Active recon types. This package is the ONLY one that originates traffic at a
// target, and it does not scan itself — it delegates to Infiltr behind the gate.

export type Tier = 1 | 2 | 3;

export interface ScanProfile {
  tiers: Tier[]; // which tiers this approval permits
  tools?: string[];
}

// Optional per-scan context for checks that need more than a URL. Passed
// straight through to Infiltr. Only idor/ssrf keys are honored there.
export interface InfiltrContext {
  idor?: { victim_headers?: Record<string, string>; victim_id?: string; id_param?: string };
  ssrf?: { canary_host?: string; wait?: number };
  /** Scan-wide session applied to every module (authenticated testing). */
  auth?: { headers?: Record<string, string> };
}

export interface ScanTargetInput {
  programId: string;
  target: string;
  tier: Tier;
  profile: ScanProfile;
  /** Required for Tier 3: each high-impact action needs its own confirmation. */
  perActionConfirmed?: boolean;
  /** Optional IDOR/SSRF context forwarded to Infiltr. */
  context?: InfiltrContext;
}

export interface InfiltrFinding {
  title: string;
  vulnClass: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence: Record<string, unknown>;
  /** 0..1 from Infiltr. Verified exposure/CVE/IDOR/SSRF ~0.9, regex ~0.7, info ~0.3. */
  confidence?: number;
  /** Stable dedup key `vulnClass:host:location` — Infiltr collapses duplicates. */
  key?: string;
}

export interface InfiltrResult {
  target: string;
  assets: string[]; // hosts/urls observed
  findings: InfiltrFinding[];
}

export interface InfiltrClient {
  scan(target: string, profile: ScanProfile, context?: InfiltrContext): Promise<InfiltrResult>;
}
