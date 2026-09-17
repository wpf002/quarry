# Quarry

Autonomous bug-bounty engine. It finds programs, parses their scope, scores them,
does passive recon, drafts findings and reports, and manages the submission queue
on its own. The one thing it does not do on its own is originate active traffic
against a target or press submit. Those two steps are human-gated, per program.

## The autonomy boundary (read this first)

Everything in Quarry is fully autonomous **up to the point where it would send an
active packet at someone else's system based on a machine's reading of scope.**
That single step stays with a human, because in a bounty program authorization is
narrow and explicit, and "the AI believed it was in scope" is not a defense.

| Stage | Mode |
|---|---|
| Program discovery (HackerOne, Bugcrowd, Intigriti, YesWeHack, self-hosted) | autonomous |
| Policy parsing → structured scope + confidence + ambiguity flags | autonomous |
| Program scoring / ranking | autonomous |
| Passive recon (CT logs, passive DNS, public source, security.txt, self-proxied) | autonomous |
| Triage, chain detection, impact, duplicate risk | autonomous |
| Report drafting, contact resolution, submission queueing | autonomous |
| **Allowlist construction** (confirm real in-scope assets) | **human** |
| **Active scan approval** (one click per program) | **human** |
| **Final submission** | **human** |

The parser's `parsedScope` is advisory. It never authorizes a scan by itself.
Active scanning reads only from the hand-built `Allowlist`, and only when a valid,
unexpired `ScanApproval` exists. The gate `assertActiveScanAllowed()` in
`@quarry/core` fails closed: no allowlist match, no approval, or an expired
approval all return refusal. Every scope verdict and every active action is written
to the append-only `AuditLog`.

## Relationship to existing projects

- **Scout** supplies the scope-gated posture for discovery and passive recon.
- **Infiltr** is the only component that executes active scans. `recon-active`
  delegates to it behind the gate; Quarry never execs pentest binaries directly.
- **Flint** is the AI seam. Policy parsing, triage, and report drafting route
  through it, never straight to a model vendor.

## Architecture

```
apps/
  dashboard/       Next.js — human gate: clear ambiguity, build allowlist, approve
  api/             Fastify — orchestrator + approval + submission endpoints
worker/            autonomous loop (passive-safe only; never schedules a scan)
packages/
  db/              Prisma + Postgres. Schema is the safety model.
  core/            shared types + assertActiveScanAllowed() gate
  ai/              Flint wrapper (parse / triage / draft)
  discovery/       autonomous program finder + scorer
  recon-passive/   public-data recon only
  recon-active/    GATED delegation to Infiltr
  analyzer/        triage, chains, impact, dup risk
  reporter/        report gen + contact finder + submission queue
```

## Stack

TypeScript · pnpm · Turborepo · Next.js · Fastify · Prisma · Postgres · Redis
(BullMQ) · Railway. Active scanning handled out-of-process by Infiltr.

## Setup

```bash
./bootstrap.sh            # generates the monorepo (run once, empty dir)
cd quarry
cp .env.example .env      # Flint, platform creds, Infiltr, gate config
pnpm install
pnpm db:generate
# provision Postgres + Redis, then:
pnpm --filter @quarry/db migrate
pnpm dev                  # api + dashboard
pnpm worker               # autonomous loop
```

## Non-negotiables

1. The `Allowlist` is a whitelist, never a blacklist. Ambiguity resolves to
   out-of-scope.
2. Active scanning never runs without a matching `ScanApproval`. No exceptions,
   no override flag.
3. One platform account. Its signal-to-noise ratio is the real asset. No reports
   go out unread; nothing auto-submits.
4. Changes to `Allowlist`, `ScanApproval`, `AuditLog`, or `assertActiveScanAllowed`
   are reviewed changes, not routine ones.

## Status

Phases 0–6 implemented. All package logic is pure and unit-tested (51+ tests);
the enforcer suite gates every active target.

| Phase | Package(s) | State |
|---|---|---|
| 0 Foundation | `core`, `db` | done — scope matcher + gate, audit, queues, offline migrations |
| 1 Discovery | `discovery`, `ai` | done — read-only connectors, heuristic policy parser, scorer |
| 2 Passive recon + reporter | `recon-passive`, `reporter` | done — CT/security.txt, contact finder, platform formatters, HELD_FOR_REVIEW queue |
| 3 Analyzer | `analyzer` | done — triage, chains, impact, dup risk, quality gate |
| 4 The gate | `api`, `dashboard` | done — ambiguity clearing, allowlist builder, one-click approve |
| 5 Active recon | `recon-active` | done — Infiltr delegation behind the gate, tiers, kill switch |
| 6 Feedback | `feedback` | done — outcome tracking, scorer feedback, metrics, strategic trigger |

Two deliberate deferrals:
- **Flint (AI seam):** not wired. `@quarry/ai` ships deterministic heuristic
  implementations behind `PolicyParser` / `Triager` / `ReportDrafter`; Flint
  drops in later behind the same interfaces.
- **Live infra (Postgres/Redis/Railway):** not provisioned. Schema is
  Postgres-targeted, migrations are generated offline, and every DB read in the
  dashboard fails soft so the UI runs before infra exists.

Run `pnpm build && pnpm typecheck && pnpm test` for the full green graph.
