<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-weird-west

**Dust Devil's Bargain** — A frontier town hides a cult summoning something from the red mesa.

Part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) starter pack catalog.

## Theme

Western + supernatural. Gunslingers, dust spirits, and a mesa cult. The Dust resource accumulates over time — when it hits 100, the drifter is claimed by the desert.

## Quick Start

```typescript
import { createGame } from '@ai-rpg-engine/starter-weird-west';

const engine = createGame();
engine.start();
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

## License

MIT
