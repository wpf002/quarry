# Quarry Roadmap

The sequence is driven by one rule: everything that runs unattended and sends no
traffic at a target ships before the single module that does. Discovery and
reporting produce value on day one with zero legal surface. Active scanning lands
last, behind a gate that is already built, tested, and boring by the time anything
needs it.

Estimates are effort, not calendar. Solo/part-time, expect the calendar to run
~2x the effort figure.

---

## Phase map at a glance

| Phase | Name | Traffic risk | Effort | Gate needed |
|---|---|---|---|---|
| 0 | Foundation hardening | none | 1.5–2 wk | builds the gate |
| 1 | Discovery | none | 2–3 wk | no |
| 2 | Passive recon + reporter | none | 3–4 wk | no |
| 3 | Analyzer | none | 2–3 wk | no |
| 4 | The gate, for real | none | 1.5–2 wk | this IS the gate UI |
| 5 | Active recon (Infiltr) | HIGH | 3–4 wk | yes, hard dependency |
| 6 | Feedback loop + scale | low | ongoing | no |

Phases 1–4 are independent of Phase 5 and deliver a working, revenue-adjacent
product on their own. Phase 5 cannot start until Phase 4 is done and the enforcer
test suite is green.

---

## Phase 0 — Foundation hardening

Turn the scaffold into something real. Nothing here is user-facing; it's the spine
every later phase plugs into. The scope gate gets built now, before anything can
use it, so it's never rushed under pressure to ship a scanner.

**Build**
- Postgres + Redis provisioned on Railway; `DATABASE_URL` / `REDIS_URL` wired.
- `prisma migrate` run; schema live. Seed script for a couple of fake programs.
- `@quarry/ai`: real Flint client. One `parse()`, one `complete()`, model routing
  config (cheap model for bulk classification, strong model for scope + reports).
- `@quarry/core`: replace the stub `matches()` with a real matcher. Exact host
  match, CIDR containment, URL-prefix match, wildcard ONLY when `allowWildcard`.
  This is the most important function in the codebase.
- `AuditLog` write helper. Every scope verdict and every gate check calls it.
- CI: typecheck + test on push. Turbo remote cache optional.
- BullMQ queues stood up (empty consumers for now).

**Definition of done**
- `pnpm db:migrate && pnpm dev && pnpm worker` all run against Railway.
- `assertActiveScanAllowed()` is fully implemented and cannot pass without a live
  allowlist match + valid approval. It fails closed on every ambiguous input.
- Enforcer unit tests exist and pass (see Testing track). No scanner exists yet,
  so the gate guards nothing, which is exactly when you want it finished.

**Gate checkpoint:** none. But the gate is now real.

---

## Phase 1 — Discovery

Pure intelligence gathering. No target traffic, only reads from bounty platforms'
own APIs and public program pages. Lowest risk, highest immediate leverage: it
tells you where hunting is even worth it.

**Build**
- Platform connectors, read-only:
  - HackerOne API (programs endpoint, policy fetch).
  - Bugcrowd API.
  - Intigriti API.
  - YesWeHack API.
  - `SELF_HOSTED`: security.txt + `/security` + VDP page crawler for direct programs.
- Policy capture: store `policyRaw` verbatim per program.
- LLM policy parser (via Flint) emits into `parsedScope`:
  - in-scope assets, explicit out-of-scope, prohibited methods, reward-by-severity,
    preferred vuln types, unusual rules.
  - `parseConfidence` (0–1) and `ambiguityFlags[]` for anything unclear.
  - Hard rule: the parser NEVER marks an asset authoritatively in-scope. It
    proposes; a human disposes (Phase 4).
- `ProgramScorer`: reward, scope breadth, competition estimate, policy clarity,
  asset types, response rate, time-to-bounty. Weighted, tunable.
- Worker cron: poll platforms on a schedule, diff against `Program` table, parse
  and score new/changed programs.
- Dashboard: read-only ranked program list with scores and ambiguity flags.

**Definition of done**
- A ranked, refreshing `Program` DB with machine-readable scope and confidence.
- New programs appear without manual work; changed policies re-parse and re-score.
- Zero packets sent to any target. Only platform APIs and public policy pages hit.

**Gate checkpoint:** none (no target traffic).

---

## Phase 2 — Passive recon + reporter

The autonomous core. Two packages that together make Quarry useful even if the
active scanner never ships. All recon here is public-data only.

