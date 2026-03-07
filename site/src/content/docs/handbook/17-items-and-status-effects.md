---
title: "Chapter 17 — Items and Status Effects"
description: "Items and Status Effects"
sidebar:
  order: 17
---


> Part IV — Authoring Games

Gameplay modifiers.

## Items

- **Consumables** — single-use items with immediate effects
- **Equipment** — persistent items that modify stats or grant abilities
- **Key items** — narrative objects that unlock interactions or zones

## Status Effects

Status effects are timed conditions applied to entities.

### Properties

| Property | Description |
|----------|-------------|
| id | Unique identifier |
| duration | Number of ticks before expiration |
| effect | What happens each tick |
| stackable | Whether multiple instances can coexist |

### Example

```
id: bleeding
duration: 3 ticks
effect: -2 hp per tick
stackable: false
```

## How Statuses Interact with the Simulation

Status effects produce events each tick (`status.tick`, `status.expired`). Other modules can listen for these events. For example, the cognition module might update an entity's morale when a debilitating status is applied, or the environment module might react to a status that produces noise or light.
