import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildH1Scope, buildIntigritiScope } from './enrich.js';

test('buildH1Scope: eligible hosts in-scope, ineligible out, source-code skipped, wildcards flagged', () => {
  const s = buildH1Scope({
    data: [
      { attributes: { asset_type: 'URL', asset_identifier: 'hackerone.com', eligible_for_submission: true } },
      { attributes: { asset_type: 'URL', asset_identifier: 'support.hackerone.com', eligible_for_submission: false } },
      { attributes: { asset_type: 'WILDCARD', asset_identifier: 'https://*.hackerone-user-content.com/', eligible_for_submission: true } },
      { attributes: { asset_type: 'SOURCE_CODE', asset_identifier: 'https://github.com/x/y', eligible_for_submission: true } },
    ],
  });
  assert.deepEqual(s.inScope, ['hackerone.com', 'https://*.hackerone-user-content.com/']);
  assert.deepEqual(s.outOfScope, ['support.hackerone.com']);
  assert.equal(s.wildcardFlags.length, 1);
  assert.ok(s.policyRaw.includes('In scope'));
});

test('buildIntigritiScope: maps domains.content, tiers, wildcards', () => {
  const s = buildIntigritiScope({
    domains: { content: [
      { endpoint: '*.azcpggpc.ca', tier: { value: 'No Bounty' } },
      { endpoint: 'app.x.com', tier: { value: 'Tier 1 - Critical' } },
      { endpoint: 'old.x.com', tier: { value: 'Out of Scope' } },
    ] },
  });
  assert.deepEqual(s.inScope, ['*.azcpggpc.ca', 'app.x.com']);
  assert.deepEqual(s.outOfScope, ['old.x.com']);
  assert.equal(s.wildcardFlags.length, 1);
});

test('empty/malformed detail yields empty scope', () => {
  assert.deepEqual(buildH1Scope({}).inScope, []);
  assert.deepEqual(buildIntigritiScope({}).inScope, []);
});
