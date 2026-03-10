<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-creation

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-creation)](https://www.npmjs.com/package/@ai-rpg-engine/character-creation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Système de création de personnages sans interface utilisateur — archétypes, origines, traits, spécialisations multiples et validation de la configuration pour [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installation

```bash
npm install @ai-rpg-engine/character-creation
```

## Fonctionnalités

Les personnages ne sont pas de simples feuilles de calcul, mais des identités. Ce paquet gère la fusion structurée de l'archétype principal, de l'origine, des traits de personnalité et d'une discipline secondaire optionnelle pour créer une entité de joueur validée. Chaque combinaison archétype + discipline produit un titre qui synthétise l'identité du personnage plutôt que de simplement additionner des chiffres.

## Utilisation

### Valider une configuration

```typescript
import { validateBuild } from '@ai-rpg-engine/character-creation';
import { content, buildCatalog } from '@ai-rpg-engine/starter-fantasy';

const build = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: ['iron-frame', 'cursed-blood'],
  disciplineId: 'occultist',
  statAllocations: { vigor: 2, instinct: 1 },
};

const result = validateBuild(build, buildCatalog, content.ruleset);
// result.ok === true
// result.resolvedTitle === 'Grave Warden'
// result.finalStats === { vigor: 8, instinct: 6, will: 1 }
// result.resolvedTags includes 'martial', 'oath-broken', 'curse-touched', 'grave-warden'
```

### Convertir en `EntityState`

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, buildCatalog, content.ruleset);
// Full EntityState ready for the engine:
// entity.id === 'player'
// entity.blueprintId === 'penitent-knight'
// entity.stats, entity.resources, entity.tags, entity.inventory all computed
// entity.custom === { archetypeId, backgroundId, disciplineId, title, portraitRef }
```

### Parcourir les options disponibles

```typescript
import {
  getAvailableArchetypes,
  getAvailableBackgrounds,
  getAvailableTraits,
  getAvailableDisciplines,
  getStatBudgetRemaining,
} from '@ai-rpg-engine/character-creation';

const archetypes = getAvailableArchetypes(buildCatalog);
const backgrounds = getAvailableBackgrounds(buildCatalog);
const traits = getAvailableTraits(buildCatalog, ['iron-frame']); // filters incompatible
const disciplines = getAvailableDisciplines(buildCatalog, 'penitent-knight', ['martial']);
const remaining = getStatBudgetRemaining(build, buildCatalog); // points left to allocate
```

### Sérialiser pour les fichiers de sauvegarde

```typescript
import { serializeBuild, deserializeBuild, validateSerializedBuild } from '@ai-rpg-engine/character-creation';

const json = serializeBuild(build);
const restored = deserializeBuild(json);
const check = validateSerializedBuild(json); // { ok: true, errors: [] }
```

## Concepts

| Concept | Description |
|---------|-------------|
| **Archetype** | Classe principale — statistiques de base, balises de départ, arbre de progression |
| **Background** | Histoire d'origine — modificateurs de statistiques, balises de départ, inventaire optionnel |
| **Trait** | Atout ou défaut — effets sur les statistiques, les ressources, les balises, les verbes ou les factions |
| **Discipline** | Classe secondaire — 1 verbe accordé, 1 effet passif, 1 inconvénient |
| **Cross-Title** | Identité synthétisée à partir de l'archétype + de la discipline (par exemple, "Garde Funèbre") |
| **Entanglement** | Effet de friction provenant de certaines combinaisons archétype + discipline |
| **Build Catalog** | Menu spécifique au paquet contenant toutes les options de personnage |

## Spécialisations multiples

Le système utilise une fusion d'identité structurée, et non une simple addition :

- **L'archétype principal** définit l'identité de base (statistiques de base, arbre de progression, balises de départ).
- **La discipline secondaire** est concise : 1 verbe, 1 effet passif, 1 inconvénient.
- Chaque combinaison produit un **titre inter-disciplinaire** ("Pistolet Hex", "Chirurgien Synapse", "Maréchal de la Quarantaine").
- Certaines combinaisons créent des **entrelacs** — effets narratifs de friction.

## Effets des traits

| Type | Exemple |
|------|---------|
| modificateur de statistique | `{ stat: 'dex', amount: 1 }` |
| modificateur de ressource | `{ resource: 'hp', amount: -3 }` |
| attribution de balise | `{ tag: 'curse-touched' }` |
| accès à un verbe | `{ verb: 'steal' }` |
| modificateur de faction | `{ faction: 'guard', amount: -10 }` |

## Catalogues de configurations

Chaque paquet de démarrage exporte un `buildCatalog` contenant des options spécifiques au paquet. Chaque catalogue comprend 3 archétypes, 3 origines, 4 traits (2 atouts + 2 défauts), 2 disciplines et 6 titres inter-disciplinaires.

## Fait partie de AI RPG Engine

Ce paquet fait partie du dépôt monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Il dépend uniquement de `@ai-rpg-engine/core` pour les importations de types, et n'a aucune dépendance d'exécution du moteur.

## Licence

MIT
