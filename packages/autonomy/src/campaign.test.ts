import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCampaign, autopilotTriggers } from './campaign.js';

test('campaign liveness: paused or expired is not live', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  assert.equal(evaluateCampaign({ paused: false, expiresAt: new Date('2026-06-08T00:00:00Z') }, now).live, true);
  assert.equal(evaluateCampaign({ paused: true, expiresAt: new Date('2026-06-08T00:00:00Z') }, now).live, false);
  assert.equal(evaluateCampaign({ paused: false, expiresAt: new Date('2026-05-31T00:00:00Z') }, now).live, false);
});

test('autopilot pauses on tier-3 discovery', () => {
  const t = autopilotTriggers({ oosHits: 0, tier3Discovered: 1, policyChanged: false, validRate: 1, sample: 20 });
  assert.equal(t.pause, true);
  assert.match(t.reason!, /tier-3/);
});

test('autopilot pauses on policy change and OOS', () => {
  assert.equal(autopilotTriggers({ oosHits: 0, tier3Discovered: 0, policyChanged: true, validRate: 1, sample: 20 }).pause, true);
  assert.equal(autopilotTriggers({ oosHits: 2, tier3Discovered: 0, policyChanged: false, validRate: 1, sample: 20 }).pause, true);
});

test('autopilot pauses on valid-rate drop only with a big-enough sample', () => {
  assert.equal(autopilotTriggers({ oosHits: 0, tier3Discovered: 0, policyChanged: false, validRate: 0.4, sample: 20 }).pause, true);
  assert.equal(autopilotTriggers({ oosHits: 0, tier3Discovered: 0, policyChanged: false, validRate: 0.4, sample: 3 }).pause, false);
});

test('autopilot stays running when everything is clean', () => {
  assert.equal(autopilotTriggers({ oosHits: 0, tier3Discovered: 0, policyChanged: false, validRate: 0.9, sample: 20 }).pause, false);
});
