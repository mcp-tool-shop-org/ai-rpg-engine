<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/campaign-memory

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/campaign-memory)](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Memória persistente de NPCs, relações multi-eixos e diário de campanha para o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalação

```bash
npm install @ai-rpg-engine/campaign-memory
```

## O que ele faz

Os NPCs se lembram do que aconteceu. Não apenas "hostil: verdadeiro" — eles rastreiam confiança, medo, admiração e familiaridade em todas as interações. As memórias diminuem com o tempo: vívidas → desbotadas → tênues → esquecidas. O diário de campanha registra eventos significativos ao longo das sessões.

## Uso

### Diário de Campanha

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

### Banco de Memória de NPCs

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

### Eixos de Relação

| Eixo | Intervalo | Significado |
|------|-------|---------|
| confiança | -1 a 1 | Desconfiança → Confiança |
| medo | 0 a 1 | Sem medo → Aterrorizado |
| admiração | -1 a 1 | Desprezo → Admiração |
| familiaridade | 0 a 1 | Estranho → Íntimo |

### Categorias de Registro

`ação` · `combate` · `morte` · `traição` · `presente` · `roubo` · `dívida` · `descoberta` · `aliança` · `insulto` · `resgate` · `morte`

Cada categoria tem efeitos de relacionamento padrão. Um resgate aumenta a confiança (+0,4) e a admiração (+0,3). Uma traição destrói a confiança (-0,5).

### Consolidação da Memória

As memórias diminuem com o tempo em três estágios:

- **vívida** — alta relevância, recém-formada
- **desbotada** — a relevância caiu abaixo do limite de desvanecimento
- **tênue** — dificilmente lembrada, prestes a ser esquecida

Configure as taxas de decaimento para cada NPC ou globalmente.

## Serialização

Tanto `CampaignJournal` quanto `NpcMemoryBank` suportam `serialize()` e `deserialize()` para persistência entre sessões.

## Parte do AI RPG Engine

Este pacote faz parte do monorepository [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Ele funciona de forma independente ou se integra com os sistemas de cognição e rumores do motor.

## Licença

MIT
