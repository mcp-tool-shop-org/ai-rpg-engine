---
title: "Chapter 25 — Planned Systems"
description: "Planned Systems"
sidebar:
  order: 28
---


> Part VIII — Future Directions

AI RPG Engine is evolving. Some systems that were planned have shipped; others remain under consideration.

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

## Shipped in Phase 5

The following systems shipped as built-in modules in Phase 5 — Spatial Memory.

### District Simulation (district-core)

Zone-level events aggregate into persistent district metrics: alert pressure, intruder likelihood, rumor density, surveillance, and stability. Districts decay toward baseline each tick. Faction-controlled districts boost faction alertLevel when intruder likelihood rises. Threat level is a weighted composite across metrics.

### Belief Provenance (belief-provenance)

Pure query module that reconstructs end-to-end belief traces. Answers "why does this entity/faction believe X about Y?" by correlating perception logs, cognition state, rumor records, and faction beliefs. No new state — reads existing module data. Produces human-readable forensic narratives.

### Observer Presentation (observer-presentation)

Subjective event rendering per observer. The same event is presented differently based on perception clarity, faction allegiance, and cognitive bias. Built-in rules handle low clarity, partial visibility, hostile faction framing, paranoid suspicion, and environmental distortion. Custom rules are authorable per genre — undead see trespassers, ICE agents see intrusions.

## Shipped as Standalone Packages

The following systems shipped as standalone npm packages, designed to work independently or integrate with the engine's existing modules.

### Campaign Memory (@ai-rpg-engine/campaign-memory)

Persistent NPC memory with multi-axis relationships and a campaign journal. NPCs track trust, fear, admiration, and familiarity across every interaction — replacing the binary "hostile: true/false" model with graduated relationship axes. Memories fade through consolidation stages (vivid → faded → dim → forgotten), with salience decay driven by configurable rates. The campaign journal records significant events across sessions with 12 categories (combat, kill, betrayal, gift, theft, rescue, etc.), enabling NPCs to ground their behavior in what actually happened. Default relationship effects map each event category to axis deltas — a rescue builds trust (+0.4) and admiration (+0.3), a betrayal destroys trust (-0.5).

### Rumor System (@ai-rpg-engine/rumor-system)

Rumor lifecycle engine with mutation mechanics. Rumors now mutate as they spread — five built-in mutation rules fire probabilistically per hop: exaggeration (numbers grow), minimization (numbers shrink), inversion (booleans flip), attribution shift (who did it changes), and embellishment (emotional charge intensifies). The engine tracks full spread paths, faction uptake, confidence decay per hop, and lifecycle states (spreading → established → fading → dead). Environment instability multiplies mutation probabilities, making chaotic zones breed wilder rumors.

## Planned

### Companion AI

NPCs that travel with the player, maintaining their own cognition state. Companions observe the same events through different perception filters, forming independent beliefs that may contradict the narrator or the player's understanding.

### Stealth Systems

Stealth built on perception layers rather than binary detection. Noise, light, movement speed, and sense types interact to create graduated detection states instead of simple seen/unseen toggles.

### Advanced World Simulation

Scheduled world events, environmental cascades, and economic simulation. The world ticks forward whether the player acts or not, producing a living environment with its own momentum.

---

These planned systems build on the foundations laid in Phases 1–5 and the standalone packages shipped since. The architecture supports them because cognition, perception, environment, faction cognition, rumor propagation, campaign memory, districts, and observer presentation were designed as composable layers rather than isolated features.
