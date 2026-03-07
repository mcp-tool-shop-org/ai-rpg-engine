# Chapter 30 — Equipment System

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
