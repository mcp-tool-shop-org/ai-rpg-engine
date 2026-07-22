---
title: "Chapter 42a — Social Leverage & Opportunities"
description: "The social-action layer, the leverage economy that funds it, and the opportunity lifecycle"
sidebar:
  order: 42.5
---

# Chapter 42a — Social Leverage & Opportunities

The combat layer lets you act on entities. The economy lets you act on goods. This layer lets you act on **factions and standing** — leaning on reputation, coin, threat, and rumor to bend the strategic board without drawing a weapon. It arrived complete in v2.9: four verbs, a currency economy that funds them, and an opportunity lifecycle that both pays into that economy and reads back out of it.

> **Shipped in v2.9.** The player-leverage verbs and the opportunity spawn/resolution loop were authored across the v2.8–v2.9 arc; v2.9 connected the write side end to end — most importantly the earning path (opportunity completion grants leverage), without which the verbs were unaffordable in play.

---

## Leverage currencies

Leverage is spent, not rolled. `getLeverageState(actor.custom)` reads six currencies off the player entity:

| Currency | Earned by | Spent on |
|----------|-----------|----------|
| `favor` | completing favor-shaped opportunities | `bribe` |
| `influence` | completing contracts / supply-runs | `seed` (rumor) |
| `legitimacy` | lawful opportunity resolutions | `petition` |
| `heat` | intimidation, defeat fallout | rises as a cost/consequence |
| `debt` | bribery side-effects | — |
| `blackmail` | investigation opportunities | v3.0 sub-verbs |

A verb is only offered on the numbered menu when its cost is affordable and its cooldown is ready — the same "never advertise a guaranteed rejection" discipline the trade menu uses.

## The four verbs

All four are numbered `leverage` entries on the action menu:

- **`bribe <faction>`** — spend `favor` to raise a faction's reputation toward you; accrues `debt` and a little `heat`, more if the faction is already alert.
- **`intimidate <faction>`** — spend `heat` to cow a faction: raises their alert, lowers their reputation and cohesion. A threat, with a cost.
- **`petition <faction>`** — spend `legitimacy` to lean on the district's controlling authority; taps the already-ticking pressure system.
- **`seed`** — spend `influence` to plant a rumor about yourself. This lights the entire **player-rumor** module (confidence decay, distortion, faction spread) and the Director's Ledger **RUMORS ABOUT YOU** section.

Each verb writes real `reputation_<faction>` / `faction_alert_<faction>` / `heat` globals — the *same* globals trade pricing and the opportunity faction-gate already read, so a bribe you pay is felt at the merchant and in what contracts appear.

## The opportunity lifecycle

Opportunities are the engine's offered goals — and, since v2.9, the primary way to *earn* leverage.

1. **Spawn.** Every round, `evaluateOpportunities` scores candidate contracts / bounties / favors / supply-runs against live pressure, scarcity, faction, companion, and district state. It spawns scarcely: capped active count, a minimum interval, and pair-conflict dedup.
2. **Accept.** The `opportunity` verb (menu: *Accept*) moves an available opportunity to accepted.
3. **Resolve.** *Complete* or *Abandon*. Completion runs `computeOpportunityFallout` → `applyOpportunityFallout`, which writes the reward: reputation, economy shifts, **leverage currency**, and — for companion-tagged favors — a real morale change on that companion.
4. **Expire.** Ignore an accepted opportunity to its deadline and the authored expiry fallout now applies (reputation hits, obligations) — deadlines have teeth.

The endgame's rising-power and merchant-prince arcs read the opportunities you actually resolved, so a session spent running contracts reads differently at the finale than one spent fighting.

## Honest ceilings (v3.0)

- **Passive leverage income.** Today opportunity completion is the earning path; a passive drip from reputation/milestones (`tickLeverage` / `computeLeverageGains`) is authored but not yet wired.
- **The other 18 sub-verbs.** `player-leverage.ts` authors 22 social/rumor/diplomacy/sabotage actions; v2.9 deliberately ships four. The diplomacy and sabotage groups, plus the dialogue condition/effect vocabulary that reads this social state, are v3.0.
- **`escort` opportunities** are a defined kind with no spawn rule yet, and the named-NPC **PEOPLE** director section awaits a persisted npc-agency producer — the coherent anchor for a v3.0 "living NPCs" release.
