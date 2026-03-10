<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/campaign-memory

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/campaign-memory)](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Memoria persistente de los personajes no jugables (PNJs), relaciones multidimensionales y diario de campaña para [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalación

```bash
npm install @ai-rpg-engine/campaign-memory
```

## ¿Qué hace?

Los PNJs recuerdan lo que ha sucedido. No solo "hostil: verdadero", sino que registran la confianza, el miedo, la admiración y la familiaridad en cada interacción. Los recuerdos se desvanecen con el tiempo: vívidos → desvanecidos → tenues → olvidados. El diario de campaña registra eventos importantes a lo largo de las sesiones.

## Uso

### Diario de campaña

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

### Banco de memoria de los PNJs

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

### Ejes de relación

| Eje | Rango | Significado |
|------|-------|---------|
| confianza | -1 a 1 | Desconfianza → Confianza |
| miedo | 0 a 1 | Sin miedo → Aterrado |
| admiración | -1 a 1 | Desprecio → Admiración |
| familiaridad | 0 a 1 | Desconocido → Íntimo |

### Categorías de registro

`acción` · `combate` · `muerte` · `traición` · `regalo` · `robo` · `deuda` · `descubrimiento` · `alianza` · `insulto` · `rescate` · `muerte`

Cada categoría tiene efectos predeterminados en la relación. Un rescate genera confianza (+0.4) y admiración (+0.3). Una traición destruye la confianza (-0.5).

### Consolidación de la memoria

Los recuerdos se desvanecen con el tiempo a través de tres etapas:

- **vívido** — alta relevancia, recientemente formado
- **desvanecido** — la relevancia disminuye por debajo del umbral de desvanecimiento
- **tenue** — apenas recordado, a punto de ser olvidado

Configure las tasas de desvanecimiento para cada PNJ o globalmente.

## Serialización

Tanto `CampaignJournal` como `NpcMemoryBank` admiten `serialize()` y `deserialize()` para la persistencia entre sesiones.

## Parte de AI RPG Engine

Este paquete es parte del monorepositorio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Funciona de forma independiente o se integra con los sistemas de cognición y rumores del motor.

## Licencia

MIT
