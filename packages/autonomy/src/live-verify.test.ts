import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patternToHost, sanCovers } from './live-verify.js';

test('patternToHost handles hosts, urls, ports, and CIDR', () => {
  assert.equal(patternToHost('api.acme.com'), 'api.acme.com');
  assert.equal(patternToHost('API.ACME.COM:8443'), 'api.acme.com');
  assert.equal(patternToHost('https://api.acme.com/v2/'), 'api.acme.com');
  assert.equal(patternToHost('10.0.0.0/24'), null); // CIDR not a host
});

test('sanCovers: exact and single-level wildcard only', () => {
  assert.equal(sanCovers('api.acme.com', ['api.acme.com']), true);
  assert.equal(sanCovers('api.acme.com', ['*.acme.com']), true);
  assert.equal(sanCovers('a.b.acme.com', ['*.acme.com']), false); // wildcard is one level
  assert.equal(sanCovers('acme.com', ['*.acme.com']), false);     // apex not covered by wildcard
  assert.equal(sanCovers('api.acme.com', ['*.other.com', 'www.acme.com']), false);
  assert.equal(sanCovers('API.ACME.COM', ['api.acme.com']), true); // case-insensitive
});
