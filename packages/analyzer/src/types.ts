export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AnalyzableFinding {
  id: string;
  title: string;
  vulnClass: string;
  severity: Severity;
  evidence: Record<string, unknown>;
  assets?: string[];
}

export interface DupRiskInput {
  vulnClass: string;
  programAgeDays: number;
  assetVisibility: 'low' | 'medium' | 'high';
  similarFindingsInProgram: number;
}

export interface AnalysisResult {
  findingId: string;
  confidence: number; // 0..1 true-positive
  severity: Severity;
  dupRisk: number; // 0..1
  impact: string;
  confirmingEvidence: string[];
}

export interface QualityVerdict {
  pass: boolean;
  reasons: string[];
}
