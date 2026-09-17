import type { QualityVerdict } from './types.js';

// The quality gate before anything reaches the report queue. Signal-to-noise on
// the one platform account is the real asset, so this fails closed.
export const QUALITY_THRESHOLDS = {
  minConfidence: 0.8,
  maxDupRisk: 0.4,
} as const;

export function qualityGate(
  input: { confidence: number; dupRisk: number; humanConfirmed: boolean },
  thresholds = QUALITY_THRESHOLDS,
): QualityVerdict {
  const reasons: string[] = [];
  if (input.confidence <= thresholds.minConfidence) {
    reasons.push(
      `confidence ${input.confidence.toFixed(2)} <= ${thresholds.minConfidence}`,
    );
  }
  if (input.dupRisk >= thresholds.maxDupRisk) {
    reasons.push(`dupRisk ${input.dupRisk.toFixed(2)} >= ${thresholds.maxDupRisk}`);
  }
  if (!input.humanConfirmed) {
    reasons.push('not human-confirmed');
  }
  return { pass: reasons.length === 0, reasons };
}
