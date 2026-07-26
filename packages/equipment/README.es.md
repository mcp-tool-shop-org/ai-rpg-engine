<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![Licencia: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Espacios de equipo, definiciones de objetos y gestión de equipamiento para [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalación

```bash
npm install @ai-rpg-engine/equipment
```

## Qué hace

Gestiona el equipo de los personajes en 5 espacios (arma, armadura, accesorio, herramienta, adorno) con catálogos de objetos, operaciones de equipamiento, requisitos basados en etiquetas y cálculo de efectos agregados. Todas las operaciones son inmutables.

## Uso

### Crear y equipar

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

### Gestión del inventario

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

## Espacios

| Espacio | Propósito |
|------|---------|
| `weapon` | Objeto ofensivo principal |
| `armor` | Equipo defensivo |
| `accessory` | Anillo, amuleto, mejora |
| `tool` | Objeto de utilidad (llave maestra, escáner) |
| `trinket` | Amuleto, insignia, objeto pasivo |

## Rareza del objeto

`común` | `poco común` | `raro` | `legendario`

## Evolución de reliquia: equipo que se gana un nombre

Un objeto que ha realizado alguna acción acumula una historia, y una historia merece un nombre. Un alfanje que ha cobrado tres vidas se convierte en el **Alfanje Ensangrentado**. La evolución se calcula a partir de la crónica del objeto, nunca escrita por el autor.

`evaluateRelicGrowth` es el lado de lectura: transforma una crónica en un nivel y un epíteto:

```typescript
import { evaluateRelicGrowth } from '@ai-rpg-engine/equipment';

const relic = evaluateRelicGrowth(item, chronicle, currentTick);
// -> { currentEpithet: 'Bloodied Cutlass', milestonesReached: [...], tier: 1 }
```

Cinco factores lo impulsan: `kill-count` (número de muertes), `age` (antigüedad), `recognition-count` (número de reconocimientos), `faction-kills` (muertes de facciones) y `boss-kill` (muerte de jefes); todo ello se cuenta a partir de la crónica. Las armas por defecto utilizan `DEFAULT_WEAPON_MILESTONES`, el resto utiliza `DEFAULT_ARMOR_MILESTONES`; un paquete puede anularlo por objeto.

`createItemChronicleCore` es el lado de escritura: un **módulo opcional** que registra la historia del juego real.

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

Registra `acquired` (primer uso o equipamiento), `used-in-kill` (se atribuye al arma equipada del asesino) y `recognized` (cuando alguien en tu zona reacciona a tu procedencia). `recognition` se inyecta en lugar de importarse porque este paquete no tiene ninguna dependencia en tiempo de ejecución de `@ai-rpg-engine/modules`. Vuelva a leer la evolución con `getItemDisplayName`, `getRelicSummary`, `getItemChronicle` o vuelva a calcularla bajo demanda con `refreshRelicSummaries`.

El registro es determinista: basado en eventos, clave en `event.tick`, sin reloj de tiempo real y sin sorteo aleatorio (RNG). Un juego que no añade el módulo es idéntico a uno creado antes de su existencia, y el módulo no registra ningún espacio de nombres predeterminado, por lo que un mundo donde nada se registre nunca materializará el estado.

## Parte de AI RPG Engine

Este paquete forma parte del repositorio monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Licencia

MIT
