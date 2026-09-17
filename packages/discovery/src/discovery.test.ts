import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreEarnability, countScannableAssets } from './scorer.js';
import { mapHackerOne, mapBugcrowd, type PlatformConnector } from './connectors.js';
import { discoverPrograms } from './discovery.js';

test('earnability: closed programs score zero', () => {
  const s = scoreEarnability({ offersBounty: true, isOpen: false, maxBountyUsd: 5000, scannableAssets: 10 });
  assert.equal(s.total, 0);
  assert.match(s.reason, /closed/);
});

test('earnability: VDP is capped below any paying program', () => {
  const vdp = scoreEarnability({ offersBounty: false, isOpen: true, scannableAssets: 20 });
  const pays = scoreEarnability({ offersBounty: true, isOpen: true, maxBountyUsd: 500, scannableAssets: 1 });
  assert.ok(vdp.total < pays.total);
  assert.match(vdp.reason, /VDP/);
});

test('earnability: bigger payout and more scannable surface score higher', () => {
  const small = scoreEarnability({ offersBounty: true, isOpen: true, maxBountyUsd: 100, scannableAssets: 1, programAgeDays: 3000 });
  const big = scoreEarnability({ offersBounty: true, isOpen: true, maxBountyUsd: 20000, scannableAssets: 18, programAgeDays: 100 });
  assert.ok(big.total > small.total);
  assert.ok(big.total <= 1);
});

test('countScannableAssets ignores source repos and mobile builds', () => {
  const n = countScannableAssets([
    'api.acme.com',
    'https://github.com/acme/repo',
    'com.acme.android',
    '10.0.0.1',
    'https://play.google.com/store/apps/details?id=x',
  ]);
  assert.equal(n, 2); // api.acme.com + the IP
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

test('carriesPolicy: list-level polls (no policy text) must not trigger a re-parse', async () => {
  const { carriesPolicy } = await import('./discovery.js');
  assert.equal(carriesPolicy(''), false);
  assert.equal(carriesPolicy('   '), false);
  assert.equal(carriesPolicy(null), false);
  assert.equal(carriesPolicy(undefined), false);
  assert.equal(carriesPolicy('In scope: api.acme.com'), true);
});
