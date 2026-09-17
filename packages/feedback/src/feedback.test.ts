import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOutcomeStats, stateToOutcome } from './outcomes.js';
import { scoreMultiplier, dupRiskAdjustment } from './scoring-feedback.js';
import { computeMetrics } from './metrics.js';
import { strategicReviewTrigger } from './strategic.js';

test('stateToOutcome maps platform states', () => {
  assert.equal(stateToOutcome('RESOLVED'), 'PAID');
  assert.equal(stateToOutcome('DUPLICATE'), 'DUPLICATE');
  assert.equal(stateToOutcome('HELD_FOR_REVIEW'), 'PENDING');
});

test('outcome stats compute valid and dup rates over decided only', () => {
  const s = computeOutcomeStats(['RESOLVED', 'RESOLVED', 'DUPLICATE', 'OUT_OF_SCOPE', 'HELD_FOR_REVIEW']);
  assert.equal(s.decided, 4);
  assert.equal(s.validRate, 0.5); // 2 paid / 4 decided
  assert.equal(s.dupRate, 0.25);
  assert.equal(s.pending, 1);
});

test('scoreMultiplier rewards payouts, penalizes dups/oos', () => {
  const good = scoreMultiplier(computeOutcomeStats(['RESOLVED', 'RESOLVED', 'RESOLVED']));
  const bad = scoreMultiplier(computeOutcomeStats(['DUPLICATE', 'OUT_OF_SCOPE', 'DUPLICATE']));
  assert.ok(good > 1);
  assert.ok(bad < 1);
  assert.equal(scoreMultiplier(computeOutcomeStats(['HELD_FOR_REVIEW'])), 1); // undecided -> neutral
});

test('dupRiskAdjustment scales with historical dup rate', () => {
  const high = dupRiskAdjustment(computeOutcomeStats(['DUPLICATE', 'DUPLICATE', 'RESOLVED', 'RESOLVED']));
  assert.ok(high > 0 && high <= 0.2);
});

test('metrics: revenue grouped by vuln class, findings per program', () => {
  const m = computeMetrics(
    [
      { programId: 'p1', vulnClass: 'idor', severity: 'HIGH' },
      { programId: 'p1', vulnClass: 'xss', severity: 'MEDIUM' },
      { programId: 'p2', vulnClass: 'idor', severity: 'HIGH' },
    ],
    [
      { state: 'RESOLVED', payoutUsd: 1000, vulnClass: 'idor' },
      { state: 'RESOLVED', payoutUsd: 500, vulnClass: 'idor' },
      { state: 'DUPLICATE', vulnClass: 'xss' },
    ],
  );
  assert.equal(m.totalFindings, 3);
  assert.equal(m.findingsPerProgram['p1'], 2);
  assert.equal(m.revenueByClass['idor'], 1500);
  assert.equal(m.totalRevenueUsd, 1500);
  assert.equal(m.outcomes.dupRate, 0.3333);
});

test('strategic trigger flags a low/info-heavy window', () => {
  const now = new Date('2026-02-01T00:00:00Z');
  const recent = (sev: any, daysAgo: number) => ({ severity: sev, createdAt: new Date(now.getTime() - daysAgo * 86400000) });
  const flagged = strategicReviewTrigger(
    [recent('LOW', 1), recent('INFO', 2), recent('LOW', 3), recent('INFO', 4), recent('HIGH', 5), recent('LOW', 6)],
    now,
  );
  assert.equal(flagged.flagged, true);
  assert.ok(flagged.lowInfoRatio > 0.6);
  // old findings outside the window are ignored
  const notFlagged = strategicReviewTrigger([recent('LOW', 60), recent('INFO', 90)], now);
  assert.equal(notFlagged.flagged, false);
});
