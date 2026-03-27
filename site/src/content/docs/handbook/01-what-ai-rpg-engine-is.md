---
title: "Chapter 1 — What AI RPG Engine Is"
description: "What AI RPG Engine Is"
sidebar:
  order: 1
---


AI RPG Engine is a terminal RPG simulation engine.

It provides the systems needed to build interactive worlds that run entirely in the terminal. These worlds can contain characters that think, environments that change, and events that unfold according to simulation rules rather than rigid scripts.

AI RPG Engine is designed around a simple idea:

> A believable world comes from systems interacting with each other.

Instead of writing a long chain of scripted scenes, you define rules and content:

- rooms and zones
- entities and characters
- dialogue trees
- items and abilities
- environmental conditions
- AI behaviors
- progression systems

The engine then runs those systems together.

When a player performs an action, the engine processes that action through the simulation and produces events that describe what happened.

Those events are then presented to the player through the terminal interface.

Because the engine separates simulation truth from presentation, it can support complex narrative techniques such as unreliable narration, perception differences between characters, and layered storytelling.

---

## Genre-Agnostic by Design

AI RPG Engine is genre-agnostic.

The same engine can power very different worlds because genre assumptions live in rulesets and content, not in the core runtime.

The repository includes 10 starter worlds spanning different genres:

| Starter | Genre |
|---------|-------|
| starter-fantasy | Dark fantasy |
| starter-cyberpunk | Cyberpunk |
| starter-detective | Victorian mystery |
| starter-pirate | High-seas pirate |
| starter-zombie | Zombie survival |
| starter-weird-west | Weird west |
| starter-colony | Sci-fi colony |
| starter-ronin | Feudal Japan |
| starter-vampire | Vampire horror |
| starter-gladiator | Historical gladiator |

All 10 run on the same engine without changing the core runtime. Each one demonstrates different composition patterns — stat mappings, resource profiles, engagement configurations, and ability sets.

---

## The Core Thesis

```
simulation truth
+ modular rules
+ authored content
+ presentation layers
= reactive narrative worlds
```

That is the purpose of AI RPG Engine: a reusable foundation for building many kinds of simulation-driven terminal RPGs.
