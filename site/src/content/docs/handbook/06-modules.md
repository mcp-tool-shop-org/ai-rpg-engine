---
title: "Chapter 6 — Modules"
description: "Modules"
sidebar:
  order: 6
---


> Part II — Engine Architecture

How mechanics plug into the engine.

## Topics

- **Module lifecycle** — `register()`, `init()`, `teardown()`
- **Event listeners** — subscribing to simulation events
- **Formula registration** — contributing calculations to the engine
- **Namespaced state** — per-module data attached to world state

## Built-in Modules

Over 30 modules ship in the `@ai-rpg-engine/modules` package:

### Core Systems

| Module | Purpose |
|--------|---------|
| traversal-core | Movement between zones |
| combat-core | Attack, guard, disengage resolution, damage, defeat |
| inventory-core | Item management and usage |
| dialogue-core | Conversation trees and state |
| status-core | Buffs, debuffs, and timed effects |
| cognition-core | AI beliefs, memory, morale, and intent |
| perception-filter | Entity-level truth layers with sensory channels |
| progression-core | Currency, trees, and advancement |
| environment-core | Dynamic zone properties, hazards, and decay |
| narrative-authority | Truth concealment, distortion, and contradiction tracking |

### Combat Stack

| Module | Purpose |
|--------|---------|
| combat-tactics | Tactical triangle (brace, reposition), round flags |
| combat-resources | Genre resource integration (gains, spends, drains) |
| combat-intent | AI combat decision scoring with pack biases |
| combat-review | Formula tracing and combat transparency |
| combat-recovery | Post-combat wounds, morale aftermath |
| combat-state-narration | Narrative descriptions of combat state changes |
| engagement-core | Engagement states (engaged, protected, backline, isolated) |
| engagement-narration | Narrative descriptions of engagement changes |
| defeat-fallout | Post-defeat consequences |
| defeat-narration | Narrative descriptions of defeat events |
| combat-roles | Role templates, encounter composition, boss phases |
| encounter-library | Reusable encounter archetypes (patrol, ambush, horde, duel, boss) |
| combat-summary | Encounter auditing, region summaries, combat content overview |

### Ability System

| Module | Purpose |
|--------|---------|
| ability-core | Ability resolution with costs, cooldowns, stat checks |
| ability-effects | Typed effect handlers (damage, heal, status apply, cleanse) |
| ability-review | Ability trace recording |
| ability-intent | AI ability scoring with self/AoE/single-target evaluation |
| ability-builders | Helper functions for common ability patterns |
| ability-summary | Pack auditing and cross-pack comparison |
| status-semantics | 11-tag semantic vocabulary, resistance/vulnerability |
| unified-decision | Merges combat + ability scoring into one decision |

### Social and Political

| Module | Purpose |
|--------|---------|
| faction-cognition | Faction-level shared beliefs with propagation delay |
| rumor-propagation | Knowledge spreading between entities and factions |
| district-core | Zone-level event aggregation into district metrics |
| district-mood | District mood computation and modifiers |
| belief-provenance | End-to-end belief trace reconstruction |
| observer-presentation | Subjective event rendering per observer |
| social-consequence | Stance derivation, reputation consequences, title evolution |
| player-rumor | Player-originated rumors with mutation and spread |
| pressure-system | World pressures that drive faction and NPC behavior |
| pressure-resolution | Pressure fallout computation |
| faction-agency | Faction goal evaluation and autonomous action |
| player-leverage | Structured social play (social, rumor, diplomacy, sabotage verbs) |
| npc-agency | NPC goal evaluation, obligations, consequence chains |
| item-recognition | NPC item recognition based on knowledge and context |
| companion-core | Party state, companion morale, cohesion |
| companion-reactions | Companion departure risk and reaction evaluation |

### Strategic Layer

| Module | Purpose |
|--------|---------|
| strategic-map | District, faction, and hotspot aggregation |
| move-advisor | Deterministic scoring engine for action recommendations |
| opportunity-core | Emergent opportunity generation and lifecycle |
| opportunity-resolution | Opportunity fallout computation |
| arc-detection | Story arc momentum tracking |
| endgame-detection | Endgame trigger evaluation |
| economy-core | District-level supply tracking |
| trade-value | Context-sensitive item valuation |
| crafting-core | Material tracking and salvage |
| crafting-recipes | Recipe resolution, repair, modification |
| tag-taxonomy | Tag classification and validation |

Modules extend the engine without modifying core. Each module is self-contained, registering its verbs, event handlers, and formulas during initialization.

Use `buildCombatStack()` to wire the combat modules automatically. See the [Composition Guide](./57-composition-guide.md) for the recommended approach.

## Standalone Packages

These packages provide types and logic that work independently or alongside the built-in modules. Install them separately from npm.

| Package | Purpose |
|---------|---------|
| @ai-rpg-engine/presentation | Narration plan schema, render contracts, voice profiles |
| @ai-rpg-engine/audio-director | Cue scheduling, priority, ducking, cooldown logic |
| @ai-rpg-engine/soundpack-core | Sound pack manifests, content-addressable registry |
| @ai-rpg-engine/campaign-memory | Persistent NPC memory, relationship axes, campaign journal |
| @ai-rpg-engine/rumor-system | Rumor lifecycle, mutation mechanics, spread tracking |
| @ai-rpg-engine/character-creation | Archetypes, backgrounds, traits, multiclassing, build validation |
| @ai-rpg-engine/asset-registry | Content-addressed storage for portraits, icons, and media |
| @ai-rpg-engine/image-gen | Headless portrait generation pipeline with provider abstraction |
| @ai-rpg-engine/equipment | Equipment slots, item catalogs, and loadout management |
| @ai-rpg-engine/character-profile | Persistent character profiles with progression, injuries, and save/load |

Standalone packages have no engine dependency -- they define types and logic that game runtimes consume. The built-in modules handle engine integration (event listeners, world state mutation), while standalone packages handle domain logic (how memories decay, how rumors mutate).

## Starter Packs

Pre-built worlds that wire modules with genre-specific rulesets, content, and progression. Each is a composition example demonstrating different patterns.

| Package | Genre | Stats | Unique Verbs |
|---------|-------|-------|--------------|
| @ai-rpg-engine/starter-fantasy | Dark fantasy | vigor, instinct, will | pray, rest |
| @ai-rpg-engine/starter-cyberpunk | Cyberpunk | chrome, reflex, netrunning | jack-in |
| @ai-rpg-engine/starter-detective | Victorian mystery | perception, eloquence, grit | interrogate, deduce |
| @ai-rpg-engine/starter-pirate | High-seas pirate | brawn, cunning, sea-legs | plunder, navigate |
| @ai-rpg-engine/starter-zombie | Zombie survival | fitness, wits, nerve | barricade, scavenge |
| @ai-rpg-engine/starter-weird-west | Weird west | grit, draw-speed, lore | draw, commune |
| @ai-rpg-engine/starter-colony | Sci-fi colony | engineering, command, awareness | scan, allocate |
| @ai-rpg-engine/starter-ronin | Feudal Japan | discipline, reflex, honor | meditate, shadow-step |
| @ai-rpg-engine/starter-vampire | Vampire horror | presence, cunning, bloodline | feed, mesmerize |
| @ai-rpg-engine/starter-gladiator | Historical gladiator | might, agility, showmanship | taunt, rally |
