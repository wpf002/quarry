import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyProvenance } from './provenance.js';
import { evaluateBreaker } from './breaker.js';
import { evaluatePreAuth, ttlHoursUntil } from './preauth.js';
import { selectAutoScanTargets } from './scheduler.js';

test('provenance: subdomain of a confirmed apex verifies; lookalike does not', async () => {
  assert.equal((await verifyProvenance('api.acme.com', ['acme.com'])).verified, true);
  assert.equal((await verifyProvenance('a.b.acme.com', ['acme.com'])).method, 'SUBDOMAIN_OF_APEX');
  assert.equal((await verifyProvenance('evil-acme.com', ['acme.com'])).verified, false);
  assert.equal((await verifyProvenance('acme.com.evil.com', ['acme.com'])).verified, false);
});

test('provenance: cert SAN ties target to a confirmed apex', async () => {
  const certFetcher = async () => ['cdn.fastly.net', 'acme.com', 'assets.acme.com'];
  const r = await verifyProvenance('assets.acme.com', ['acme.com'], { certFetcher });
  // assets.acme.com is already a subdomain, so it verifies by subdomain first
  assert.equal(r.verified, true);
  // a host NOT under apex but sharing a cert that also covers the apex:
  const certFetcher2 = async () => ['acme-cdn.io', 'acme.com'];
  const r2 = await verifyProvenance('acme-cdn.io', ['acme.com'], { certFetcher: certFetcher2 });
  assert.equal(r2.verified, true);
  assert.equal(r2.method, 'CERT_SAN_MATCH');
});

test('provenance: unrelated host with unrelated cert fails', async () => {
  const certFetcher = async () => ['unrelated.com'];
  const r = await verifyProvenance('unrelated.com', ['acme.com'], { certFetcher });
  assert.equal(r.verified, false);
});

test('breaker trips on OOS, rate, budget, or policy change', () => {
  const limits = { rateLimitPerMin: 20, dailyBudgetUsd: 5 };
  assert.equal(evaluateBreaker({ oosHits: 1, scansThisMinute: 1, spentUsdToday: 0, policyChanged: false }, limits).trip, true);
  assert.equal(evaluateBreaker({ oosHits: 0, scansThisMinute: 25, spentUsdToday: 0, policyChanged: false }, limits).trip, true);
  assert.equal(evaluateBreaker({ oosHits: 0, scansThisMinute: 1, spentUsdToday: 9, policyChanged: false }, limits).trip, true);
  assert.equal(evaluateBreaker({ oosHits: 0, scansThisMinute: 1, spentUsdToday: 0, policyChanged: true }, limits).trip, true);
  assert.equal(evaluateBreaker({ oosHits: 0, scansThisMinute: 1, spentUsdToday: 0, policyChanged: false }, limits).trip, false);
});

test('evaluatePreAuth: revoked and expired are not live', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  assert.equal(evaluatePreAuth({ revoked: false, expiresAt: new Date('2026-06-02T00:00:00Z') }, now).live, true);
  assert.equal(evaluatePreAuth({ revoked: true, expiresAt: new Date('2026-06-02T00:00:00Z') }, now).live, false);
  assert.equal(evaluatePreAuth({ revoked: false, expiresAt: new Date('2026-05-31T00:00:00Z') }, now).live, false);
});

test('ttlHoursUntil rounds up and floors at 1', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  assert.equal(ttlHoursUntil(new Date('2026-06-02T00:00:00Z'), now), 24);
  assert.equal(ttlHoursUntil(new Date('2026-06-01T00:10:00Z'), now), 1);
});

test('selectAutoScanTargets keeps only provenance-verified assets, capped', async () => {
  const targets = await selectAutoScanTargets({
    assets: [
      { value: 'api.acme.com' },
      { value: 'www.acme.com' },
      { value: 'evil-acme.com' },   // lookalike -> excluded
      { value: 'blog.acme.com' },
    ],
    apexes: ['acme.com'],
    limit: 2,
  });
  assert.equal(targets.length, 2);         // capped at limit
  assert.ok(!targets.includes('evil-acme.com'));
});
