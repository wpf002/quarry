import type { ReactNode } from 'react';

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function ScoreBar({ value }: { value: number | null | undefined }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div className="score">
      <div className="score-track">
        <div className="score-fill" style={{ width: `${v * 100}%` }} />
      </div>
      <span className="score-num">{value == null ? '—' : v.toFixed(2)}</span>
    </div>
  );
}

const PLATFORM_CLASS: Record<string, string> = {
  HACKERONE: 'pill-accent',
  BUGCROWD: 'pill-warn',
  INTIGRITI: 'pill-info',
  YESWEHACK: 'pill-info',
  SELF_HOSTED: 'pill-muted',
};

export function PlatformPill({ platform }: { platform: string }) {
  return (
    <span className={`pill ${PLATFORM_CLASS[platform] ?? 'pill-muted'}`}>
      {platform.toLowerCase().replace('_', ' ')}
    </span>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <div className="empty">
        <div className="empty-icon">◇</div>
        <h3>{title}</h3>
        <div>{children}</div>
      </div>
    </div>
  );
}
