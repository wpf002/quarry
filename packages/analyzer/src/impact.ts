import type { Severity } from './types.js';

// Impact statement grounded in the vuln class and the affected assets rather
// than a generic blurb.
const TEMPLATES: Record<string, (assets: string) => string> = {
  'git-exposure': (a) => `Source code and commit history are retrievable at ${a}, exposing internal logic, endpoints, and possibly hardcoded secrets.`,
  'exposed-secret': (a) => `A live credential is publicly retrievable at ${a}; an attacker can authenticate as the associated identity without further compromise.`,
  'public-bucket': (a) => `The bucket at ${a} lists and serves objects to anonymous users, exposing whatever data it holds.`,
  idor: (a) => `Object references at ${a} are not authorized per-user, letting one account read or modify another account's data.`,
  ssrf: (a) => `The server at ${a} fetches attacker-controlled URLs, reaching internal services and cloud metadata not otherwise exposed.`,
  xss: (a) => `Script executes in a victim's session on ${a}, enabling session theft or actions on the victim's behalf.`,
};

export function impactFor(vulnClass: string, assets: string[]): string {
  const a = assets[0] ?? 'the affected asset';
  const t = TEMPLATES[vulnClass];
  return t ? t(a) : `Impact on ${a} depends on the surrounding functionality; confirm concrete effect before reporting.`;
}

export function bumpSeverityForImpact(base: Severity, vulnClass: string): Severity {
  // High-impact classes should not be under-reported by a generic triage.
  if ((vulnClass === 'exposed-secret' || vulnClass === 'ssrf') && base === 'MEDIUM') {
    return 'HIGH';
  }
  return base;
}
