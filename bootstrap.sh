#!/usr/bin/env bash
#
# Quarry — infrastructure bootstrap
# Run once in an empty directory. Produces a working pnpm/Turborepo skeleton.
#
# Autonomy boundary (enforced in code, not convention):
#   Autonomous, unattended:  discovery, policy parsing, scoring, passive recon,
#                            analysis, report drafting, submission queueing.
#   Human-gated, per program: active scanning + submission. A scan run cannot
#                            originate traffic unless a valid, unexpired
#                            ScanApproval exists for a hand-verified Allowlist.
#
set -euo pipefail

ROOT="quarry"
if [ -e "$ROOT" ]; then
  echo "refusing to run: ./$ROOT already exists" >&2
  exit 1
fi

echo "==> scaffolding $ROOT"
mkdir -p "$ROOT"
cd "$ROOT"

# ---------------------------------------------------------------------------
# workspace roots
# ---------------------------------------------------------------------------
mkdir -p \
  apps/dashboard \
  apps/api/src/routes \
  worker/src \
  packages/db/prisma \
  packages/db/src \
  packages/core/src \
  packages/ai/src \
  packages/discovery/src \
  packages/recon-passive/src \
  packages/recon-active/src \
  packages/analyzer/src \
  packages/reporter/src

# ---------------------------------------------------------------------------
# root package.json / workspace / turbo
# ---------------------------------------------------------------------------
cat > package.json <<'JSON'
{
  "name": "quarry",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "db:generate": "pnpm --filter @quarry/db generate",
    "db:migrate": "pnpm --filter @quarry/db migrate",
    "worker": "pnpm --filter @quarry/worker dev"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "prettier": "^3.3.0"
  }
}
JSON

cat > pnpm-workspace.yaml <<'YAML'
packages:
  - "apps/*"
  - "packages/*"
  - "worker"
YAML

cat > turbo.json <<'JSON'
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] }
  }
}
JSON

cat > tsconfig.base.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": true
  }
}
JSON

