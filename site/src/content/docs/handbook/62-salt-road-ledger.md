---
title: "Chapter 62 — Salt Road Ledger (Mercantile)"
description: "The eleventh starter, authored backwards from the ledger — obligation as the primary loop, combat priced as a penalty, and instruments that gate mechanics."
sidebar:
  order: 62
---

> Part X — On-Ledger Play (optional)

The eleventh starter, and the first authored backwards from a system rather than a genre. `@ai-rpg-engine/starter-merchant` exists because the [ledger adapter](./60-xrpl-ledger-adapter.md) had accumulated capabilities that no shipped pack was shaped to use: escrow was plumbing, unique gear was a sword with a receipt, and `reconcile()` was something a test called. Salt Road Ledger makes those the game.

You play a **factor** — an agent trading on someone else's capital. You do not own the goods you move; you owe for them. Every mechanic is a variation on that one pressure.

## The economic idea

Two resources do the work, and the distinction between them is the whole design:

- **`coin`** is what you hold.
- **`liquidity`** is what you can deploy *without calling in a debt*.

Selling on terms raises coin while consuming liquidity. At liquidity 0 you do not die — every `haggle` fails and every `consign` is refused, which is a more specific kind of stuck.

**`lien`** is the failure mode, and it is *inverse*: it starts empty and fills. Overdue consignments accrue it at `overdueTicks × value ÷ 10`. At **70** the Assay Guild seizes a consigned asset and marks you `encumbered`. At **90** your Guild Seal is revoked — the run's soft fail.

Nothing on the Salt Road is scarce. The `merchant` genre supply profile is deliberately the flattest and highest in the catalog (compare pirate's smuggling curve: luxuries 60, medicine 30). The constraint is never what exists; it is what you have promised.

## The five verbs

| Verb | What it does |
|------|--------------|
| `appraise` | Reads an item's true worth, rarity and provenance against the asking price. A higher `ledger` narrows the estimate band; no roll is involved. |
| `haggle` | Contests a price. Costs liquidity; `tongue` against the counterparty's `ledger`. The won margin is **banked against that counterparty** and consumed by your next `consign` with them. |
| `consign` | Hands goods over against future payment, creating an obligation with a due tick. **The goods leave your inventory immediately** — you are holding a promise instead of an object, and that gap is the risk. |
| `underwrite` | Takes on another party's risk for a fee. Liquidity now; if the party you guaranteed actually defaults, the claim fires and the lien lands. Otherwise the policy lapses and you keep the premium. |
| `audit` | Reconciles your books against a district's records and reports the discrepancies. Requires the Ledger Book — you cannot audit from memory. |

`consign` is the one worth dwelling on. It is the only verb in the catalog whose *offline* semantics — value held by a third party, released at a future tick, refunded if the counterparty defaults — are a one-to-one match for a settlement primitive that already existed. Everywhere else in the engine, escrow is plumbing. Here it is a plot device.

## Combat is a bad trade

Deliberately, and in the numbers rather than only in the prose:

- HP tops out at **24**, the lowest ceiling in the catalog, and a test pins it.
- The `CombatResourceProfile` has an **empty `gains` array**. No row anywhere rewards violence.
- Attacking and guarding spend liquidity, taking damage drains it, and `defeat-enemy` drains **5 more** — you have just damaged someone's property.
- The AI modifiers push a low-liquidity factor toward disengaging.

The stat mapping is wrong-footed on purpose: `attack → tongue`, `precision → ledger`, `resolve → standing`. A factor who ends up swinging does it by browbeating and backing, never by out-muscling anyone.

## Instruments gate mechanics, not stats

Five unique items, and two of them are load-bearing:

| Item | Effect |
|------|--------|
| `guild-seal` | Grants the `consign` verb. Without it you are cash-on-the-barrel only, which is the Warrens' whole pitch. |
| `ledger-book` | Grants `audit`. |
| `writ-of-passage` | Waives the Dockward tariff. Tradeable, which is precisely the problem. |
| `deed-of-the-longshore` | Passive liquidity, and the first thing collections will take. |
| `assayers-loupe` | `+2 ledger` for appraisals. |

Because the seal *grants a verb*, losing it removes a mechanic rather than a stat bonus. A seizure costs you the ability to do business, not two points of something.

The seal is also this pack's relic: its default milestones are `age` and `recognition-count`, so it grows by being **seen** rather than by killing anything. Wearing it in company records a `recognized` chronicle entry, and three of those earn it an epithet. [Iron Colosseum](./45-iron-colosseum.md) drives relic growth by kill-count, so the two packs together exercise both halves of the growth surface.

## The Warrens is a mechanic, not scenery

Four districts, three faction-controlled. **The Warrens has no controlling faction, deliberately**, and a test pins that it stays that way.

No faction means no escrow and no recourse: it is the one district where a direct payment is the only way to settle, and where prices are better precisely because nobody will help you. That makes the pack's comparison of the two settlement primitives something you *play* rather than something you configure.

## On-ledger play

This is the reference pack for the ledger adapter, and it carries **no dependency on it** — `firewall.test.ts` asserts that no manifest field, no import in any form, and no XRPL identifier ever appears in the pack. The coupling runs one way only: `contract-core` emits an event vocabulary, and a driver subscribes.

| Pack event | What a ledger driver does with it |
|---|---|
| `merchant.books.opened` | `enable()` — checkpoint 0 |
| `merchant.contract.consigned` | mirror as escrow, settled under memo `VERB:consign` |
| `merchant.contract.honoured` | escrow finish |
| `merchant.contract.defaulted` | escrow cancel |
| `merchant.instrument.seized` | `NFTokenBurn` — the named compensator |
| `merchant.audit.requested` | run `reconcile()` and render the report |

Every mechanic works fully offline. The adapter *mirrors*; it never *enables*. A run is byte-identical whether or not one is attached, and the [merchant played-session proof](./60-xrpl-ledger-adapter.md) settles both the fungible and NFT layers in a single session against this pack — proven live on testnet.

## What this pack is for

If you are building a game whose loop is obligation rather than combat, the obligation lifecycle in `contract-core.ts` is the part to read. If you need a system inside a pack without taking a dependency for it, the injected-ops pattern (status machinery and the recognition evaluator both passed in) is the seam to copy.

And if you want the discipline rather than the content: `anti-inert.test.ts` traces every headline mechanic through a real played session, and it found six that were wired, schema-valid, unit-green and dead — including a status with no producer, two items with no acquisition path, and a verb whose documented downside could not occur.
