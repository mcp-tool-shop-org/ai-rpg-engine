---
title: "Beginners Guide"
description: "Get started with AI RPG Engine from scratch"
sidebar:
  order: 99
---

A step-by-step guide for developers new to AI RPG Engine. No prior game engine experience required.

---

## 1. What You Need

AI RPG Engine is a TypeScript monorepo. You need:

- **Node.js 20 or later** — the engine uses ESM modules and modern APIs
- **npm** — for installing dependencies (comes with Node.js)
- **A code editor** — VS Code, Neovim, or any TypeScript-capable editor
- **Git** — to clone the repository

Optional:

- **Ollama** — for AI-assisted worldbuilding (scaffold, diagnose, repair workflows). Not required for the engine itself.
- **ComfyUI** — for AI portrait generation. Not required for gameplay.

---

## 2. Installation and First Run

Clone the repository and set up the project:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-rpg-engine.git
cd ai-rpg-engine
npm install
npm run build
```

Run the test suite to verify everything works:

```bash
npm test
```

You should see all 2743 tests pass.

Run a starter world through the CLI:

```bash
node packages/cli/dist/bin.js run
```

This launches the fantasy starter in your terminal. You can move between zones, talk to NPCs, and fight enemies using text commands like `move crypt`, `speak pilgrim`, or `attack ghoul`.

---

## 3. Core Concepts

AI RPG Engine is built on five ideas. Understanding them makes the rest of the system click.

### The Engine is a Simulation, Not a Script

Traditional game engines run scripted scenes in order. AI RPG Engine runs a simulation. You define entities, zones, rules, and behaviors. The engine ticks forward, processes actions, and produces events. Stories emerge from systems interacting, not from predetermined sequences.

### Everything Flows Through Actions

Every state change goes through the same pipeline:

```
ActionIntent --> Validation --> Resolution --> Events --> Presentation
```

There are no backdoors. A player attacking, an NPC investigating, and a timed explosion all flow through `processAction()`. This guarantees determinism.

### Events Are the Currency

Every meaningful change produces a `ResolvedEvent` — a structured record of what happened, when, to whom, and why. Modules subscribe to events and react. Combat produces hit events. Perception filters check who noticed. Cognition updates beliefs. The event log is the complete truth of the simulation.

### Modules Are Composable

The core engine is small. It handles world state, actions, events, ticks, and RNG. Everything else — combat, dialogue, inventory, perception, AI cognition — is a module that plugs in. You pick the modules your game needs and skip the rest.

### Stats Are Genre-Neutral

The engine does not know what "strength" or "netrunning" means. A ruleset defines which stats exist, which resources are trackable, and which formulas govern interactions. The same engine runs a fantasy dungeon crawl and a cyberpunk heist because genre lives in the ruleset, not the runtime.

---

## 4. Building Your First Game

Here is the minimal code to create a working game from scratch:

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Step 1: Define your stat mapping (three roles for combat formulas)
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
});

// Step 2: Create the engine with your modules
const engine = new Engine({
  manifest: {
    id: 'my-first-game',
    title: 'My First Game',
    version: '1.0.0',
    engineVersion: '2.3.1',
    ruleset: 'custom',
    modules: [],
    contentPacks: [],
  },
  seed: 42,
  modules: [
    traversalCore,
    ...combat.modules,
  ],
});

// Step 3: Add zones
engine.store.addZone({
  id: 'village', name: 'Village Square',
  tags: ['safe'], neighbors: ['forest'],
});
engine.store.addZone({
  id: 'forest', name: 'Dark Forest',
  tags: ['dangerous'], neighbors: ['village'],
});

// Step 4: Add the player
engine.store.addEntity({
  id: 'hero', type: 'player', name: 'Adventurer',
  blueprintId: 'hero', tags: ['human'],
  stats: { might: 6, agility: 5, will: 4 },
  resources: { hp: 25 }, statuses: [],
});
engine.store.state.playerId = 'hero';
engine.store.state.locationId = 'village';

// Step 5: Add an enemy in the forest
engine.store.addEntity({
  id: 'wolf', type: 'enemy', name: 'Grey Wolf',
  blueprintId: 'wolf', tags: ['beast', 'hostile'],
  stats: { might: 4, agility: 6, will: 2 },
  resources: { hp: 12 }, statuses: [],
  zoneId: 'forest',
});

// Step 6: Play
engine.submitAction('move', { targetIds: ['forest'] }); // move to forest
engine.submitAction('attack', { targetIds: ['wolf'] });  // attack the wolf
```

Every call to `submitAction` returns an array of `ResolvedEvent` objects describing what happened. Your presentation layer reads those events and displays them to the player.

---

## 5. Understanding the Module System

Modules are the building blocks of game mechanics. Each module implements the `EngineModule` interface with three lifecycle methods:

| Method | When | Purpose |
|--------|------|---------|
| `register(ctx)` | Engine construction | Wire event listeners, verbs, formulas, persistence |
| `init(ctx)` | After all modules registered | Set up initial state |
| `teardown()` | Engine shutdown | Clean up |

### Picking Modules

You do not need every module. Here is a guide:

| If your game has... | Use these modules |
|--------------------|-------------------|
| Rooms to move between | `traversalCore` |
| Combat | `buildCombatStack()` (wires 8+ combat modules automatically) |
| NPC dialogue | `createDialogueCore(dialogues)` |
| NPC beliefs and memory | `createCognitionCore()` |
| Items | `createInventoryCore()` |
| Status effects (buffs/debuffs) | `statusCore` |
| Character abilities | `createAbilityCore()` + `createAbilityEffects()` |
| Factions | `createFactionCognition()` |
| Environmental hazards | `createEnvironmentCore()` |
| Skill trees | `createProgressionCore()` |

### Writing a Custom Module

```typescript
import type { EngineModule } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';

export function createRestModule(): EngineModule {
  return {
    id: 'rest-module',
    version: '1.0.0',
    register(ctx) {
      // Register a new verb
      ctx.actions.registerVerb('rest', (action, world) => {
        const entity = world.entities[action.actorId];
        if (entity) {
          entity.resources.hp = Math.min(
            (entity.resources.hp ?? 0) + 5,
            30
          );
        }
        return [{
          id: nextId(),
          tick: world.meta.tick,
          type: 'rest.completed',
          actorId: action.actorId,
          payload: { healed: 5 },
        }];
      });
    },
  };
}
```

Pass your module to the engine alongside the built-in ones:

```typescript
const engine = new Engine({
  manifest: myManifest,
  modules: [...combat.modules, createRestModule()],
});
```

---

## 6. Testing and Debugging

### Deterministic Replay

The engine uses seeded RNG. Given the same seed and the same sequence of actions, the engine produces identical results every time. This means:

- Bugs are reproducible — replay the session that triggered them
- Tests are stable — no flaky randomness
- Regression testing works — commit action logs as test fixtures

### The Test Harness

Use `createTestEngine()` to spin up isolated engine instances for testing:

```typescript
import { createTestEngine } from '@ai-rpg-engine/core';

const engine = createTestEngine({
  modules: [createRestModule()],
});

// Add entities, submit actions, check results
engine.submitAction('rest');
expect(engine.world.entities['player'].resources.hp).toBe(25);
```

### Observability

The engine records every event in `world.eventLog`. You can:

- Filter events by domain (`combat.*`, `dialogue.*`)
- Inspect entity beliefs through the cognition module
- Check perception logs to see what NPCs noticed or missed
- Examine district metrics for spatial aggregation
- Trace belief provenance to understand why an NPC holds a specific belief

### CLI Debugging

```bash
# Inspect a save file
node packages/cli/dist/bin.js inspect-save

# Replay a session
node packages/cli/dist/bin.js replay --verbose
```

---

## 7. Next Steps

Once you are comfortable with the basics, explore these topics:

### Learn from the Starters

The 10 starter worlds are composition examples. Each one demonstrates different patterns:

| Starter | What to study |
|---------|--------------|
| **starter-fantasy** | Simplest wiring — minimal combat, no resources |
| **starter-weird-west** | `buildCombatStack` reference, dual resource profile |
| **starter-cyberpunk** | Squad engagement with backline/protector tags |
| **starter-detective** | Social-first gameplay, perception-heavy |
| **starter-zombie** | Scarcity mechanics, infection as inverse resource |

Each starter has its own README explaining the patterns it demonstrates and what to borrow for your own game.

### Read the Composition Guide

[Chapter 57 — Composition Guide](./57-composition-guide.md) walks through the full workflow for building a game from scratch: stat mapping, combat stack, module selection, content creation.

### Explore Advanced Systems

- [Quest Webs](./42-quest-webs.md) — emergent opportunities generated from world conditions
- [AI-Assisted Worldbuilding](./36-ai-worldbuilding.md) — use Ollama to scaffold, diagnose, and repair content
- [Character Creation](./27-character-creation.md) — archetypes, backgrounds, traits, and multiclassing
- [Equipment System](./30-equipment.md) — slot-based equipment with item catalogs

### Key Resources

| Resource | Where |
|----------|-------|
| Handbook index | [Handbook](./index.md) |
| Module API reference | [Appendix C](./appendix-c-module-api.md) |
| Event types | [Appendix A](./appendix-a-event-vocabulary.md) |
| Content schemas | [Appendix B](./appendix-b-schema-reference.md) |
| CLI commands | [Appendix D](./appendix-d-cli-reference.md) |
| Source code | [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine) |