cat > .gitignore <<'GIT'
node_modules/
dist/
.next/
.turbo/
.env
*.log
packages/db/prisma/*.db
GIT

cat > .prettierrc <<'JSON'
{ "singleQuote": true, "semi": true, "trailingComma": "all" }
JSON

# ---------------------------------------------------------------------------
# env template — no secrets committed, only shape
# ---------------------------------------------------------------------------
cat > .env.example <<'ENV'
# --- infra ---
DATABASE_URL="postgresql://quarry:quarry@localhost:5432/quarry?schema=public"
REDIS_URL="redis://localhost:6379"

# --- AI seam (routes through Flint; do not call model vendors directly) ---
FLINT_BASE_URL="http://localhost:8080"
FLINT_API_KEY=""

# --- bounty platform API creds (read-only discovery use) ---
HACKERONE_API_USERNAME=""
HACKERONE_API_TOKEN=""
BUGCROWD_API_TOKEN=""
INTIGRITI_API_TOKEN=""

# --- Infiltr: the ONLY component that runs active scans ---
# recon-active delegates here; it never execs pentest binaries itself.
INFILTR_BASE_URL="http://localhost:9090"
INFILTR_API_KEY=""

# --- gate config ---
# Active scanning is refused unless a ScanApproval row is valid AND unexpired.
SCAN_APPROVAL_TTL_HOURS="24"
MAX_CONCURRENT_ACTIVE_TARGETS="5"
ENV

# ---------------------------------------------------------------------------
# packages/db — Prisma. This schema IS the safety model.
# ---------------------------------------------------------------------------
cat > packages/db/package.json <<'JSON'
{
  "name": "@quarry/db",
  "version": "0.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "generate": "prisma generate",
    "migrate": "prisma migrate dev",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "@prisma/client": "^5.20.0" },
  "devDependencies": { "prisma": "^5.20.0", "typescript": "^5.6.0" }
}
JSON

cat > packages/db/tsconfig.json <<'JSON'
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
JSON

cat > packages/db/src/index.ts <<'TS'
export * from '@prisma/client';
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
TS

cat > packages/db/prisma/schema.prisma <<'PRISMA'
// Quarry data model.
// The tables that carry legal weight are Allowlist, ScanApproval, and AuditLog.
// If those are wrong, nothing else matters; treat changes to them as reviewed.

generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Platform { HACKERONE BUGCROWD INTIGRITI YESWEHACK SELF_HOSTED }
enum ScopeVerdict { IN_SCOPE OUT_OF_SCOPE AMBIGUOUS }
enum ReconSource { CT_LOG PASSIVE_DNS PUBLIC_SOURCE SECURITY_TXT PROXIED_SELF ACTIVE_SCAN }
enum Severity { INFO LOW MEDIUM HIGH CRITICAL }
enum ApprovalState { PENDING APPROVED REJECTED EXPIRED CONSUMED }
enum SubmissionState { QUEUED HELD_FOR_REVIEW SUBMITTED TRIAGED RESOLVED DUPLICATE OUT_OF_SCOPE INFORMATIVE }

model Program {
  id              String   @id @default(cuid())
  platform        Platform
  handle          String                          // e.g. "acme" on hackerone
  name            String
  policyRaw       String   @db.Text               // captured policy text
  // structured scope emitted by the LLM parser — advisory only.
  // it never authorizes an active scan on its own; see Allowlist.
  parsedScope     Json
  parseConfidence Float                           // 0..1 from the parser
  ambiguityFlags  String[]                        // human must clear these
  maxBountyUsd    Int?
  score           Float?                          // ProgramScorer output
  active          Boolean  @default(false)        // human flipped it on
  assets          Asset[]
  allowlist       Allowlist[]
  approvals       ScanApproval[]
  findings        Finding[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([platform, handle])
}

// Every asset the autonomous side discovers. Default verdict is OUT_OF_SCOPE.
// Discovery may only write PASSIVE sources; ACTIVE_SCAN rows come from Infiltr
// after a gate check.
model Asset {
  id         String       @id @default(cuid())
  program    Program      @relation(fields: [programId], references: [id])
  programId  String
  value      String                               // domain / host / url
  verdict    ScopeVerdict @default(OUT_OF_SCOPE)
  verdictBy  String                               // "parser:v3" or "human:will"
  source     ReconSource
  meta       Json?
  createdAt  DateTime     @default(now())
  @@unique([programId, value])
}

// The hard gate. A human builds this by hand from confirmed-in-scope assets.
// Active scanning may touch a target ONLY if it matches a live Allowlist entry.
// This is a whitelist, never a blacklist. No wildcards without an explicit flag.
model Allowlist {
  id             String        @id @default(cuid())
  program        Program       @relation(fields: [programId], references: [id])
  programId      String
  pattern        String                            // exact host/CIDR/url-prefix
  allowWildcard  Boolean       @default(false)
  addedBy        String                            // human identity, required
  note           String?
  active         Boolean       @default(true)
  createdAt      DateTime      @default(now())
  approvals      ScanApproval[]
  @@unique([programId, pattern])
}

// The per-program one-click authorization. This row is what makes an active
// scan legal. It pins the exact allowlist version, the human, and an expiry.
// recon-active refuses to run without a matching APPROVED, unexpired row.
model ScanApproval {
  id            String        @id @default(cuid())
  program       Program       @relation(fields: [programId], references: [id])
  programId     String
  allowlist     Allowlist     @relation(fields: [allowlistId], references: [id])
  allowlistId   String
  state         ApprovalState @default(PENDING)
  approvedBy    String?                            // set on APPROVED
  approvedAt    DateTime?
  expiresAt     DateTime?
  scanProfile   Json                               // which tiers/tools permitted
  consumedRunId String?                            // links to the run it authorized
  createdAt     DateTime      @default(now())
}

model Finding {
  id            String    @id @default(cuid())
  program       Program   @relation(fields: [programId], references: [id])
  programId     String
  title         String
  vulnClass     String
  severity      Severity
  confidence    Float                              // triage true-positive %
  dupRisk       Float                              // 0..1 from dup assessor
  evidence      Json                               // request/response, artifacts
  chainOf       String[]                           // component finding ids
  humanConfirmed Boolean  @default(false)
  report        Report?
  createdAt     DateTime  @default(now())
}

model Report {
  id           String          @id @default(cuid())
  finding      Finding         @relation(fields: [findingId], references: [id])
  findingId    String          @unique
  markdown     String          @db.Text
  submission   Submission?
  createdAt    DateTime        @default(now())
}

model Submission {
  id         String          @id @default(cuid())
  report     Report          @relation(fields: [reportId], references: [id])
  reportId   String          @unique
  state      SubmissionState @default(QUEUED)
  platformRef String?                              // id returned by platform
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt
}

// Append-only trail. Every scope verdict and every active action lands here.
// Never updated, never deleted in normal operation.
model AuditLog {
  id        String   @id @default(cuid())
  actor     String                                 // "parser:v3" | "human:will" | "infiltr"
  action    String                                 // "scope.verdict" | "scan.run" | "approval.grant"
  programId String?
  target    String?
  detail    Json
  createdAt DateTime @default(now())
  @@index([programId])
  @@index([createdAt])
}
PRISMA

# ---------------------------------------------------------------------------
# packages/core — shared types + the enforcement gate (stub, real logic later)
# ---------------------------------------------------------------------------
cat > packages/core/package.json <<'JSON'
{
  "name": "@quarry/core",
  "version": "0.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc", "typecheck": "tsc --noEmit" },
  "dependencies": { "@quarry/db": "workspace:*" },
  "devDependencies": { "typescript": "^5.6.0" }
}
JSON
cat > packages/core/tsconfig.json <<'JSON'
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
JSON
cat > packages/core/src/index.ts <<'TS'
export * from './scope-enforcer.js';
TS
cat > packages/core/src/scope-enforcer.ts <<'TS'
import { prisma } from '@quarry/db';

/**
 * The single choke point for anything that would originate active traffic.
 * recon-active MUST call assertActiveScanAllowed() before every target.
 * Fails closed: ambiguity, missing approval, or expiry all return refusal.
 */
