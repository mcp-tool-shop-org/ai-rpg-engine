---
title: "Chapter 24 — Observability"
description: "Observability"
sidebar:
  order: 32
---


> Part VII — Debugging and Tools

How to inspect the simulation.

## Topics

- **Event logs** — the full record of what happened
- **Belief inspection** — what entities currently believe
- **Perception debugging** — what entities detected and missed
- **Environment state** — current dynamic zone properties

## Event Logs

Every event the engine produces is recorded. Event logs can be filtered by domain (`combat.*`), entity, zone, or time range to narrow down what you're looking for.

## Belief Inspection

Query an entity's cognition state to see their current beliefs:

```
entity: ash_ghoul
beliefs:
  player_hostile: 0.7 (source: combat.contact.hit)
  player_location: crypt (source: perception)
memories: 3 recorded, 1 recent
morale: 0.4
```

## Perception Debugging

Check what an entity perceived and what they missed:

```
entity: ash_ghoul
perceived: combat.contact.hit (clarity: 0.9, sense: sight)
missed: world.zone.entered (clarity: 0.3, sense: hearing)
```

## Environment State

Inspect dynamic zone properties at any point:

```
zone: crypt
noise: 3 (baseline: 0, decaying)
light: low
stability: 5
hazards: 0 active
```

## District Inspection

Inspect the spatial memory of district-level aggregates:

```
district: crypt-depths
alertPressure: 15 / 100
intruderLikelihood: 10 / 100
rumorDensity: 5 / 100
surveillance: 15 / 100
stability: 4
threatLevel: 12
controllingFaction: chapel-undead
zones: vestry-door, crypt-chamber
```

A district is "on alert" when alertPressure exceeds 30. Threat level is a weighted composite across all metrics.

## Belief Provenance Traces

Answer "why does this entity believe that?" with end-to-end trace reconstruction:

```
Belief Trace: Entity ash-ghoul
  Subject: player
  Key: hostile
  Current: true (confidence: 0.70)

  Chain:
    [tick 3] EVENT combat.contact.hit involving player
    [tick 3] SEEN ash-ghoul detected via sight (clarity: 0.90)
    [tick 3] BELIEF ash-ghoul believes player.hostile = true (confidence: 0.70, source: observed)
    [tick 3] RUMOR> ash-ghoul rumored player.hostile to faction chapel-undead (distortion: 0.030)
```

Traces work for both entities (`traceEntityBelief`) and factions (`traceFactionBelief`). Use `traceSubject` to find all beliefs about a subject across the entire world.

## Presentation Divergences

See how the same event was described differently to different observers:

```
event: world.zone.entered (player enters crypt-chamber)
  ash-ghoul: "warm blood encroaches upon the sacred dead" [rules: undead-threat-framing]
  (player sees: objective event — no distortion)
```

Divergences are recorded automatically when observer presentation rules fire. Query them with `getDivergences` or filter by event with `getEventDivergences`.

## Why Observability Matters

With cognition, perception, environment, districts, and observer presentation interacting, the simulation produces emergent behavior. Observability tools let you understand *why* something happened, not just *what* happened. This becomes essential as worlds grow in complexity.
