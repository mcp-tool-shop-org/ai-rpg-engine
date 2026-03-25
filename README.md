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

A TypeScript toolkit for building deterministic RPG simulations. You define stats, pick modules, wire a combat stack, and create content. The engine handles state, events, RNG, action resolution, and AI decision-making. Every run is reproducible.

This is a **composition engine**, not a finished game. The 10 starter worlds are examples — decomposable patterns you learn from and remix. Your game uses whatever subset of the engine you need.

---

## What This Is

- A **module library** — 27+ modules covering combat, perception, cognition, factions, rumors, traversal, companions, and more
- A **composition toolkit** — `buildCombatStack()` wires combat in ~7 lines; `new Engine({ modules })` boots the game
- A **simulation runtime** — deterministic ticks, replayable action logs, seeded RNG
- An **AI design studio** (optional) — scaffolding, critique, balance analysis, tuning, experiments via Ollama

## What This Is Not

- Not a playable game out of the box — you compose one from modules and content
- Not a visual engine — it outputs structured events, not pixels
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## Current Status (v2.3.0)

**What works and is tested:**
- Core runtime: world state, events, actions, ticks, replay — stable since v1.0
- Combat system: 5 actions, 4 combat states, 4 engagement states, companion interception, defeat flow, AI tactics — 1099 tests
- Abilities: costs, cooldowns, stat checks, typed effects, status vocabulary, AI-aware selection
- Unified decision layer: combat + ability scoring merged into one call (`selectBestAction`)
- 10 starter worlds with stat-differentiated enemies and full combat integration
- `buildCombatStack()` eliminates ~40 lines of combat setup per world
- Tag taxonomy and validation utilities for content authoring
- Boss phase validation with cross-phase tag tracing

**What is rough or incomplete:**
- AI worldbuilding tools (Ollama layer) work but are lightly tested compared to simulation
- CLI studio shell is functional but not polished
- Only 1 of 10 starters uses `buildCombatStack` (Weird West); others use verbose manual wiring
- No profile system yet — worlds are standalone, not composable from shared profiles
- Documentation is extensive (57 chapters) but not all chapters reflect the latest APIs

---

