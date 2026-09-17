import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleForAutoSubmit, reputationOk } from './autosubmit.js';

const policy = {
  enabled: true,
  minConfidence: 0.85,
  maxDupRisk: 0.3,
  allowedVulnClasses: [] as string[],
  requireChain: false,
};
const good = { confidence: 0.9, dupRisk: 0.1, vulnClass: 'exposed-config', severity: 'MEDIUM' as const, chainLen: 0 };

test('eligible when the bar is cleared and class is safe', () => {
  assert.equal(eligibleForAutoSubmit(good, policy).ok, true);
});

test('disabled policy blocks everything', () => {
  assert.equal(eligibleForAutoSubmit(good, { ...policy, enabled: false }).ok, false);
});

test('high-impact classes and CRITICAL never auto-submit', () => {
  assert.equal(eligibleForAutoSubmit({ ...good, vulnClass: 'rce' }, policy).ok, false);
  assert.equal(eligibleForAutoSubmit({ ...good, vulnClass: 'idor' }, policy).ok, false);
  assert.equal(eligibleForAutoSubmit({ ...good, vulnClass: 'ssrf' }, policy).ok, false);
  assert.equal(eligibleForAutoSubmit({ ...good, severity: 'CRITICAL' }, policy).ok, false);
});

test('bar: confidence must exceed, dup must be under', () => {
  assert.equal(eligibleForAutoSubmit({ ...good, confidence: 0.8 }, policy).ok, false);
  assert.equal(eligibleForAutoSubmit({ ...good, confidence: 0.85 }, policy).ok, false); // strict >
  assert.equal(eligibleForAutoSubmit({ ...good, dupRisk: 0.3 }, policy).ok, false);
  assert.equal(eligibleForAutoSubmit({ ...good, dupRisk: 0.5 }, policy).ok, false);
});

test('class allowlist and chain requirement enforced', () => {
  assert.equal(eligibleForAutoSubmit(good, { ...policy, allowedVulnClasses: ['git-exposure'] }).ok, false);
  assert.equal(eligibleForAutoSubmit({ ...good, vulnClass: 'git-exposure' }, { ...policy, allowedVulnClasses: ['git-exposure'] }).ok, true);
  assert.equal(eligibleForAutoSubmit(good, { ...policy, requireChain: true }).ok, false);
  assert.equal(eligibleForAutoSubmit({ ...good, chainLen: 2 }, { ...policy, requireChain: true }).ok, true);
});

test('reputation: below floor over a big-enough sample pauses; small sample allows', () => {
  const mostlyDup = Array(12).fill('DUPLICATE') as any[];
  assert.equal(reputationOk(mostlyDup).ok, false);
  const mostlyPaid = [...Array(9).fill('RESOLVED'), 'DUPLICATE'] as any[];
  assert.equal(reputationOk(mostlyPaid).ok, true);
  // too few decided -> allow (no evidence to pause)
  assert.equal(reputationOk(['DUPLICATE', 'DUPLICATE'] as any[]).ok, true);
});
