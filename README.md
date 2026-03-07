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

<p align="center">A simulation-first terminal RPG engine for worlds shaped by perception, cognition, and consequence.</p>

---

## What It Is

AI RPG Engine is a modular runtime for building terminal RPGs where actions create information, information distorts, and consequences emerge from what characters believe happened.

The engine maintains objective world truth while supporting unreliable narration, perception differences between characters, and layered storytelling. It is genre-agnostic — the same core runs dark fantasy, cyberpunk, or any other setting through pluggable rulesets.

## Install

```bash
npm install @ai-rpg-engine/core @ai-rpg-engine/modules @ai-rpg-engine/content-schema
```

## Quick Start

```typescript
import { Engine } from '@ai-rpg-engine/core';
import {
  combatCore, dialogueCore, inventoryCore, traversalCore,
  statusCore, environmentCore, cognitionCore, perceptionFilter,
} from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game', version: '1.0.0',
    engineVersion: '1.0.0', ruleset: 'fantasy',
    modules: ['combat-core', 'dialogue-core', 'cognition-core'],
    contentPacks: [],
  },
  seed: 42,
  modules: [
    combatCore(), dialogueCore(), inventoryCore(),
    traversalCore(), statusCore(), environmentCore(),
    cognitionCore(), perceptionFilter(),
  ],
});

// Submit an action
const events = engine.submitAction('attack', {
  targetIds: ['guard-01'],
});

// Every action produces structured events
for (const event of events) {
  console.log(event.type, event.payload);
}
```

## Architecture

```
Engine
  WorldStore      — entities, zones, quests, factions, RNG, event log
  ActionDispatcher — verb handlers, validators
  ModuleManager   — modules, formulas, rules, persistence
  Presentation    — channels that route (and can distort) events
```

Every state change flows through a single pipeline:

```
action --> validation --> resolution --> events --> presentation
```

## Packages

| Package | Purpose |
|---------|---------|
| `@ai-rpg-engine/core` | State, entities, actions, events, rules, RNG, persistence |
| `@ai-rpg-engine/modules` | 17 built-in simulation modules |
| `@ai-rpg-engine/content-schema` | Content schemas and validators |
| `@ai-rpg-engine/terminal-ui` | Terminal renderer and input layer |
| `@ai-rpg-engine/cli` | Developer CLI: run, replay, inspect |
| `@ai-rpg-engine/starter-fantasy` | The Chapel Threshold (fantasy demo) |
| `@ai-rpg-engine/starter-cyberpunk` | Neon Lockbox (cyberpunk demo) |

## Built-In Modules

| Module | What It Does |
|--------|-------------|
| combat-core | Attack/defend, damage, defeat, stamina |
| dialogue-core | Graph-based dialogue trees with conditions |
| inventory-core | Items, equipment, use/equip/unequip |
| traversal-core | Zone movement and exit validation |
| status-core | Status effects with duration and stacking |
| environment-core | Dynamic zone properties, hazards, decay |
| cognition-core | AI beliefs, intent, morale, memory |
| perception-filter | Sensory channels, clarity, cross-zone hearing |
| narrative-authority | Truth vs presentation, concealment, distortion |
| progression-core | Currency-based advancement, skill trees |
| faction-cognition | Faction beliefs, trust, inter-faction knowledge |
| rumor-propagation | Information spread with confidence decay |
| knowledge-decay | Time-based confidence erosion |
| district-core | Spatial memory, zone metrics, alert thresholds |
| belief-provenance | Trace reconstruction across perception/cognition/rumor |
| observer-presentation | Per-observer event filtering, divergence tracking |
| simulation-inspector | Runtime inspection, health checks, diagnostics |

## Key Design Decisions

- **Simulation truth is sacred** — the engine maintains objective state. Presentation layers may lie, but world truth is canonical.
- **Actions create events** — no meaningful state change happens silently. Everything emits structured, queryable events.
- **Deterministic replay** — seeded RNG and the action pipeline guarantee identical results from identical inputs.
- **Content is data** — rooms, entities, dialogue, items are defined as data, not code.
- **Genre belongs to rulesets** — the engine has no opinion about swords vs lasers.

## Security and Trust

AI RPG Engine is a **local-only simulation library**.

- **Data touched:** in-memory game state only. Save files written to `.ai-rpg-engine/` when CLI save is used.
- **Data NOT touched:** no filesystem access beyond save files, no network, no environment variables, no system resources.
- **No telemetry.** No data is collected or sent anywhere.
- **No secrets.** The engine does not read, store, or transmit credentials.

See [SECURITY.md](SECURITY.md) for the full security policy.

## Requirements

- Node.js >= 20
- TypeScript (ESM modules)

## Documentation

- [Handbook](docs/handbook/index.md) — 25 chapters + 4 appendices
- [Design Overview](docs/DESIGN.md) — architecture deep-dive
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
