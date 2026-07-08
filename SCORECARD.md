# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.
> This is an audit snapshot — scores reflect the gate results at the date below, not a live readout.

**Repo:** mcp-tool-shop-org/ai-rpg-engine
**Date:** 2026-07-08 (v2.5.0 dogfood swarm; snapshot — original audit 2026-03-06 at v1.0.0). The v2.5 swarm also made the quality gates real: pack rubric on the live catalog, docs-integrity vs the latest tag, coverage ratchet, and a LICENSE packaging gate that blocks publish (each with a mutation meta-test).
**Type tags:** `[npm]` `[library]`

## Pre-Remediation Assessment

| Category | Score | Notes |
|----------|-------|-------|
| A. Security | 10/10 | SECURITY.md, threat model, no secrets, no telemetry |
| B. Error Handling | 10/10 | Structured events with verb + reason fields |
| C. Operator Docs | 10/10 | README, CHANGELOG, LICENSE, handbook (58 chapters + 4 appendices) |
| D. Shipping Hygiene | 10/10 | verify script, v2.4.0, dep scanning, clean packaging |
| E. Identity (soft) | 10/10 | Logo, 7 translations, landing page, repo metadata |
| **Overall** | **50/50** | |

## Key Gaps

None — all gates pass. Shipped at full score.

## Remediation Priority

No remediation needed.

## Post-Remediation

| Category | Before | After |
|----------|--------|-------|
| A. Security | 10/10 | 10/10 |
| B. Error Handling | 10/10 | 10/10 |
| C. Operator Docs | 10/10 | 10/10 |
| D. Shipping Hygiene | 10/10 | 10/10 |
| E. Identity (soft) | 10/10 | 10/10 |
| **Overall** | 50/50 | 50/50 |
