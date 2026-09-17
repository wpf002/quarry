import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreProgram } from './scorer.js';
import { mapHackerOne, mapBugcrowd, type PlatformConnector } from './connectors.js';
import { discoverPrograms } from './discovery.js';

test('scorer: higher reward and clarity rank higher', () => {
  const weak = scoreProgram({ maxBountyUsd: 100, inScopeCount: 1, parseConfidence: 0.4, ambiguityCount: 2, hasWideScope: true });
  const strong = scoreProgram({ maxBountyUsd: 5000, inScopeCount: 6, parseConfidence: 0.9, ambiguityCount: 0, hasWideScope: false });
  assert.ok(strong.total > weak.total);
  assert.ok(strong.total <= 1 && weak.total >= 0);
});

test('scorer: ambiguity penalizes policy clarity', () => {
  const clean = scoreProgram({ inScopeCount: 3, parseConfidence: 0.8, ambiguityCount: 0, hasWideScope: false });
  const messy = scoreProgram({ inScopeCount: 3, parseConfidence: 0.8, ambiguityCount: 4, hasWideScope: false });
  assert.ok(clean.policyClarity > messy.policyClarity);
});

test('mapHackerOne maps the documented shape', () => {
  const rows = mapHackerOne({
    data: [
      { id: '1', attributes: { handle: 'acme', name: 'Acme', policy: 'In scope: api.acme.com', max_bounty: 5000 } },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.handle, 'acme');
  assert.equal(rows[0]!.maxBountyUsd, 5000);
  assert.equal(rows[0]!.url, 'https://hackerone.com/acme');
});

test('mapBugcrowd tolerates missing fields', () => {
  const rows = mapBugcrowd({ programs: [{ code: 'globex', name: 'Globex' }] });
  assert.equal(rows[0]!.handle, 'globex');
  assert.equal(rows[0]!.policyRaw, '');
});

test('discoverPrograms parses + scores from a fake connector, skips no-cred ones', async () => {
  const fake: PlatformConnector = {
    platform: 'HACKERONE',
    async fetchPrograms() {
      return [
        { platform: 'HACKERONE', handle: 'acme', name: 'Acme', policyRaw: 'In scope: *.acme.com. Rewards: Critical $5000.', maxBountyUsd: 5000 },
      ];
    },
  };
  const noCreds: PlatformConnector = {
    platform: 'BUGCROWD',
    async fetchPrograms() { return null; },
  };
  const out = await discoverPrograms([fake, noCreds]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.raw.handle, 'acme');
  assert.ok(out[0]!.ambiguityFlags.some((f) => f.includes('wildcard')));
  assert.ok(out[0]!.score.total > 0);
});

test('discoverPrograms survives a throwing connector', async () => {
  const boom: PlatformConnector = {
    platform: 'INTIGRITI',
    async fetchPrograms() { throw new Error('platform 500'); },
  };
  const out = await discoverPrograms([boom]);
  assert.deepEqual(out, []);
});
