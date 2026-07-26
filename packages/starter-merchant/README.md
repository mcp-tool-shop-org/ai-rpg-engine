<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-merchant

> **Composition Example** — This starter demonstrates how to build a game whose loop is obligation rather than combat. It is an example to learn from, not a template to copy. See the [Composition Guide](../../docs/handbook/57-composition-guide.md) to build your own game.

**Salt Road Ledger** — You are a factor of a small trading house. You do not own the goods you move; you owe for them. Every coin you are owed is a knife someone else is holding.

Part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) starter pack catalog.

## Theme

Mercantile pressure, wry and then ruinous. Nothing on the Salt Road is scarce — the constraint is what you have promised. `liquidity` is what you can deploy without calling in a debt; `lien` accrues when you cannot, and at 70 the Assay Guild takes a consigned asset. At 90 it takes your seal.

Combat exists and is deliberately a **bad trade**. HP tops out at 24, the lowest ceiling in the catalog, and the combat resource profile has an empty `gains` array — no row anywhere rewards violence. Attacking spends liquidity, taking damage drains it, and winning drains 5 more, because you have just damaged someone's property.

## Quick Start

```typescript
import { createGame } from '@ai-rpg-engine/starter-merchant';

const engine = createGame(71);

// Register with the Assay Guild — the seal is what makes consignment possible
engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
engine.submitAction('choose', { parameters: { choiceId: 'register' } });

// Read the goods, contest the terms, then hand them over
engine.submitAction('appraise', { parameters: { itemId: 'bale-of-flax' } });
engine.submitAction('move', { targetIds: ['long-quay'] });
engine.submitAction('move', { targetIds: ['crooked-stair'] });
engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

// Reconcile your own books
engine.submitAction('audit');
```

## Patterns Demonstrated

- **A non-combat primary loop** — five commerce verbs carry the game; the combat stack is wired but priced as a penalty
- **An inverted resource profile** — `CombatResourceProfile` with no `gains`, so the AI pushes a low-liquidity factor toward disengaging
- **A pack-local module** — `contract-core` lives inside the starter rather than in `@ai-rpg-engine/modules`, because it has exactly one consumer. Promote at the second.
- **Injected ops instead of new dependencies** — status machinery and the recognition evaluator are passed in, the same seam `createEquipmentCore` uses
- **Instruments that gate mechanics, not stats** — the Guild Seal grants `consign` and the Ledger Book grants `audit`, so a seizure removes a verb
- **An uncontrolled district as a mechanic** — the Warrens has no controlling faction, which is what makes it the one place with no escrow and no recourse

## Unique Mechanics

| Verb | What it does |
|------|--------------|
| `appraise` | Reads true worth, rarity and provenance against the asking price. A better `ledger` narrows the band. |
| `haggle` | Contests a price. Costs liquidity; the won margin is banked against that counterparty and consumed by your next `consign` with them. |
| `consign` | Hands goods over against future payment, creating an obligation with a due tick. The goods leave your inventory immediately — that gap is the whole risk. |
| `underwrite` | Takes on another party's risk for a fee. Liquidity now; if the party you guaranteed defaults, the claim fires and the lien lands. |
| `audit` | Reconciles your books and reports the discrepancies. Requires the Ledger Book — you cannot audit from memory. |

**The obligation clock** runs on movement rather than a timer. Overdue consignments accrue lien at `overdueTicks × value ÷ 10`. Seizure at lien 70 takes the obligation whose item id sorts lowest — deterministic, never a roll.

## Content

- **8 zones** across 4 districts: Saltgate (the lawful market), Dockward (tariffs and delay), the Warrens (cash on the barrel), and the High Counting House
- **4 NPCs** — Assay Master Corvane, Harbourmaster Drell, Broker Inaya, Exchequer Null
- **3 hostiles + 1 boss** — The Standing Account is not a creature but a reckoning, with phases keyed to how encumbered you arrive
- **3 quests** — Open the Books, The Late Caravan, The Standing Account
- **14 items** split into fungible trade goods and five unique instruments

## Stats & Resources

| Stat | Role |
|------|------|
| `ledger` | Arithmetic, memory, fraud detection |
| `tongue` | Negotiation and misdirection |
| `standing` | Who vouches for you |

| Resource | Behaviour |
|----------|-----------|
| `hp` | 24 max — the lowest in the catalog |
| `stamina` | Standard action economy |
| `coin` | What you hold |
| `liquidity` | What you can deploy without calling in a debt |
| `lien` | **Inverse** — starts empty and fills toward seizure |

Combat maps `attack → tongue`, `precision → ledger`, `resolve → standing`: a factor who ends up swinging does it by browbeating and backing, never by out-muscling anyone.

## On-Ledger Play (optional)

This is the reference pack for `@ai-rpg-engine/ledger-adapter`. It carries no dependency on it — a test asserts that it never will — but its mechanics are the ones the adapter was built to meet: `consign` is a settlement primitive wearing a plot device, `audit` is the external verifier as a playable verb, and a lien seizure is the named burn compensator arriving in fiction. See [Chapter 60](../../docs/handbook/60-xrpl-ledger-adapter.md) and [Chapter 61](../../docs/handbook/61-xrpl-nft-gear.md).

## What to Borrow

The obligation lifecycle, if your game has debt. The injected-ops pattern, if your pack needs a system without taking a dependency. And the anti-inert audit in `anti-inert.test.ts` — it traces every headline mechanic through a real played session and found six that were wired, schema-valid, unit-green and dead.

## License

MIT
