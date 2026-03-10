<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/rumor-system

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/rumor-system)](https://www.npmjs.com/package/@ai-rpg-engine/rumor-system)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Motor de ciclo de vida de rumores con mecanismos de mutación, seguimiento de la propagación y adopción por facciones para [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalación

```bash
npm install @ai-rpg-engine/rumor-system
```

## ¿Qué hace?

Los rumores mutan a medida que se propagan. "El jugador mató a un mercader" puede convertirse en "El jugador masacró a cinco mercaderes" después de varios saltos a través de guardias aterrorizados. El motor rastrea la disminución de la confianza, la carga emocional, las rutas de propagación, el número de mutaciones y la adopción por facciones, lo que convierte el chismorreo de los PNJ en un sistema de simulación, no en una simple copia y pegado.

## Uso

### Creación y propagación de rumores

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

### Reglas de mutación

Cinco mutaciones integradas se activan de forma probabilística durante cada salto de propagación:

| Mutación | Probabilidad | Efecto |
|----------|------------|--------|
| **exaggerate** | 15% | Los valores numéricos aumentan un 20-50% |
| **minimize** | 10% | Los valores numéricos disminuyen |
| **invert** | 5% | Los valores booleanos cambian (raro, dramático) |
| **attribute-shift** | 8% | La atribución cambia al propagador |
| **embellish** | 20% | La carga emocional se intensifica |

La inestabilidad ambiental multiplica todas las probabilidades.

### Ciclo de vida del rumor

```
spreading → established → fading → dead
```

- **propagación** — se está transmitiendo activamente entre entidades
- **establecido** — ha alcanzado el máximo de saltos (maxHops), ampliamente conocido
- **desvanecimiento** — no hay nuevas propagaciones durante un número de ticks igual al umbral de desvanecimiento (fadingThreshold)
- **muerto** — no hay actividad durante un número de ticks igual al umbral de muerte (deathThreshold)

```typescript
// Update lifecycle statuses
engine.tick(currentTick);

// Query active rumors
const activeRumors = engine.query({ status: 'spreading', minConfidence: 0.5 });
const playerRumors = engine.aboutSubject('player');
```

### Configuración

```typescript
const engine = new RumorEngine({
  maxHops: 5,              // Transitions to 'established' after this
  confidenceDecayPerHop: 0.1,
  fadingThreshold: 10,     // Ticks inactive → 'fading'
  deathThreshold: 30,      // Ticks inactive → 'dead'
  mutations: customRules,  // Replace default mutations
});
```

### Mutaciones personalizadas

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

## Serialización

`RumorEngine` admite `serialize()` y `RumorEngine.deserialize()` para la persistencia.

## Parte de AI RPG Engine

Este paquete es parte del monorepositorio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Funciona de forma independiente o se integra con los sistemas de cognición y facciones del motor.

## Licencia

MIT
