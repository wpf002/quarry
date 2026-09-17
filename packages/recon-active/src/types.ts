// Active recon types. This package is the ONLY one that originates traffic at a
// target, and it does not scan itself — it delegates to Infiltr behind the gate.

export type Tier = 1 | 2 | 3;

export interface ScanProfile {
  tiers: Tier[]; // which tiers this approval permits
  tools?: string[];
}

export interface ScanTargetInput {
  programId: string;
  target: string;
  tier: Tier;
  profile: ScanProfile;
  /** Required for Tier 3: each high-impact action needs its own confirmation. */
  perActionConfirmed?: boolean;
}

export interface InfiltrFinding {
  title: string;
  vulnClass: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence: Record<string, unknown>;
}

export interface InfiltrResult {
  target: string;
  assets: string[]; // hosts/urls observed
  findings: InfiltrFinding[];
}

export interface InfiltrClient {
  scan(target: string, profile: ScanProfile): Promise<InfiltrResult>;
}
