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

export function priorityTier(value: number | null | undefined): 'High' | 'Medium' | 'Low' {
  const v = value ?? 0;
  return v >= 0.7 ? 'High' : v >= 0.45 ? 'Medium' : 'Low';
}

export function PriorityBar({ value }: { value: number | null | undefined }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  const tier = priorityTier(value);
  const color = tier === 'High' ? 'var(--accent)' : tier === 'Medium' ? 'var(--warn)' : 'var(--faint)';
  return (
    <div className="score">
      <div className="score-track">
        <div className="score-fill" style={{ width: `${v * 100}%`, background: color }} />
      </div>
      <span style={{ fontSize: 12, color, width: 52, textAlign: 'right' }}>{tier}</span>
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

function pageWindow(current: number, total: number): (number | '…')[] {
  const keep = new Set<number>([1, total, current - 1, current, current + 1]);
  const pages = [...keep].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of pages) {
    if (n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}

export function Pager({
  page,
  totalPages,
  basePath,
  extraQuery = '',
  total,
  pageSize,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  extraQuery?: string;
  total?: number;
  pageSize?: number;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => `${basePath}?page=${p}${extraQuery}`;
  const summary =
    total != null && pageSize != null
      ? `${((page - 1) * pageSize + 1).toLocaleString()}–${Math.min(page * pageSize, total).toLocaleString()} of ${total.toLocaleString()}`
      : `Page ${page} of ${totalPages}`;
  const arrow = (p: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="btn btn-sm btn-ghost" style={{ opacity: 0.35, pointerEvents: 'none' }}>{label}</span>
    ) : (
      <Link className="btn btn-sm btn-ghost" href={href(p)} aria-label={label === '←' ? 'Previous page' : 'Next page'}>{label}</Link>
    );
  return (
    <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <span className="page-sub">{summary}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {arrow(page - 1, '←', page <= 1)}
        {pageWindow(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} style={{ color: 'var(--faint)', padding: '0 4px' }}>…</span>
          ) : p === page ? (
            <span key={p} className="btn btn-sm btn-primary" style={{ pointerEvents: 'none', minWidth: 34, textAlign: 'center' }}>{p}</span>
          ) : (
            <Link key={p} className="btn btn-sm btn-ghost" href={href(p)} style={{ minWidth: 34, textAlign: 'center' }}>{p}</Link>
          ),
        )}
        {arrow(page + 1, '→', page >= totalPages)}
      </div>
    </nav>
  );
}

export function SortHeader({
  label, field, sort, dir, basePath, width,
}: { label: string; field: string; sort: string; dir: string; basePath: string; width?: number }) {
  const active = sort === field;
  const nextDir = active && dir === 'desc' ? 'asc' : 'desc';
  return (
    <th style={width ? { width } : undefined}>
      <Link href={`${basePath}?sort=${field}&dir=${nextDir}`} style={{ color: active ? 'var(--accent)' : 'inherit' }}>
        {label}{active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
      </Link>
    </th>
  );
}

export function StatusPill({ status }: { status: string | null | undefined }) {
  const v = (status ?? '').toLowerCase();
  if (!v) return <span className="pill pill-muted">unknown</span>;
  if (v === 'open') return <span className="pill pill-accent">open</span>;
  if (v === 'paused') return <span className="pill pill-warn">paused</span>;
  return <span className="pill pill-danger">{v}</span>;
}

export function PaysPill({ offersBounty }: { offersBounty: boolean }) {
  return offersBounty
    ? <span className="pill pill-accent">bounty</span>
    : <span className="pill pill-muted">vdp</span>;
}

export function money(amount: number | null | undefined, currency: string | null | undefined, approx = false) {
  if (!amount) return '—';
  const cur = (currency ?? 'usd').toLowerCase();
  const n = amount.toLocaleString();
  const s = cur === 'usd' ? `$${n}` : cur === 'eur' ? `€${n}` : `${n} ${cur.toUpperCase()}`;
  return approx ? `~${s}` : s;
}
