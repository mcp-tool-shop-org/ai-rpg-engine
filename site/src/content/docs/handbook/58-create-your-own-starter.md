---
title: "Chapter 58 — Create Your Own Starter"
description: "Step-by-step guide to building a new starter from the template"
sidebar:
  order: 58
---

# Create Your Own Starter

The fastest path to a new game: copy the template and customize.

## Quick Start

The starter template is published on npm as an artifact to copy from (not a runtime dependency).

```bash
# 1. Get the template from npm
npm pack @ai-rpg-engine/starter-template
tar -xzf ai-rpg-engine-starter-template-*.tgz
mv package packages/starter-mygame
rm ai-rpg-engine-starter-template-*.tgz

# 2. Update package.json
#    - name: @ai-rpg-engine/starter-mygame
#    - description: your game's one-liner
#    - remove "files" array (you'll configure your own)

# 3. Install and build
npm install
npx tsc -p packages/starter-mygame/tsconfig.json

# 4. Run tests
npx vitest run packages/starter-mygame
```

Or, if working inside the monorepo:

```bash
cp -r templates/starter packages/starter-mygame
```

## What You Own vs What the Stack Owns

| Layer | Owner | You Touch? |
|-------|-------|-----------|
| Combat formulas (hit/damage/dodge) | `buildCombatStack` | No |
| Cognition, engagement, tactics | `buildCombatStack` | No |
| Recovery, intent, narration | `buildCombatStack` | No |
| **Stat mapping** | **You** | Config only |
| **Resource profile** | **You** | Config only |
| **Traversal + zones** | **You** | Yes |
| **Entities + content** | **You** | Yes |
| **Custom modules** | **You** | Yes |
| **Ruleset definition** | **You** | Yes |

## The Four Files You Edit

### 1. `src/ruleset.ts` — Declarative contract

Define your stats, resources, verbs, and formulas. The three combat stats must map to `attack`, `precision`, and `resolve` via `buildCombatStack`'s `statMapping`.

```typescript
stats: [
  { id: 'brawn', name: 'Brawn', min: 1, max: 20, default: 5 },    // → attack
  { id: 'reflex', name: 'Reflex', min: 1, max: 20, default: 5 },  // → precision
  { id: 'nerve', name: 'Nerve', min: 1, max: 20, default: 5 },    // → resolve
],
```

Add your starter-specific resource — this is what makes your game feel different:

```typescript
resources: [
  { id: 'hp', name: 'HP', min: 0, max: 100, default: 25 },
  { id: 'guts', name: 'Guts', min: 0, max: 50, default: 10 },  // your pressure lever
],
```

### 2. `src/content.ts` — Entities and world

Define your manifest, player, enemies, NPCs, and zones. Zones need `id`, `roomId`, `name`, `tags`, and `neighbors`.

### 3. `src/setup.ts` — Composition root

This is where the composition contract lives:

```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'brawn', precision: 'reflex', resolve: 'nerve' },
  playerId: 'player',
  recovery: { safeZoneTags: ['safe'] },
});

const engine = new Engine({
  modules: [
    traversalCore,
    statusCore,
    ...combat.modules,    // ← the full combat stack (9 modules)
    // YOUR MODULES HERE
    createMyCustomPressure(),
  ],
});
```

### 4. `src/starter.test.ts` — Smoke test

At minimum, verify:
- Ruleset validates against schema
- `createGame()` boots without throwing
- Your custom resource exists on the player

## Writing a Custom Module

```typescript
import type { EngineModule, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';

function createMyPressure(): EngineModule {
  return {
    id: 'my-pressure',
    version: '1.0.0',
    register(ctx) {
      ctx.events.on('combat.round.end', (event: ResolvedEvent, world: WorldState) => {
        const p = world.entities['player'];
        if (p) {
          p.resources.guts = Math.max(0, (p.resources.guts ?? 0) - 3);
        }
      });
    },
  };
}
```

## Optional: Resource Profile

If your combat costs resources (stamina for attacks, mana for abilities), configure `resourceProfile`:

```typescript
buildCombatStack({
  statMapping: { attack: 'brawn', precision: 'reflex', resolve: 'nerve' },
  resourceProfile: {
    spends: [
      { verbId: 'attack', costStat: 'stamina', amount: 2 },
      { verbId: 'use-ability', costStat: 'mana', amount: 5 },
    ],
  },
});
```

## Optional: Cognition Config

Control AI belief decay and morale:

```typescript
buildCombatStack({
  // ...
  cognition: {
    decay: { baseRate: 0.03, pruneThreshold: 0.1 },
    moraleFleeThresholds: { low: 20, critical: 10 },
  },
  // cognition: false,  // ← to exclude AI cognition entirely
});
```

## Checklist

- [ ] Three stats mapped to `attack`/`precision`/`resolve`
- [ ] At least one starter-specific resource
- [ ] `buildCombatStack` with `statMapping` (no custom formulas needed)
- [ ] At least one custom module demonstrating your game's pressure
- [ ] `createGame()` boots and tests pass
- [ ] `package.json` name follows `@ai-rpg-engine/starter-*` convention
