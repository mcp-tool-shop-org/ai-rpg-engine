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

# @ai-rpg-engine/starter-zombie

**Ashfall Dead** — a zombie survival starter world for AI RPG Engine.

## Install

```bash
npm install @ai-rpg-engine/starter-zombie
```

## What You'll Learn

This starter demonstrates the full engine stack through a survival scenario:

| Feature | What the Zombie shows |
|---|---|
| **Rulesets** | `zombieMinimalRuleset` — stats (fitness/wits/nerve), resources (hp/stamina/infection), verbs, formulas |
| **Zones & traversal** | 5 zones across 3 rooms with adjacency, light levels, interactables, hazards |
| **Districts** | The Safehouse (survivors faction) vs Dead Zone (hostile, undead) |
| **Dialogue** | Branching medic conversation with hospital supply-run quest hook |
| **Combat** | Shambler (slow, tough) and Runner (fast, fragile) with aggressive AI |
| **Cognition & perception** | Memory decay, perception filter, zombie hunger presentation rule |
| **Progression** | 3-node Survival tree with XP rewards on entity defeat |
| **Environment** | Roaming dead draining stamina, infection-risk zones raising infection |
| **Factions** | Survivors faction with medic, scavenger, and military leader |
| **Belief provenance** | Rumor propagation with delay, belief tracking |
| **Inventory** | Antibiotics with scripted item-use effect reducing infection |
| **Simulation inspector** | Full inspection wired for replay analysis |

## What's Inside

- **5 zones** — Safehouse Lobby, Abandoned Gas Station, Overrun Street, Hospital East Wing, Hospital Rooftop
- **3 NPCs** — Dr. Chen (medic), Rook (scavenger), Sergeant Marsh (military leader)
- **2 enemies** — Shambler (slow, tough undead), Runner (fast, fragile undead)
- **1 item** — Antibiotics (reduces infection by 25)
- **1 progression tree** — Survival (Scrapper → Cool-Headed → Last One Standing)
- **1 presentation rule** — zombies perceive all living as prey
- **15 modules wired** — traversal, status, combat, inventory, dialogue, cognition, perception, progression, environment, factions, rumors, districts, belief, observer presentation, inspector

## Usage

```typescript
import { createGame } from '@ai-rpg-engine/starter-zombie';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zombieMinimalRuleset, survivalTree } from '@ai-rpg-engine/starter-zombie';
```

## Documentation

- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
