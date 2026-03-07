# Chapter 24 — Observability

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

## Why Observability Matters

With cognition, perception, and environment interacting, the simulation produces emergent behavior. Observability tools let you understand *why* something happened, not just *what* happened. This becomes essential as worlds grow in complexity.
