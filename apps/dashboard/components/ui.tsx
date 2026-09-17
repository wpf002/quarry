import Link from 'next/link';
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
      <span className="score-num">{value == null ? '—' : `${Math.round(v * 100)}%`}</span>
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

const SEV_CLASS: Record<string, string> = {
  CRITICAL: 'pill-danger',
  HIGH: 'pill-danger',
  MEDIUM: 'pill-warn',
  LOW: 'pill-info',
  INFO: 'pill-muted',
};

export function SeverityPill({ severity }: { severity: string }) {
  return (
    <span className={`pill ${SEV_CLASS[severity] ?? 'pill-muted'}`}>
      {severity.toLowerCase()}
    </span>
  );
}

export function Meter({
  value,
  invert,
}: {
  value: number | null | undefined;
  invert?: boolean;
}) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  // invert: high is bad (dup risk) -> red; else high is good -> green
  const good = invert ? 1 - v : v;
  const color =
    good > 0.66 ? 'var(--accent)' : good > 0.33 ? 'var(--warn)' : 'var(--danger)';
  return (
    <div className="score">
      <div className="score-track">
        <div
          className="score-fill"
          style={{ width: `${v * 100}%`, background: color }}
        />
      </div>
      <span className="score-num">{value == null ? '—' : `${Math.round(v * 100)}%`}</span>
    </div>
  );
}

export function ConfidenceBand({ value }: { value: number | null | undefined }) {
  const v = value ?? 0;
  const band = v >= 0.8 ? 'HIGH' : v >= 0.5 ? 'MEDIUM' : 'LOW';
  const cls = band === 'HIGH' ? 'pill-accent' : band === 'MEDIUM' ? 'pill-warn' : 'pill-muted';
  return <span className={`pill ${cls}`}>{band}</span>;
}

export function Pager({ page, totalPages, basePath }: { page: number; totalPages: number; basePath: string }) {
  if (totalPages <= 1) return null;
  const link = (p: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="btn btn-sm" style={{ opacity: 0.4, pointerEvents: 'none' }}>{label}</span>
    ) : (
      <Link className="btn btn-sm" href={`${basePath}?page=${p}`}>{label}</Link>
    );
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
      {link(page - 1, '← Prev', page <= 1)}
      <span className="page-sub">Page {page} of {totalPages}</span>
      {link(page + 1, 'Next →', page >= totalPages)}
    </div>
  );
}