**recon-passive — build**
- Certificate transparency (crt.sh / certspotter) for subdomain surface.
- Passive DNS (a provider API, not active resolution sweeps).
- Public source signals: GitHub code search for the org, Wayback/CommonCrawl
  endpoint mining, exposed `.git`/`.env` references already indexed publicly.
- security.txt + published cloud listings (public S3 index pages, etc.).
- Writes `Asset` rows: source = passive enum only, verdict defaults OUT_OF_SCOPE,
  `verdictBy = "parser:vN"`. Nothing here is treated as authorized-to-scan.

**reporter — build**
- Contact finder, RFC 9116 order: security.txt → `/security` → VDP page →
  platform directory → WHOIS → common addresses (security@, etc.). Returns ranked
  `DisclosureContact`.
- Report drafting via Flint: title, summary, description, repro steps, PoC
  description (no harmful payloads), impact, remediation, CVE/CWE/OWASP refs.
- Platform-specific formatting (HackerOne markdown + CVSS; Bugcrowd VRT; Intigriti;
  plain email for self-hosted).
- Submission queue: everything lands `HELD_FOR_REVIEW`. Nothing auto-submits, ever.

**Findings at this stage** come only from passive signals: publicly exposed
secrets, public buckets, `.git` exposure, known-CVE matches against passively
fingerprinted tech. Modest but real and duplicate-light if you move fast.

**Definition of done**
- For any active program: public asset inventory + resolved disclosure contact +
  any passive findings drafted into platform-correct reports sitting in the review
  queue.
- A human can open a queued report, read it, and it's submission-ready after edit.

**Gate checkpoint:** none (public data only). This is the line past which Phase 5
lives.

---

## Phase 3 — Analyzer

What separates a scanner wrapper from a hunter: reasoning over the whole finding
set instead of one alert at a time.

**Build**
- Triage / false-positive filter: per finding, true-positive confidence %,
  severity, what evidence would confirm/deny, duplicate-class guess.
- Chain detection: combine 2+ findings into higher severity (self-XSS + CSRF,
  SSRF + metadata, etc.), privilege-escalation and data-exposure paths, PoC steps
  that are read-only only.
- Impact analysis grounded in what the app actually does, not generic blurbs.
- Duplicate-risk score (0–1) from vuln commonality, program age/maturity, asset
  visibility.
- Quality gate before anything reaches the report queue:
  - confidence > 0.80, dupRisk < 0.40, and `humanConfirmed = true`.
  - Anything below is logged, not reported. Signal-to-noise is the account asset.

**Definition of done**
- Findings arrive ranked with confidence, dup risk, impact, and chain grouping.
- The quality gate provably blocks low-confidence / high-dup findings from
  becoming reports.

**Gate checkpoint:** none.

---

## Phase 4 — The gate, for real

The enforcement logic exists from Phase 0. This phase builds the human surface
that feeds it. After this, Quarry is a complete autonomous product for everything
except active scanning.

**Build (dashboard + api)**
- Ambiguity-clearing UI: human resolves each `ambiguityFlag` on a program before
  it can ever be scanned.
- Allowlist builder: hand-enter confirmed in-scope patterns (exact host / CIDR /
  url-prefix). Wildcards require an explicit, separate toggle and a note. Whitelist
  only. No import-from-parsedScope shortcut, because that would let the parser
  authorize scanning through the back door.
- One-click **Approve scan**: `POST /programs/:id/approve-scan` validates that
  the allowlist is non-empty, all ambiguity flags are cleared, then writes
  `ScanApproval{ state: APPROVED, approvedBy, expiresAt = now + TTL }` and audits
  it. Refuses otherwise.
- Approval TTL from `SCAN_APPROVAL_TTL_HOURS`. Expired approvals do not scan.
- Concurrency guard: no more than `MAX_CONCURRENT_ACTIVE_TARGETS` approved-and-live
  at once.

**Definition of done**
- A human can take a program from discovered → ambiguity-cleared → allowlisted →
  approved, and that produces exactly one valid, expiring `ScanApproval`.
- `assertActiveScanAllowed()` passes for allowlisted targets under that approval
  and refuses everything else, verified by tests.

**Gate checkpoint:** this phase is the checkpoint. Phase 5 cannot begin until the
enforcer suite is green and the approval flow is manually verified end to end.

---

