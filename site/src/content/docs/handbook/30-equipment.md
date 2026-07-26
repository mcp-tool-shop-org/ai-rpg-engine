---
title: "Chapter 30 — Equipment System"
description: "Equipment System"
sidebar:
  order: 30
---

> Part VII — Systems

Slot-based equipment with item catalogs, loadout management, and aggregate effect computation.

## Package

`@ai-rpg-engine/equipment` — zero dependencies.

```bash
npm install @ai-rpg-engine/equipment
```

## Architecture

```
ItemCatalog → equipItem() → Loadout → computeLoadoutEffects() → LoadoutEffect
                ↓              ↓                                     ↓
          tag validation    5 slots                          stat/resource mods
          auto-inventory    + inventory                      tags + verbs
```

All operations are immutable — every function returns a new loadout.

## Equipment Slots

| Slot | Purpose |
|------|---------|
| `weapon` | Primary offensive item |
| `armor` | Defensive gear |
| `accessory` | Ring, amulet, augment |
| `tool` | Utility item |
| `trinket` | Charm, badge, passive |

## Item Definition

Each item has:

- **id/name/description** — identity
- **slot** — which slot it occupies
- **rarity** — common, uncommon, rare, legendary
- **statModifiers** — stat adjustments when equipped
- **resourceModifiers** — resource adjustments when equipped
- **grantedTags** — tags active while equipped
- **grantedVerbs** — verbs unlocked while equipped
- **requiredTags** — character must have these tags to equip
- **provenance** — flavor text for item origin

## Core Functions

- `createEmptyLoadout()` — all slots null, empty inventory
- `equipItem(loadout, itemId, catalog, characterTags)` — equip with validation; auto-moves replaced item to inventory
- `unequipItem(loadout, slot)` — move equipped item to inventory
- `addToInventory(loadout, itemId)` — add item to carried list
- `removeFromInventory(loadout, itemId)` — remove from carried list
- `computeLoadoutEffects(loadout, catalog)` — aggregate all equipped item effects
- `validateLoadout(loadout, catalog, characterTags)` — verify loadout integrity
- `getAllItems(loadout)` — list all equipped + inventory items

## Starter Gear

Each of the 7 starter packs exports an `itemCatalog` with 7 genre-appropriate items spanning all slots and rarities.

## Relic Growth — gear that earns a name

An item that has done something accumulates a history, and a history earns a name. A cutlass that has taken three lives becomes the **Bloodied Cutlass**; one that has taken twenty-five becomes **Cutlass, Drinker of Souls**. Growth is computed, never authored — you do not write the epithet, the item earns it.

Two pieces make this work, and for several releases only the first existed.

**The read side** (`relic-growth.ts`, shipped in v3.3) turns an item's history into a tier and an epithet:

```ts
const relic = evaluateRelicGrowth(item, chronicle, currentTick);
// -> { itemId, currentEpithet: 'Bloodied Cutlass', milestonesReached: [...], tier: 1 }
```

Growth is driven by five triggers, each counted off the item's chronicle: `kill-count`, `age`, `recognition-count`, `faction-kills`, and `boss-kill`. Weapons default to `DEFAULT_WEAPON_MILESTONES` (kills and renown); everything else defaults to `DEFAULT_ARMOR_MILESTONES` (age and recognition). A pack can override milestones per item.

**The write side** (`chronicle-core.ts`) is the producer. It is an **opt-in module** a pack adds to its own module list:

```ts
import { createItemChronicleCore } from '@ai-rpg-engine/equipment';
import { evaluateItemRecognition } from '@ai-rpg-engine/modules';

createItemChronicleCore({
  catalog: itemCatalog,
  recognition: { evaluate: evaluateItemRecognition }, // optional
})
```

It records three things as you play:

| Entry | When |
|---|---|
| `acquired` | the first time an item is picked up or equipped |
| `used-in-kill` | on `combat.entity.defeated`, credited to the killer's equipped weapon |
| `recognized` | when someone sharing your zone reacts to what you are carrying |

`recognition` is injected rather than imported because `@ai-rpg-engine/equipment` carries no runtime dependency on `@ai-rpg-engine/modules` — the same seam `createEquipmentCore` uses for its status ops. Omit it and `recognized` is never recorded.

### Reading growth back

The module persists both the raw history and an engine-computed summary, so a display surface never has to recompute anything:

```ts
getItemDisplayName(world, itemId, fallback) // 'Bloodied Trident & Net'
getRelicSummary(world, itemId)             // { milestoneCount, tier, displayName, epithet }
getItemChronicle(world)                    // itemId -> ItemChronicleEntry[]
```

The terminal HUD and the Director's ledger both read these, which is why they cannot disagree about an item's tier. `refreshRelicSummaries(world, config, tick)` re-ages every item on demand — useful at a checkpoint, since `age` advances with the clock rather than with events.

### Determinism

Recording happens in-tick, off the resolved event stream, keyed on `event.tick` — no wall clock, no RNG draw. Recognition deliberately uses the rule-driven `evaluateItemRecognition` and **not** the probabilistic `shouldRecognize`, because consuming a seeded roll would shift every subsequent roll in the run.

Legacy replay is preserved by construction. A pack that does not add the module has exactly the engine that shipped before it existed, and the module registers no namespace default — so a world where nothing is ever chronicled never materialises `world.modules['item-chronicle']` at all.

`starter-gladiator` is the first shipped pack to wire it: the arena is where a weapon earns its reputation. See `packages/starter-gladiator/src/relic-played-session.test.ts` for a full played session in which the retiarius trident ends the run as the Bloodied Trident & Net.

### Known ceilings

- **Recognition fires on equip, not continuously.** Equip in an empty room, walk into a crowd, and you are not noticed until you next change gear. Continuous scanning needs a per-tick perception pass that does not exist yet.
- **`lost` is never recorded.** There is no drop verb to key it off.
- **`faction-kills` needs content that sets `EntityState.faction`.** The trigger works; no shipped pack populates the field yet.
