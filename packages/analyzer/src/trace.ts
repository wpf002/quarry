import { prisma } from '@quarry/db';
import { audit } from '@quarry/core';
import { detectChains } from './chains.js';

// Persist detected chains onto findings: each component finding records the
// other component ids in chainOf, so a finding "knows" what it links to.
export async function persistChains(programId: string): Promise<number> {
  const findings = await prisma.finding.findMany({
    where: { programId },
    select: { id: true, title: true, vulnClass: true, severity: true, evidence: true },
  });
  const chains = detectChains(
    findings.map((f) => ({
      id: f.id,
      title: f.title,
      vulnClass: f.vulnClass,
      severity: f.severity,
      evidence: (f.evidence ?? {}) as Record<string, unknown>,
    })),
  );

  const links = new Map<string, Set<string>>();
  for (const c of chains) {
    for (const id of c.components) {
      const set = links.get(id) ?? new Set<string>();
      for (const other of c.components) if (other !== id) set.add(other);
      links.set(id, set);
    }
  }
  for (const [id, set] of links) {
    await prisma.finding.update({ where: { id }, data: { chainOf: [...set] } });
  }
  if (chains.length > 0) {
    await audit({
      actor: 'analyzer:v1',
      action: 'chain.detected',
      programId,
      detail: { chains: chains.map((c) => ({ title: c.title, severity: c.severity, components: c.components })) },
    });
  }
  return chains.length;
}

export interface TraceStep {
  at: Date;
  actor: string;
  action: string;
  detail: Record<string, unknown>;
}

// Assemble a reproducible trace for a finding: the finding, anything it chains
// to, and the audit steps that reference it. This mirrors the "every finding is
// a complete trace" pattern the leading tools use.
export async function getFindingTrace(findingId: string) {
  const finding = await prisma.finding.findUnique({
    where: { id: findingId },
    include: { program: true, report: { include: { submission: true } } },
  });
  if (!finding) return null;

  const chained = finding.chainOf.length
    ? await prisma.finding.findMany({ where: { id: { in: finding.chainOf } } })
    : [];

  // AuditLog.detail is JSON; fetch the program's recent rows and keep those
  // that reference this finding.
  const rows = await prisma.auditLog.findMany({
    where: { programId: finding.programId },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  const steps: TraceStep[] = rows
    .filter((r) => JSON.stringify(r.detail ?? {}).includes(findingId))
    .map((r) => ({ at: r.createdAt, actor: r.actor, action: r.action, detail: (r.detail ?? {}) as Record<string, unknown> }));

  return { finding, chained, steps };
}
