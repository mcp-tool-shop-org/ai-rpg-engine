---
title: "Chapter 14 — Rooms and Zones"
description: "Rooms and Zones"
sidebar:
  order: 14
---


> Part IV — Authoring Games

World structure.

## Topics

- **Room definitions** — top-level spatial containers
- **Zones** — sub-areas within rooms
- **Exits** — connections between zones
- **Hazards** — environmental dangers
- **Interactables** — objects the player can examine or use

## Example Zone

```
id: crypt_entry
name: Crypt Entrance
light: low
noise: echoing
hazards:
  - rot spores (condition: stability < 3)
exits:
  - chapel_nave (direction: up)
  - crypt_deep (direction: down)
interactables:
  - crumbling_altar
  - dust_covered_tome
```

## Zone Properties

Zones have both static properties (defined in content) and dynamic properties (modified at runtime by the environment module). The environment system overlays dynamic values on top of base definitions, so a zone can start quiet and become noisy as events unfold.

## Exits and Connectivity

Exits define how zones connect. Each exit specifies a target zone and an optional direction label. The traversal module validates movement against available exits before allowing zone transitions.

## What a visual client may draw

The sim still stores **zone ids**, not cells. A Godot host may paint those zones as 2:1 dimetric diamonds on one continuous ground, Y-sort buildings, and tween a sprite between clicks. That drawing is presentation. `move` still names a neighbour zone. Intra-zone walking that never submits is a client lie and is not occupancy. See [Chapter 66](./66-visual-clients.md).
