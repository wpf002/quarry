# Quarry Autonomy Roadmap

Goal: get to where Quarry finds bounties, runs them, and reports them with as
little of your time as possible. Framed as autonomy levels (like self-driving),
each one removes human clicks while keeping guardrails that can't be silently
turned off.

The honest boundary up front: "zero input, ever" for active scanning and
submission against third parties is not something to ship. In a bounty,
authorization is narrow, and "the model thought it was in scope" is not a legal
defense. So the endgame is not *no* human input — it's compressing human input
from **per-finding** down to **a periodic policy sign-off** (e.g. weekly), plus
a kill switch. Inside that signed envelope, a program can run lights-out. That's
the difference between hands-off and unaccountable.

Today = **L0**. Everything below L0 is already built and passing tests.

**Shipped:** L0, L1 (batch review inbox), L2 (standing authorizations with
ownership-verified allowlists, budget/rate limits, and auto-revoking circuit
breakers), L3 (opt-in auto-submit under a policy bar; high-impact/CRITICAL never
auto-submit; reputation breaker), L4 (self-directed onboarding of top-scored
programs + provenance-based allowlist proposals + daily digest, stopping at the
human sign-off), L5 (signed policy envelope: composes L2/L3 under one expiry
with master auto-pause triggers + an autopilot dashboard). Note: L3 relaxes the
original "nothing auto-submits" non-negotiable, by explicit choice, behind
per-program opt-in.

**Full L0-L5 shipped.** The permanent boundaries hold: first per-program
authorization is human; Tier-3 actions never auto-run; scope trust requires
ownership proof; auto-pause + kill switch stop everything.

---

## Autonomy levels

| Level | What runs itself | What you still do | New risk |
|---|---|---|---|
| **L0 (now)** | discovery, passive recon, triage, chain/dup/impact, report drafting | build allowlist, approve each scan, submit each report | none new |
| **L1** | + batch review inbox | approve/submit in bulk, not one-by-one | none new |
| **L2** | + auto-scan within a standing per-program authorization | grant a time-boxed, budget-capped auth once per program | active traffic, bounded |
| **L3** | + auto-submit above a policy bar | set the confidence/dup thresholds; review a digest | reputation, bounded |
| **L4** | + self-selects which programs to onboard | review a daily digest; sign envelopes | wider surface |
| **L5** | lights-out inside a signed policy envelope | periodic sign-off + spot checks | highest; fully gated |

The one irreducible click: **the first per-program authorization** (allowlist
confirmed + envelope signed). It's the legal act. Everything else can be
automated around it.

---

## L1 — Batch the human, don't remove them  (effort: 1 wk)

Cut clicks without changing the trust model.

- **Review inbox**: one screen with every queued report + every program awaiting
  approval. Multi-select → approve / submit / reject.
- **Keyboard-driven triage** (j/k/a/x), so a full queue clears in minutes.
- **Diff view** on re-parsed policies so re-approval is a glance.
- Still one human decision per report; just amortized.

Build: dashboard inbox route, batch API endpoints, bulk `grantScanApproval` /
submit. No schema change.

---

## L2 — Standing authorizations  (effort: 2–3 wk)

A human pre-authorizes a program *once*, with hard limits; the worker scans
within them without asking again.

- New `PreAuthorization` model: `programId`, `allowlistVersion`, `tiers`,
  `expiresAt`, `maxTargets`, `rateLimit`, `dailyBudgetUsd`, `signedBy`.
- Worker may schedule Tier-1/2 active scans **only** against targets that match
  the pinned allowlist under a live PreAuthorization — the existing
  `assertActiveScanAllowed` gate still runs per target, unchanged.
- **Machine-verifiable scope** before any auto-scan:
  - DNS TXT / file ownership proof, or cert-SAN match, that the asset belongs to
    the program's confirmed apex.
  - Parsed "automation/AI allowed" flag from policy, **confirmed once** by a
    human (never trusted from the parser alone).
- Circuit breakers (auto-revoke the authorization): first out-of-scope hit,
  rate anomaly, or budget breach.

Result: you click once per program per TTL. Scanning runs hands-off until it
expires or trips a breaker.

---

## L3 — Auto-submit under a policy bar  (effort: 2–3 wk)

Reports that clear a bar you set go out without a click; everything else waits.

- Per-program `AutoSubmitPolicy`: `minConfidence`, `maxDupRisk`,
  `allowedVulnClasses`, `dailyCap`, `requireChain?`.
- Auto-submit worker: submits only findings above the bar, respecting the cap.
- **Reputation circuit breaker**: track rolling valid-rate; if it drops below a
  floor (e.g. <70% over last 10), auto-pause submission and flag for review.
  Signal-to-noise on the account is the asset.
- Everything still lands in the audit log; a daily digest shows what went out.

Guardrail that stays: high-impact classes (RCE, auth bypass, anything that
writes state — the Tier-3 set) never auto-submit and never auto-scan. Per-action
human confirmation, always.

---

## L4 — Self-directed program selection  (effort: 3–4 wk)

Quarry decides where to hunt.

- Scorer + feedback loop rank the program universe continuously; top-N get
  auto-onboarded through discovery → passive → draft (all already autonomous).
- Auto-onboarding stops at the allowlist. It **proposes** an allowlist from
  passive assets + ownership proofs; a human confirms to arm L2/L3.
- Daily digest: "3 new programs scored >0.8, allowlists drafted, awaiting your
  sign-off." One review session sets the next day's work.
- Cost governor: model routing + per-finding cost ceiling with alerts.

---

## L5 — Lights-out inside a signed envelope  (effort: 4–6 wk + soak time)

The hands-off state, for programs you've explicitly put in it.

- **Policy envelope**: a signed record binding programs, tiers, rate, spend,
  auto-submit thresholds, and an expiry. Human signs it (weekly/monthly). Inside
  it, discovery → scan → triage → submit run with no further input.
- Envelope is enforced the same way the scan gate is: fail-closed, per target,
  audited. Expired or unsigned → nothing runs.
- **Autopilot dashboard**: live runs, spend, valid-rate, next expiry, big red
  kill switch.
- Auto-pause triggers (any one halts and pages you): OOS hit, valid-rate drop,
  budget breach, a Tier-3-class discovery, a program policy change, or a
  platform automation-rule change detected on re-parse.
- Weekly you: read the digest, re-sign or adjust envelopes, spot-check a few
  reports. That's the "not much input."

---

## Cross-cutting (build alongside, from L2 on)

- **Ownership verification service** — the thing that lets scope be trusted
  without a human eyeballing every host.
- **Anomaly / circuit-breaker engine** — one place that watches rate, spend,
  valid-rate, scope drift and can revoke authorizations.
- **Notifications** — digest + page-on-breaker (email/Slack/push).
- **Policy-change watcher** — re-parse on program updates; any scope-narrowing
  change auto-suspends affected authorizations until re-signed.
- **Legal/ToS currency** — track each platform's automation & AI-disclosure
  rules; an authorization can't be granted for a program whose terms forbid
  automation.

---

## What never becomes autonomous (permanent)

1. The **first authorization** per program (allowlist confirmed + envelope
   signed). One human act; everything else automates around it.
2. **Tier-3 / state-changing / high-impact actions** — per-action confirmation,
   always.
3. **Scope trust** — an asset enters an allowlist only via confirmed ownership,
   never the parser's say-so.

Reaching L5 on a handful of programs is the realistic "runs while you sleep"
target. It's hands-off, not unaccounted-for — you stay the author of every
authorization, you just sign in batches instead of per finding.
