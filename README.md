<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPG Engine

Simulation-native toolkit for building, analyzing, and balancing RPG worlds.

AI RPG Engine combines a deterministic simulation runtime with an AI-assisted design studio so authors can build worlds, test them through simulation, and improve them based on evidence instead of guesswork.

> Traditional tools help you write stories.
> AI RPG Engine helps you **test worlds**.

---

## What It Does

```
build → critique → simulate → analyze → tune → experiment
```

You can generate world content, critique designs, run deterministic simulations, analyze replay behavior, tune mechanics, run experiments across many seeds, and compare outcomes. Every result is reproducible, inspectable, and explainable.

---

## Core Capabilities

### Deterministic Simulation

A tick-based simulation engine for RPG worlds. World state, event system, perception and cognition layers, faction belief propagation, rumor systems, district metrics with mood derivation, NPC agency with loyalty breakpoints and consequence chains, companions with morale and departure risk, player leverage and political action, strategic map analysis, move advisor, item recognition and equipment provenance, relic growth milestones, emergent opportunities (contracts, bounties, favors, supply runs, investigations) generated from world conditions, campaign arc detection (10 arc kinds derived from accumulated state), endgame trigger detection (8 resolution classes), and deterministic finale rendering with structured epilogues. Replayable action logs and deterministic RNG. Every run can be replayed exactly.

### AI-Assisted Worldbuilding

Optional AI layer that scaffolds rooms, factions, quests, and districts from a theme. Critiques designs, normalizes schema errors, proposes improvements, and guides multi-step worldbuilding workflows. The AI never mutates simulation state directly — it only generates content or suggestions.

### Guided Design Workflows

Session-aware, plan-first workflows for world scaffolding, critique loops, design iteration, guided builds, and structured tuning plans. Combines deterministic tools with AI assistance.

### Combat System

Five combat actions (attack, guard, disengage, brace, reposition) with four combat states (guarded, off-balance, exposed, fleeing) and four engagement states (engaged, protected, backline, isolated). Three stat dimensions — instinct (precision), vigor (force), will (resolve) — drive every formula so a quick duelist plays differently from a heavy bruiser or a composed sentinel.

Companion interception uses a scored formula driven by reaction speed, health, morale, combat states, and role tags. AI opponents estimate interception cover and prefer weaker-covered targets. Guard breakthrough, counter-attacks, brace resistance, morale cascades, and defeat narration create emergent combat stories. All 10 starter packs have stat-differentiated enemies and integrated combat formulas.

### Abilities & Powers

Genre-native ability system with 10-pack cross-genre coverage — every pack has 3+ abilities with a complete tactical triangle (offense, defense, control). Abilities have costs, stat checks, cooldowns, and typed effects (damage, heal, status apply, cleanse). Status effects use an 11-tag semantic vocabulary with resistance/vulnerability profiles across 8+ packs. AI-aware ability selection scores self/AoE/single-target paths with resistance awareness and cleanse valuation. Cross-pack comparison matrix, balance audit, and pack identity profiling catch outliers and dead abilities at authoring time.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }, { resourceId: 'infection', amount: 5 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

### Simulation Analysis

Replay analysis that explains why events happened, where mechanics break down, which triggers never fire, and which systems create instability. Structured findings feed directly into tuning.

### Guided Tuning

Balance findings generate structured tuning plans with proposed fixes, expected impact, confidence estimates, and previewed changes. Applied step-by-step with full traceability.

### Scenario Experiments

Run batches of simulations across seeds to understand typical behavior. Extract scenario metrics, detect variance, sweep parameters, and compare tuned vs baseline worlds. Turns world design into a testable process.

### Studio Shell

CLI design studio with project dashboards, issue browsing, experiment inspection, session history, guided onboarding, and context-aware command discovery. A workspace for building and testing worlds.

---

## Quick Start

```bash
# Install the CLI
npm install -g @ai-rpg-engine/cli

# Start the interactive studio
ai chat

# Run onboarding
/onboard

# Create your first content
create-room haunted chapel

# Run a simulation
simulate

# Analyze the results
analyze-balance

# Tune the design
tune paranoia

# Run an experiment
experiment run --runs 50
```

---

## Example Workflow

```bash
ai chat

/onboard
create-location-pack haunted chapel district
critique-content
simulate
analyze-balance
tune rumor propagation
experiment run --runs 50
compare-replays
```

Build a world and improve it through simulation evidence.

---

## Architecture

The system has four layers.

| Layer | Role |
|-------|------|
| **Simulation** | Deterministic engine — world state, events, actions, perception, cognition, factions, rumor propagation, district metrics, replay |
| **Authoring** | Content generation — scaffolding, critique, normalization, repair loops, pack generators |
| **AI Cognition** | Optional AI assistance — chat shell, context routing, retrieval, memory shaping, tool orchestration |
| **Studio UX** | CLI design environment — dashboards, issue tracking, experiment browsing, session history, guided workflows |

---

## Packages

| Package | Purpose |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Deterministic simulation runtime — world state, events, RNG, ticks, action resolution |
| [`@ai-rpg-engine/modules`](packages/modules) | 35+ built-in modules — combat (5 actions, 4 states, engagement, tactics, interception, defeat narration), perception, cognition, factions, rumors, districts, NPC agency, companions, player leverage, strategic map, move advisor, item recognition, emergent opportunities, arc detection, endgame triggers |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Canonical schemas and validators for world content |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Character progression state, injuries, milestones, reputation |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Archetype selection, build generation, starter gear |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Equipment types, item provenance, relic growth, item chronicles |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Cross-session memory, relationship effects, campaign state |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Optional AI authoring — scaffolding, critique, guided workflows, tuning, experiments |
| [`@ai-rpg-engine/cli`](packages/cli) | Command-line design studio — chat shell, workflows, experiment tools |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Terminal renderer and input layer |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold — fantasy starter world |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox — cyberpunk starter world |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective — Victorian mystery starter world |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem — pirate starter world |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead — zombie survival starter world |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain — weird west starter world |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss — sci-fi colony starter world |

---

## Documentation

| Resource | Description |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 54 chapters + 4 appendices covering every system |
| [Design Document](docs/DESIGN.md) | Architecture deep-dive — action pipeline, truth vs presentation, simulation layers |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | Scaffold, diagnose, tune, experiment workflows |
| [Philosophy](PHILOSOPHY.md) | Why deterministic worlds, evidence-driven design, and AI as assistant |
| [Changelog](CHANGELOG.md) | Release history |

---

## Philosophy

AI RPG Engine is built around three ideas:

1. **Deterministic worlds** — simulation results must be reproducible.
2. **Evidence-driven design** — world mechanics should be tested through simulation.
3. **AI as assistant, not authority** — AI tools help generate and critique designs but do not replace deterministic systems.

See [PHILOSOPHY.md](PHILOSOPHY.md) for the full explanation.

---

## Security

AI RPG Engine is a **local-only simulation library**. No telemetry, no network, no secrets. Save files go to `.ai-rpg-engine/` only when explicitly requested. See [SECURITY.md](SECURITY.md) for details.

## Requirements

- Node.js >= 20
- TypeScript (ESM modules)

## License

[MIT](LICENSE)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
