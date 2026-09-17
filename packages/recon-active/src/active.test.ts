import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runActiveScan, runActiveScanBatch, KillSwitchEngaged } from './active.js';
import { tierPermitted, assertTierRunnable, TierRefusal } from './tiers.js';
import type { ActiveDeps } from './active.js';
import type { InfiltrClient, ScanTargetInput } from './types.js';

function spyInfiltr() {
  const calls: string[] = [];
  const client: InfiltrClient = {
    async scan(target) {
      calls.push(target);
      return { target, assets: [target], findings: [] };
    },
  };
  return { client, calls };
}

const base: ScanTargetInput = {
  programId: 'p1',
  target: 'api.acme.com',
  tier: 1,
  profile: { tiers: [1, 2] },
};

test('kill switch halts before the gate and before Infiltr', async () => {
  const inf = spyInfiltr();
  let gateCalled = false;
  const deps: ActiveDeps = {
    killed: async () => true,
    assertAllowed: async () => { gateCalled = true; },
    infiltr: inf.client,
    persist: async () => {},
  };
  await assert.rejects(() => runActiveScan(base, deps), KillSwitchEngaged);
  assert.equal(gateCalled, false);
  assert.equal(inf.calls.length, 0);
});

test('gate refusal stops the scan; Infiltr never called', async () => {
  const inf = spyInfiltr();
  const deps: ActiveDeps = {
    killed: async () => false,
    assertAllowed: async () => { throw new Error('target not on live allowlist'); },
    infiltr: inf.client,
    persist: async () => {},
  };
  await assert.rejects(() => runActiveScan(base, deps), /allowlist/);
  assert.equal(inf.calls.length, 0);
});

test('tier 2 refused when profile lacks it; gate not reached', async () => {
  const inf = spyInfiltr();
  let gateCalled = false;
  const deps: ActiveDeps = {
    killed: async () => false,
    assertAllowed: async () => { gateCalled = true; },
    infiltr: inf.client,
    persist: async () => {},
  };
  await assert.rejects(
    () => runActiveScan({ ...base, tier: 2, profile: { tiers: [1] } }, deps),
    TierRefusal,
  );
  assert.equal(gateCalled, false);
});

test('tier 3 refused without per-action confirmation', async () => {
  const deps: ActiveDeps = { killed: async () => false, assertAllowed: async () => {}, infiltr: spyInfiltr().client, persist: async () => {} };
  await assert.rejects(
    () => runActiveScan({ ...base, tier: 3, profile: { tiers: [1, 2, 3] } }, deps),
    TierRefusal,
  );
});

test('happy path: kill off + tier ok + gate passes -> Infiltr + persist', async () => {
  const inf = spyInfiltr();
  let persisted = false;
  const deps: ActiveDeps = {
    killed: async () => false,
    assertAllowed: async () => {},
    infiltr: inf.client,
    persist: async () => { persisted = true; },
  };
  const r = await runActiveScan(base, deps);
  assert.equal(inf.calls[0], 'api.acme.com');
  assert.equal(persisted, true);
  assert.deepEqual(r.assets, ['api.acme.com']);
});

test('batch gates every target and rejects tier 3', async () => {
  const inf = spyInfiltr();
  let gateCalls = 0;
  const deps: ActiveDeps = {
    killed: async () => false,
    assertAllowed: async (_p, t) => { gateCalls++; if (t === 'bad.com') throw new Error('not on allowlist'); },
    infiltr: inf.client,
    persist: async () => {},
  };
  const res = await runActiveScanBatch(
    [
      { ...base, target: 'ok.acme.com' },
      { ...base, target: 'bad.com' },
      { ...base, target: 'high.acme.com', tier: 3, profile: { tiers: [1, 2, 3] } },
    ],
    deps,
  );
  assert.deepEqual(res.map((r) => r.ok), [true, false, false]);
  // tier-3 target short-circuits before the gate; the other two are gated
  assert.equal(gateCalls, 2);
  assert.equal(inf.calls.length, 1); // only ok.acme.com scanned
});

test('tier helpers', () => {
  assert.equal(tierPermitted({ tiers: [1] }, 1), true);
  assert.equal(tierPermitted({ tiers: [1] }, 2), false);
  assert.throws(() => assertTierRunnable(3, { tiers: [1, 2, 3] }, false), TierRefusal);
  assert.doesNotThrow(() => assertTierRunnable(3, { tiers: [1, 2, 3] }, true));
});
