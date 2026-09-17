import { prisma } from '@quarry/db';
import { audit } from '@quarry/core';
import { scoreProgram } from './scorer.js';

// Per-program enrichment: fetch the REAL scope from each platform's detail
// endpoint and turn it into structured in/out-of-scope + a score. This is what
// makes allowlist proposals and campaigns actionable.

export interface EnrichedScope {
  policyRaw: string;
  inScope: string[];
  outOfScope: string[];
  wildcardFlags: string[];
}

const HOST_ASSET_TYPES = new Set(['URL', 'WILDCARD', 'DOMAIN', 'IP_ADDRESS', 'CIDR', 'API']);

function arr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}
function wildcardFlag(id: string): string {
  return `wildcard ${id} needs human confirmation`;
}

// HackerOne: /hackers/programs/{handle}/structured_scopes
export function buildH1Scope(structuredScopes: unknown): EnrichedScope {
  const rows = arr((structuredScopes as any)?.data);
  const inScope: string[] = [];
  const outOfScope: string[] = [];
  const wildcardFlags: string[] = [];
  for (const r of rows) {
    const a = r?.attributes ?? {};
    if (!HOST_ASSET_TYPES.has(a.asset_type)) continue; // skip SOURCE_CODE, OTHER, etc.
    const id = String(a.asset_identifier ?? '').trim();
    if (!id) continue;
    if (a.eligible_for_submission) {
      inScope.push(id);
      if (id.includes('*')) wildcardFlags.push(wildcardFlag(id));
    } else {
      outOfScope.push(id);
    }
  }
  return { policyRaw: synthPolicy(inScope, outOfScope), inScope, outOfScope, wildcardFlags };
}

// Intigriti: /external/researcher/v1/programs/{id} -> domains.content[]
export function buildIntigritiScope(detail: unknown): EnrichedScope {
  const rows = arr((detail as any)?.domains?.content);
  const inScope: string[] = [];
  const outOfScope: string[] = [];
  const wildcardFlags: string[] = [];
  for (const c of rows) {
    const endpoint = String(c?.endpoint ?? '').trim();
    if (!endpoint) continue;
    const tier = String(c?.tier?.value ?? '').toLowerCase();
    if (tier.includes('out of scope')) {
      outOfScope.push(endpoint);
    } else {
      inScope.push(endpoint);
      if (endpoint.includes('*')) wildcardFlags.push(wildcardFlag(endpoint));
    }
  }
  return { policyRaw: synthPolicy(inScope, outOfScope), inScope, outOfScope, wildcardFlags };
}

function synthPolicy(inScope: string[], outOfScope: string[]): string {
  const parts = [];
  if (inScope.length) parts.push('In scope:\n' + inScope.join('\n'));
  if (outOfScope.length) parts.push('Out of scope:\n' + outOfScope.join('\n'));
  return parts.join('\n\n');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Json = (url: string, headers: Record<string, string>) => Promise<any>;
const defaultJson: Json = async (url, headers) => {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

// Enrich programs that only have list-level data (low parseConfidence). Fetches
// each program's real scope, updates parsedScope + score, and audits. Rate
// limited to be polite to the platform APIs.
export async function enrichAndPersist(
  opts: { limit?: number; delayMs?: number; json?: Json } = {},
): Promise<{ enriched: number; skipped: number; errors: number; errorSample: string[] }> {
  const limit = opts.limit ?? 1000;
  const delayMs = opts.delayMs ?? 200;
  const json = opts.json ?? defaultJson;

  const h1User = process.env.HACKERONE_API_USERNAME ?? '';
  const h1Token = process.env.HACKERONE_API_TOKEN ?? '';
  const h1Headers = h1User && h1Token
    ? { Authorization: `Basic ${Buffer.from(`${h1User}:${h1Token}`).toString('base64')}`, Accept: 'application/json' }
    : null;
  const itToken = process.env.INTIGRITI_API_TOKEN ?? '';
  const itHeaders = itToken ? { Authorization: `Bearer ${itToken}`, Accept: 'application/json' } : null;

  // Intigriti detail needs the program's GUID; build a handle -> id map once.
  const itMap = new Map<string, string>();
  if (itHeaders) {
    try {
      const list = await json('https://api.intigriti.com/external/researcher/v1/programs?limit=500', itHeaders);
      for (const r of arr(list?.records)) if (r?.handle && r?.id) itMap.set(r.handle, r.id);
    } catch {
      /* leave map empty */
    }
  }

  const programs = await prisma.program.findMany({
    where: { parseConfidence: { lt: 0.9 }, platform: { in: ['HACKERONE', 'INTIGRITI'] } },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });

  let enriched = 0, skipped = 0, errors = 0;
  const errorCounts = new Map<string, number>();
  for (const p of programs) {
    try {
      let scope: EnrichedScope | null = null;
      if (p.platform === 'HACKERONE' && h1Headers) {
        scope = buildH1Scope(await json(`https://api.hackerone.com/v1/hackers/programs/${p.handle}/structured_scopes`, h1Headers));
      } else if (p.platform === 'INTIGRITI' && itHeaders) {
        const id = itMap.get(p.handle);
        if (id) scope = buildIntigritiScope(await json(`https://api.intigriti.com/external/researcher/v1/programs/${id}`, itHeaders));
      }
      if (!scope) { skipped++; continue; }

      const parsedScope = {
        inScope: scope.inScope,
        outOfScope: scope.outOfScope,
        prohibited: [],
        rewardsBySeverity: {},
        preferredVulnTypes: [],
        unusualRules: [],
      };
      const score = scoreProgram({
        maxBountyUsd: p.maxBountyUsd ?? undefined,
        inScopeCount: scope.inScope.length,
        parseConfidence: 0.9,
        ambiguityCount: scope.wildcardFlags.length,
        hasWideScope: scope.wildcardFlags.length > 0,
      });
      await prisma.program.update({
        where: { id: p.id },
        data: {
          policyRaw: scope.policyRaw,
          parsedScope: parsedScope as object,
          parseConfidence: 0.9,
          ambiguityFlags: scope.wildcardFlags,
          score: score.total,
        },
      });
      await audit({
        actor: 'enrich:v1',
        action: 'scope.enrich',
        programId: p.id,
        detail: { inScope: scope.inScope.length, outOfScope: scope.outOfScope.length, wildcards: scope.wildcardFlags.length },
      });
      enriched++;
    } catch (e) {
      errors++;
      const msg = (e as Error).message || 'unknown';
      errorCounts.set(msg, (errorCounts.get(msg) ?? 0) + 1);
      // Rate limited: back off hard so we stop burning the quota.
      if (msg.includes('429')) await sleep(5000);
    }
    await sleep(delayMs);
  }
  const errorSample = [...errorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([m, n]) => `${m} x${n}`);
  return { enriched, skipped, errors, errorSample };
}
