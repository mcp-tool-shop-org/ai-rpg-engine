<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/pack-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/pack-registry)](https://www.npmjs.com/package/@ai-rpg-engine/pack-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Catálogo de pacotes iniciais, descoberta, filtragem e critérios de qualidade para o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalação

```bash
npm install @ai-rpg-engine/pack-registry
```

## O que ele faz

O registro de pacotes é um catálogo em tempo de execução de pacotes iniciais. Permite registrar pacotes, navegar por eles por gênero/dificuldade/tom e validar esses pacotes com base em um conjunto de critérios de qualidade em 7 dimensões. Ele alimenta as interfaces de seleção de pacotes e garante que cada mundo inicial atenda a um padrão mínimo de qualidade.

## Uso

### Registro e descoberta de pacotes

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

### Metadados do pacote

Cada pacote inicial exporta um `packMeta: PackMetadata` com campos estruturados:

| Campo | Tipo | Descrição |
|-------|------|-------------|
| id | string | Identificador único (corresponde a manifest.id) |
| nome | string | Nome legível |
| slogan | string | Slogan de marketing em uma linha |
| gêneros | PackGenre[] | Tags de gênero para filtragem |
| dificuldade | PackDifficulty | iniciante, intermediário ou avançado |
| tons | PackTone[] | Descritores de tom narrativo |
| tags | string[] | Tags de texto livre para pesquisa |
| engineVersion | string | Versão mínima do motor (semver) |
| narratorTone | string | Tom para o narrador |

### Critérios de Qualidade

Valide os pacotes com base em 7 dimensões de originalidade:

```typescript
import { validatePackRubric } from '@ai-rpg-engine/pack-registry';

const result = validatePackRubric(packEntry);
// result.ok === true (score >= 5/7)
// result.score === 7
// result.checks === [{ dimension: 'distinct-verbs', passed: true, detail: '...' }, ...]
```

| Dimensão | O que é verificado |
|-----------|---------------|
| distinct-verbs | O pacote possui verbos únicos além do conjunto básico |
| distinct-resource-pressure | As mecânicas de recursos criam uma tensão significativa |
| distinct-faction-topology | A estrutura das facções difere de outros pacotes |
| distinct-presentation-rule | A percepção/narração tem um toque único |
| distinct-audio-palette | O design de som suporta o gênero |
| distinct-failure-mode | A falha parece diferente de outros pacotes |
| distinct-narrative-fantasy | A fantasia central é única |

Pontuação >= 5/7 para ser qualificado como um pacote inicial.

### Tipos Disponíveis

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

## Parte do AI RPG Engine

Este pacote faz parte do monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Ele funciona de forma independente para descoberta de pacotes ou se integra com claude-rpg para a interface de seleção de pacotes.

## Licença

MIT
