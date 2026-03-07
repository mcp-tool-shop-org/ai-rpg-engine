---
title: "Chapter 9 — Perception Layers"
description: "Perception Layers"
sidebar:
  order: 9
---


> Part III — Simulation Systems

How entities observe the world.

## Topics

- **Sensory channels** — sight, hearing, smell, tremorsense, thermal, network
- **Perception filters** — layers that determine what an entity detects
- **Clarity model** — 0.0 to 1.0 scale determining interpretation quality
- **Cross-zone hearing** — detecting events in adjacent zones
- **Signal noise** — environmental interference with perception

## Objective Truth vs Perceived Truth

The engine always knows what actually happened. But each entity perceives events through its own filters.

A perception check determines:
- **Did the entity detect the event?** (based on stats, sense type, difficulty)
- **How clearly?** (clarity score: full, partial, or none)

## Clarity Interpretation

| Clarity | Interpretation | What the Entity Knows |
|---------|---------------|----------------------|
| 0.8–1.0 | Full | Accurate details |
| 0.5–0.7 | Partial | Something happened, details unclear |
| 0.0–0.4 | None | Missed entirely |

## Built-in Perception Layers

| Layer | Sense | Base Difficulty | Cross-Zone |
|-------|-------|----------------|------------|
| visual-movement | sight | 30 | no |
| visual-combat | sight | 20 | no |
| auditory-combat | hearing | 25 | yes |
| visual-defeat | sight | 15 | no |

## Example

A guard in an adjacent room hears combat through the auditory layer (cross-zone). Their perception check succeeds at clarity 0.6 — partial interpretation. They know *something violent happened nearby* but not who was involved. Their cognition layer updates with a low-confidence belief about intruders. Their intent system shifts toward investigation.

No script triggered this chain. The systems produced it.