export async function assertActiveScanAllowed(
  programId: string,
  target: string,
): Promise<void> {
  const entry = await prisma.allowlist.findFirst({
    where: { programId, active: true },
    // NOTE: real matcher must do exact host / CIDR / url-prefix matching,
    // with wildcard only when allowWildcard is true. Substring match is a bug.
  });
  if (!entry || !matches(entry.pattern, target, entry.allowWildcard)) {
    throw new ScopeRefusal(`target not on live allowlist: ${target}`);
  }

  const approval = await prisma.scanApproval.findFirst({
    where: { programId, state: 'APPROVED', allowlistId: entry.id },
    orderBy: { approvedAt: 'desc' },
  });
  if (!approval) throw new ScopeRefusal('no APPROVED scan approval');
  if (approval.expiresAt && approval.expiresAt < new Date()) {
    throw new ScopeRefusal('scan approval expired');
  }

  await prisma.auditLog.create({
    data: { actor: 'core', action: 'scan.gate.pass', programId, target,
      detail: { allowlistId: entry.id, approvalId: approval.id } },
  });
}

export class ScopeRefusal extends Error {}

// placeholder — replace with real exact/CIDR/prefix matcher before B goes live
function matches(_pattern: string, _target: string, _wildcard: boolean): boolean {
  return false; // fails closed by default until implemented
}
TS

# ---------------------------------------------------------------------------
# remaining packages — thin stubs so the graph builds
# ---------------------------------------------------------------------------
make_pkg () {
  local name="$1"; local dir="$2"; local desc="$3"
  cat > "packages/$dir/package.json" <<JSON
{
  "name": "@quarry/$name",
  "version": "0.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc", "typecheck": "tsc --noEmit" },
  "dependencies": { "@quarry/core": "workspace:*", "@quarry/db": "workspace:*" },
  "devDependencies": { "typescript": "^5.6.0" }
}
JSON
  cat > "packages/$dir/tsconfig.json" <<'JSON'
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
JSON
  cat > "packages/$dir/src/index.ts" <<TS
// @quarry/$name — $desc
export const PACKAGE = '$name';
TS
}

make_pkg "ai"            "ai"            "Flint seam wrapper: policy parsing, triage, report drafting"
make_pkg "discovery"    "discovery"    "AUTONOMOUS: find + parse + score bounty programs"
make_pkg "recon-passive" "recon-passive" "AUTONOMOUS: CT logs, passive DNS, security.txt, public only"
make_pkg "recon-active" "recon-active" "GATED: delegates active scans to Infiltr behind assertActiveScanAllowed"
make_pkg "analyzer"     "analyzer"     "AUTONOMOUS: triage, chain detection, impact, dup risk"
make_pkg "reporter"     "reporter"     "AUTONOMOUS: report + contact finding + submission queue"

