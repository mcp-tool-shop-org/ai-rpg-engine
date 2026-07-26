<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Equipment slots, item definitions, and loadout management for [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Install

```bash
npm install @ai-rpg-engine/equipment
```

## What It Does

Manages character equipment across 5 slots (weapon, armor, accessory, tool, trinket) with item catalogs, loadout operations, tag-based requirements, and aggregate effect computation. All operations are immutable.

## Usage

### Create and Equip

```typescript
import {
  createEmptyLoadout,
  equipItem,
  computeLoadoutEffects,
} from '@ai-rpg-engine/equipment';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

const catalog: ItemCatalog = {
  items: [
    {
      id: 'iron-sword',
      name: 'Iron Sword',
      description: 'A sturdy blade.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { str: 2 },
      grantedTags: ['armed'],
      grantedVerbs: ['slash'],
    },
  ],
};

let loadout = createEmptyLoadout();
const result = equipItem(loadout, 'iron-sword', catalog, []);
// result.loadout.equipped.weapon === 'iron-sword'
// result.errors === []

const effects = computeLoadoutEffects(result.loadout, catalog);
// effects.statModifiers.str === 2
// effects.grantedTags === ['armed']
```

### Inventory Management

```typescript
import { addToInventory, removeFromInventory } from '@ai-rpg-engine/equipment';

let loadout = createEmptyLoadout();
loadout = addToInventory(loadout, 'healing-potion');
const { loadout: updated, removed } = removeFromInventory(loadout, 'healing-potion');
```

### Validation

```typescript
import { validateLoadout } from '@ai-rpg-engine/equipment';

const result = validateLoadout(loadout, catalog, characterTags);
// result.ok, result.errors
```

## Slots

| Slot | Purpose |
|------|---------|
| `weapon` | Primary offensive item |
| `armor` | Defensive gear |
| `accessory` | Ring, amulet, augment |
| `tool` | Utility item (lockpick, scanner) |
| `trinket` | Charm, badge, passive item |

## Item Rarity

`common` | `uncommon` | `rare` | `legendary`

## Relic Growth — gear that earns a name

An item that has done something accumulates a history, and a history earns a name. A cutlass that has taken three lives becomes the **Bloodied Cutlass**. Growth is computed from the item's chronicle, never authored.

`evaluateRelicGrowth` is the read side — it turns a chronicle into a tier and an epithet:

```typescript
import { evaluateRelicGrowth } from '@ai-rpg-engine/equipment';

const relic = evaluateRelicGrowth(item, chronicle, currentTick);
// -> { currentEpithet: 'Bloodied Cutlass', milestonesReached: [...], tier: 1 }
```

Five triggers drive it — `kill-count`, `age`, `recognition-count`, `faction-kills`, `boss-kill` — counted off the chronicle. Weapons default to `DEFAULT_WEAPON_MILESTONES`, everything else to `DEFAULT_ARMOR_MILESTONES`; a pack can override per item.

`createItemChronicleCore` is the write side: an **opt-in** `EngineModule` that records history from real play.

```typescript
import { createItemChronicleCore, getItemDisplayName } from '@ai-rpg-engine/equipment';
import { evaluateItemRecognition } from '@ai-rpg-engine/modules';

// add to your engine's module list
createItemChronicleCore({
  catalog: itemCatalog,
  recognition: { evaluate: evaluateItemRecognition }, // optional
})

getItemDisplayName(world, 'cutlass', 'Cutlass'); // 'Bloodied Cutlass'
```

It records `acquired` (first pickup or equip), `used-in-kill` (credited to the killer's equipped weapon), and `recognized` (when someone in your zone reacts to your provenance). `recognition` is injected rather than imported because this package carries no runtime dependency on `@ai-rpg-engine/modules`. Read growth back with `getItemDisplayName`, `getRelicSummary`, `getItemChronicle`, or re-age on demand with `refreshRelicSummaries`.

Recording is deterministic — event-driven, keyed on `event.tick`, no wall clock and no RNG draw. A game that does not add the module is byte-identical to one built before it existed, and the module registers no namespace default, so a world where nothing is chronicled never materialises the state at all.

## Part of AI RPG Engine

This package is part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) monorepo.

## License

MIT
