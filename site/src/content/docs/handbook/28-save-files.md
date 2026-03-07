---
title: "Chapter 22 — Save Files"
description: "Save Files"
sidebar:
  order: 28
---


> Part VII — Debugging and Tools

State serialization.

## Topics

- **Save structure** — what gets serialized
- **Compatibility** — how saves interact with engine versions
- **Inspection** — reading save files for debugging

## What Gets Saved

The engine serializes the complete `WorldState`:

- all entity states (stats, resources, inventories, statuses)
- zone states (dynamic properties, hazard activation logs)
- module state (cognition beliefs, perception logs, progression unlocks)
- event history
- random seed state
- tick counter

## Inspecting Saves

Use the CLI to print a save file in readable format:

```bash
ai-rpg-engine inspect-save
```

This outputs the full world state as structured text, making it easy to verify entity positions, belief states, progression unlocks, and environmental conditions without loading the game.

## Compatibility

Save files are versioned. The engine checks the save version against the current engine version and warns about incompatibilities. Content changes (new zones, modified entities) may invalidate saves, but engine-level changes are designed to be backwards-compatible where possible.
