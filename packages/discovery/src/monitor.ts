import { prisma } from '@quarry/db';

// Continuous change-monitoring. For each active program's apex domains, query
// certificate-transparency logs (crt.sh) for subdomains and store any NEW ones
// as CT_LOG assets. These are PROPOSALS — a human still verifies each before it
// can be scanned; monitoring never expands what gets scanned on its own.

const CRT = (q: string) => `https://crt.sh/?q=${encodeURIComponent(q)}&output=json`;

export function apexesFrom(scope: unknown): string[] {
  const inScope = (scope as { inScope?: string[] } | null)?.inScope ?? [];
  const apexes = new Set<string>();
  for (const raw of inScope) {
    const host = String(raw).toLowerCase().replace(/^https?:\/\//, '').replace(/^\*\./, '').split('/')[0] ?? '';
    const v = host.split(':')[0] ?? '';
    if (!v || !/^[a-z0-9.-]+$/.test(v)) continue;
    const parts = v.split('.').filter(Boolean);
    if (parts.length >= 2) apexes.add(parts.slice(-2).join('.'));
  }
  return [...apexes];
}

async function crtSubdomains(apex: string, timeoutMs = 20_000): Promise<string[]> {
  const res = await fetch(CRT(`%.${apex}`), { signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
  if (!res || !res.ok) return [];
  const rows = (await res.json().catch(() => [])) as Array<{ name_value?: string }>;
  const hosts = new Set<string>();
  for (const r of rows) {
    for (const n of String(r.name_value ?? '').split('\n')) {
      const h = n.trim().toLowerCase();
      if (h && !h.startsWith('*') && h.endsWith('.' + apex) && /^[a-z0-9.-]+$/.test(h)) hosts.add(h);
    }
  }
  return [...hosts];
}

// Sweep a batch of active programs. Returns how many new subdomains were found.
export async function monitorSubdomains(opts: { limit?: number; apexesPerProgram?: number } = {}): Promise<{ programs: number; added: number }> {
  const programs = await prisma.program.findMany({
    where: { active: true },
    select: { id: true, parsedScope: true },
    orderBy: { updatedAt: 'desc' },
    take: opts.limit ?? 8,
  });
  let added = 0;
  for (const p of programs) {
    const existing = new Set(
      (await prisma.asset.findMany({ where: { programId: p.id }, select: { value: true } })).map((a) => a.value),
    );
    for (const apex of apexesFrom(p.parsedScope).slice(0, opts.apexesPerProgram ?? 3)) {
      const subs = await crtSubdomains(apex);
      const fresh = subs.filter((h) => !existing.has(h)).slice(0, 300);
      if (fresh.length > 0) {
        await prisma.asset.createMany({
          data: fresh.map((value) => ({
            programId: p.id, value, verdict: 'OUT_OF_SCOPE' as const, verdictBy: 'monitor:ct', source: 'CT_LOG' as const,
          })),
          skipDuplicates: true,
        });
        fresh.forEach((h) => existing.add(h));
        added += fresh.length;
      }
    }
  }
  return { programs: programs.length, added };
}
