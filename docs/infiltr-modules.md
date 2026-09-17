# Infiltr modules that produce paid findings

Quarry orchestrates and gates; **Infiltr does the detecting**. Quarry can only
surface and rank what Infiltr returns. Today Infiltr's profile emits headers,
endpoints, and fingerprints — none of which bounty programs pay for. This spec
lists the modules that produce payable findings, mapped to Infiltr's existing
`/scan` contract.

## Contract (unchanged)

```
POST {INFILTR_BASE_URL}/scan
Authorization: Bearer <key>
{ "target": "host-or-url", "profile": { "tiers": [1|2|3], "tools": ["..."] } }

-> { "target": "...",
     "assets":   ["host/url", ...],
     "findings": [ { "title", "vulnClass", "severity", "evidence" }, ... ] }
```

Quarry persists each finding, records the scan `target`, and runs the quality
gate (`confidence >= 0.8`, `dupRisk < 0.4`, human-confirmed → report-ready).

## Output rules (so Quarry ranks, not drowns)

- **Emit fewer, higher-value findings.** One finding per real issue, not per URL.
- Set `severity` honestly: `CRITICAL|HIGH|MEDIUM|LOW|INFO`. Anything purely
  informational → `INFO` (Quarry hides these by default).
- Put a reproducible request/response in `evidence` (`{ url, request, response,
  detail }`) so Quarry's trace + your report have proof.
- Use a **stable finding key** (e.g. `vulnClass:host:location`) so repeat scans
  dedup instead of piling up (the 8000-row problem).
- Prefer `confidence >= 0.8` only when the check actually confirmed the issue;
  that is what lets it clear Quarry's gate.

## Tier 1 — passive / safe (highest ROI, fully automatable)

| Module | vulnClass | Detects | Sev | Pays because |
|---|---|---|---|---|
| Exposed VCS/secrets | `secret-exposure` / `git-exposure` | `/.git/config`, `/.env`, `/.svn/`, `*.bak`, `config.json`, `.DS_Store`, keys in JS bundles | HIGH–CRIT | direct credential/source leak |
| Subdomain takeover | `subdomain-takeover` | dangling CNAME → unclaimed S3/GitHub Pages/Heroku/Netlify/Fastly (fingerprint match) | HIGH | full control of a subdomain |
| Public cloud storage | `public-bucket` | world-readable S3/GCS/Azure buckets tied to the target | HIGH | data exposure |
| Known CVEs (nuclei) | `cve-<id>` | version/template match, safe checks only | per CVSS | proven vuln components |
| Exposed panels/debug | `exposed-panel` | `/actuator`, `/debug`, unauth admin, writable Swagger, `.git`-style dashboards | MED–HIGH | admin/data access |

`tools` hint: `["nuclei","secretfinder","subjack","s3scanner"]`.

## Tier 2 — low-impact active (needs a probe, still safe)

| Module | vulnClass | Detects | Sev | Notes |
|---|---|---|---|---|
| IDOR / BOLA | `idor` | object-id swap on numeric/UUID params returns another user's data | HIGH | needs 2 test accounts / tokens |
| SSRF | `ssrf` | out-of-band canary hit from a URL/webhook param | HIGH | OOB collaborator required |
| Reflected XSS | `xss` | safe non-destructive payload reflects unencoded | MED | |
| Open redirect | `open-redirect` | `?next=`/`?url=` follows to attacker host | LOW–MED | often chains into SSRF/OAuth |
| CORS misconfig | `cors-misconfig` | `ACAO` reflects origin **with** `ACAC: true` | MED | credentialed cross-origin read |
| Auth/session flaws | `auth-weakness` | no login rate-limit, guessable reset tokens, JWT `alg=none` | MED–HIGH | |

`tools` hint: `["nuclei","ffuf","custom-idor","interactsh"]`.

## Tier 3 — manual only (Infiltr CLI, never delegated by Quarry)

SQLi exploitation (`sqlmap`), RCE PoC, deserialization, chained exploitation,
proof-of-access. Quarry refuses to auto-run these; run them yourself, per
target, from Infiltr's console when a Tier 1/2 signal warrants it.

## What to build first

For a solo, beginner-friendly, mostly-automated path: **subdomain takeover** and
**exposed secrets/`.git`**. High payout, low false-positive, safe to run
unattended, and Quarry already gates + reports them. CORS and open-redirect are
the next cheapest Tier 2 adds.

## The part no scanner does

A scanner finds candidates. The money comes from a human confirming one real
issue and writing a clear, reproducible report. Quarry's job is to filter the
noise down to that short list; Infiltr's job is to make the list worth reading.
