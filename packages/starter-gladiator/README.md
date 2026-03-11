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

# @ai-rpg-engine/starter-gladiator

> **Composition Example** — This starter demonstrates how to wire the engine for arena combat. It is an example to learn from, not a template to copy. See the [Composition Guide](../../docs/handbook/57-composition-guide.md) to build your own game.

**Iron Colosseum** — An underground gladiatorial arena beneath a crumbling empire. Fight for freedom, earn patrons, and survive the crowd's judgment.

Part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) starter pack catalog.

## Theme

Roman arena combat + patronage politics. Crowd Favor swings wildly on spectacle — high favor unlocks patron gifts, low favor means a death sentence. Patrons see gladiators as "investments in blood and spectacle."

## Quick Start

```typescript
import { createGame } from '@ai-rpg-engine/starter-gladiator';

const engine = createGame();
engine.start();
```

## Patterns Demonstrated

| Feature | What Gladiator shows |
|---------|----------------------|
| **Resources** | Volatile meta-resource (crowd favor) driven by spectacle, not efficiency |
| **Combat** | 3-phase boss design with mid-encounter dynamic shifts |
| **Custom verbs** | Taunt and showboat as non-damage combat actions affecting resources |
| **Social** | Patronage system gated by crowd favor thresholds |

## Content

- **5 zones:** Holding Cells, Arena Floor, Patron Gallery, Armory, Tunnel Exit
- **3 NPCs:** Lanista Brutus (arena master), Domina Valeria (patron), Nerva (veteran ally)
- **2 enemies:** Arena Champion, War Beast
- **1 dialogue tree:** Patron audience on sponsorship and arena politics
- **1 progression tree:** Arena Glory (Crowd Pleaser → Iron Endurance → Freedom Fighter)
- **1 item:** Patron Token (boosts crowd favor by 10)

## Unique Mechanics

| Verb | Description |
|------|-------------|
| `taunt` | Provoke enemies and thrill the crowd |
| `showboat` | Sacrifice efficiency for spectacle and favor |

## Stats & Resources

| Stat | Role |
|------|------|
| might | Raw power, heavy strikes |
| agility | Speed, evasion, precision |
| showmanship | Crowd manipulation, theatrical combat |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–40 | Standard health |
| Fatigue | 0–50 | Inverse pressure — rises in combat, recovers -2/tick |
| Crowd Favor | 0–100 | Volatile — >75 unlocks patron gifts, <25 means death |

## What to Borrow

Performance resource economy (crowd-favor) and 3-phase boss design. Study how crowd favor acts as a volatile meta-resource that swings on spectacle rather than efficiency, and how the Arena Champion fight uses phase transitions to shift combat dynamics mid-encounter.

## License

MIT
