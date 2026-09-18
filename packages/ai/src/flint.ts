// Flint — the LLM analysis copilot. Given a finding, it judges real-vs-noise,
// assesses exploitability, suggests concrete validation steps, and drafts a
// report. It is a COPILOT: a human confirms and submits. When ANTHROPIC_API_KEY
// is set it uses Claude; otherwise it returns a structured heuristic (still
// useful) so the seam works with or without a key.

export interface FindingLike {
  title: string;
  vulnClass: string;
  severity: string;
  confidence: number;
  target?: string | null;
  program?: string | null;
  evidence?: Record<string, unknown> | null;
}

export interface FlintAnalysis {
  verdict: 'likely-real' | 'likely-noise' | 'uncertain';
  confidence: number; // Flint's own 0..1
  reasoning: string;
  exploitability: string;
  nextSteps: string[];
  reportDraft: string;
  model: string;
}

const PAYABLE = new Set([
  'sqli', 'sql-injection', 'ssrf', 'idor', 'rce', 'command-injection', 'xss',
  'subdomain-takeover', 'secret-exposure', 'sensitive-file-exposure', 'git-exposure',
  'exposed-api-docs', 'exposed-api-key', 'cors-misconfiguration', 'open-redirect',
  'auth-bypass', 'ssti', 'xxe', 'lfi', 'deserialization', 'graphql-introspection',
  'jwt-weakness', 'public-bucket',
]);
const NOISE = new Set([
  'missing-security-header', 'discovered-endpoint', 'tech-fingerprint', 'info-header',
  'http-status', 'page-title', 'ip', 'weak-tls-protocol', 'tls-issue', 'open-port',
  'waf-detected', 'js-library', 'scan-note', 'banner', 'os-fingerprint',
]);

function buildPrompt(f: FindingLike): string {
  return [
    'You are a senior bug-bounty triager. Assess ONE scanner finding.',
    'Be skeptical: most scanner output is informational or a false positive. Only genuinely',
    'exploitable, in-scope, non-duplicate issues pay.',
    '',
    `Finding: ${f.title}`,
    `Class: ${f.vulnClass}  Severity: ${f.severity}  Scanner confidence: ${f.confidence}`,
    `Target: ${f.target ?? 'n/a'}  Program: ${f.program ?? 'n/a'}`,
    `Evidence: ${JSON.stringify(f.evidence ?? {}, null, 0).slice(0, 4000)}`,
    '',
    'Return ONLY JSON: {"verdict":"likely-real|likely-noise|uncertain","confidence":0..1,',
    '"reasoning":"...","exploitability":"...","nextSteps":["..."],"reportDraft":"..."}',
    'reportDraft: a concise, reproducible bug-bounty report (summary, steps, impact).',
  ].join('\n');
}

async function callClaude(f: FindingLike, key: string): Promise<FlintAnalysis | null> {
  const model = process.env.FLINT_MODEL || 'claude-sonnet-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'user', content: buildPrompt(f) }] }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const data = (await res.json().catch(() => null)) as { content?: Array<{ text?: string }> } | null;
  const text = data?.content?.map((c) => c.text ?? '').join('') ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Partial<FlintAnalysis>;
    return {
      verdict: (j.verdict as FlintAnalysis['verdict']) ?? 'uncertain',
      confidence: typeof j.confidence === 'number' ? j.confidence : 0.5,
      reasoning: j.reasoning ?? text.slice(0, 800),
      exploitability: j.exploitability ?? '',
      nextSteps: Array.isArray(j.nextSteps) ? j.nextSteps : [],
      reportDraft: j.reportDraft ?? '',
      model,
    };
  } catch {
    return { verdict: 'uncertain', confidence: 0.5, reasoning: text.slice(0, 800), exploitability: '', nextSteps: [], reportDraft: '', model };
  }
}

function heuristic(f: FindingLike): FlintAnalysis {
  const cls = f.vulnClass.toLowerCase();
  const payable = PAYABLE.has(cls) || cls.startsWith('cve');
  const noise = NOISE.has(cls);
  const verdict: FlintAnalysis['verdict'] = noise ? 'likely-noise' : payable && f.confidence >= 0.7 ? 'likely-real' : 'uncertain';
  const nextSteps = noise
    ? ['Deprioritize — this class is almost never paid. Confirm the program explicitly rewards it before spending time.']
    : [
        `Manually reproduce ${f.vulnClass} on ${f.target ?? 'the target'} and capture the exact request/response.`,
        'Confirm the target is in the program scope and the class is in-scope (not excluded).',
        'Search the program for a duplicate before writing it up.',
        'Assess real impact (what an attacker gains) — that drives the payout tier.',
      ];
  return {
    verdict,
    confidence: noise ? 0.85 : payable ? Math.min(0.9, f.confidence) : 0.5,
    reasoning: noise
      ? `${f.vulnClass} is informational; programs rarely pay for it.`
      : payable
        ? `${f.vulnClass} is a payable class; scanner confidence ${f.confidence}. Needs manual confirmation of exploitability and scope.`
        : `${f.vulnClass} may be payable depending on impact and scope; verify manually.`,
    exploitability: payable ? 'Potentially exploitable — confirm by hand before reporting.' : 'Low — likely informational.',
    nextSteps,
    reportDraft: payable
      ? `# ${f.title}\n\n## Summary\n${f.vulnClass} on ${f.target ?? 'target'}.\n\n## Steps to reproduce\n1. …\n\n## Impact\n…\n\n## Evidence\n${JSON.stringify(f.evidence ?? {}, null, 2).slice(0, 1500)}`
      : '',
    model: 'heuristic (no ANTHROPIC_API_KEY set)',
  };
}

export async function analyzeFinding(f: FindingLike): Promise<FlintAnalysis> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    const llm = await callClaude(f, key);
    if (llm) return llm;
  }
  return heuristic(f);
}
