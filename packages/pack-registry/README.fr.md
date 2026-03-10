<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/pack-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/pack-registry)](https://www.npmjs.com/package/@ai-rpg-engine/pack-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Catalogue de packs de démarrage, permettant la découverte, le filtrage et l'évaluation de la qualité pour [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installation

```bash
npm install @ai-rpg-engine/pack-registry
```

## Fonctionnalités

Le registre de packs est un catalogue en temps réel de packs de démarrage. Il permet d'enregistrer des packs, de les parcourir par genre/difficulté/tonalité, et de les valider selon une grille d'évaluation de qualité en 7 dimensions. Il alimente les interfaces utilisateur de sélection de packs et garantit que chaque monde de démarrage répond à un niveau de qualité minimum.

## Utilisation

### Enregistrement et découverte de packs

```typescript
import { registerPack, getAllPacks, filterPacks, getPackSummaries } from '@ai-rpg-engine/pack-registry';
import { content, createGame, packMeta } from '@ai-rpg-engine/starter-fantasy';

// Register a pack
registerPack({
  meta: packMeta,
  manifest: content.manifest,
  ruleset: content.ruleset,
  createGame,
});

// Browse all registered packs
const summaries = getPackSummaries();
// [{ id: 'chapel-threshold', name: 'The Chapel Threshold', tagline: '...', genres: ['fantasy'], difficulty: 'beginner' }]

// Filter by genre, difficulty, or tone
const darkPacks = filterPacks({ tone: 'dark' });
const beginnerPacks = filterPacks({ difficulty: 'beginner' });
```

### Métadonnées du pack

Chaque pack de démarrage exporte un `packMeta: PackMetadata` avec des champs structurés :

| Champ | Type | Description |
|-------|------|-------------|
| id | string | Identifiant unique (correspond à manifest.id) |
| name | string | Nom lisible par l'utilisateur |
| tagline | string | Phrase d'accroche marketing en une ligne |
| genres | PackGenre[] | Étiquettes de genre pour le filtrage |
| difficulty | PackDifficulty | débutant, intermédiaire ou avancé |
| tones | PackTone[] | Descripteurs de tonalité narrative |
| tags | string[] | Étiquettes libres pour la recherche |
| engineVersion | string | Version minimale du moteur (semver) |
| narratorTone | string | Tonalité pour le narrateur |

### Grille d'évaluation

Validez les packs selon 7 dimensions de singularité :

```typescript
import { validatePackRubric } from '@ai-rpg-engine/pack-registry';

const result = validatePackRubric(packEntry);
// result.ok === true (score >= 5/7)
// result.score === 7
// result.checks === [{ dimension: 'distinct-verbs', passed: true, detail: '...' }, ...]
```

| Dimension | Ce qu'elle vérifie |
|-----------|---------------|
| distinct-verbs | Le pack possède des verbes uniques en dehors de l'ensemble de base |
| distinct-resource-pressure | Les mécaniques de ressources créent une tension significative |
| distinct-faction-topology | La structure des factions diffère des autres packs |
| distinct-presentation-rule | La perception/narration a une particularité unique |
| distinct-audio-palette | Le design sonore soutient le genre |
| distinct-failure-mode | L'échec a un aspect différent des autres packs |
| distinct-narrative-fantasy | L'élément fantastique central est unique |

Un score >= 5/7 est requis pour être considéré comme un pack de démarrage.

### Types disponibles

```typescript
import type {
  PackGenre,        // 'fantasy' | 'sci-fi' | 'cyberpunk' | 'horror' | ...
  PackDifficulty,   // 'beginner' | 'intermediate' | 'advanced'
  PackTone,         // 'dark' | 'gritty' | 'heroic' | 'noir' | ...
  PackMetadata,     // Full pack metadata
  PackEntry,        // Registry entry (meta + manifest + ruleset + createGame)
  PackSummary,      // Compact display format
  PackFilter,       // Filter criteria
  RubricResult,     // Quality rubric output
} from '@ai-rpg-engine/pack-registry';
```

## Fait partie de AI RPG Engine

Ce paquet fait partie du monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Il peut être utilisé de manière autonome pour la découverte de packs ou s'intégrer à claude-rpg pour l'interface utilisateur de sélection de packs.

## Licence

MIT
