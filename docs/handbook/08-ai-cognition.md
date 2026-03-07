# Chapter 8 — AI Cognition

> Part III — Simulation Systems

How actors think.

## Topics

- **Beliefs** — what an entity thinks is true (subject, key, value, confidence, source)
- **Memories** — recorded events with emotional tags and decay
- **Morale** — emotional state influencing behavior
- **Perception input** — how observed events feed into beliefs
- **Intent selection** — choosing actions based on beliefs and personality

## The Belief Model

```
belief: player_hostile
confidence: 0.7
source: combat.contact.hit
```

AI entities act on beliefs, not objective truth. A ghoul that *believes* it was attacked will respond aggressively — even if the actual attacker was someone else and the ghoul only heard the noise.

## Intent Profiles

Built-in profiles shape how entities choose actions:

- **aggressive** — prioritizes attack, low retreat threshold
- **cautious** — prioritizes investigation, high retreat threshold

Custom profiles can weight any combination of goals, fears, and morale thresholds.

## How Cognition Connects to Other Systems

Cognition receives input from:
- **perception-filter** — what the entity actually observed
- **environment-core** — ambient conditions affecting alertness
- **combat events** — direct experience updates beliefs immediately

This means AI behavior emerges from the simulation rather than being scripted per encounter.
