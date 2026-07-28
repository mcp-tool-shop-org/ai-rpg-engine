---
title: "Chapter 63 — Running the Instrument"
description: "A pack built to USE a system finds what the system's own tests cannot — three catalog-wide checks, and why your validators catch the same disease."
sidebar:
  order: 63
---

> Part X — On-Ledger Play (optional)

[Chapter 62](./62-salt-road-ledger.md) describes a pack built backwards from a system. This chapter is about what that pack turned out to be *good for*, which was not the thing it was built for.

Salt Road Ledger was authored to use the [ledger adapter](./60-xrpl-ledger-adapter.md) as a game rather than as plumbing. Building it found three unfinished edges in the shipped adapter and nine mechanics that were wired, schema-valid, unit-green and **dead** — several of them green in CI for a full release. None of that was the goal. It was a side effect of being the first consumer to actually try.

That side effect is the more valuable product, and this chapter is the method.

## The failure mode this engine actually has

Not "does this work when called." That question has good coverage.

The question with poor coverage is **"does anything call it, and can a player reach it?"** Every defect in the table below passed its own package's tests:

| Where | What was dead |
|---|---|
| ledger-adapter | `SettlementVerb` — `buy`/`sell` existed; both call sites passed the literal `'settle'` |
| ledger-adapter | `config.settlement` — declared, defaulted, **zero reads**; `payment` behaved identically to `token-escrow` |
| ledger-adapter | `settleCheckpoint` never forwarded `options`, so both axes above were reachable only by bypassing the documented seam |
| ledger-adapter | `mode: 'diary'` and `issuerMode: 'persistent'` — same shape, one release later, in the same package |
| ledger-adapter | `SettlementVerb.default` — structurally unable to reach a memo |
| equipment | `boss-kill` checked a bare `boss` tag; all packs tag `role:boss` |
| equipment | `recognized` required a faction no shipped entity sets — silently killing all armor growth |
| equipment | `item.lost` — a chronicle event with no producer anywhere, because nothing could make an item change hands |
| starter-merchant | `recruit` advertised with zero recruitable NPCs; `use` inert across the entire item catalog |

A unit suite cannot see any of these. It answers a different question.

## Three checks that can

Each generalises one of the defects above into something that runs over the whole catalog in CI.

### 1. Verb reachability — does a valid target exist?

Every pack already proves each advertised verb resolves to a registered handler, and that every registered handler is advertised. Both directions passed for a pack whose `recruit` could never succeed, because `companion-core` registers that handler in **every** world. The gate that actually decides is content: an entity tagged `recruitable` or `companion-ready`.

`packs-verb-reachability.test.ts` boots all eleven packs and **submits** each verb through the real engine, asking whether any target in the booted world is accepted. It does not re-implement the gates in the test file — see the next section for why that matters.

Two details are load-bearing:

- **Position is a gameplay gate, not a defect.** Three packs ship recruitable NPCs one zone from spawn. A probe that ran at tick 0 without moving reported them dead alongside the pack that was genuinely broken. The probe walks the player over first.
- **Absence of rejection is not success.** `use` accepts any id sitting in the player's inventory — `useHandler` looks the item up in its effect map, finds nothing, and still emits `item.used` and consumes it. That axis needs a stricter reading: *did the item's effect actually emit anything?*

### 2. Zero-behavioral-read config

The grep is two minutes and it has now found the same class twice in the same package:

```bash
grep -rn '\.mode\b|\.issuerMode\b' packages/<pkg>/src --include=*.ts | grep -v '\.test\.'
```

If every hit is an assignment or a validation, the field is a label. Run it over every config surface and every closed union you ship. `config.network` survives this check for a good reason — the mainnet guard operates on the host and the field is typed as a literal, so it cannot vary — and the distinction between "unread because inert" and "unread because constant" is worth writing down where the next auditor will find it.

### 3. Catalog-of-record membership

`starter-merchant` shipped and never entered the pack rubric's real-catalog suite. The suite stayed green: it asserted a 10-pack catalog and got one. Two consequences, both live for a release — the claim "merchant scores 7/7 against the live catalog" was measured *by hand* and enforced nowhere, and every other pack's cross-catalog distinctness dimensions were computed against a catalog missing a live neighbour.

A second 10-pack suite in a different package had the same hole.

Bumping a literal fixes the instance. The class is closed by reading the workspace off disk and requiring every shipping pack to be scored — so a twelfth cannot ship unscored.

## Your validators catch the same disease

This is the part that generalises past this engine.

Of the checks written during these two cycles, **five were vacuous on first draft**. One skipped exactly the malformed input it existed to catch. One compared content against a literal in the test file. One accepted any string in an inventory. One measured item *placement* and called it usability, condemning eight healthy packs. One passed the item id where the engine expected an entity, making every target-taking item look inert.

Three were caught by a committed negative control. Two were caught by checking a red result against real content before believing it.

So: **every new check ships with a mutation meta-test in the same commit**, and the control is committed code, not an anecdote in a commit message. `pack-registry/src/catalog.test.ts` is the house idiom — construct the mutation the real defect was, and assert the gate goes red.

The same principle applies to fakes. `anchorMemo` was first written as a 1-drop self-payment. `DryRunTransport` accepted it, the unit suite went green, a full dry-run replay went green — and live XRPL rejected it `temREDUNDANT`, because a Payment whose Account equals its Destination is invalid. The fix was one line; the *durable* fix was teaching the fake to model the rule, exactly as it already models `tecPATH_DRY`. A lesson written only in a commit message is one the next transport-shaped bug walks straight past.

## Prove it before you believe it

Two results in this cycle were wrong in a way that would have shipped as a headline finding:

- **"No pack spawns opportunities."** True of the probe, false of the engine. `runWorldTick` is not a verb and not an event subscription — it is a per-round function *the CLI drives*, after the player's action and the NPC round. A probe built from `submitAction` alone drives half a round forever and sees nothing. Every pack spawns opportunities when the round is driven properly.
- **"`evaluateOpportunities` has zero production callers."** An artifact of a truncated grep.

Both were caught by checking against source before reporting. A finding is a claim about the system, and a claim measured by hand is attested, not asserted — which is the same rule that produced check #3 above.

## The order matters

Build the check, run it, and **watch it fail on a defect you already know about**, before you fix anything. A check written after the fix is a check validated against the only case anyone tested it on.

The audit here was proven red on `recruit` in one pack, with all ten others green, before a single line of content was added.

## See also

- [Chapter 62 — Salt Road Ledger](./62-salt-road-ledger.md) — the pack this method came out of
- [Chapter 60 — The XRPL Ledger Adapter](./60-xrpl-ledger-adapter.md) — `diary` mode and the issuer axis
- [Chapter 61 — Unique Gear as NFTs](./61-xrpl-nft-gear.md) — the item chronicle `give` now stamps
