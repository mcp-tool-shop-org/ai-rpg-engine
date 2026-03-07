# Chapter 25 — Planned Systems

> Part VIII — Future Directions

SignalFire is evolving. Some systems that were planned have shipped; others remain under consideration.

## Shipped in Phase 4

The following systems were planned and are now implemented as built-in modules.

### Faction Cognition (faction-cognition)

Faction-level shared beliefs with propagation delay and distortion. An entity reports what it perceived to its faction, filtered through its own clarity. Factions maintain cohesion scores that scale how well information is retained. Alert levels rise and decay naturally based on hostile rumors.

### Rumor Propagation (rumor-propagation)

Knowledge spreading between entities and factions over time, degrading in accuracy as it passes through environmental noise. Distortion increases in chaotic environments. Deduplication prevents rumor spam. Confidence thresholds filter out weak beliefs.

### Knowledge Decay (cognition-core v0.2.0)

Beliefs degrade over time based on environmental stability, time since last confirmation, and configurable decay rates. Reinforcement resets the decay clock. Beliefs below a prune threshold are removed entirely. Environmental instability accelerates decay — creating unreliable narrators, paranoid NPCs, and fading intel from one mechanic.

### Simulation Inspector (simulation-inspector)

Full observability layer with entity, faction, and zone inspection. Snapshot capture for state comparison. Text formatters for CLI output. Five debug inspectors registered for tooling integration.

## Planned

### Procedural Districts

Region-level simulation where district conditions (patrol frequency, noise levels, faction control) evolve based on cumulative player actions and world events.

### Companion AI

NPCs that travel with the player, maintaining their own cognition state. Companions observe the same events through different perception filters, forming independent beliefs that may contradict the narrator or the player's understanding.

### Stealth Systems

Stealth built on perception layers rather than binary detection. Noise, light, movement speed, and sense types interact to create graduated detection states instead of simple seen/unseen toggles.

### Advanced World Simulation

Scheduled world events, environmental cascades, and economic simulation. The world ticks forward whether the player acts or not, producing a living environment with its own momentum.

---

These planned systems build on the foundations laid in Phases 1–4. The architecture supports them because cognition, perception, environment, faction cognition, and rumor propagation were designed as composable layers rather than isolated features.
