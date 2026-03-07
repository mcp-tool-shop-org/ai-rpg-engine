---
title: "Chapter 10 — Environment Simulation"
description: "Environment Simulation"
sidebar:
  order: 10
---


> Part III — Simulation Systems

Zones are active systems, not static backdrops.

## Dynamic Zone Properties

Every zone can have dynamic properties that change during play:

- **light** — visibility conditions
- **noise** — ambient sound level (affects perception)
- **stability** — structural integrity
- **authority** — narrative control level

Properties can be read, set, or modified relative to a baseline.

## Built-in Noise Rules

| Event | Noise Change |
|-------|-------------|
| Combat hit | +3 |
| Combat miss | +2 |
| Entity defeated | +5 |
| Zone entry | +1 |

Noise decays over time through the decay system.

## Decay System

Properties can have decay timers that move them toward a baseline value over ticks.

```
noise: 5 → decay rate: 1 per tick → baseline: 0
```

Decay is processed explicitly through `environment-tick` events, not reactively on every event. This prevents same-tick cancellation bugs.

## Hazards

Zones can define hazards that trigger on specific events:

```
hazard: unstable-floor
trigger: world.zone.entered
condition: stability < 3
effect: stamina damage
```

Hazards activate when their conditions are met, producing events that feed back into the simulation.

## Tick Effects

Zones can have passive tick effects that apply to qualifying entities each tick:

```
zone: healing-spring
effect: restore 2 hp per tick
condition: entity is alive
```

## The Feedback Loop

```
noise ↑ → AI perception triggers → cognition updates → investigation
decay ↑ → environment hazards trigger → damage events → more noise
```

The environment doesn't just set the scene. It participates in the simulation.