# ---------------------------------------------------------------------------
# apps/api — Fastify orchestrator
# ---------------------------------------------------------------------------
cat > apps/api/package.json <<'JSON'
{
  "name": "@quarry/api",
  "version": "0.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@quarry/core": "workspace:*",
    "@quarry/db": "workspace:*",
    "@quarry/discovery": "workspace:*",
    "@quarry/reporter": "workspace:*"
  },
  "devDependencies": { "typescript": "^5.6.0", "tsx": "^4.19.0" }
}
JSON
cat > apps/api/tsconfig.json <<'JSON'
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
JSON
cat > apps/api/src/index.ts <<'TS'
import Fastify from 'fastify';
const app = Fastify({ logger: true });

app.get('/health', async () => ({ ok: true }));

// The gate endpoint the dashboard hits on the one-click approval.
// It records a ScanApproval; it does NOT itself start a scan.
app.post('/programs/:id/approve-scan', async (req, reply) => {
  // TODO: validate allowlist is non-empty, ambiguityFlags cleared,
  // write ScanApproval{ state: APPROVED, approvedBy, expiresAt }, audit it.
  return reply.code(501).send({ todo: 'approval handler' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen({ port }).catch((e) => { app.log.error(e); process.exit(1); });
TS

# ---------------------------------------------------------------------------
# worker — the autonomous loop
# ---------------------------------------------------------------------------
cat > worker/package.json <<'JSON'
{
  "name": "@quarry/worker",
  "version": "0.0.0",
  "scripts": { "dev": "tsx watch src/index.ts", "build": "tsc", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "bullmq": "^5.13.0",
    "@quarry/core": "workspace:*",
    "@quarry/db": "workspace:*",
    "@quarry/discovery": "workspace:*",
    "@quarry/recon-passive": "workspace:*",
    "@quarry/analyzer": "workspace:*",
    "@quarry/reporter": "workspace:*"
  },
  "devDependencies": { "typescript": "^5.6.0", "tsx": "^4.19.0" }
}
JSON
cat > worker/tsconfig.json <<'JSON'
{ "extends": "../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
JSON
cat > worker/src/index.ts <<'TS'
// Autonomous loop. Everything scheduled here is unattended and passive-safe.
// Active scanning is NOT scheduled here; it only runs from an approved gate.
async function tick() {
  // discovery.pollPlatforms()  -> new/updated programs
  // discovery.parsePolicies()  -> parsedScope + ambiguityFlags
  // discovery.score()          -> rank
  // reconPassive.enrich()      -> public-only assets
  // analyzer.triage()          -> findings from passive signals
  // reporter.draft()           -> queued reports, HELD_FOR_REVIEW
}
setInterval(() => { void tick(); }, 60_000);
console.log('quarry worker up (passive/autonomous only)');
TS

# ---------------------------------------------------------------------------
# apps/dashboard — Next.js (human gate UI). Minimal marker; init real app later.
# ---------------------------------------------------------------------------
cat > apps/dashboard/package.json <<'JSON'
{
  "name": "@quarry/dashboard",
  "version": "0.0.0",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@quarry/db": "workspace:*"
  },
  "devDependencies": { "typescript": "^5.6.0", "@types/react": "^18.3.0" }
}
JSON
cat > apps/dashboard/README.md <<'MD'
# Quarry Dashboard

Where the human lives. Two jobs:
1. Clear program `ambiguityFlags` and build the `Allowlist` by hand.
2. The one-click **Approve scan** action (writes a `ScanApproval`).

Scaffold the Next app in place: `pnpm dlx create-next-app@latest . --ts`
MD

echo "==> done. structure:"
find . -maxdepth 3 -type d -not -path '*/node_modules/*' | sort
echo ""
echo "next:"
echo "  cp .env.example .env      # fill in Flint + platform + Infiltr creds"
echo "  pnpm install"
echo "  pnpm db:generate"
echo "  pnpm dev"
