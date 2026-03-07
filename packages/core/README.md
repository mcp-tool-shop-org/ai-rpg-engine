<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/core

The foundation of AI RPG Engine — world state, entities, actions, events, rules, seeded RNG, and persistence.

## Install

```bash
npm install @ai-rpg-engine/core
```

## What's Inside

- **Engine** — tick-based simulation loop with deterministic replay
- **WorldState** — rooms, entities, global flags, tick counter
- **EntityState** — resources, inventory, status effects, beliefs, memories
- **Action Pipeline** — validate → pre-process → resolve → post-process → commit
- **Event Bus** — structured events with type, source, targets, payload
- **Seeded RNG** — reproducible randomness from a single seed
- **Module System** — register/compose simulation modules
- **Test Harness** — helpers for deterministic module testing

## Quick Start

```typescript
import { Engine } from '@ai-rpg-engine/core';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game',
    version: '1.0.0', engineVersion: '1.0.0',
    ruleset: 'fantasy', modules: [],
    contentPacks: [],
  },
  seed: 42,
  modules: [],
});

const state = engine.getState();
```

## Documentation

- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/) — 25 chapters + 4 appendices
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
