import type { Platform } from '@quarry/db';

// Platform-specific report formatting. Same finding, different house style:
// HackerOne markdown + CVSS, Bugcrowd VRT, Intigriti, plain email for
// self-hosted / YesWeHack.

export interface ReportableFinding {
  title: string;
  vulnClass: string;
  severity: string;
  assets: string[];
  bodyMarkdown: string; // drafted by the AI seam
  cvss?: string;
  cwe?: string;
}

export function formatForPlatform(
  finding: ReportableFinding,
  platform: Platform,
): string {
  switch (platform) {
    case 'HACKERONE':
      return h1(finding);
    case 'BUGCROWD':
      return bugcrowd(finding);
    case 'INTIGRITI':
      return intigriti(finding);
    case 'YESWEHACK':
    case 'SELF_HOSTED':
    default:
      return plainEmail(finding);
  }
}

function h1(f: ReportableFinding): string {
  return [
    f.bodyMarkdown,
    '',
    '---',
    `**Severity (CVSS):** ${f.cvss ?? 'TODO — compute vector'}`,
    f.cwe ? `**Weakness:** ${f.cwe}` : '**Weakness:** TODO — CWE',
    `**Asset(s):** ${f.assets.join(', ') || 'n/a'}`,
  ].join('\n');
}

function bugcrowd(f: ReportableFinding): string {
  return [
    f.bodyMarkdown,
    '',
    '---',
    `**VRT:** ${vrtHint(f.vulnClass)}`,
    `**Severity:** ${f.severity}`,
    `**Targets:** ${f.assets.join(', ') || 'n/a'}`,
  ].join('\n');
}

function intigriti(f: ReportableFinding): string {
  return [
    f.bodyMarkdown,
    '',
    '---',
    `**Type:** ${f.vulnClass}`,
    `**Severity:** ${f.severity}`,
    `**Endpoint(s):** ${f.assets.join(', ') || 'n/a'}`,
  ].join('\n');
}

function plainEmail(f: ReportableFinding): string {
  return [
    `Subject: Security disclosure — ${f.title}`,
    '',
    `Severity: ${f.severity}`,
    `Affected: ${f.assets.join(', ') || 'n/a'}`,
    '',
    stripMarkdown(f.bodyMarkdown),
    '',
    'Reported in good faith under your disclosure policy.',
  ].join('\n');
}

function vrtHint(vulnClass: string): string {
  const map: Record<string, string> = {
    xss: 'cross_site_scripting_xss',
    idor: 'broken_access_control.idor',
    ssrf: 'server_side_request_forgery_ssrf',
    'git-exposure': 'server_security_misconfiguration.source_code_disclosure',
    'exposed-secret': 'sensitive_data_exposure',
    'public-bucket': 'server_security_misconfiguration.misconfigured_dns',
  };
  return map[vulnClass] ?? 'TODO — map to VRT';
}

function stripMarkdown(md: string): string {
  return md.replace(/^#+\s*/gm, '').replace(/\*\*/g, '');
}
