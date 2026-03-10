<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/pack-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/pack-registry)](https://www.npmjs.com/package/@ai-rpg-engine/pack-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Catálogo de paquetes iniciales, descubrimiento, filtrado y rúbrica de calidad para [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalación

```bash
npm install @ai-rpg-engine/pack-registry
```

## ¿Qué hace?

El registro de paquetes es un catálogo en tiempo de ejecución de paquetes iniciales. Permite registrar paquetes, explorarlos por género/dificultad/tono y validarlos según una rúbrica de calidad de 7 dimensiones.  Impulsa las interfaces de usuario para la selección de paquetes y garantiza que cada mundo inicial cumpla con un estándar mínimo de calidad.

## Uso

### Registro y Descubrimiento de Paquetes

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

### Metadatos del Paquete

Cada paquete inicial exporta un `packMeta: PackMetadata` con campos estructurados:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | Identificador único (coincide con manifest.id) |
| name | string | Nombre legible |
| tagline | string | Eslogan de marketing de una línea |
| genres | PackGenre[] | Etiquetas de género para el filtrado |
| difficulty | PackDifficulty | principiante, intermedio o avanzado |
| tones | PackTone[] | Descriptores de tono narrativo |
| tags | string[] | Etiquetas de formato libre para la búsqueda |
| engineVersion | string | Versión mínima del motor (semver) |
| narratorTone | string | Tono para el narrador |

### Rúbrica de Calidad

Valida los paquetes según 7 dimensiones de singularidad:

```typescript
import { validatePackRubric } from '@ai-rpg-engine/pack-registry';

const result = validatePackRubric(packEntry);
// result.ok === true (score >= 5/7)
// result.score === 7
// result.checks === [{ dimension: 'distinct-verbs', passed: true, detail: '...' }, ...]
```

| Dimensión | Qué se verifica |
|-----------|---------------|
| distinct-verbs | El paquete tiene verbos únicos además del conjunto base |
| distinct-resource-pressure | Las mecánicas de recursos crean una tensión significativa |
| distinct-faction-topology | La estructura de las facciones difiere de otros paquetes |
| distinct-presentation-rule | La percepción/narración tiene un giro único |
| distinct-audio-palette | El diseño de sonido apoya el género |
| distinct-failure-mode | El fracaso se siente diferente a otros paquetes |
| distinct-narrative-fantasy | La fantasía central es única |

Se requiere una puntuación >= 5/7 para calificar como un paquete inicial.

### Tipos Disponibles

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

## Parte de AI RPG Engine

Este paquete es parte del monorepositorio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Funciona de forma independiente para el descubrimiento de paquetes o se integra con claude-rpg para la interfaz de usuario de selección de paquetes.

## Licencia

MIT
