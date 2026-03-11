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

# @ai-rpg-engine/starter-vampire

> **Composition Example** — This starter demonstrates how to wire the engine for gothic vampire horror. It is an example to learn from, not a template to copy. See the [Composition Guide](../../docs/handbook/57-composition-guide.md) to build your own game.

**Crimson Court** — A decaying aristocratic manor during a masked ball. Three vampire houses vie for dominance while the hunger threatens to consume you.

Part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) starter pack catalog.

## Theme

Gothic horror + vampire court politics. Bloodlust rises each tick — if it hits 100, the player loses control. Feeding reduces bloodlust but costs humanity. Vampires perceive humans as "vessels of warmth."

## Quick Start

```typescript
import { createGame } from '@ai-rpg-engine/starter-vampire';

const engine = createGame();
engine.start();
```

## Patterns Demonstrated

| Feature | What Vampire shows |
|---------|---------------------|
| **Resources** | Opposing dual resources (bloodlust rises, humanity falls) creating a moral economy |
| **Cognition** | Vampires perceive humans differently — presentation rule on living entities |
| **Dialogue** | Gated options — low humanity locks conversation branches |
| **Progression** | Supernatural power tree with escalating social control abilities |

## Content

- **5 zones:** Grand Ballroom, East Gallery, Wine Cellar, Moonlit Garden, Bell Tower
- **3 NPCs:** Duchess Morvaine (elder vampire), Cassius (rival fledgling), Servant Elara (human)
- **2 enemies:** Witch Hunter, Feral Thrall
- **1 dialogue tree:** Duchess audience on court politics and controlling the hunger
- **1 progression tree:** Blood Mastery (Iron Will → Mesmerist → Apex Predator)
- **1 item:** Blood Vial (reduces bloodlust by 15)

## Unique Mechanics

| Verb | Description |
|------|-------------|
| `enthrall` | Supernatural social domination using presence |
| `feed` | Drain blood to reduce bloodlust at the cost of humanity |

## Stats & Resources

| Stat | Role |
|------|------|
| presence | Social dominance, supernatural authority |
| vitality | Physical prowess, feeding efficiency |
| cunning | Deception, perception, court intrigue |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–30 | Standard health |
| Bloodlust | 0–100 | Inverse pressure — rises each tick, loss of control at 100 |
| Humanity | 0–30 | Moral anchor — below 10 locks dialogue options |

## What to Borrow

Opposing dual resources (bloodlust vs humanity). Study how two resources that move in opposite directions create a moral economy — feeding reduces bloodlust but costs humanity, making every resource decision a narrative choice with permanent consequences.

## License

MIT
