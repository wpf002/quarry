import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HeuristicPolicyParser, HeuristicTriager } from './heuristic.js';

const parser = new HeuristicPolicyParser();

test('extracts in-scope hosts and CIDRs', () => {
  const r = parser.parsePolicy(
    'In scope: api.acme.com, 203.0.113.0/24. Out of scope: blog.acme.com.',
  );
  assert.ok(r.scope.inScope.includes('api.acme.com'));
  assert.ok(r.scope.inScope.includes('203.0.113.0/24'));
  assert.ok(r.scope.outOfScope.includes('blog.acme.com'));
  assert.ok(!r.scope.inScope.includes('blog.acme.com'));
});

test('flags wildcards as ambiguous, never authoritative', () => {
  const r = parser.parsePolicy('In scope: *.acme.com');
  assert.ok(r.ambiguityFlags.some((f) => f.includes('wildcard')));
});

test('flags open-ended scope language', () => {
  const r = parser.parsePolicy('In scope: acme.com and all related properties etc');
  assert.ok(r.ambiguityFlags.some((f) => f.includes('open-ended')));
});

test('empty policy yields low confidence and an ambiguity flag', () => {
  const r = parser.parsePolicy('');
  assert.ok(r.confidence < 0.5);
  assert.ok(r.ambiguityFlags.length > 0);
});

test('extracts rewards and prohibited methods', () => {
  const r = parser.parsePolicy(
    'Rewards: Critical $5000, High $2000. Prohibited: DoS, social engineering.',
  );
  assert.equal(r.scope.rewardsBySeverity.CRITICAL, '$5000');
  assert.ok(r.scope.prohibited.includes('DoS'));
  assert.ok(r.scope.prohibited.includes('social engineering'));
});

test('confidence rises with more structured signal', () => {
  const thin = parser.parsePolicy('acme.com');
  const rich = parser.parsePolicy(
    'In scope: api.acme.com. Out of scope: x.acme.com. Rewards: High $2000. Prohibited: DoS.',
  );
  assert.ok(rich.confidence > thin.confidence);
});

test('triager maps class to severity', () => {
  const t = new HeuristicTriager();
  assert.equal(t.triage({ title: 'x', vulnClass: 'rce', evidenceSummary: '' }).suggestedSeverity, 'CRITICAL');
  assert.equal(t.triage({ title: 'x', vulnClass: 'open-redirect', evidenceSummary: '' }).suggestedSeverity, 'LOW');
});
