// L4 daily digest. One read that tells you what the autonomous side did and
// what needs your sign-off. Pure: assembled from data the caller loads.

export interface DigestInput {
  newTopPrograms: Array<{ handle: string; score: number }>;
  proposalsByProgram: Array<{ handle: string; count: number }>;
  queuedReports: number;
  autoSubmittedToday: number;
  pausedAuths: Array<{ handle: string; reason: string }>;
  revenueUsd: number;
}

export interface Digest extends DigestInput {
  headline: string;
  needsYou: number; // count of things awaiting a human
}

export function buildDigest(input: DigestInput): Digest {
  const needsYou =
    input.proposalsByProgram.reduce((n, p) => n + (p.count > 0 ? 1 : 0), 0) +
    input.queuedReports +
    input.pausedAuths.length;
  const headline =
    needsYou === 0
      ? 'All clear — nothing needs your sign-off.'
      : `${needsYou} item(s) need you: ${input.proposalsByProgram.filter((p) => p.count > 0).length} allowlist(s) to confirm, ${input.queuedReports} report(s) to review, ${input.pausedAuths.length} paused auth(s).`;
  return { ...input, headline, needsYou };
}

export function digestMarkdown(d: Digest): string {
  const lines = [`# Quarry digest`, '', `**${d.headline}**`, ''];
  if (d.newTopPrograms.length) {
    lines.push('## New top programs');
    for (const p of d.newTopPrograms) lines.push(`- ${p.handle} — score ${p.score.toFixed(2)}`);
    lines.push('');
  }
  if (d.proposalsByProgram.some((p) => p.count > 0)) {
    lines.push('## Allowlists awaiting your sign-off');
    for (const p of d.proposalsByProgram.filter((x) => x.count > 0)) lines.push(`- ${p.handle} — ${p.count} proposed`);
    lines.push('');
  }
  if (d.pausedAuths.length) {
    lines.push('## Paused authorizations');
    for (const a of d.pausedAuths) lines.push(`- ${a.handle} — ${a.reason}`);
    lines.push('');
  }
  lines.push(`Reports in review: ${d.queuedReports} · auto-submitted today: ${d.autoSubmittedToday} · revenue: $${d.revenueUsd.toLocaleString()}`);
  return lines.join('\n');
}
