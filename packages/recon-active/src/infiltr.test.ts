import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpInfiltrClient, InfiltrError } from './infiltr.js';

const fakeHttp = (status: number, body: any = {}) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('200 returns assets + findings', async () => {
  const c = new HttpInfiltrClient('http://x', 'k', fakeHttp(200, { assets: ['a.com'], findings: [{ title: 't' }] }));
  const r = await c.scan('a.com', { tiers: [1] });
  assert.deepEqual(r.assets, ['a.com']);
  assert.equal(r.findings.length, 1);
});

test('429 is transient (defer, not scope drift)', async () => {
  const c = new HttpInfiltrClient('http://x', 'k', fakeHttp(429));
  await assert.rejects(() => c.scan('a.com', { tiers: [1] }), (e: any) =>
    e instanceof InfiltrError && e.transient && !e.scopeRejected);
});

test('403 is a scope rejection (trip the breaker)', async () => {
  const c = new HttpInfiltrClient('http://x', 'k', fakeHttp(403));
  await assert.rejects(() => c.scan('a.com', { tiers: [1] }), (e: any) =>
    e instanceof InfiltrError && e.scopeRejected && !e.transient);
});

test('400/500 are hard failures, not transient', async () => {
  for (const code of [400, 500]) {
    const c = new HttpInfiltrClient('http://x', 'k', fakeHttp(code));
    await assert.rejects(() => c.scan('a.com', { tiers: [1] }), (e: any) =>
      e instanceof InfiltrError && !e.transient && !e.scopeRejected);
  }
});

test('unconfigured throws a clear error', async () => {
  const c = new HttpInfiltrClient('', '', fakeHttp(200));
  await assert.rejects(() => c.scan('a.com', { tiers: [1] }), /not configured/);
});
