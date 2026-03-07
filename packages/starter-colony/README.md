# @ai-rpg-engine/starter-colony

**Signal Loss** — A distant colony loses contact with Earth. Something is alive in the caverns below.

Part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) starter pack catalog.

## Theme

Sci-fi colony management + alien contact. Power is a shared colony resource — when it drops, systems fail in cascade. The alien presence perceives colonists as "disruptive resonance patterns."

## Quick Start

```typescript
import { createGame } from '@ai-rpg-engine/starter-colony';

const engine = createGame();
engine.start();
```

## Content

- **5 zones:** Command Module, Hydroponics Bay, Perimeter Fence, Signal Tower, Alien Cavern
- **2 NPCs:** Dr. Vasquez (scientist), Chief Okafor (security)
- **2 enemies:** Breached Drone, Resonance Entity
- **1 dialogue tree:** Dr. Vasquez briefing on alien signal and colony politics
- **1 progression tree:** Commander path (Field Engineer → Sharp Sensors → Unshakeable)
- **1 item:** Emergency Cell (restores 20 power)

## Unique Mechanics

| Verb | Description |
|------|-------------|
| `scan` | Sensor sweep using awareness |
| `allocate` | Redistribute power between colony systems |

## Stats & Resources

| Stat | Role |
|------|------|
| engineering | Fix and build systems |
| command | Leadership and crew morale |
| awareness | Sensors and perception |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–25 | Standard health |
| Power | 0–100 | Shared colony resource, regens 2/tick |
| Morale | 0–30 | Crew cohesion |

## License

MIT
