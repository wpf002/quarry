export interface WindowFinding {
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  createdAt: Date;
}

export interface StrategicVerdict {
  flagged: boolean;
  lowInfoRatio: number;
  windowCount: number;
  reason?: string;
}

// If most of what we produce over a window is low/info, that's a signal to
// rethink strategy rather than grind. Default: >60% low/info over 30 days.
export function strategicReviewTrigger(
  findings: WindowFinding[],
  now: Date,
  opts: { windowDays?: number; threshold?: number; minCount?: number } = {},
): StrategicVerdict {
  const windowDays = opts.windowDays ?? 30;
  const threshold = opts.threshold ?? 0.6;
  const minCount = opts.minCount ?? 5;
  const cutoff = now.getTime() - windowDays * 86_400_000;

  const inWindow = findings.filter((f) => f.createdAt.getTime() >= cutoff);
  const lowInfo = inWindow.filter((f) => f.severity === 'LOW' || f.severity === 'INFO');
  const ratio = inWindow.length ? Number((lowInfo.length / inWindow.length).toFixed(4)) : 0;
  const flagged = inWindow.length >= minCount && ratio > threshold;

  return {
    flagged,
    lowInfoRatio: ratio,
    windowCount: inWindow.length,
    reason: flagged
      ? `${Math.round(ratio * 100)}% of ${inWindow.length} findings in ${windowDays}d were low/info`
      : undefined,
  };
}
