<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/rumor-system

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/rumor-system)](https://www.npmjs.com/package/@ai-rpg-engine/rumor-system)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Motor de ciclo de vida de rumores com mecanismos de mutação, rastreamento de propagação e adoção por facções para o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalação

```bash
npm install @ai-rpg-engine/rumor-system
```

## O que ele faz

Os rumores se transformam à medida que se espalham. "O jogador matou um mercador" pode se tornar "O jogador massacrou cinco mercadores" após algumas propagações entre guardas em pânico. O motor rastreia a perda de confiança, a carga emocional, os caminhos de propagação, o número de mutações e a adoção por facções, transformando a fofoca dos NPCs em um sistema de simulação, e não em uma simples cópia e colagem.

## Uso

### Criar e espalhar rumores

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

### Regras de mutação

Cinco mutações internas são aplicadas probabilisticamente durante cada propagação:

| Mutação | Probabilidade | Efeito |
|----------|------------|--------|
| **exaggerate** | 15% | Valores numéricos aumentam 20-50% |
| **minimize** | 10% | Valores numéricos diminuem |
| **invert** | 5% | Valores booleanos invertem (raro, dramático) |
| **attribute-shift** | 8% | Atribuição muda para o propagador |
| **embellish** | 20% | Carga emocional se intensifica |

Instabilidade ambiental multiplica todas as probabilidades.

### Ciclo de vida do rumor

```
spreading → established → fading → dead
```

- **propagando** — sendo ativamente transmitido entre entidades
- **estabelecido** — atingiu o número máximo de propagações (maxHops), amplamente conhecido
- **desvanecendo** — nenhuma nova propagação por um número de ticks (fadingThreshold)
- **morto** — sem atividade por um número de ticks (deathThreshold)

```typescript
// Update lifecycle statuses
engine.tick(currentTick);

// Query active rumors
const activeRumors = engine.query({ status: 'spreading', minConfidence: 0.5 });
const playerRumors = engine.aboutSubject('player');
```

### Configuração

```typescript
const engine = new RumorEngine({
  maxHops: 5,              // Transitions to 'established' after this
  confidenceDecayPerHop: 0.1,
  fadingThreshold: 10,     // Ticks inactive → 'fading'
  deathThreshold: 30,      // Ticks inactive → 'dead'
  mutations: customRules,  // Replace default mutations
});
```

### Mutações personalizadas

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

## Serialização

`RumorEngine` suporta `serialize()` e `RumorEngine.deserialize()` para persistência.

## Parte do AI RPG Engine

Este pacote faz parte do monorepository [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Ele funciona de forma independente ou se integra com os sistemas de cognição e facções do motor.

## Licença

MIT
