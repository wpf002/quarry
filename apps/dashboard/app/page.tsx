// Placeholder home for the human-gate dashboard.
//
// This is a static shell. Live data wiring (ranked program list, ambiguity
// clearing, allowlist builder, one-click Approve scan) is Phase 1 / Phase 4 —
// it reads from Postgres via @quarry/db and is intentionally NOT built yet.
// The autonomy boundary below is the product's whole point.

const GATED = [
  ['Allowlist construction', 'Confirm real in-scope assets, by hand.'],
  ['Active scan approval', 'One click, per program, expiring.'],
  ['Final submission', 'No report leaves unread. Nothing auto-submits.'],
];

const AUTONOMOUS = [
  'Program discovery',
  'Policy parsing → structured scope + confidence + ambiguity flags',
  'Program scoring / ranking',
  'Passive recon (CT logs, passive DNS, public source, security.txt)',
  'Triage, chain detection, impact, duplicate risk',
  'Report drafting, contact resolution, submission queueing',
];

export default function Home() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Quarry</h1>
      <p style={{ color: '#9aa4b2', marginTop: 0 }}>
        Autonomous bug-bounty engine. Everything runs unattended up to the point
        where it would send an active packet at someone else&apos;s system —
        that step, and final submission, stay with a human.
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', color: '#7ee787' }}>Autonomous</h2>
        <ul style={{ lineHeight: 1.7 }}>
          {AUTONOMOUS.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', color: '#ff7b72' }}>
          Human-gated (this dashboard&apos;s job)
        </h2>
        <ul style={{ lineHeight: 1.7, listStyle: 'none', paddingLeft: 0 }}>
          {GATED.map(([title, desc]) => (
            <li key={title} style={{ marginBottom: '0.5rem' }}>
              <strong>{title}</strong>
              <span style={{ color: '#9aa4b2' }}> — {desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <p style={{ marginTop: '2rem', color: '#6b7280', fontSize: '0.85rem' }}>
        Scaffold state: safety gate (assertActiveScanAllowed) is implemented and
        tested. Data-backed views land in Phase&nbsp;1 / Phase&nbsp;4.
      </p>
    </main>
  );
}
