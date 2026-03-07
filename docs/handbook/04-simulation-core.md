# Chapter 4 — The Simulation Core

> Part II — Engine Architecture

The simulation core is the runtime that powers every AI RPG Engine world. It manages world state, processes actions, emits events, and advances time. Everything else — modules, rulesets, presentation — builds on top of this foundation.

---

## WorldState

All simulation truth lives in a single `WorldState` object:

| Field | Type | Purpose |
|-------|------|---------|
| `meta` | `WorldMeta` | World ID, game ID, tick counter, RNG seed, active ruleset and modules |
| `playerId` | `string` | The player entity ID |
| `locationId` | `string` | Current player zone |
| `entities` | `Record<string, EntityState>` | All actors, objects, and interactables |
| `zones` | `Record<string, ZoneState>` | Spatial containers with properties and connections |
| `quests` | `Record<string, QuestState>` | Active and completed quest state |
| `factions` | `Record<string, FactionState>` | Faction definitions and relationships |
| `globals` | `Record<string, ScalarValue>` | Arbitrary key-value state (flags, counters) |
| `modules` | `Record<string, unknown>` | Per-module namespaced state |
| `eventLog` | `ResolvedEvent[]` | Complete history of all events |
| `pending` | `PendingEffect[]` | Delayed effects scheduled for future ticks |
| `narrator` | `NarratorState?` | Optional narrator state for presentation layers |

The WorldStore class wraps WorldState and provides typed operations for entity lookup, resource modification, stat queries, zone management, event recording, and serialization.

---

## Entities

Every actor, object, and interactable in the world is an `EntityState`:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `string` | Unique identifier |
| `blueprintId` | `string` | Content definition this entity was created from |
| `type` | `string` | Category: `"npc"`, `"enemy"`, `"item"`, `"object"` |
| `name` | `string` | Display name |
| `tags` | `string[]` | Searchable labels (`"hostile"`, `"merchant"`, `"quest-giver"`) |
| `stats` | `Record<string, number>` | Stable capabilities (vigor, reflex, will) |
| `resources` | `Record<string, number>` | Trackable pools (hp, stamina, heat) |
| `statuses` | `AppliedStatus[]` | Active status effects with duration |
| `inventory` | `string[]?` | Item entity IDs |
| `equipment` | `Record<string, string>?` | Slot-to-item ID mapping |
| `zoneId` | `string?` | Current location |
| `ai` | `AIState?` | AI profile, goals, fears, alert level, knowledge |
| `custom` | `Record<string, ScalarValue>?` | Ruleset-specific data |

Stats and resources are genre-neutral. A fantasy ruleset defines `vigor`, `instinct`, `will` as stats and `hp`, `stamina` as resources. A cyberpunk ruleset defines `chrome`, `reflex`, `netrunning` as stats and `hp`, `heat` as resources. The engine treats them identically.

---

## Actions and the Resolution Pipeline

Every state change flows through the action pipeline. There are no backdoors.

```
ActionIntent --> Validation --> Resolution --> Events --> Presentation
```

### 1. Declaration

An action starts as an `ActionIntent` with a verb, actor, optional targets, and parameters. The engine emits an `action.declared` event immediately.

### 2. Validation

Every registered validator runs against the action and current world state. Validators check things like: does the actor have enough stamina? Is the target in the same zone? Is this verb legal in the current context?

If any validator fails, the engine emits `action.rejected` with a structured reason and stops. No state changes occur.

### 3. Resolution

The verb handler (registered by a module) executes the action against the world state and returns resolved events. For example, the combat module's `attack` handler calculates damage, applies it, checks for defeat, and returns events describing what happened.

### 4. Recording

All resolved events are recorded in the event log and emitted through the event bus. Other modules can listen and react — cognition updates beliefs, perception filters check visibility, environment tracks noise.

### 5. Pending Effects

After resolution, the engine processes any pending effects that are due at the current tick. Pending effects are delayed consequences — a poison tick, a timed explosion, a status expiration.

### 6. Tick Advance

The tick counter increments after each action. This provides a discrete, deterministic time axis that all systems reference.

---

## Ticks and Time

The engine uses discrete ticks rather than real-time. Each call to `processAction()` advances the tick by one.

Ticks serve as the universal clock:
- Events record which tick they occurred at
- Statuses track their start tick and duration
- Pending effects specify which tick to execute at
- AI memories record when they were formed
- Knowledge decay references tick distances

This makes the simulation fully deterministic — given the same seed and the same sequence of actions, the engine produces identical results every time.

---

## The Engine Class

The `Engine` class ties everything together. It creates a WorldStore, an ActionDispatcher, and a ModuleManager. Modules register their verbs, event listeners, rules, formulas, and persistence namespaces during construction.

The engine exposes:

| Method / Property | Purpose |
|-------------------|---------|
| `submitAction(verb, options)` | Process a player action |
| `processAction(action)` | Process any action (player, AI, or system) |
| `getAvailableActions()` | List all registered verbs |
| `serialize()` | Full state snapshot for save/load |
| `world` | Read-only access to current WorldState |
| `tick` | Current tick number |
| `formulas` | Access to the formula registry |

---

## Deterministic Replay

Because every state change flows through `processAction()` and the RNG is seeded, the engine supports deterministic replay:

1. Record the seed and every ActionIntent in order
2. Create a new engine with the same seed
3. Replay each action — the world state will be identical

This is the foundation of the engine's debugging and testing workflow. The portability tests verify that two engines created with the same seed and given the same actions produce byte-identical serialized state.

---

## Module State Persistence

Each module can register a namespaced state slot in `world.modules`. The engine deep-clones default state during initialization (via `structuredClone`), so module state must be serializable — no functions, no circular references.

Modules that need runtime-only data (like function references) use the registry pattern: store a serializable key in module state, keep the actual functions in a module-level Map outside the world state.

---

## Summary

The simulation core provides five guarantees:

1. **Single entry point** — all state changes go through the action pipeline
2. **Structured events** — every change produces queryable, replayable events
3. **Determinism** — same seed + same actions = same results
4. **Serialization** — full state can be saved, loaded, and compared
5. **Modularity** — the core knows nothing about combat, dialogue, or any specific system
