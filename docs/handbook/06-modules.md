# Chapter 6 — Modules

> Part II — Engine Architecture

How mechanics plug into the engine.

## Topics

- **Module lifecycle** — `register()`, `init()`, `teardown()`
- **Event listeners** — subscribing to simulation events
- **Formula registration** — contributing calculations to the engine
- **Namespaced state** — per-module data attached to world state

## Built-in Modules

| Module | Purpose |
|--------|---------|
| traversal-core | Movement between zones |
| combat-core | Attack resolution, damage, defeat |
| inventory-core | Item management and usage |
| dialogue-core | Conversation trees and state |
| status-core | Buffs, debuffs, and timed effects |
| cognition-core | AI beliefs, memory, and intent |
| perception-filter | Entity-level truth layers |
| progression-core | Currency, trees, and advancement |
| environment-core | Dynamic zone properties and hazards |
| narrative-authority | Truth concealment and distortion |

Modules extend the engine without modifying core. Each module is self-contained, registering its verbs, event handlers, and formulas during initialization.

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

Standalone packages have no engine dependency — they define types and logic that game runtimes consume. The built-in modules handle engine integration (event listeners, world state mutation), while standalone packages handle domain logic (how memories decay, how rumors mutate).

## Starter Packs

Pre-built worlds that wire all 15 modules with genre-specific rulesets, content, and progression. Each is a single `createGame()` call.

| Package | Genre | Stats | Unique Verbs |
|---------|-------|-------|--------------|
| @ai-rpg-engine/starter-fantasy | Dark fantasy | vigor, instinct, will | pray, rest |
| @ai-rpg-engine/starter-cyberpunk | Cyberpunk | chrome, reflex, netrunning | jack-in |
| @ai-rpg-engine/starter-detective | Victorian mystery | perception, eloquence, grit | interrogate, deduce |
| @ai-rpg-engine/starter-pirate | High-seas pirate | brawn, cunning, sea-legs | plunder, navigate |
| @ai-rpg-engine/starter-zombie | Zombie survival | fitness, wits, nerve | barricade, scavenge |
| @ai-rpg-engine/starter-weird-west | Weird west | grit, draw-speed, lore | draw, commune |
| @ai-rpg-engine/starter-colony | Sci-fi colony | engineering, command, awareness | scan, allocate |
