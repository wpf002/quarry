// The AI seam. Policy parsing, triage, and report drafting are defined as
// interfaces here so a real model backend (Flint) can be dropped in later
// WITHOUT changing any caller. The shipped default is a deterministic,
// no-network heuristic implementation.

export interface ParsedScope {
  inScope: string[];
  outOfScope: string[];
  prohibited: string[];
  rewardsBySeverity: Record<string, string>;
  preferredVulnTypes: string[];
  unusualRules: string[];
}

export interface ParseResult {
  scope: ParsedScope;
  /** 0..1 — how confident the parser is in the extraction. */
  confidence: number;
  /** Anything a human must clear before the program can be scanned. */
  ambiguityFlags: string[];
}

export interface PolicyParser {
  /**
   * Parse raw policy text into structured scope. The parser NEVER marks an
   * asset authoritatively in-scope; parsedScope is advisory only. A human
   * builds the Allowlist (Phase 4).
   */
  parsePolicy(policyRaw: string): ParseResult;
}

export interface TriageInput {
  title: string;
  vulnClass: string;
  evidenceSummary: string;
}

export interface TriageResult {
  truePositiveConfidence: number; // 0..1
  suggestedSeverity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confirmingEvidence: string[];
  duplicateClassGuess: string;
}

export interface Triager {
  triage(input: TriageInput): TriageResult;
}

export interface ReportDraftInput {
  title: string;
  vulnClass: string;
  severity: string;
  assets: string[];
  evidenceSummary: string;
}

export interface ReportDrafter {
  draft(input: ReportDraftInput): string; // markdown
}
