<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Gestion des emplacements d'équipement, des définitions d'objets et de la configuration pour [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installation

```bash
npm install @ai-rpg-engine/equipment
```

## Fonctionnalités

Gère l'équipement des personnages dans 5 emplacements (arme, armure, accessoire, outil, objet de fée) avec des catalogues d'objets, des opérations de configuration, des exigences basées sur des balises et le calcul des effets combinés. Toutes les opérations sont immuables.

## Utilisation

### Création et équipement

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

### Gestion de l'inventaire

```typescript
import { addToInventory, removeFromInventory } from '@ai-rpg-engine/equipment';

let loadout = createEmptyLoadout();
loadout = addToInventory(loadout, 'healing-potion');
const { loadout: updated, removed } = removeFromInventory(loadout, 'healing-potion');
```

### Validation

```typescript
import { validateLoadout } from '@ai-rpg-engine/equipment';

const result = validateLoadout(loadout, catalog, characterTags);
// result.ok, result.errors
```

## Emplacements

| Emplacement | Fonction |
|------|---------|
| `weapon` | Objet offensif principal |
| `armor` | Équipement défensif |
| `accessory` | Anneau, amulette, amélioration |
| `tool` | Objet utilitaire (crochet de serrure, scanner) |
| `trinket` | Amulette, insigne, objet passif |

## Rareté de l'objet

`commun` | `peu courant` | `rare` | `légendaire`

## Fait partie de AI RPG Engine

Ce paquet fait partie du dépôt monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Licence

MIT
