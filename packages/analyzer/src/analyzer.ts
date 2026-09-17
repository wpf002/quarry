import { prisma } from '@quarry/db';
import { audit } from '@quarry/core';
import { HeuristicTriager, type Triager } from '@quarry/ai';
import type { AnalyzableFinding, AnalysisResult, DupRiskInput } from './types.js';
import { dupRisk } from './dedup.js';
import { impactFor, bumpSeverityForImpact } from './impact.js';
import { qualityGate } from './quality.js';

// AUTONOMOUS. Triage one finding: true-positive confidence, severity, impact,
// and duplicate risk. Pure aside from the injected triager.
export function analyzeFinding(
  finding: AnalyzableFinding,
  dupInput: Omit<DupRiskInput, 'vulnClass'>,
  triager: Triager = new HeuristicTriager(),
): AnalysisResult {
  const t = triager.triage({
    title: finding.title,
    vulnClass: finding.vulnClass,
    evidenceSummary: JSON.stringify(finding.evidence ?? {}),
  });
  const severity = bumpSeverityForImpact(t.suggestedSeverity, finding.vulnClass);
  return {
    findingId: finding.id,
    confidence: t.truePositiveConfidence,
    severity,
    dupRisk: dupRisk({ vulnClass: finding.vulnClass, ...dupInput }),
    impact: impactFor(finding.vulnClass, finding.assets ?? []),
    confirmingEvidence: t.confirmingEvidence,
  };
}

// Persist analysis onto the Finding row. Does NOT set humanConfirmed and does
// NOT queue a report — the quality gate needs a human confirmation first.
export async function persistAnalysis(result: AnalysisResult): Promise<void> {
  await prisma.finding.update({
    where: { id: result.findingId },
    data: {
      confidence: result.confidence,
      dupRisk: result.dupRisk,
      severity: result.severity,
    },
  });
  await audit({
    actor: 'analyzer:v1',
    action: 'finding.analyzed',
    detail: {
      findingId: result.findingId,
      confidence: result.confidence,
      dupRisk: result.dupRisk,
      severity: result.severity,
    },
  });
}

// Which stored findings are report-ready. Applies the quality gate; anything
// that fails is logged, not queued.
export async function reportReadyFindings(): Promise<string[]> {
  const findings = await prisma.finding.findMany({
    where: { report: null },
    select: { id: true, confidence: true, dupRisk: true, humanConfirmed: true },
  });
  const ready: string[] = [];
  for (const f of findings) {
    const verdict = qualityGate({
      confidence: f.confidence,
      dupRisk: f.dupRisk,
      humanConfirmed: f.humanConfirmed,
    });
    if (verdict.pass) ready.push(f.id);
  }
  return ready;
}
