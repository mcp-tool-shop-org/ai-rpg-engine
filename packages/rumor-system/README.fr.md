<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/rumor-system

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/rumor-system)](https://www.npmjs.com/package/@ai-rpg-engine/rumor-system)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Moteur de cycle de vie des rumeurs avec mécanismes de mutation, suivi de la propagation et adoption par les factions, pour [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installation

```bash
npm install @ai-rpg-engine/rumor-system
```

## Fonctionnalités

Les rumeurs évoluent au fur et à mesure de leur propagation. "Le joueur a tué un marchand" peut devenir "Le joueur a massacré cinq marchands" après quelques transmissions par des gardes paniqués. Le moteur suit la diminution de la crédibilité, la charge émotionnelle, les chemins de propagation, le nombre de mutations et l'adoption par les factions, transformant ainsi les potins des PNJ en un système de simulation, et non en une simple copie-colle.

## Utilisation

### Création et propagation des rumeurs

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

### Règles de mutation

Cinq mutations intégrées se déclenchent de manière probabiliste à chaque étape de la propagation :

| Mutation | Probabilité | Effet |
|----------|------------|--------|
| **exaggerate** | 15% | Les valeurs numériques augmentent de 20 à 50 % |
| **minimize** | 10% | Les valeurs numériques diminuent |
| **invert** | 5% | Les valeurs booléennes s'inversent (rare, spectaculaire) |
| **attribute-shift** | 8% | L'attribution change et est attribuée au diffuseur |
| **embellish** | 20% | La charge émotionnelle s'intensifie |

L'instabilité de l'environnement multiplie toutes les probabilités.

### Cycle de vie des rumeurs

```
spreading → established → fading → dead
```

- **propagation** — activement transmise entre les entités
- **établie** — a atteint le nombre maximal de sauts, largement connue
- **disparition** — aucune nouvelle propagation pendant un nombre de cycles `fadingThreshold`
- **morte** — aucune activité pendant un nombre de cycles `deathThreshold`

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

### Mutations personnalisées

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

## Sérialisation

`RumorEngine` prend en charge `serialize()` et `RumorEngine.deserialize()` pour la persistance.

## Fait partie de AI RPG Engine

Ce paquet fait partie du dépôt monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Il peut être utilisé de manière autonome ou intégré aux systèmes de cognition et de factions du moteur.

## Licence

MIT
