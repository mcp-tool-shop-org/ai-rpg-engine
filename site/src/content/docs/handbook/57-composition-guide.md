---
title: "Chapter 57 — Composition Guide"
description: "How to build your own game by composing engine modules"
sidebar:
  order: 57
---

# Chapter 57 — Composition Guide

AI RPG Engine ships 10 starter worlds. They are **examples**, not templates. Each one demonstrates how to combine engine modules into a game with its own combat identity, resource economy, and narrative pressure.

This chapter shows you how to build your own game by composing the same pieces the starters use.

---

## The Shape of a Game

Every game built on the engine has the same structure:

```
stat mapping → combat stack → modules → content → Engine constructor
```

You define stats, configure combat, pick the modules you need, create your content (entities, zones, dialogue), and wire it all into `new Engine()`. That's the whole pattern.

The starters add demo glue on top — scripted event listeners for item gifts, audio cues, and fallout hooks. Those are polish, not architecture.

---

## Step 1: Name Your Stats

Every game needs a **stat mapping** — three stat roles that drive every combat formula:

| Role | What It Drives | Example Names |
|------|---------------|---------------|
| **Attack** | Damage, guard breakthrough | vigor, might, brawn, chrome, grit, fitness |
| **Precision** | Hit chance, disengage, guard counter | instinct, agility, cunning, reflex, perception, wits |
| **Resolve** | Guard absorption, brace resistance, morale | will, composure, sea-legs, command, presence, nerve |

The golden rule: **three distinct stats, never collapse attack = resolve**. If your attack and resolve map to the same stat, guard breakthrough becomes trivial and combat loses its tension.

```typescript
const statMapping = { attack: 'might', precision: 'agility', resolve: 'will' };
```

You can define stats beyond these three — exploration stats, social stats, crafting stats. The mapping only governs combat formulas.

---

## Step 2: Choose Your Combat Stack

`buildCombatStack` is the recommended entry point. It generates formulas, wraps them with engagement and resource modifiers, sets up review tracing, and returns a module array.

### Minimal combat (no resources, no engagement roles)

```typescript
import { buildCombatStack } from '@ai-rpg-engine/modules';

const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
});
```

### Combat with a resource profile

```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  resourceProfile: {
    packId: 'my-game',
    gains: [
      { trigger: 'attack-hit', resourceId: 'momentum', amount: 2 },
    ],
    spends: [
      { action: 'attack', resourceId: 'momentum', amount: 5, effects: { damageBonus: 2 } },
    ],
    drains: [],
    aiModifiers: [],
  },
});
```

### Combat with engagement roles

```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  engagement: {
    backlineTags: ['ranged', 'caster'],
    protectorTags: ['bodyguard'],
  },
  biasTags: ['undead', 'beast'],
});
```

See [Build a Combat Pack](./55-combat-pack-guide) for deep combat authoring.

---

## Step 3: Wire Your Modules

Pick the modules your game needs:

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { traversalCore, statusCore, buildCombatStack, createDialogueCore, createCognitionCore, /* ... */ } from '@ai-rpg-engine/modules';

const combat = buildCombatStack({ /* ... */ });

const engine = new Engine({
  manifest: { id: 'my-game', title: 'My Game', version: '1.0.0' },
  seed: 42,
  modules: [
    traversalCore,
    statusCore,
    ...combat.modules,
    createDialogueCore(myDialogues),
    createCognitionCore({ decay: { baseRate: 0.02 } }),
    // ... add what you need
  ],
});
```

| If your game has... | You need |
|--------------------|----------|
| Rooms to move between | `traversalCore` |
| Combat | `buildCombatStack` |
| NPC dialogue | `createDialogueCore` |
| NPC beliefs and memory | `createCognitionCore` |
| Items and equipment | `createInventoryCore` |
| Factions | `createFactionCognition` |
| Character abilities | `createAbilityCore` + `createAbilityEffects` |
| Boss encounters | `createBossPhaseListener` |

---

## Step 4: Create Your Content

```typescript
engine.store.addZone({ id: 'cave', name: 'Goblin Cave', tags: ['dark'], exits: [{ to: 'clearing' }] });
engine.store.addEntity({ id: 'hero', type: 'player', name: 'Fighter', tags: ['human'], stats: { might: 6, agility: 5, will: 4 }, resources: { hp: 25, maxHp: 25 }, inventory: [], equipment: {}, statuses: [] });
engine.store.state.playerId = 'hero';
engine.store.state.locationId = 'cave';
```

---

## Remixing Starters

| Starter | Best Pattern to Borrow |
|---------|----------------------|
| **Fantasy** | Simplest combat wiring — no resources, no engagement roles |
| **Weird West** | `buildCombatStack` usage, dual resource profile |
| **Cyberpunk** | Squad engagement with backline/protector tags |
| **Detective** | Defensive resource spending |
| **Pirate** | Crew morale as shared group resource |
| **Zombie** | Consequence-only resource (infection) |
| **Vampire** | Opposing dual resources (bloodlust vs humanity) |
| **Gladiator** | Performance economy, 3-phase boss |
| **Ronin** | Multiple protector roles, dual-layer resources |

---

## See Also

- [Build a Combat Pack](./55-combat-pack-guide) — deep combat authoring
- [Combat Overview](./49a-combat-overview) — the six pillars
- [Tuning Philosophy](./56-tuning-philosophy) — what to tune vs leave alone
- [Modules](./06-modules) — module system architecture
