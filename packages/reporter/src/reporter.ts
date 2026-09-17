import { prisma, type Platform } from '@quarry/db';
import { audit } from '@quarry/core';
import {
  HeuristicReportDrafter,
  type ReportDrafter,
} from '@quarry/ai';
import { formatForPlatform, type ReportableFinding } from './formatters.js';

export interface DraftInput {
  title: string;
  vulnClass: string;
  severity: string;
  assets: string[];
  evidenceSummary: string;
  cvss?: string;
  cwe?: string;
}

// Draft a platform-ready report. Pure: AI seam writes the body, the formatter
// applies house style. No persistence, no submission.
export function draftReport(
  input: DraftInput,
  platform: Platform,
  drafter: ReportDrafter = new HeuristicReportDrafter(),
): string {
  const bodyMarkdown = drafter.draft({
    title: input.title,
    vulnClass: input.vulnClass,
    severity: input.severity,
    assets: input.assets,
    evidenceSummary: input.evidenceSummary,
  });
  const reportable: ReportableFinding = {
    title: input.title,
    vulnClass: input.vulnClass,
    severity: input.severity,
    assets: input.assets,
    bodyMarkdown,
    cvss: input.cvss,
    cwe: input.cwe,
  };
  return formatForPlatform(reportable, platform);
}

// Draft a report for a stored finding and queue it. It ALWAYS lands
// HELD_FOR_REVIEW. Nothing auto-submits, ever. Returns the submission id.
export async function draftAndQueue(
  findingId: string,
  drafter: ReportDrafter = new HeuristicReportDrafter(),
): Promise<string> {
  const finding = await prisma.finding.findUniqueOrThrow({
    where: { id: findingId },
    include: { program: true },
  });

  const evidence = finding.evidence as Record<string, unknown>;
  const assets = Array.isArray((evidence as any)?.assets)
    ? ((evidence as any).assets as string[])
    : typeof (evidence as any)?.url === 'string'
      ? [(evidence as any).url as string]
      : [];

  const markdown = draftReport(
    {
      title: finding.title,
      vulnClass: finding.vulnClass,
      severity: finding.severity,
      assets,
      evidenceSummary:
        typeof (evidence as any)?.snippet === 'string'
          ? ((evidence as any).snippet as string)
          : finding.title,
    },
    finding.program.platform,
    drafter,
  );

  const report = await prisma.report.upsert({
    where: { findingId },
    create: { findingId, markdown },
    update: { markdown },
  });

  const submission = await prisma.submission.upsert({
    where: { reportId: report.id },
    create: { reportId: report.id, state: 'HELD_FOR_REVIEW' },
    // Never downgrade a human-advanced state back to held.
    update: {},
  });

  await audit({
    actor: 'reporter:v1',
    action: 'report.queued',
    programId: finding.programId,
    detail: { findingId, submissionId: submission.id, state: 'HELD_FOR_REVIEW' },
  });

  return submission.id;
}
