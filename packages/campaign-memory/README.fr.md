<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/campaign-memory

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/campaign-memory)](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Mémoire persistante des PNJ, relations multi-axes et journal de campagne pour [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installation

```bash
npm install @ai-rpg-engine/campaign-memory
```

## Fonctionnalités

Les PNJ se souviennent de ce qui s'est passé. Il ne s'agit pas seulement de "hostile : vrai" – ils suivent la confiance, la peur, l'admiration et la familiarité à travers chaque interaction. Les souvenirs s'estompent avec le temps : vifs → estompés → faibles → oubliés. Le journal de campagne conserve les événements importants entre les sessions.

## Utilisation

### Journal de campagne

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

### Banque de mémoire des PNJ

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

### Axes de relations

| Axe | Plage | Signification |
|------|-------|---------|
| confiance | -1 à 1 | Méfiance → Confiance |
| peur | 0 à 1 | Pas de peur → Terreur |
| admiration | -1 à 1 | Mépris → Admiration |
| familiarité | 0 à 1 | Étranger → Intime |

### Catégories d'enregistrements

`action` · `combat` · `kill` · `betrayal` · `gift` · `theft` · `debt` · `discovery` · `alliance` · `insult` · `rescue` · `death`

Chaque catégorie a des effets de relation par défaut. Une action de sauvetage renforce la confiance (+0,4) et l'admiration (+0,3). Une trahison détruit la confiance (-0,5).

### Consolidation de la mémoire

Les souvenirs s'estompent avec le temps, en trois étapes :

- **vif** — forte importance, récemment créé
- **estompé** — l'importance a diminué en dessous du seuil d'estompement
- **faible** — à peine mémorisé, sur le point d'être oublié

Configurez les taux d'estompement pour chaque PNJ ou globalement.

## Sérialisation

`CampaignJournal` et `NpcMemoryBank` prennent en charge `serialize()` et `deserialize()` pour la persistance entre les sessions.

## Fait partie de AI RPG Engine

Ce paquet fait partie du dépôt monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Il peut être utilisé de manière autonome ou intégré aux systèmes de cognition et de rumeurs du moteur.

## Licence

MIT
