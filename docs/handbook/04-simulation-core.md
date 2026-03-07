# Chapter 4 — The Simulation Core

> Part II — Engine Architecture

The runtime engine that powers every Signalfire world.

## Topics

- **WorldState** — the central state container
- **Entities** — actors, objects, and their properties
- **Zones** — spatial containers with properties and connections
- **Actions** — player and AI inputs to the simulation
- **Events** — structured outputs from action resolution
- **Ticks** — discrete simulation time steps

## The Simulation Loop

```
input → action → validation → resolution → events → presentation
```

Every player command follows this pipeline. The engine validates the action against the current world state, resolves it through the relevant modules, produces events, and feeds those events to presentation layers.

## Deterministic Replay

Because the simulation loop is deterministic and seeded, any sequence of actions can be replayed to produce the exact same events. This is the foundation of Signalfire's debugging and testing workflow.
