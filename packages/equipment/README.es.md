<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Ranuras de equipamiento, definiciones de objetos y gestión de equipamiento para [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalación

```bash
npm install @ai-rpg-engine/equipment
```

## ¿Qué hace?

Gestiona el equipamiento del personaje en 5 ranuras (arma, armadura, accesorio, herramienta, objeto especial) con catálogos de objetos, operaciones de equipamiento, requisitos basados en etiquetas y cálculo de efectos combinados. Todas las operaciones son inmutables.

## Uso

### Creación y equipamiento

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

### Gestión de inventario

```typescript
import { addToInventory, removeFromInventory } from '@ai-rpg-engine/equipment';

let loadout = createEmptyLoadout();
loadout = addToInventory(loadout, 'healing-potion');
const { loadout: updated, removed } = removeFromInventory(loadout, 'healing-potion');
```

### Validación

```typescript
import { validateLoadout } from '@ai-rpg-engine/equipment';

const result = validateLoadout(loadout, catalog, characterTags);
// result.ok, result.errors
```

## Ranuras

| Ranura | Propósito |
|------|---------|
| `weapon` | Objeto ofensivo principal |
| `armor` | Equipo defensivo |
| `accessory` | Anillo, amuleto, mejora |
| `tool` | Objeto de utilidad (destornillador, escáner) |
| `trinket` | Amuletos, insignias, objetos pasivos |

## Rareza del objeto

`común` | `poco común` | `raro` | `legendario`

## Parte de AI RPG Engine

Este paquete es parte del monorepositorio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Licencia

MIT