## Quick Start

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, createTraversalCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [...combat.modules, createTraversalCore(), createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

See the [Composition Guide](docs/handbook/57-composition-guide.md) for the full workflow.

---

## Architecture

| Layer | Role |
|-------|------|
| **Core Runtime** | Deterministic engine — world state, events, actions, ticks, RNG, replay |
| **Modules** | 27+ composable systems — combat, perception, cognition, factions, traversal, companions, etc. |
| **Content** | Entities, zones, dialogue, items, abilities, statuses — author-created |
| **AI Studio** | Optional Ollama layer — scaffolding, critique, balance analysis, tuning, experiments |

---

## Combat System

Five actions (attack, guard, disengage, brace, reposition), four combat states (guarded, off-balance, exposed, fleeing), four engagement states (engaged, protected, backline, isolated). Three stat dimensions drive every formula so a quick duelist plays differently from a heavy bruiser or a composed sentinel.

AI opponents use unified decision scoring — combat actions and abilities compete in a single evaluation, with configurable thresholds to prevent marginal ability spam.

Pack authors use `buildCombatStack()` to wire combat from a stat mapping, resource profile, and bias tags. See the [Combat Overview](docs/handbook/49a-combat-overview.md) and [Pack Author Guide](docs/handbook/55-combat-pack-guide.md).

---

## Abilities

Genre-native ability system with costs, stat checks, cooldowns, and typed effects (damage, heal, status apply, cleanse). Status effects use an 11-tag semantic vocabulary with resistance/vulnerability profiles. AI-aware selection scores self/AoE/single-target paths.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## Packages

| Package | Purpose |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Deterministic simulation runtime — world state, events, RNG, ticks, action resolution |
| [`@ai-rpg-engine/modules`](packages/modules) | 27+ composable modules — combat, perception, cognition, factions, rumors, traversal, companions, NPC agency, strategic map, item recognition, emergent opportunities, arc detection, endgame triggers |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Canonical schemas and validators for world content |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Character progression, injuries, milestones, reputation |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Archetype selection, build generation, starter gear |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Equipment types, item provenance, relic growth |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Cross-session memory, relationship effects, campaign state |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Optional AI authoring — scaffolding, critique, guided workflows, tuning, experiments |
| [`@ai-rpg-engine/cli`](packages/cli) | Command-line design studio |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Terminal renderer and input layer |

### Starter Examples

The 10 starter worlds are **composition examples** — they demonstrate how to combine engine modules into complete games. Each one shows different patterns (stat mappings, resource profiles, engagement configs, ability sets). See each starter's README for "Patterns Demonstrated" and "What to Borrow."

| Starter | Genre | Key Patterns |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Dark fantasy | Minimal combat, dialogue-driven |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Resources, engagement roles |
| [`starter-detective`](packages/starter-detective) | Victorian mystery | Social-first, perception-heavy |
| [`starter-pirate`](packages/starter-pirate) | Pirate | Naval + melee, multi-zone |
| [`starter-zombie`](packages/starter-zombie) | Zombie survival | Scarcity, infection resource |
| [`starter-weird-west`](packages/starter-weird-west) | Weird west | buildCombatStack reference, pack biases |
| [`starter-colony`](packages/starter-colony) | Sci-fi colony | Chokepoints, ambush zones |
| [`starter-ronin`](packages/starter-ronin) | Feudal Japan | Hidden passages, multiple protector roles |
| [`starter-vampire`](packages/starter-vampire) | Vampire horror | Blood resource, social manipulation |
| [`starter-gladiator`](packages/starter-gladiator) | Historical gladiator | Arena combat, crowd favor |

---

## Documentation

| Resource | Description |
|----------|-------------|
| [Composition Guide](docs/handbook/57-composition-guide.md) | Build your own game by composing engine modules — start here |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | Six combat pillars, five actions, states at a glance |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | Step-by-step buildCombatStack, stat mapping, resource profiles |
| [Handbook](docs/handbook/index.md) | 57 chapters + 4 appendices covering every system |
| [Composition Model](docs/composition-model.md) | The 6 reusable layers and how they compose |
| [Examples](docs/examples/) | Runnable TypeScript examples — mixed party, cross-world, from scratch |
| [Design Document](docs/DESIGN.md) | Architecture deep-dive — action pipeline, truth vs presentation |
| [Philosophy](PHILOSOPHY.md) | Deterministic worlds, evidence-driven design, AI as assistant |
| [Changelog](CHANGELOG.md) | Release history |

---

## Roadmap

### Where we are now

The simulation runtime and combat system are solid — 2743 tests, 10 genre examples, deterministic replay, full AI decision scoring. The engine works as a composition toolkit: pick modules, define stats, wire, create content. Documentation covers every system but needs an API sync pass for the latest additions.

### Next few weeks

- Migrate remaining 9 starters to `buildCombatStack` (Weird West is the reference)
- API documentation sync — `submitActionAs`, `selectBestAction`, `resourceCaps`, tag taxonomy
- Starter README polish — clearer "What to Borrow" and remix guidance
- Cross-linking pass — README, composition guide, examples, and handbook wired together

### Destination: Plug-in Profiles

The engine's end goal is **user-defined profiles** — portable bundles that slot into any game. A profile packages a stat mapping, resource behavior, AI bias tags, abilities, and encounter hooks into a single importable unit. Two players with different profiles can share a world, each bringing their own playstyle.

Profiles build on composition (already working) and the unified decision layer (shipped in v2.3.0). The remaining work is defining the profile schema, building the loader, and validating cross-profile interactions. See [Profile Roadmap](docs/profile-roadmap.md) for the full plan.

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
