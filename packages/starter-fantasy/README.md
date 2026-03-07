<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-fantasy

**The Chapel Threshold** — a dark fantasy starter world for AI RPG Engine.

## Install

```bash
npm install @ai-rpg-engine/starter-fantasy
```

## What's Inside

A complete content pack featuring:

- **The Chapel** — a ruined chapel with interconnected rooms and hidden passages
- **NPCs** — guards, ghouls, and spirits with distinct AI cognition profiles
- **Items** — weapons, armor, potions, and quest items
- **Dialogue** — branching conversations with condition-gated options
- **Combat encounters** — enemies with varied tactics driven by the cognition system

## Usage

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { combatCore, dialogueCore, cognitionCore } from '@ai-rpg-engine/modules';
import { chapelThreshold } from '@ai-rpg-engine/starter-fantasy';

const engine = new Engine({
  manifest: chapelThreshold.manifest,
  seed: 42,
  modules: [combatCore(), dialogueCore(), cognitionCore()],
});

engine.loadContentPack(chapelThreshold);
```

## Documentation

- [The Chapel Threshold (Ch. 20)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/20-chapel-threshold/)
- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
