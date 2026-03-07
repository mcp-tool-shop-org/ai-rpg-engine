---
title: "Chapter 13 — Content Files"
description: "Content Files"
sidebar:
  order: 13
---


> Part IV — Authoring Games

The schema system that defines your world.

## Content Types

| Type | Purpose |
|------|---------|
| GameManifest | Top-level game definition |
| EntityBlueprint | Actors, enemies, objects |
| RoomDefinition | Spatial containers |
| ZoneDefinition | Sub-areas within rooms |
| DialogueDefinition | Conversation trees |
| QuestDefinition | Objective tracking |
| AbilityDefinition | Skills and actions |
| StatusDefinition | Buffs, debuffs, conditions |
| ProgressionTreeDefinition | Advancement paths |

## The Validation Pipeline

Content goes through three stages before it reaches the engine:

```
schema validation → cross-reference validation → compiled content bundle
```

1. **Schema validation** — structure and types are correct
2. **Cross-reference validation** — all refs point to real content (zones, entities, items)
3. **Compilation** — content is bundled into a runtime-ready format

Errors are caught early, before the game runs. This prevents broken references, missing entities, and malformed data from causing runtime crashes.

## Content Is Data, Not Code

Games define their worlds through structured content files, not by writing engine code. This keeps gameplay logic separate from simulation mechanics and makes worlds portable across engine versions.
