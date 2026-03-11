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

# @ai-rpg-engine/starter-ronin

> **Composition Example** — This starter demonstrates how to wire the engine for feudal mystery. It is an example to learn from, not a template to copy. See the [Composition Guide](../../docs/handbook/57-composition-guide.md) to build your own game.

**Jade Veil** — A feudal castle during a tense political summit. A lord has been poisoned. Find the killer before honor runs out.

Part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) starter pack catalog.

## Theme

Feudal mystery + court intrigue. Honor is fragile — false accusations cost dearly and are nearly impossible to recover. Every question carries weight, every accusation has consequences. Assassins perceive the ronin as "a blade without a lord — unpredictable."

## Quick Start

```typescript
import { createGame } from '@ai-rpg-engine/starter-ronin';

const engine = createGame();
engine.start();
```

## Patterns Demonstrated

| Feature | What Ronin shows |
|---------|------------------|
| **Engagement** | Multiple protector roles (bodyguard + samurai), hidden passages |
| **Resources** | Dual-layer: ki (regenerating) vs honor (fragile, hard to recover) |
| **Social** | Investigation with consequence — false accusations cost honor |
| **Cognition** | Assassin perception rule targeting unaffiliated ronin |

## Content

- **5 zones:** Castle Gate, Great Hall, Tea Garden, Lord's Chamber, Hidden Passage
- **3 NPCs:** Lord Takeda (poisoned lord), Lady Himiko (suspect), Magistrate Sato (investigator)
- **2 enemies:** Shadow Assassin, Corrupt Samurai
- **1 dialogue tree:** Magistrate briefing on the poisoning and court suspects
- **1 progression tree:** Way of the Blade (Steady Hand → Inner Calm → Righteous Fury)
- **1 item:** Incense Kit (restores 5 ki)

## Unique Mechanics

| Verb | Description |
|------|-------------|
| `duel` | Formal martial challenge using discipline |
| `meditate` | Restore ki and composure at the cost of a turn |

## Stats & Resources

| Stat | Role |
|------|------|
| discipline | Martial skill, blade technique, focus |
| perception | Awareness, deduction, reading intent |
| composure | Social control, emotional mastery |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–30 | Standard health |
| Honor | 0–30 | Fragile — false accusations cost -5, hard to recover |
| Ki | 0–20 | Spiritual energy, regens 2/tick |

## What to Borrow

Multiple protector roles (bodyguard + samurai) and dual-layer resources (ki + honor). Study how two engagement protector roles with different trigger conditions create layered defense, and how ki (regenerating) vs honor (fragile, hard to recover) force different play styles in combat vs investigation.

## License

MIT
