<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-creation

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-creation)](https://www.npmjs.com/package/@ai-rpg-engine/character-creation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Headless character creation system — archetypes, backgrounds, traits, multiclassing, and build validation for [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Install

```bash
npm install @ai-rpg-engine/character-creation
```

## What It Does

Characters aren't spreadsheets — they're identities. This package handles the structured fusion of primary archetype, background origin, personality traits, and optional secondary discipline into a validated player entity. Each archetype + discipline combo produces a cross-discipline title that synthesizes the character's identity rather than just stacking numbers.

## Usage

### Validate a Build

```typescript
import { validateBuild } from '@ai-rpg-engine/character-creation';
import { content, buildCatalog } from '@ai-rpg-engine/starter-fantasy';

const build = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: ['iron-frame', 'cursed-blood'],
  disciplineId: 'occultist',
  statAllocations: { vigor: 2, instinct: 1 },
};

const result = validateBuild(build, buildCatalog, content.ruleset);
// result.ok === true
// result.resolvedTitle === 'Grave Warden'
// result.finalStats === { vigor: 8, instinct: 6, will: 1 }
// result.resolvedTags includes 'martial', 'oath-broken', 'curse-touched', 'grave-warden'
```

### Resolve to EntityState

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, buildCatalog, content.ruleset);
// Full EntityState ready for the engine:
// entity.id === 'player'
// entity.blueprintId === 'penitent-knight'
// entity.stats, entity.resources, entity.tags, entity.inventory all computed
// entity.custom === { archetypeId, backgroundId, disciplineId, title, portraitRef }
```

### Browse Available Options

```typescript
import {
  getAvailableArchetypes,
  getAvailableBackgrounds,
  getAvailableTraits,
  getAvailableDisciplines,
  getStatBudgetRemaining,
} from '@ai-rpg-engine/character-creation';

const archetypes = getAvailableArchetypes(buildCatalog);
const backgrounds = getAvailableBackgrounds(buildCatalog);
const traits = getAvailableTraits(buildCatalog, ['iron-frame']); // filters incompatible
const disciplines = getAvailableDisciplines(buildCatalog, 'penitent-knight', ['martial']);
const remaining = getStatBudgetRemaining(build, buildCatalog); // points left to allocate
```

### Serialize for Save Files

```typescript
import { serializeBuild, deserializeBuild, validateSerializedBuild } from '@ai-rpg-engine/character-creation';

const json = serializeBuild(build);
const restored = deserializeBuild(json);
const check = validateSerializedBuild(json); // { ok: true, errors: [] }
```

## Concepts

| Concept | Description |
|---------|-------------|
| **Archetype** | Primary class — base stats, starting tags, progression tree |
| **Background** | Origin story — stat modifiers, starting tags, optional inventory |
| **Trait** | Perk or flaw — effects on stats, resources, tags, verbs, or factions |
| **Discipline** | Secondary class — 1 granted verb, 1 passive effect, 1 drawback |
| **Cross-Title** | Synthesized identity from archetype + discipline (e.g., "Grave Warden") |
| **Entanglement** | Friction effect from certain archetype + discipline combos |
| **Build Catalog** | Pack-specific menu of all character options |

## Multiclassing

The system uses structured identity fusion, not additive stacking:

- **Primary archetype** defines core identity (base stats, progression tree, starting tags)
- **Secondary discipline** is compact: 1 verb, 1 passive, 1 drawback
- Each combo produces a **cross-discipline title** ("Hex Pistol", "Synapse Surgeon", "Quarantine Marshal")
- Some combos create **entanglements** — narrative friction effects

## Trait Effects

| Type | Example |
|------|---------|
| stat-modifier | `{ stat: 'dex', amount: 1 }` |
| resource-modifier | `{ resource: 'hp', amount: -3 }` |
| grant-tag | `{ tag: 'curse-touched' }` |
| verb-access | `{ verb: 'steal' }` |
| faction-modifier | `{ faction: 'guard', amount: -10 }` |

## Build Catalogs

All 7 starter packs export a `buildCatalog` with pack-specific options. Each catalog includes 3 archetypes, 3 backgrounds, 4 traits (2 perks + 2 flaws), 2 disciplines, and 6 cross-discipline titles.

## Part of AI RPG Engine

This package is part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) monorepo. It depends only on `@ai-rpg-engine/core` for type imports — no engine runtime dependency.

## License

MIT
