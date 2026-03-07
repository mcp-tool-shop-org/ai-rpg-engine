---
title: "Chapter 26 — Signal Loss (Sci-Fi Colony Demo)"
description: "Signal Loss (Sci-Fi Colony Demo)"
sidebar:
  order: 26
---

> Part VI — Starter Worlds

A walkthrough of the sci-fi colony starter.

## Setting

A distant colony loses contact with Earth. Power reserves are finite and shared — every system you run drains the same pool. Something is alive in the caverns below the signal tower, and it perceives your colonists as "disruptive resonance patterns."

## Contents

| Element | Description |
|---------|-------------|
| Command Module | Starting zone — console, holotable, crew bunks |
| Hydroponics Bay | Supply zone — growth pods, water recycler, nutrient tanks |
| Perimeter Fence | Defense zone — motion sensors, damaged gate, watchtower |
| Signal Tower | Communication zone — antenna array, relay console, strange signal |
| Alien Cavern | Hostile zone — bioluminescent walls, resonance field, crystal formations |
| Dr. Vasquez | NPC — scientist, awareness 7, alien signal briefing quest |
| Chief Okafor | NPC — security chief, engineering 5, command 6 |
| Breached Drone | Enemy — malfunctioning bot (engineering 6, awareness 2) |
| Resonance Entity | Enemy — alien presence (awareness 9, command 4) |
| Emergency Cell | Item — restores 20 power |
| Commander | Progression tree — field-engineer → sharp-sensors → unshakeable |

## Ruleset: colony-minimal

| Stat | Role |
|------|------|
| Engineering | Fix, build, and maintain colony systems |
| Command | Leadership, crew management, morale |
| Awareness | Sensors, perception, anomaly detection |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–25 | Physical health |
| Power | 0–100 | **Shared colony resource**, regens 2/tick, cascading shutdown on depletion |
| Morale | 0–30 | Crew cohesion and willingness |

Unique verbs: `scan` (sensor sweep), `allocate` (redistribute power between systems).

## How the Systems Interact

1. **Dialogue** — Dr. Vasquez briefs the commander on the alien signal, colony power politics, and the cavern situation. Choosing to investigate sets the `cavern-mission` global flag.

2. **Environment** — Two hazard types: power drain affects all zones (representing degrading infrastructure), resonance fields near the cavern reduce both morale and power simultaneously.

3. **Cognition** — The alien perception presentation rule makes the Resonance Entity perceive colonists as "disruptive resonance patterns" — it's not aggressive, it's trying to dampen interference.

4. **Combat** — Two enemy archetypes: Breached Drones are engineering-heavy but sensor-blind (hack or outmaneuver), Resonance Entities have extreme awareness but limited physicality (requires brute force).

5. **Factions** — The colony council controls the main settlement zones, while the cavern zones are unclaimed territory with unknown presence.

## Install

```bash
npm install @ai-rpg-engine/starter-colony
```

```typescript
import { createGame } from '@ai-rpg-engine/starter-colony';
const engine = createGame(42);
```
