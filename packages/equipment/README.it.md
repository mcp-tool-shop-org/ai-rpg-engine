<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Slot per l'equipaggiamento, definizioni degli oggetti e gestione delle configurazioni per [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installazione

```bash
npm install @ai-rpg-engine/equipment
```

## Cosa fa

Gestisce l'equipaggiamento del personaggio in 5 slot (arma, armatura, accessorio, strumento, oggetto speciale) con cataloghi di oggetti, operazioni di configurazione, requisiti basati su tag e calcolo degli effetti combinati. Tutte le operazioni sono immutabili.

## Utilizzo

### Creazione e equipaggiamento

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

### Gestione dell'inventario

```typescript
import { addToInventory, removeFromInventory } from '@ai-rpg-engine/equipment';

let loadout = createEmptyLoadout();
loadout = addToInventory(loadout, 'healing-potion');
const { loadout: updated, removed } = removeFromInventory(loadout, 'healing-potion');
```

### Validazione

```typescript
import { validateLoadout } from '@ai-rpg-engine/equipment';

const result = validateLoadout(loadout, catalog, characterTags);
// result.ok, result.errors
```

## Slot

| Slot | Scopo |
|------|---------|
| `weapon` | Oggetto offensivo principale |
| `armor` | Equipaggiamento difensivo |
| `accessory` | Anello, amuleto, potenziamento |
| `tool` | Oggetto utile (grimaldello, scanner) |
| `trinket` | Oggetto speciale, distintivo, oggetto passivo |

## Rarità dell'oggetto

`comune` | `raro` | `epico` | `leggendario`

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Licenza

MIT
