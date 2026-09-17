'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { section: 'Autonomous' },
  { href: '/', label: 'Overview' },
  { href: '/programs', label: 'Programs' },
  { href: '/findings', label: 'Findings' },
  { href: '/queue', label: 'Report queue' },
  { section: 'Human gate' },
  { href: '/allowlist', label: 'Allowlist' },
  { href: '/approvals', label: 'Scan approvals' },
  { section: 'Trace' },
  { href: '/audit', label: 'Audit log' },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">Q</div>
        <span className="brand-name">Quarry</span>
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
