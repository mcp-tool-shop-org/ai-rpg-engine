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

# @ai-rpg-engine/starter-weird-west

> **Composition Example** — This starter demonstrates how to wire the engine for weird western. It is an example to learn from, not a template to copy. See the [Composition Guide](../../docs/handbook/57-composition-guide.md) to build your own game.

**Dust Devil's Bargain** — A haunted frontier town where the dead still draw.

Part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) starter pack catalog.

## Theme

Western + supernatural. Gunslingers, dust spirits, and a mesa cult. The Dust resource accumulates over time — when it hits 100, the drifter is claimed by the desert.

## Quick Start

```typescript
import { createGame } from '@ai-rpg-engine/starter-weird-west';

const engine = createGame();
engine.submitAction('inspect');
```

## Content

- **5 zones:** Drifter's Crossroads, Saloon, Sheriff's Office, Red Mesa Trail, Spirit Hollow
- **2 NPCs:** Bartender Silas, Sheriff Hale
- **2 enemies:** Dust Revenant, Mesa Crawler
- **1 dialogue tree:** Bartender intel on the mesa cult
- **1 progression tree:** Gunslinger path (Quick Hand → Iron Will → Dead Eye)
- **1 item:** Sage Bundle (reduces Dust by 20)

## Unique Mechanics

| Verb | Description |
|------|-------------|
| `draw` | Quick-draw duel — reflex contest |
| `commune` | Speak with spirits using lore |

## Stats & Resources

| Stat | Role |
|------|------|
| grit | Toughness and willpower |
| draw-speed | Reflexes and reaction time |
| lore | Supernatural knowledge |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–30 | Standard health |
| Resolve | 0–20 | Mental fortitude, regens 1/tick |
| Dust | 0–100 | **Inverse pressure** — accumulates, 100 = death |

## What to Borrow

`buildCombatStack` usage and dual resource profile (dust + resolve). Study how two resources with opposite polarity create tension — dust accumulates toward a death threshold while resolve is spent for powerful actions, forcing players to balance aggression against survival.

## License

MIT
