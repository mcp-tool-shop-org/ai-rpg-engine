<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

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

## What You'll Learn

This starter demonstrates the full engine stack in a compact world:

| Feature | What the Chapel shows |
|---|---|
| **Rulesets** | `fantasyMinimalRuleset` — stats (vigor/instinct/will), resources (hp/stamina), verbs, formulas |
| **Zones & traversal** | 5 zones across 2 rooms with adjacency, light levels, interactables, hazards |
| **Districts** | Chapel Grounds (sacred) vs Crypt Depths (cursed, faction-controlled) |
| **Dialogue** | Branching pilgrim conversation with 3 paths and global-flag effects |
| **Combat** | Ash Ghoul with aggressive AI profile, fear tags, guard goal |
| **Cognition & perception** | Memory decay, perception filter, undead presentation rule |
| **Progression** | 3-node Combat Mastery tree with XP rewards on entity defeat |
| **Environment** | Unstable-floor hazard draining stamina on zone entry |
| **Factions** | Chapel-undead faction with cohesion setting |
| **Belief provenance** | Rumor propagation with delay, belief tracking |
| **Inventory** | Healing draught with scripted item-use effect |
| **Simulation inspector** | Full inspection wired for replay analysis |

## What's Inside

- **5 zones** — Ruined Chapel Entrance, Nave, Shadowed Alcove, Vestry Passage, Crypt Antechamber
- **1 NPC** — Suspicious Pilgrim (branching dialogue, 3 conversation paths)
- **1 enemy** — Ash Ghoul (aggressive AI, fear of fire and sacred)
- **1 item** — Healing Draught (scripted use-effect restoring 8 HP)
- **1 progression tree** — Combat Mastery (Toughened → Keen Eye → Battle Fury)
- **1 presentation rule** — undead perceive all living as threats
- **15 modules wired** — traversal, status, combat, inventory, dialogue, cognition, perception, progression, environment, factions, rumors, districts, belief, observer presentation, inspector

## Usage

```typescript
import { createGame } from '@ai-rpg-engine/starter-fantasy';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zones, pilgrimDialogue, fantasyMinimalRuleset } from '@ai-rpg-engine/starter-fantasy';
```

## Documentation

- [The Chapel Threshold (Ch. 20)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/20-chapel-threshold/)
- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
