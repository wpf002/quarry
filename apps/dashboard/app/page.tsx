import { prisma, safe } from '../lib/db';
import { Stat } from '../components/ui';

export const dynamic = 'force-dynamic';

export default async function Overview() {
  const [programs, active, findings, queued] = await Promise.all([
    safe(() => prisma.program.count(), 0),
    safe(() => prisma.program.count({ where: { active: true } }), 0),
    safe(() => prisma.finding.count(), 0),
    safe(
      () => prisma.submission.count({ where: { state: 'HELD_FOR_REVIEW' } }),
      0,
    ),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Overview</h1>
          <div className="page-sub">
            Autonomous discovery and reporting. Active scanning stays behind the
            human gate.
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <Stat label="Programs discovered" value={programs} hint="across all platforms" />
        <Stat label="Active programs" value={active} hint="human flipped on" />
        <Stat label="Findings" value={findings} hint="passive + analyzed" />
        <Stat label="Awaiting review" value={queued} hint="held, never auto-sent" />
      </div>

      <div className="callout">
        <span>◆</span>
        <div>
          <strong>Autonomy boundary.</strong> Everything up to originating an
          active packet runs unattended. Building the allowlist, approving a
          scan, and final submission are human actions, per program.
        </div>
      </div>
    </>
  );
}
