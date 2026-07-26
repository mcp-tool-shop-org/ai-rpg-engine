<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![Licenza: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Slot per l'equipaggiamento, definizioni degli oggetti e gestione dell'inventario per [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installazione

```bash
npm install @ai-rpg-engine/equipment
```

## Funzionalità

Gestisce l'equipaggiamento del personaggio in 5 slot (arma, armatura, accessorio, strumento, amuleto) con cataloghi di oggetti, operazioni di gestione dell'inventario, requisiti basati su tag e calcolo degli effetti aggregati. Tutte le operazioni sono immutabili.

## Utilizzo

### Creazione ed equipaggiamento

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
| `accessory` | Anello, amuleto, potenziatore |
| `tool` | Oggetto di utilità (grimaldello, scanner) |
| `trinket` | Amuleto, distintivo, oggetto passivo |

## Rarità dell'oggetto

`common` | `uncommon` | `rare` | `legendary`

## Evoluzione delle reliquie: un equipaggiamento che si guadagna un nome

Un oggetto che ha compiuto determinate azioni accumula una storia, e una storia gli fa guadagnare un nome. Una sciabola che ha causato tre morti diventa la **Sciabola Insanguinata**. L'evoluzione viene calcolata a partire dalla cronologia dell'oggetto, senza alcuna modifica manuale.

`evaluateRelicGrowth` è il lato di lettura: trasforma una cronologia in un livello e un epiteto:

```typescript
import { evaluateRelicGrowth } from '@ai-rpg-engine/equipment';

const relic = evaluateRelicGrowth(item, chronicle, currentTick);
// -> { currentEpithet: 'Bloodied Cutlass', milestonesReached: [...], tier: 1 }
```

Cinque fattori la determinano: `kill-count`, `age`, `recognition-count`, `faction-kills`, `boss-kill`: vengono conteggiati a partire dalla cronologia. Le armi utilizzano di default `DEFAULT_WEAPON_MILESTONES`, tutto il resto utilizza `DEFAULT_ARMOR_MILESTONES`; un pacchetto può sovrascrivere questi valori per ogni oggetto.

`createItemChronicleCore` è il lato di scrittura: un **modulo opzionale** che registra la storia durante il gioco.

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

Registra `acquired` (primo utilizzo o equipaggiamento), `used-in-kill` (attribuzione all'arma equipaggiata del personaggio che ha inflitto il colpo) e `recognized` (quando qualcuno nella tua area reagisce alla tua presenza). `recognition` viene iniettato anziché importato perché questo pacchetto non ha dipendenze in fase di esecuzione su `@ai-rpg-engine/modules`. È possibile recuperare l'evoluzione con `getItemDisplayName`, `getRelicSummary`, `getItemChronicle` o aggiornarla su richiesta con `refreshRelicSummaries`.

La registrazione è deterministica: basata sugli eventi, attivata da `event.tick`, senza orologio di sistema e senza elementi casuali (RNG). Un gioco che non aggiunge il modulo è identico a uno creato prima della sua esistenza, e il modulo non registra alcun namespace predefinito, quindi un mondo in cui nulla viene registrato non materializzerà mai lo stato.

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Licenza

MIT
