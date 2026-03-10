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

# @ai-rpg-engine/starter-pirate

**Black Flag Requiem** — a high-seas pirate starter world for AI RPG Engine.

## Install

```bash
npm install @ai-rpg-engine/starter-pirate
```

## What You'll Learn

This starter demonstrates the full engine stack through a pirate adventure:

| Feature | What the Pirate shows |
|---|---|
| **Rulesets** | `pirateMinimalRuleset` — stats (brawn/cunning/sea-legs), resources (hp/morale), verbs, formulas |
| **Zones & traversal** | 5 zones across 3 rooms with adjacency, light levels, interactables, hazards |
| **Districts** | Port Haven (colonial-navy faction) vs Cursed Waters (dangerous sea) |
| **Dialogue** | Branching cartographer conversation with quest hook and global-flag effects |
| **Combat** | Navy Sailor (aggressive) and Drowned Guardian (cursed sea beast) |
| **Cognition & perception** | Memory decay, perception filter, cursed guardian presentation rule |
| **Progression** | 3-node Seamanship tree with XP rewards on entity defeat |
| **Environment** | Storm surge draining morale, drowning pressure dealing damage |
| **Factions** | Colonial Navy faction with governor and sailors |
| **Belief provenance** | Rumor propagation with delay, belief tracking |
| **Inventory** | Rum barrel with scripted item-use effect restoring morale |
| **Simulation inspector** | Full inspection wired for replay analysis |

## What's Inside

- **5 zones** — Ship Deck, The Rusty Anchor (tavern), Governor's Fort, Open Water, Sunken Shrine
- **3 NPCs** — Quartermaster Bly (crew), Mara the Cartographer (neutral), Governor Vane (colonial authority)
- **2 enemies** — Navy Sailor (aggressive), Drowned Guardian (cursed sea beast)
- **1 item** — Rum Barrel (restores 8 morale)
- **1 progression tree** — Seamanship (Sea-Hardened → Ruthless → Dread Captain)
- **1 presentation rule** — cursed creatures perceive all visitors as trespassers
- **15 modules wired** — traversal, status, combat, inventory, dialogue, cognition, perception, progression, environment, factions, rumors, districts, belief, observer presentation, inspector

## Usage

```typescript
import { createGame } from '@ai-rpg-engine/starter-pirate';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, pirateMinimalRuleset, seamanshipTree } from '@ai-rpg-engine/starter-pirate';
```

## Documentation

- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
