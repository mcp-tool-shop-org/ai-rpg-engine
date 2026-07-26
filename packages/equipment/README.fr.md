<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![License : MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Emplacements d’équipement, définitions d’objets et gestion de l’arsenal pour [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installation

```bash
npm install @ai-rpg-engine/equipment
```

## Fonctionnalités

Gère l’équipement des personnages dans 5 emplacements (arme, armure, accessoire, outil, ornement) avec des catalogues d’objets, des opérations d’arsenal, des exigences basées sur des balises et le calcul d’effets cumulés. Toutes les opérations sont immuables.

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

### Gestion de l’inventaire

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

| Emplacement | Objectif |
|------|---------|
| `weapon` | Objet offensif principal |
| `armor` | Équipement défensif |
| `accessory` | Anneau, amulette, amélioration |
| `tool` | Objet utilitaire (crochet de serrurier, scanner) |
| `trinket` | Talisman, insigne, objet passif |

## Rareté des objets

`commun` | `peu commun` | `rare` | `légendaire`

## Évolution de la relique : un équipement qui se forge une réputation

Un objet qui a accompli quelque chose accumule une histoire, et une histoire mérite un nom. Un coutelas qui a coûté la vie à trois personnes devient le **Coutelas ensanglanté**. L’évolution est calculée à partir de la chronique de l’objet, jamais créée par l’utilisateur.

`evaluateRelicGrowth` est la fonction de lecture : elle transforme une chronique en un niveau et un épithète :

```typescript
import { evaluateRelicGrowth } from '@ai-rpg-engine/equipment';

const relic = evaluateRelicGrowth(item, chronicle, currentTick);
// -> { currentEpithet: 'Bloodied Cutlass', milestonesReached: [...], tier: 1 }
```

Cinq déclencheurs l’alimentent : `kill-count`, `age`, `recognition-count`, `faction-kills`, `boss-kill` ; ils sont comptabilisés à partir de la chronique. Les armes utilisent par défaut `DEFAULT_WEAPON_MILESTONES`, tous les autres objets utilisent `DEFAULT_ARMOR_MILESTONES`. Un pack peut remplacer ces valeurs pour chaque objet.

`createItemChronicleCore` est la fonction d’écriture : un **module optionnel** qui enregistre l’historique du jeu réel.

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

Il enregistre `acquired` (premier ramassage ou équipement), `used-in-kill` (crédité à l’arme équipée du tueur) et `recognized` (lorsqu’une personne dans votre zone réagit à votre provenance). La reconnaissance est injectée plutôt qu’importée, car ce paquet ne comporte aucune dépendance d’exécution sur `@ai-rpg-engine/modules`. Relisez les données d’évolution avec `getItemDisplayName`, `getRelicSummary`, `getItemChronicle` ou mettez à jour les données en fonction des besoins avec `refreshRelicSummaries`.

L’enregistrement est déterministe : basé sur les événements, déclenché par `event.tick`, sans horloge et sans tirage aléatoire. Un jeu qui n’ajoute pas le module est identique à celui créé avant son existence, et le module ne crée aucun espace de noms par défaut, de sorte qu’un monde où rien n’est enregistré ne matérialise jamais cet état.

## Fait partie d’AI RPG Engine

Ce paquet fait partie du monorepositoire [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Licence

MIT
