import { prisma } from '@quarry/db';

export interface AuditEntry {
  actor: string; // "parser:v3" | "human:will" | "core" | "infiltr"
  action: string; // "scope.verdict" | "scan.gate.pass" | "approval.grant"
  programId?: string | null;
  target?: string | null;
  detail: Record<string, unknown>;
}

/**
 * Write one row to the append-only AuditLog. Every scope verdict, gate
 * pass/refusal, and active action goes through here so the trail is complete.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor: entry.actor,
      action: entry.action,
      programId: entry.programId ?? null,
      target: entry.target ?? null,
      detail: entry.detail as object,
    },
  });
}
