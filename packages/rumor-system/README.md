<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/rumor-system

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/rumor-system)](https://www.npmjs.com/package/@ai-rpg-engine/rumor-system)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Rumor lifecycle engine with mutation mechanics, spread tracking, and faction uptake for [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Install

```bash
npm install @ai-rpg-engine/rumor-system
```

## What It Does

Rumors mutate as they spread. "The player killed a merchant" becomes "The player slaughtered five merchants" after a few hops through panicked guards. The engine tracks confidence decay, emotional charge, spread paths, mutation counts, and faction uptake — making NPC gossip a simulation system, not a copy-paste.

## Usage

### Create and Spread Rumors

```typescript
import { RumorEngine } from '@ai-rpg-engine/rumor-system';

const engine = new RumorEngine();

// A guard witnesses a killing
const rumor = engine.create({
  claim: 'player killed merchant_1',
  subject: 'player',
  key: 'killed_merchant',
  value: true,
  sourceId: 'guard_1',
  originTick: 42,
  confidence: 0.9,
  emotionalCharge: -0.7,
});

// The rumor spreads — mutations may apply
const spread = engine.spread(rumor.id, {
  spreaderId: 'guard_1',
  spreaderFactionId: 'town_guard',
  receiverId: 'guard_2',
  receiverFactionId: 'town_guard',
  environmentInstability: 0.3,
  hopCount: 1,
});

// Track which factions absorbed the rumor
engine.recordFactionUptake(rumor.id, 'town_guard');
```

### Mutation Rules

Five built-in mutations fire probabilistically during each spread hop:

| Mutation | Probability | Effect |
|----------|------------|--------|
| **exaggerate** | 15% | Numeric values increase 20-50% |
| **minimize** | 10% | Numeric values decrease |
| **invert** | 5% | Boolean values flip (rare, dramatic) |
| **attribute-shift** | 8% | Attribution changes to the spreader |
| **embellish** | 20% | Emotional charge intensifies |

Environment instability multiplies all probabilities.

### Rumor Lifecycle

```
spreading → established → fading → dead
```

- **spreading** — actively being passed between entities
- **established** — reached maxHops, widely known
- **fading** — no new spreads for fadingThreshold ticks
- **dead** — no activity for deathThreshold ticks

```typescript
// Update lifecycle statuses
engine.tick(currentTick);

// Query active rumors
const activeRumors = engine.query({ status: 'spreading', minConfidence: 0.5 });
const playerRumors = engine.aboutSubject('player');
```

### Configuration

```typescript
const engine = new RumorEngine({
  maxHops: 5,              // Transitions to 'established' after this
  confidenceDecayPerHop: 0.1,
  fadingThreshold: 10,     // Ticks inactive → 'fading'
  deathThreshold: 30,      // Ticks inactive → 'dead'
  mutations: customRules,  // Replace default mutations
});
```

### Custom Mutations

```typescript
import type { MutationRule } from '@ai-rpg-engine/rumor-system';

const panicMutation: MutationRule = {
  id: 'panic',
  type: 'exaggerate',
  probability: 0.30,
  apply: (rumor, ctx) => ({
    ...rumor,
    emotionalCharge: Math.max(-1, rumor.emotionalCharge - 0.3),
    mutationCount: rumor.mutationCount + 1,
  }),
};
```

## Serialization

`RumorEngine` supports `serialize()` and `RumorEngine.deserialize()` for persistence.

## Part of AI RPG Engine

This package is part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) monorepo. It works standalone or integrates with the engine's cognition and faction systems.

## License

MIT
