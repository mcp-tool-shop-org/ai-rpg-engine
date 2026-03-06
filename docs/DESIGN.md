# SignalFire Design Overview

SignalFire is a simulation-first narrative engine for terminal RPGs. It maintains objective world truth, routes events through presentation channels that can lie, and supports pluggable genres through modular rulesets.

## Core Architecture

```
┌─────────────────────────────────────────────┐
│                   Engine                     │
│  ┌──────────┐ ┌────────────┐ ┌───────────┐ │
│  │WorldStore│ │ActionDisp. │ │ModuleMgr  │ │
│  │  state   │ │  verbs     │ │  modules  │ │
│  │  rng     │ │  validators│ │  formulas │ │
│  │  events  │ │            │ │  rules    │ │
│  └──────────┘ └────────────┘ └───────────┘ │
│         ┌──────────────┐                    │
│         │Presentation  │                    │
│         │  Channels    │                    │
│         └──────────────┘                    │
└─────────────────────────────────────────────┘
```

**WorldStore** holds the canonical simulation state: entities, zones, quests, factions, globals, event log, pending effects, and seeded RNG.

**ActionDispatcher** is the single front door into the simulation. Every state change flows through `dispatch(action)`: declare → validate → resolve → record → emit.

**ModuleManager** registers modules and wires their verbs, rules, events, persistence namespaces, UI panels, and formulas into the engine.

**PresentationChannels** routes resolved events through typed filters before the UI sees them. This is how the engine lies.

## Action Pipeline

```
Player/AI/Script
      │
      ▼
  ActionIntent { verb, actorId, targetIds, parameters }
      │
      ▼
  action.declared (event emitted)
      │
      ▼
  Validators (global + module rule checks)
      │ fail → action.rejected
      ▼
  VerbHandler (registered by module)
      │
      ▼
  ResolvedEvent[] (recorded to world log)
      │
      ▼
  action.resolved (event emitted)
      │
      ▼
  Tick advances
```

Every mutation goes through this pipeline. No backdoors.

## Event System

Events follow `domain.object.verb` naming:
- `combat.contact.hit`, `combat.entity.defeated`
- `world.zone.entered`, `world.zone.inspected`
- `resource.changed`, `status.applied`
- `dialogue.started`, `dialogue.ended`
- `action.declared`, `action.resolved`, `action.rejected`

The EventBus supports specific listeners, domain wildcards (`combat.*`), and catch-all (`*`).

## Module System

Modules plug mechanics into the engine without touching core:

```typescript
const myModule: EngineModule = {
  id: 'my-module',
  version: '0.1.0',
  dependsOn: ['other-module'],

  register(ctx) {
    ctx.actions.registerVerb('my-verb', handler);
    ctx.rules.registerCheck(myCheck);
    ctx.events.on('combat.*', myListener);
    ctx.persistence.registerNamespace('my-module', defaults);
    ctx.formulas.register('my-formula', myFn);
  },

  init(ctx) { /* called after all modules registered */ },
  teardown() { /* called on shutdown */ },
};
```

**Registries available:**
- `actions` — register verb handlers
- `rules` — register checks (pre-action) and effects (post-event)
- `events` — subscribe to event types
- `content` — extend schemas
- `persistence` — namespaced state that survives save/load
- `ui` — register panel renderers
- `debug` — register inspectors
- `formulas` — register/query named formula implementations

**Built-in modules:** traversal-core, status-core, combat-core, inventory-core, dialogue-core, narrative-authority.

## Ruleset Model

A `RulesetDefinition` declares what a genre provides:

```typescript
{
  id: 'fantasy-minimal',
  name: 'Fantasy Minimal',
  version: '0.1.0',
  stats: [{ id: 'vigor', name: 'Vigor', default: 5 }, ...],
  resources: [{ id: 'hp', name: 'HP', min: 0, default: 20 }, ...],
  verbs: [{ id: 'attack', name: 'Attack', tags: ['combat'] }, ...],
  formulas: [{ id: 'hit-chance', name: 'Hit Chance', inputs: [...], output: 'number' }],
  defaultModules: ['traversal-core', 'combat-core', ...],
  progressionModels: [],
}
```

The engine is genre-ignorant. It doesn't know what "vigor" means. The ruleset + modules + content define the genre. Proven by running both fantasy and cyberpunk on the same runtime.

## Truth vs Presentation

This is SignalFire's defining feature.

```
Objective Truth (WorldStore)
       │
       ▼
  ResolvedEvent
       │
       ├──→ [objective channel] → UI shows truth
       │
       └──→ [narrator channel] ──→ filters ──→ UI shows distortion
                                      │
                                      ├─ conceal (suppress event)
                                      ├─ distort (modify payload)
                                      └─ lie (replace entirely)
```

The same event can be presented differently on different channels. The narrative-authority module tracks contradictions between objective and presented events. Players can discover hidden truths later.

**Contradiction lifecycle:**
1. Event occurs (objective truth recorded)
2. Narrator filter modifies/conceals it
3. Contradiction recorded (eventId, objective vs presented)
4. Player finds evidence → `revealTruth(eventId)`
5. Contradiction marked discovered

## Content Pipeline

Content is validated at three levels:

1. **Schema validation** — each type (EntityBlueprint, ZoneDefinition, DialogueDefinition, etc.) checked for required fields, correct types, enum values
2. **Reference validation** — cross-content integrity (zone neighbors exist, dialogue speakers match entities, exit targets point to real zones, neighbor symmetry)
3. **Content loader** — combines both, produces summary or error report

```typescript
const result = loadContent({
  entities: [...],
  zones: [...],
  dialogues: [...],
  quests: [...],
});
// result.ok, result.errors, result.summary
```

## Save/Load and Replay

Full engine state serializes to JSON: world state + RNG state + action log.

Replay works by creating a fresh engine with the same seed and re-dispatching the action log. Deterministic RNG ensures identical results.

## Package Structure

```
packages/
  core/             — Engine, WorldStore, EventBus, ActionDispatcher, types
  content-schema/   — Author-facing types, validators, reference checker, loader
  modules/          — Built-in mechanical modules
  terminal-ui/      — Terminal renderer (scene, events, actions, dialogue)
  cli/              — signalfire run|replay|inspect-save
  starter-fantasy/  — The Chapel Threshold (fantasy demo)
  starter-cyberpunk/— Neon Lockbox (cyberpunk demo)
```

## Creating a New Game

1. Define a `RulesetDefinition` (stats, resources, verbs, formulas)
2. Write content (entities, zones, dialogues) using content-schema types
3. Select modules or write custom ones
4. Wire everything in a `createGame()` function
5. Run with `signalfire run` or embed the Engine directly

No core edits required. The engine doesn't know your genre exists until you tell it.
