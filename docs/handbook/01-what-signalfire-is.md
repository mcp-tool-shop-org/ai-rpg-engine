# Chapter 1 — What Signalfire Is

Signalfire is a terminal RPG simulation engine.

It provides the systems needed to build interactive worlds that run entirely in the terminal. These worlds can contain characters that think, environments that change, and events that unfold according to simulation rules rather than rigid scripts.

Signalfire is designed around a simple idea:

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

Signalfire is genre-agnostic.

The same engine can power very different worlds because genre assumptions live in rulesets and content, not in the core runtime.

The repository already includes two small demonstration games:

### The Chapel Threshold

A dark fantasy scene featuring a ruined chapel, a mysterious pilgrim, and an ash ghoul lurking beneath the crypt.

### Neon Lockbox

A cyberpunk micro-scenario involving a fixer, a locked data cache, and an ICE sentry guarding a digital asset.

Both games run on the same engine without changing the core runtime.

---

## The Core Thesis

```
simulation truth
+ modular rules
+ authored content
+ presentation layers
= reactive narrative worlds
```

That is the purpose of Signalfire: a reusable foundation for building many kinds of simulation-driven terminal RPGs.
