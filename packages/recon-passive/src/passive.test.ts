import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCrtSh, parseSecurityTxt } from './sources.js';
import { enumerateAssets } from './passive.js';
import { detectExposures } from './detectors.js';
import type { PassiveSource } from './types.js';

test('parseCrtSh extracts in-domain subdomains, strips wildcards', () => {
  const assets = parseCrtSh(
    [
      { name_value: 'api.acme.com\n*.acme.com' },
      { name_value: 'www.acme.com' },
      { name_value: 'evil.com' },
      { name_value: 'm.testacme.com' },
    ],
    'acme.com',
  );
  const values = assets.map((a) => a.value).sort();
  assert.deepEqual(values, ['acme.com', 'api.acme.com', 'www.acme.com']);
  assert.ok(!values.includes('evil.com'));
  assert.ok(!values.includes('m.testacme.com')); // dot boundary: not a subdomain of acme.com
  assert.ok(assets.every((a) => a.source === 'CT_LOG'));
});

test('parseSecurityTxt pulls contact and policy', () => {
  const s = parseSecurityTxt(
    'Contact: mailto:security@acme.com\nContact: https://acme.com/report\nPolicy: https://acme.com/vdp\n',
  );
  assert.deepEqual(s.contact, ['mailto:security@acme.com', 'https://acme.com/report']);
  assert.equal(s.policy, 'https://acme.com/vdp');
});

test('enumerateAssets dedups across sources and survives failures', async () => {
  const a: PassiveSource = {
    source: 'CT_LOG',
    async enumerate() {
      return [
        { value: 'api.acme.com', source: 'CT_LOG' },
        { value: 'www.acme.com', source: 'CT_LOG' },
      ];
    },
  };
  const b: PassiveSource = {
    source: 'PASSIVE_DNS',
    async enumerate() {
      return [{ value: 'api.acme.com', source: 'PASSIVE_DNS' }]; // dup
    },
  };
  const boom: PassiveSource = {
    source: 'PUBLIC_SOURCE',
    async enumerate() {
      throw new Error('down');
    },
  };
  const out = await enumerateAssets('acme.com', [a, b, boom]);
  assert.equal(out.length, 2);
  // first source wins the dedup
  assert.equal(out.find((x) => x.value === 'api.acme.com')!.source, 'CT_LOG');
});

test('detectExposures flags git/.env/keys from public signals only', () => {
  const findings = detectExposures([
    { url: 'https://acme.com/.git/config', via: 'wayback' },
    { url: 'https://acme.com/.env', via: 'github' },
    { url: 'https://acme.com/index.html', via: 'ct' },
    { url: 'https://acme.com/.git/config', via: 'ct' }, // dup url+class
  ]);
  const classes = findings.map((f) => f.vulnClass);
  assert.ok(classes.includes('git-exposure'));
  assert.ok(classes.includes('exposed-secret'));
  assert.equal(findings.filter((f) => f.vulnClass === 'git-exposure').length, 1);
  assert.ok(!classes.includes('safe'));
});
