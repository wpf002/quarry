import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findContacts, bestContact, commonAddresses } from './contacts.js';
import { formatForPlatform } from './formatters.js';
import { draftReport } from './reporter.js';

test('findContacts follows RFC 9116 preference order', () => {
  const ranked = findContacts({
    domain: 'acme.com',
    whoisEmail: 'admin@acme.com',
    securityTxtContacts: ['mailto:security@acme.com'],
    vdpUrl: 'https://acme.com/vdp',
  });
  assert.equal(ranked[0]!.method, 'security.txt');
  assert.equal(ranked[1]!.method, 'vdp');
  assert.equal(ranked[2]!.method, 'whois');
  // common addresses always present as fallback, ranked last
  assert.ok(ranked.some((c) => c.method === 'common'));
  assert.equal(ranked[ranked.length - 1]!.method, 'common');
});

test('bestContact prefers security.txt, falls back to common', () => {
  assert.equal(
    bestContact({ domain: 'acme.com', securityTxtContacts: ['mailto:s@acme.com'] })!.method,
    'security.txt',
  );
  assert.equal(bestContact({ domain: 'acme.com' })!.method, 'common');
});

test('commonAddresses strips www', () => {
  assert.deepEqual(commonAddresses('www.acme.com'), [
    'security@acme.com',
    'abuse@acme.com',
    'soc@acme.com',
  ]);
});

test('HackerOne format includes CVSS line; plain email strips markdown', () => {
  const f = {
    title: 'Exposed .git',
    vulnClass: 'git-exposure',
    severity: 'MEDIUM',
    assets: ['acme.com'],
    bodyMarkdown: '# Exposed .git\n\n**Summary**',
    cvss: '5.3',
  };
  const h1 = formatForPlatform(f, 'HACKERONE');
  assert.ok(h1.includes('CVSS'));
  assert.ok(h1.includes('5.3'));
  const email = formatForPlatform(f, 'SELF_HOSTED');
  assert.ok(email.startsWith('Subject:'));
  assert.ok(!email.includes('**'));
  assert.ok(!email.includes('# Exposed'));
});

test('draftReport produces platform-specific output from a finding', () => {
  const out = draftReport(
    { title: 'Public bucket', vulnClass: 'public-bucket', severity: 'MEDIUM', assets: ['x.s3.amazonaws.com'], evidenceSummary: 'listing is world-readable' },
    'BUGCROWD',
  );
  assert.ok(out.includes('VRT'));
  assert.ok(out.includes('Public bucket'));
});
