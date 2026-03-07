<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-detective

**Gaslight Detective** — a Victorian mystery starter world for AI RPG Engine.

## Install

```bash
npm install @ai-rpg-engine/starter-detective
```

## What You'll Learn

This starter demonstrates the full engine stack through an investigation scenario:

| Feature | What the Detective shows |
|---|---|
| **Rulesets** | `detectiveMinimalRuleset` — stats (perception/eloquence/grit), resources (hp/composure), verbs, formulas |
| **Zones & traversal** | 5 zones across 2 rooms with adjacency, light levels, interactables, hazards |
| **Districts** | Ashford Estate (aristocratic) vs Dockyards (dockworkers faction) |
| **Dialogue** | Branching widow interrogation with evidence-gathering and global-flag effects |
| **Combat** | Dock Thug with aggressive AI profile and territorial goals |
| **Cognition & perception** | Memory decay, perception filter, suspect paranoia presentation rule |
| **Progression** | 3-node Deduction Mastery tree with XP rewards on entity defeat |
| **Environment** | Dark alley hazard draining composure on zone entry |
| **Factions** | Dockworkers faction with cohesion setting |
| **Belief provenance** | Rumor propagation with delay, belief tracking |
| **Inventory** | Smelling salts with scripted item-use effect |
| **Simulation inspector** | Full inspection wired for replay analysis |

## What's Inside

- **5 zones** — The Study (crime scene), Parlour, Servants' Hall, Front Entrance, Back Alley
- **3 NPCs** — Lady Ashford (widow/suspect), Constable Pike (law), Mrs Calloway (servant/witness)
- **1 enemy** — Dock Thug (aggressive AI, territorial)
- **1 item** — Smelling Salts (restores 6 composure)
- **1 progression tree** — Deduction Mastery (Keen Eye → Silver Tongue → Iron Nerves)
- **1 presentation rule** — suspects perceive investigation as threatening
- **15 modules wired** — traversal, status, combat, inventory, dialogue, cognition, perception, progression, environment, factions, rumors, districts, belief, observer presentation, inspector

## Usage

```typescript
import { createGame } from '@ai-rpg-engine/starter-detective';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, detectiveMinimalRuleset, deductionMasteryTree } from '@ai-rpg-engine/starter-detective';
```

## Documentation

- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
