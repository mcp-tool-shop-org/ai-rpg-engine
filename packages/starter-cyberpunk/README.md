<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-cyberpunk

**Neon Lockbox** — a cyberpunk starter world for AI RPG Engine.

## Install

```bash
npm install @ai-rpg-engine/starter-cyberpunk
```

## What's Inside

A complete content pack featuring:

- **The Lockbox** — a neon-lit district with clubs, back alleys, and corporate zones
- **NPCs** — fixers, corporate agents, street gangs with faction-aware AI
- **Items** — cyberware, weapons, hacking tools, data chips
- **Dialogue** — faction-gated conversations, reputation checks, bribe options
- **District system** — spatial memory, alert levels, faction territory control

## Usage

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { combatCore, factionCognition, districtCore } from '@ai-rpg-engine/modules';
import { neonLockbox } from '@ai-rpg-engine/starter-cyberpunk';

const engine = new Engine({
  manifest: neonLockbox.manifest,
  seed: 42,
  modules: [combatCore(), factionCognition(), districtCore()],
});

engine.loadContentPack(neonLockbox);
```

## Documentation

- [Neon Lockbox (Ch. 21)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/21-neon-lockbox/)
- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
