import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectTopPrograms, proposeAllowlist } from './onboarding.js';
import { buildDigest } from './digest.js';
import { checkCost } from './cost.js';

test('selectTopPrograms: high-score, inactive, ranked, capped', () => {
  const top = selectTopPrograms(
    [
      { id: 'a', handle: 'a', score: 0.9, active: false },
      { id: 'b', handle: 'b', score: 0.95, active: true }, // active -> excluded
      { id: 'c', handle: 'c', score: 0.6, active: false }, // below min -> excluded
      { id: 'd', handle: 'd', score: 0.82, active: false },
    ],
    { minScore: 0.7, limit: 2 },
  );
  assert.deepEqual(top.map((p) => p.handle), ['a', 'd']);
});

test('proposeAllowlist: only provenance-verified, no wildcards or lookalikes', async () => {
  const proposals = await proposeAllowlist({
    assets: [
      { value: 'api.acme.com' },
      { value: '*.acme.com' },       // wildcard -> never proposed
      { value: 'evil-acme.com' },    // lookalike -> excluded
      { value: 'www.acme.com' },
    ],
    apexes: ['acme.com'],
  });
  const vals = proposals.map((p) => p.value).sort();
  assert.deepEqual(vals, ['api.acme.com', 'www.acme.com']);
  assert.ok(proposals.every((p) => p.method === 'SUBDOMAIN_OF_APEX'));
});

test('buildDigest: needsYou counts proposals + reports + paused', () => {
  const d = buildDigest({
    newTopPrograms: [{ handle: 'acme', score: 0.9 }],
    proposalsByProgram: [{ handle: 'acme', count: 3 }, { handle: 'globex', count: 0 }],
    queuedReports: 2,
    autoSubmittedToday: 1,
    pausedAuths: [{ handle: 'initech', reason: 'valid-rate 40%' }],
    revenueUsd: 1500,
  });
  assert.equal(d.needsYou, 1 + 2 + 1); // 1 program with proposals + 2 reports + 1 paused
  assert.match(d.headline, /Waiting on you/);
});

test('buildDigest: all clear when nothing is pending', () => {
  const d = buildDigest({ newTopPrograms: [], proposalsByProgram: [], queuedReports: 0, autoSubmittedToday: 0, pausedAuths: [], revenueUsd: 0 });
  assert.equal(d.needsYou, 0);
  assert.match(d.headline, /All clear/);
});

test('cost governor flags over-ceiling cost per finding', () => {
  assert.equal(checkCost(10, 5, 1).overBudget, true);  // $2/finding > $1
  assert.equal(checkCost(3, 5, 1).overBudget, false);  // $0.6/finding < $1
  assert.equal(checkCost(0, 0, 1).costPerFinding, 0);
});