## Phase 5 — Active recon (Infiltr), gated

Last, on purpose. This is the only module that originates traffic at a target, and
it does none of the scanning itself. It delegates to Infiltr, and only after the
gate says yes.

**Build**
- `recon-active` calls `assertActiveScanAllowed(programId, target)` before EVERY
  target. No batch bypass, no "trust the loop" shortcut.
- Infiltr delegation: pass approved targets + permitted scan profile to Infiltr's
  API; Quarry never execs subfinder/httpx/nuclei directly.
- Tiered scanning, tier permitted by the `ScanApproval.scanProfile`:
  - Tier 1 passive/safe (headers, exposure, tech fingerprint, known-CVE match) —
    allowed under any approval.
  - Tier 2 low-impact active (nuclei safe tags, IDOR probing with own accounts,
    open-redirect, CSRF detection) — allowed when profile grants it.
  - Tier 3 high-impact (anything that writes/modifies state, complex auth bypass,
    chained exploit) — never batch-automated; each Tier 3 action needs its own
    per-action confirmation.
- Rate limiting aggressive by default; conservative concurrency; global kill switch.
- Results flow back as `Asset{ source: ACTIVE_SCAN }` and `Finding` rows, then
  straight into the Phase 3 analyzer and Phase 2 quality gate.

**Definition of done**
- An approved program runs a bounded Infiltr scan, fully audited, that physically
  cannot touch anything off its live allowlist.
- Killing the switch halts all active work immediately.
- Removing/expiring the approval stops the next target from running.

**Gate checkpoint:** every target, every run, forever.

---

## Phase 6 — Feedback loop + scale

Turn outcomes into a system that gets better instead of drifting.

**Build**
- Submission outcome tracking (paid / duplicate / OOS / informative) feeds back
  into `ProgramScorer` and the duplicate-risk model.
- Metrics: findings per program, valid vs invalid rate, dup rate, revenue per vuln
  class, human minutes per finding, LLM cost per finding.
- Cost control: enforce model routing; alert if cost per finding exceeds a floor.
- Private-program handling: invitations, stricter scope discipline, no scraping
  where terms forbid it.
- Strategic review trigger: if >60% of findings are low/info over 30 days, flag for
  a human rethink instead of grinding.

---

## Cross-cutting tracks (run through every phase)

**Testing (the enforcer is the priority)**
- `assertActiveScanAllowed()` gets adversarial unit tests from Phase 0: off-list
  hosts, sibling domains, CIDR edge cases, substring-lookalike hosts
  (`evil-acme.com` vs `acme.com`), expired approvals, missing approvals, wildcard
  abuse, empty allowlist. Every one must refuse.
- Property test: no input that isn't an exact allowlist match under a valid
  approval may ever return "allowed."
- Contract tests on platform connectors (recorded fixtures, no live hammering).
- The enforcer suite is a merge blocker on any change to core/db/gate code.

**Observability + audit**
- `AuditLog` is append-only. Every scope verdict, approval, gate pass/refusal, and
  active run is recorded with actor and detail.
- Periodic audit export you can actually read, so a scope decision is always
  traceable to who/what authorized it.

**Legal + policy currency**
- Policy parser re-runs when a program updates its terms.
- You personally stay current on the platforms' automation and AI-disclosure rules;
  the parser assists, it doesn't absolve.

**Cost**
- Track LLM spend from Phase 1. Bulk classification on the cheap model, scope and
  report generation on the strong one. Expect low tens of dollars/month at 5 active
  programs; one medium bounty covers it.

---

## What never becomes autonomous

Not a phase, a permanent boundary:

1. Building the `Allowlist`. A human confirms real in-scope assets by hand.
2. Approving an active scan. One click, but a human's click, per program, expiring.
3. Final submission. No report leaves unread; nothing auto-submits.
4. Tier 3 high-impact actions. Per-action human confirmation, always.

Everything else can run while you sleep. These four are what keep you the author of
every authorization instead of a machine.

---

## Honest expectations

Phases 1–4 give you a real autonomous discovery-and-reporting product with no
legal exposure. That alone is worth running. Phase 5 adds active findings but also
adds all the risk, which is why it's gated and last. Year-one revenue from a
careful build is "pays for itself and builds account reputation," not "quit your
job." The compounding comes from reputation unlocking private programs, the
feedback loop tightening scoring, and human minutes per finding dropping over time.
