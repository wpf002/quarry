import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dupRisk } from './dedup.js';
import { detectChains } from './chains.js';
import { qualityGate } from './quality.js';
import { analyzeFinding } from './analyzer.js';
import { impactFor, bumpSeverityForImpact } from './impact.js';

test('dupRisk: common class on mature, visible program scores high', () => {
  const high = dupRisk({ vulnClass: 'open-redirect', programAgeDays: 800, assetVisibility: 'high', similarFindingsInProgram: 3 });
  const low = dupRisk({ vulnClass: 'rce', programAgeDays: 30, assetVisibility: 'low', similarFindingsInProgram: 0 });
  assert.ok(high > low);
  assert.ok(high <= 1 && low >= 0);
});

test('detectChains pairs SSRF + exposed-secret into CRITICAL', () => {
  const chains = detectChains([
    { id: 'f1', title: 'SSRF', vulnClass: 'ssrf', severity: 'HIGH', evidence: {} },
    { id: 'f2', title: 'Secret', vulnClass: 'exposed-secret', severity: 'HIGH', evidence: {} },
    { id: 'f3', title: 'noise', vulnClass: 'info', severity: 'INFO', evidence: {} },
  ]);
  assert.equal(chains.length, 1);
  assert.equal(chains[0]!.severity, 'CRITICAL');
  assert.deepEqual(chains[0]!.components.sort(), ['f1', 'f2']);
  // PoC steps are descriptions, not payloads
  assert.ok(chains[0]!.readOnlyPoc.every((s) => typeof s === 'string'));
});

test('quality gate fails closed on any unmet condition', () => {
  assert.equal(qualityGate({ confidence: 0.9, dupRisk: 0.2, humanConfirmed: true }).pass, true);
  assert.equal(qualityGate({ confidence: 0.9, dupRisk: 0.2, humanConfirmed: false }).pass, false);
  assert.equal(qualityGate({ confidence: 0.7, dupRisk: 0.2, humanConfirmed: true }).pass, false);
  assert.equal(qualityGate({ confidence: 0.9, dupRisk: 0.5, humanConfirmed: true }).pass, false);
  // boundary: strictly greater than 0.8 required
  assert.equal(qualityGate({ confidence: 0.8, dupRisk: 0.2, humanConfirmed: true }).pass, false);
});

test('analyzeFinding bumps exposed-secret severity and grounds impact', () => {
  const r = analyzeFinding(
    { id: 'f1', title: 'env exposed', vulnClass: 'exposed-secret', severity: 'MEDIUM', evidence: { url: 'https://acme.com/.env' }, assets: ['acme.com'] },
    { programAgeDays: 100, assetVisibility: 'medium', similarFindingsInProgram: 0 },
  );
  assert.equal(r.severity, 'HIGH');
  assert.ok(r.impact.includes('credential'));
  assert.ok(r.dupRisk >= 0 && r.dupRisk <= 1);
});

test('impact + severity helpers', () => {
  assert.ok(impactFor('git-exposure', ['acme.com']).includes('Source code'));
  assert.equal(bumpSeverityForImpact('MEDIUM', 'ssrf'), 'HIGH');
  assert.equal(bumpSeverityForImpact('LOW', 'xss'), 'LOW');
});
