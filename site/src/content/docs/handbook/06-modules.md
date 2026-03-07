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
