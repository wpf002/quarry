import { prisma } from '@quarry/db';

// Global kill switch. Halts ALL active work immediately when engaged, via env
// (fast, no DB) or an AuditLog sentinel (operator-settable at runtime).
export function envKilled(): boolean {
  const v = (process.env.QUARRY_KILL_SWITCH ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

export async function isKilled(): Promise<boolean> {
  if (envKilled()) return true;
  try {
    const latest = await prisma.auditLog.findFirst({
      where: { actor: 'operator', action: { in: ['killswitch.on', 'killswitch.off'] } },
      orderBy: { createdAt: 'desc' },
    });
    return latest?.action === 'killswitch.on';
  } catch {
    // If we cannot determine state, fail SAFE: treat as killed.
    return true;
  }
}
