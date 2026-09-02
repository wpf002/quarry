import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, evaluate } from './matcher.js';

// Property spine of the whole system: nothing that isn't an exact allowlist
// match may ever return `allowed`. These tests all assert refusal or a single
// intended acceptance.

test('exact host: matches only itself', () => {
  assert.equal(matches('api.acme.com', 'api.acme.com', false), true);
  assert.equal(matches('api.acme.com', 'API.ACME.COM', false), true); // case
  assert.equal(matches('api.acme.com', 'api.acme.com.', false), true); // trailing dot
  assert.equal(matches('api.acme.com', 'https://api.acme.com/x', false), true);
  assert.equal(matches('api.acme.com', 'api.acme.com:8443', false), true);
});

test('exact host: rejects siblings and lookalikes', () => {
  assert.equal(matches('acme.com', 'evil-acme.com', false), false);
  assert.equal(matches('acme.com', 'acme.com.evil.com', false), false);
  assert.equal(matches('acme.com', 'notacme.com', false), false);
  assert.equal(matches('api.acme.com', 'admin.acme.com', false), false);
  assert.equal(matches('api.acme.com', 'api.acme.com.attacker.net', false), false);
  assert.equal(matches('acme.com', 'xacme.com', false), false);
});

test('wildcard: refused entirely unless allowWildcard is true', () => {
  assert.equal(matches('*.acme.com', 'foo.acme.com', false), false);
});

test('wildcard: strict subdomain boundary when allowed', () => {
  assert.equal(matches('*.acme.com', 'foo.acme.com', true), true);
  assert.equal(matches('*.acme.com', 'a.b.acme.com', true), true);
  assert.equal(matches('*.acme.com', 'acme.com', true), false); // apex excluded
  assert.equal(matches('*.acme.com', 'evil-acme.com', true), false);
  assert.equal(matches('*.acme.com', 'x.notacme.com', true), false);
  assert.equal(matches('*.acme.com', 'fooacme.com', true), false);
});

test('wildcard: only a single leading-label wildcard is legal', () => {
  assert.equal(matches('foo.*.acme.com', 'foo.x.acme.com', true), false);
  assert.equal(matches('*acme.com', 'x.acme.com', true), false);
  assert.equal(matches('*.*.acme.com', 'a.b.acme.com', true), false);
  assert.equal(matches('*.com', 'anything.com', true), false); // suffix has one label -> refuse via includes('.')? com has none
});

test('url prefix: scheme, host, port, and path boundary', () => {
  const p = 'https://api.acme.com/v2/';
  assert.equal(matches(p, 'https://api.acme.com/v2/users', false), true);
  assert.equal(matches(p, 'https://api.acme.com/v2/', false), true);
  assert.equal(matches(p, 'http://api.acme.com/v2/users', false), false); // scheme
  assert.equal(matches(p, 'https://api.acme.com:8443/v2/users', false), false); // port
  assert.equal(matches(p, 'https://evil.com/v2/users', false), false); // host
  assert.equal(matches(p, 'api.acme.com', false), false); // bare host not a URL
});

test('url prefix: /v2 must not match /v20', () => {
  const p = 'https://api.acme.com/v2';
  assert.equal(matches(p, 'https://api.acme.com/v2', false), true);
  assert.equal(matches(p, 'https://api.acme.com/v2/x', false), true);
  assert.equal(matches(p, 'https://api.acme.com/v20', false), false);
  assert.equal(matches(p, 'https://api.acme.com/v2x', false), false);
});

test('cidr: IPv4 containment and edges', () => {
  assert.equal(matches('10.0.0.0/24', '10.0.0.1', false), true);
  assert.equal(matches('10.0.0.0/24', '10.0.0.0', false), true); // network addr
  assert.equal(matches('10.0.0.0/24', '10.0.0.255', false), true); // broadcast
  assert.equal(matches('10.0.0.0/24', '10.0.1.0', false), false); // just outside
  assert.equal(matches('10.0.0.0/24', '10.0.0.256', false), false); // invalid octet
  assert.equal(matches('192.168.1.0/32', '192.168.1.0', false), true);
  assert.equal(matches('192.168.1.0/32', '192.168.1.1', false), false);
  assert.equal(matches('0.0.0.0/0', '8.8.8.8', false), true); // /0 covers all v4
});

test('cidr: never resolves a hostname into range', () => {
  assert.equal(matches('10.0.0.0/8', 'internal.acme.com', false), false);
  assert.equal(matches('10.0.0.0/8', 'https://internal.acme.com/', false), false);
});

test('cidr: IPv6 basic containment and family isolation', () => {
  assert.equal(matches('2001:db8::/32', '2001:db8::1', false), true);
  assert.equal(matches('2001:db8::/32', '2001:db9::1', false), false);
  assert.equal(matches('2001:db8::/32', '10.0.0.1', false), false); // family
  assert.equal(matches('10.0.0.0/24', '::1', false), false);
});

test('empty / malformed inputs fail closed', () => {
  assert.equal(matches('', 'acme.com', false), false);
  assert.equal(matches('acme.com', '', false), false);
  assert.equal(matches('  ', 'acme.com', false), false);
  assert.equal(matches('acme.com', 'has space', false), false);
});

test('evaluate exposes a reason for auditing', () => {
  const r = evaluate('acme.com', 'evil-acme.com', false);
  assert.equal(r.allowed, false);
  assert.ok(r.reason.length > 0);
});
