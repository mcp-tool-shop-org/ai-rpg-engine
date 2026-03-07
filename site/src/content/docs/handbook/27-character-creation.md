---
title: "Chapter 27 — Character Creation"
description: "Character Creation System"
sidebar:
  order: 27
---

> Part VII — Systems

How the engine handles player identity through archetypes, backgrounds, traits, and multiclassing.

## Package

`@ai-rpg-engine/character-creation` — standalone, depends only on `@ai-rpg-engine/core` for type imports. No engine runtime dependency.

```bash
npm install @ai-rpg-engine/character-creation
```

## Concepts

| Concept | Description |
|---------|-------------|
| Archetype | Primary class — base stats, starting tags, progression tree |
| Background | Origin story — stat modifiers, starting tags, optional inventory |
| Trait | Perk or flaw — stat/resource/tag/verb/faction effects |
| Discipline | Secondary class — 1 granted verb, 1 passive, 1 drawback |
| Cross-Title | Synthesized identity from archetype + discipline combo |
| Entanglement | Friction effect from certain archetype + discipline combos |
| Build Catalog | Pack-specific menu of all character options |
| Character Build | Player's choices (archetype, background, traits, discipline) |

## Multiclassing

The system uses **structured identity fusion**, not additive spreadsheet stacking:

- **Primary archetype** sets the character's core identity (base stats, progression tree, starting tags)
- **Secondary discipline** is compact: 1 verb, 1 passive effect, 1 drawback
- Each archetype + discipline combo produces a **cross-discipline title** that synthesizes the identity (e.g., "Grave Warden", "Hex Pistol", "Synapse Surgeon")
- Some combos create **entanglements** — friction effects that reflect narrative tension (e.g., a divine scholar who smuggles attracts unwanted attention)

## Build Catalog

Each starter pack exports a `buildCatalog: BuildCatalog` alongside its content. The catalog defines:

- 3 archetypes with stat priorities and starting tags
- 3 backgrounds with stat modifiers
- 4 traits (2 perks, 2 flaws)
- 2 disciplines with granted verbs
- 6 cross-discipline titles (3 archetypes x 2 disciplines)
- Optional entanglements

All catalogs share the same budget: `statBudget: 3`, `maxTraits: 3`, `requiredFlaws: 1`.

## Validation

`validateBuild(build, catalog, ruleset)` checks:

1. Archetype, background, traits, discipline all exist in catalog
2. No incompatible traits selected
3. Trait count within limit
4. Required flaw count met
5. Discipline required tags satisfied
6. Stat budget not exceeded
7. Stats clamped to ruleset bounds

Returns `BuildValidationResult` with computed final stats, final resources, resolved title, resolved tags, errors, and entanglement warnings.

## Entity Resolution

`resolveEntity(build, catalog, ruleset)` produces a full `EntityState`:

- `id: 'player'`, `type: 'player'`
- `blueprintId` set to archetype ID
- Computed stats = archetype base + background modifiers + trait effects + discipline effects + allocations
- Computed resources = ruleset defaults + archetype overrides + trait effects + discipline effects
- Tags merged from archetype, background, traits, title, entanglements
- Inventory merged from archetype, background
- Custom metadata: `archetypeId`, `backgroundId`, `disciplineId`, `portraitRef`, `title`

## Trait Effects

Traits produce one or more `TraitEffect`:

| Type | Example |
|------|---------|
| `stat-modifier` | `{ stat: 'dex', amount: 1 }` |
| `resource-modifier` | `{ resource: 'hp', amount: -3 }` |
| `grant-tag` | `{ tag: 'curse-touched' }` |
| `verb-access` | `{ verb: 'steal' }` |
| `faction-modifier` | `{ faction: 'guard', amount: -10 }` |

## Option Helpers

For building character creation UIs:

- `getAvailableArchetypes(catalog)` — all archetypes
- `getAvailableBackgrounds(catalog)` — all backgrounds
- `getAvailableTraits(catalog, selectedIds)` — filters out incompatible traits
- `getAvailableDisciplines(catalog, archetypeId, tags)` — filters by required tags
- `getStatBudgetRemaining(build, catalog)` — remaining allocatable points

## Serialization

Builds serialize to compact JSON for save files:

```typescript
import { serializeBuild, deserializeBuild } from '@ai-rpg-engine/character-creation';

const json = serializeBuild(build);
const restored = deserializeBuild(json);
```

`validateSerializedBuild(json)` validates structure without needing a catalog.

## Example

```typescript
import { validateBuild, resolveEntity } from '@ai-rpg-engine/character-creation';
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

const entity = resolveEntity(build, buildCatalog, content.ruleset);
// entity.id === 'player'
// entity.tags includes 'martial', 'oath-broken', 'curse-touched', 'grave-warden'
```
