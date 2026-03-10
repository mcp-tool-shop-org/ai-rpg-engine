<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/campaign-memory

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/campaign-memory)](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Persistent NPC memory, multi-axis relationships, and campaign journal for [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Install

```bash
npm install @ai-rpg-engine/campaign-memory
```

## What It Does

NPCs remember what happened. Not just "hostile: true" — they track trust, fear, admiration, and familiarity across every interaction. Memories fade over time: vivid → faded → dim → forgotten. The campaign journal persists significant events across sessions.

## Usage

### Campaign Journal

```typescript
import { CampaignJournal } from '@ai-rpg-engine/campaign-memory';

const journal = new CampaignJournal();

// Record a significant event
const record = journal.record({
  tick: 42,
  category: 'kill',
  actorId: 'player',
  targetId: 'merchant_1',
  zoneId: 'market',
  description: 'Player killed the merchant during a robbery',
  significance: 0.9,
  witnesses: ['guard_1', 'bystander_2'],
  data: { weapon: 'dagger' },
});

// Query the journal
const playerActions = journal.query({ actorId: 'player', category: 'kill' });
const merchantHistory = journal.getInvolving('merchant_1');
```

### NPC Memory Bank

```typescript
import { NpcMemoryBank, applyRelationshipEffect } from '@ai-rpg-engine/campaign-memory';

const guardMemory = new NpcMemoryBank('guard_1');

// Guard witnesses the player killing a merchant
guardMemory.remember(record, 0.9, -0.8);      // high salience, very negative
applyRelationshipEffect(guardMemory, record, 'witness');

// Check how the guard feels about the player
const rel = guardMemory.getRelationship('player');
// { trust: -0.15, fear: 0.25, admiration: -0.05, familiarity: 0 }

// Later, memories fade
guardMemory.consolidate(currentTick);
const memories = guardMemory.recall({ aboutEntity: 'player', minSalience: 0.5 });
```

### Relationship Axes

| Axis | Range | Meaning |
|------|-------|---------|
| trust | -1 to 1 | Distrust → Trust |
| fear | 0 to 1 | Unafraid → Terrified |
| admiration | -1 to 1 | Contempt → Admiration |
| familiarity | 0 to 1 | Stranger → Intimate |

### Record Categories

`action` · `combat` · `kill` · `betrayal` · `gift` · `theft` · `debt` · `discovery` · `alliance` · `insult` · `rescue` · `death`

Each category has default relationship effects. A rescue builds trust (+0.4) and admiration (+0.3). A betrayal destroys trust (-0.5).

### Memory Consolidation

Memories decay over time through three stages:

- **vivid** — high salience, recently formed
- **faded** — salience dropped below fade threshold
- **dim** — barely remembered, about to be forgotten

Configure decay rates per-NPC or globally.

## Serialization

Both `CampaignJournal` and `NpcMemoryBank` support `serialize()` and `deserialize()` for persistence across sessions.

## Part of AI RPG Engine

This package is part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) monorepo. It works standalone or integrates with the engine's cognition and rumor systems.

## License

MIT
