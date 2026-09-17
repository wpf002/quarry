import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateApproval, approvalExpiry } from './approvals.js';

test('approval refused while ambiguity flags remain', () => {
  const d = evaluateApproval({ ambiguityFlags: ['x'], activeAllowlistCount: 2, liveApprovalTargets: 0, maxConcurrent: 5 });
  assert.equal(d.ok, false);
  assert.match(d.reason!, /ambiguity/);
});

test('approval refused with an empty allowlist', () => {
  const d = evaluateApproval({ ambiguityFlags: [], activeAllowlistCount: 0, liveApprovalTargets: 0, maxConcurrent: 5 });
  assert.equal(d.ok, false);
  assert.match(d.reason!, /allowlist is empty/);
});

test('approval refused at the concurrency cap', () => {
  const d = evaluateApproval({ ambiguityFlags: [], activeAllowlistCount: 1, liveApprovalTargets: 5, maxConcurrent: 5 });
  assert.equal(d.ok, false);
  assert.match(d.reason!, /concurrency cap/);
});

test('approval granted only when everything is clean', () => {
  const d = evaluateApproval({ ambiguityFlags: [], activeAllowlistCount: 1, liveApprovalTargets: 4, maxConcurrent: 5 });
  assert.equal(d.ok, true);
});

test('approvalExpiry adds the TTL in hours', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const exp = approvalExpiry(now, 24);
  assert.equal(exp.toISOString(), '2026-01-02T00:00:00.000Z');
});
