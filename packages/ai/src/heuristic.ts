import type {
  ParseResult,
  ParsedScope,
  PolicyParser,
  Triager,
  TriageInput,
  TriageResult,
  ReportDrafter,
  ReportDraftInput,
} from './types.js';

// Deterministic, no-network implementations of the AI seam. Good enough to run
// the whole pipeline offline and in tests. Flint replaces these later behind
// the same interfaces.

const HOST_RE = /(?<![\w.*-])(?:\*\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi;
const CIDR_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}\b/g;
const URL_RE = /\bhttps?:\/\/[^\s,;)]+/gi;

function extractAssets(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(URL_RE)) found.add(m[0].replace(/[.,]$/, ''));
  for (const m of text.matchAll(CIDR_RE)) found.add(m[0]);
  for (const m of text.matchAll(HOST_RE)) found.add(m[0].toLowerCase());
  return [...found];
}

/** Split policy text into rough sections keyed by heading keyword. */
function sectionAfter(text: string, keywords: string[]): string {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const i = lower.indexOf(kw);
    if (i === -1) continue;
    // Take until the next double newline or a competing heading.
    const rest = text.slice(i + kw.length);
    const stop = rest.search(/\n\s*\n|out of scope|in scope|prohibited|rewards/i);
    return stop === -1 ? rest : rest.slice(0, stop);
  }
  return '';
}

export class HeuristicPolicyParser implements PolicyParser {
  parsePolicy(policyRaw: string): ParseResult {
    const text = policyRaw ?? '';
    const inScopeText = sectionAfter(text, ['in scope', 'in-scope', 'scope:']);
    const outText = sectionAfter(text, ['out of scope', 'out-of-scope', 'excluded', 'not in scope']);
    const prohText = sectionAfter(text, ['prohibited', 'forbidden', 'do not', "don't", 'not allowed']);

    const inScope = extractAssets(inScopeText || text);
    const outOfScope = extractAssets(outText);
    // Remove out-of-scope items from the in-scope list.
    const outSet = new Set(outOfScope);
    const inScopeClean = inScope.filter((a) => !outSet.has(a));

    const prohibited = extractProhibited(prohText || text);
    const rewardsBySeverity = extractRewards(text);
    const preferredVulnTypes = extractVulnTypes(text);

    const ambiguityFlags: string[] = [];
    for (const a of inScopeClean) {
      if (a.startsWith('*.')) {
        ambiguityFlags.push(`wildcard ${a} needs human confirmation`);
      }
    }
    if (/all (subdomains|properties|assets)|related (properties|domains)|and more|etc\.?/i.test(text)) {
      ambiguityFlags.push('policy uses open-ended scope language ("all subdomains" / "etc")');
    }
    if (inScopeClean.length === 0) {
      ambiguityFlags.push('no concrete in-scope assets could be extracted');
    }

    const scope: ParsedScope = {
      inScope: inScopeClean,
      outOfScope,
      prohibited,
      rewardsBySeverity,
      preferredVulnTypes,
      unusualRules: extractUnusual(text),
    };

    return { scope, confidence: scoreConfidence(scope, text), ambiguityFlags };
  }
}

function extractProhibited(text: string): string[] {
  const rules: string[] = [];
  const map: Array<[RegExp, string]> = [
    [/\bdos\b|denial of service/i, 'DoS'],
    [/social engineer/i, 'social engineering'],
    [/physical/i, 'physical attacks'],
    [/spam/i, 'spam'],
    [/brute[- ]?force/i, 'brute force'],
    [/automated scan/i, 'automated scanning without approval'],
  ];
  for (const [re, label] of map) if (re.test(text)) rules.push(label);
  return rules;
}

function extractRewards(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sev of ['critical', 'high', 'medium', 'low']) {
    const re = new RegExp(`${sev}[^$]{0,20}(\\$[\\d,]+(?:\\s*-\\s*\\$?[\\d,]+)?)`, 'i');
    const m = text.match(re);
    if (m && m[1]) out[sev.toUpperCase()] = m[1].replace(/[,\s]+$/, '');
  }
  return out;
}

function extractVulnTypes(text: string): string[] {
  const types = ['xss', 'sqli', 'ssrf', 'rce', 'idor', 'csrf', 'xxe', 'ssti'];
  return types.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(text));
}

function extractUnusual(text: string): string[] {
  const out: string[] = [];
  if (/first[- ]come|first reporter/i.test(text)) out.push('first-come duplicate policy');
  if (/no automated|manual only/i.test(text)) out.push('manual testing only');
  return out;
}

function scoreConfidence(scope: ParsedScope, text: string): number {
  let c = 0.3;
  if (scope.inScope.length > 0) c += 0.3;
  if (scope.outOfScope.length > 0) c += 0.1;
  if (Object.keys(scope.rewardsBySeverity).length > 0) c += 0.15;
  if (scope.prohibited.length > 0) c += 0.1;
  if (text.length > 200) c += 0.05;
  return Math.min(1, Number(c.toFixed(2)));
}

export class HeuristicTriager implements Triager {
  triage(input: TriageInput): TriageResult {
    const cls = input.vulnClass.toLowerCase();
    const sevMap: Record<string, TriageResult['suggestedSeverity']> = {
      rce: 'CRITICAL', ssrf: 'HIGH', sqli: 'CRITICAL', idor: 'HIGH',
      xss: 'MEDIUM', csrf: 'MEDIUM', 'open-redirect': 'LOW',
      'exposed-secret': 'HIGH', 'git-exposure': 'MEDIUM', 'public-bucket': 'MEDIUM',
    };
    const suggestedSeverity = sevMap[cls] ?? 'LOW';
    const hasEvidence = input.evidenceSummary.trim().length > 20;
    return {
      truePositiveConfidence: hasEvidence ? 0.7 : 0.4,
      suggestedSeverity,
      confirmingEvidence: hasEvidence
        ? ['request/response captured']
        : ['needs reproduction with captured request/response'],
      duplicateClassGuess: cls,
    };
  }
}

export class HeuristicReportDrafter implements ReportDrafter {
  draft(input: ReportDraftInput): string {
    return [
      `# ${input.title}`,
      '',
      `**Severity:** ${input.severity}  `,
      `**Class:** ${input.vulnClass}  `,
      `**Affected:** ${input.assets.join(', ') || 'n/a'}`,
      '',
      '## Summary',
      input.evidenceSummary || 'TODO: summary',
      '',
      '## Steps to reproduce',
      '1. TODO (read-only PoC — no harmful payloads).',
      '',
      '## Impact',
      'TODO: describe concrete impact grounded in what the app does.',
      '',
      '## Remediation',
      'TODO: recommended fix.',
      '',
      '## References',
      '- OWASP / CWE references TODO',
    ].join('\n');
  }
}
