'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { section: 'Autonomous' },
  { href: '/', label: 'Overview' },
  { href: '/digest', label: 'Digest' },
  { href: '/inbox', label: 'Review inbox' },
  { href: '/programs', label: 'Programs' },
  { href: '/findings', label: 'Findings' },
  { href: '/queue', label: 'Report queue' },
  { href: '/metrics', label: 'Metrics' },
  { section: 'Human gate' },
  { href: '/allowlist', label: 'Allowlist' },
  { href: '/approvals', label: 'Scan approvals' },
  { href: '/autonomy', label: 'Autonomy (L2)' },
  { href: '/autopilot', label: 'Autopilot (L5)' },
  { section: 'Trace' },
  { href: '/audit', label: 'Audit log' },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <ellipse cx="12" cy="13" rx="5" ry="6" fill="currentColor" stroke="none" />
            <circle cx="12" cy="6" r="2.4" fill="currentColor" stroke="none" />
            <line x1="12" y1="8" x2="12" y2="19" stroke="#06140a" strokeWidth="1.3" />
            <path d="M7 10 3 7 M7 13 2.5 13 M7 16 3 19" />
            <path d="M17 10 21 7 M17 13 21.5 13 M17 16 21 19" />
            <path d="M10.3 4.6 8.8 2.8 M13.7 4.6 15.2 2.8" />
          </svg>
        </div>
        <div>
          <div className="brand-name">Quarry</div>
          <div className="brand-tag">exterminator</div>
        </div>
      </div>
      {NAV.map((n, i) =>
        'section' in n ? (
          <div key={i} className="nav-section">
            {n.section}
          </div>
        ) : (
          <Link
            key={n.href}
            href={n.href!}
            className={`nav-item${path === n.href ? ' active' : ''}`}
          >
            <span className="nav-dot" />
            {n.label}
          </Link>
        ),
      )}
      <div style={{ flex: 1 }} />
      <div className="tag" style={{ alignSelf: 'flex-start' }}>
        passive-safe
      </div>
    </aside>
  );
}
