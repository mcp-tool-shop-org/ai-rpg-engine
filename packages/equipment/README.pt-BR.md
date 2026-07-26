<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![Licença: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Slots de equipamento, definições de itens e gerenciamento de equipamentos para [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalação

```bash
npm install @ai-rpg-engine/equipment
```

## O que faz

Gerencia o equipamento do personagem em 5 slots (arma, armadura, acessório, ferramenta, amuleto) com catálogos de itens, operações de configuração de equipamentos, requisitos baseados em tags e cálculo de efeitos agregados. Todas as operações são imutáveis.

## Uso

### Criar e equipar

```typescript
import {
  createEmptyLoadout,
  equipItem,
  computeLoadoutEffects,
} from '@ai-rpg-engine/equipment';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

const catalog: ItemCatalog = {
  items: [
    {
      id: 'iron-sword',
      name: 'Iron Sword',
      description: 'A sturdy blade.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { str: 2 },
      grantedTags: ['armed'],
      grantedVerbs: ['slash'],
    },
  ],
};

let loadout = createEmptyLoadout();
const result = equipItem(loadout, 'iron-sword', catalog, []);
// result.loadout.equipped.weapon === 'iron-sword'
// result.errors === []

const effects = computeLoadoutEffects(result.loadout, catalog);
// effects.statModifiers.str === 2
// effects.grantedTags === ['armed']
```

### Gerenciamento de inventário

```typescript
import { addToInventory, removeFromInventory } from '@ai-rpg-engine/equipment';

let loadout = createEmptyLoadout();
loadout = addToInventory(loadout, 'healing-potion');
const { loadout: updated, removed } = removeFromInventory(loadout, 'healing-potion');
```

### Validação

```typescript
import { validateLoadout } from '@ai-rpg-engine/equipment';

const result = validateLoadout(loadout, catalog, characterTags);
// result.ok, result.errors
```

## Slots

| Slot | Finalidade |
|------|---------|
| `weapon` | Item ofensivo principal |
| `armor` | Equipamento de defesa |
| `accessory` | Anel, amuleto, aprimoramento |
| `tool` | Item utilitário (gazua, scanner) |
| `trinket` | Amuleto, insígnia, item passivo |

## Raridade do item

`comum` | `incomum` | `raro` | `lendário`

## Crescimento de Relíquia — equipamento que ganha um nome

Um item que realizou algo acumula uma história, e uma história ganha um nome. Um cutelo que tirou três vidas torna-se o **Cutelo Ensangrentado**. O crescimento é calculado a partir da crônica do item, nunca criado manualmente.

`evaluateRelicGrowth` é o lado de leitura — transforma uma crônica em um nível e um epíteto:

```typescript
import { evaluateRelicGrowth } from '@ai-rpg-engine/equipment';

const relic = evaluateRelicGrowth(item, chronicle, currentTick);
// -> { currentEpithet: 'Bloodied Cutlass', milestonesReached: [...], tier: 1 }
```

Cinco gatilhos impulsionam-no — `kill-count`, `age`, `recognition-count`, `faction-kills`, `boss-kill` — contados a partir da crônica. Armas usam por padrão `DEFAULT_WEAPON_MILESTONES`, tudo o mais usa `DEFAULT_ARMOR_MILESTONES`; um pacote pode substituir por item.

`createItemChronicleCore` é o lado de escrita: um `EngineModule` **opcional** que registra a história do jogo real.

```typescript
import { createItemChronicleCore, getItemDisplayName } from '@ai-rpg-engine/equipment';
import { evaluateItemRecognition } from '@ai-rpg-engine/modules';

// add to your engine's module list
createItemChronicleCore({
  catalog: itemCatalog,
  recognition: { evaluate: evaluateItemRecognition }, // optional
})

getItemDisplayName(world, 'cutlass', 'Cutlass'); // 'Bloodied Cutlass'
```

Ele registra `acquired` (primeira coleta ou equipamento), `used-in-kill` (atribuído à arma equipada do atacante) e `recognized` (quando alguém em sua zona reage à sua origem). `recognition` é injetado em vez de importado porque este pacote não tem nenhuma dependência de tempo de execução em `@ai-rpg-engine/modules`. Leia o crescimento novamente com `getItemDisplayName`, `getRelicSummary`, `getItemChronicle` ou atualize sob demanda com `refreshRelicSummaries`.

O registro é determinístico — orientado a eventos, baseado em `event.tick`, sem relógio e sem sorteio aleatório (RNG). Um jogo que não adiciona o módulo é idêntico ao que foi construído antes de sua existência, e o módulo não registra nenhum namespace padrão, portanto, um mundo onde nada é registrado nunca materializa o estado.

## Parte do AI RPG Engine

Este pacote faz parte do monorepositorio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Licença

MIT
