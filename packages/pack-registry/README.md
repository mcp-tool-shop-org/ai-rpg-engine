<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/pack-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/pack-registry)](https://www.npmjs.com/package/@ai-rpg-engine/pack-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Starter pack catalog, discovery, filtering, and quality rubric for [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Install

```bash
npm install @ai-rpg-engine/pack-registry
```

## What It Does

The pack registry is a runtime catalog of starter packs. Register packs, browse them by genre/difficulty/tone, and validate them against a 7-dimension quality rubric. It powers pack selection UIs and ensures every starter world meets a minimum quality bar.

## Usage

### Register and Discover Packs

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

### Pack Metadata

Each starter pack exports a `packMeta: PackMetadata` with structured fields:

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier (matches manifest.id) |
| name | string | Human-readable name |
| tagline | string | One-line marketing tagline |
| genres | PackGenre[] | Genre tags for filtering |
| difficulty | PackDifficulty | beginner, intermediate, or advanced |
| tones | PackTone[] | Narrative tone descriptors |
| tags | string[] | Free-form tags for search |
| engineVersion | string | Minimum engine version (semver) |
| narratorTone | string | Tone string for the narrator |

### Quality Rubric

Validate packs against 7 dimensions of distinctiveness:

```typescript
import { validatePackRubric } from '@ai-rpg-engine/pack-registry';

const result = validatePackRubric(packEntry);
// result.ok === true (score >= 5/7)
// result.score === 7
// result.checks === [{ dimension: 'distinct-verbs', passed: true, detail: '...' }, ...]
```

| Dimension | What It Checks |
|-----------|---------------|
| distinct-verbs | Pack has unique verbs beyond the base set |
| distinct-resource-pressure | Resource mechanics create meaningful tension |
| distinct-faction-topology | Faction structure differs from other packs |
| distinct-presentation-rule | Perception/narration has a unique twist |
| distinct-audio-palette | Sound design supports the genre |
| distinct-failure-mode | Failure feels different from other packs |
| distinct-narrative-fantasy | The core fantasy is unique |

Score >= 5/7 to qualify as a starter pack.

### Available Types

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

## Part of AI RPG Engine

This package is part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) monorepo. It works standalone for pack discovery or integrates with claude-rpg for the pack selection UI.

## License

MIT
