<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/pack-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/pack-registry)](https://www.npmjs.com/package/@ai-rpg-engine/pack-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 用の、スターターパックのカタログ、検索機能、フィルタリング機能、および品質評価基準。

## インストール

```bash
npm install @ai-rpg-engine/pack-registry
```

## 機能概要

パックレジストリは、スターターパックの実行時カタログです。パックを登録し、ジャンル/難易度/雰囲気などで検索し、7つの次元で構成される品質評価基準に基づいて検証します。これにより、パック選択のためのUIを構築し、すべてのスターターワールドが一定の品質基準を満たすようにします。

## 使い方

### パックの登録と検索

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

### パックのメタデータ

各スターターパックは、構造化されたフィールドを持つ `packMeta: PackMetadata` をエクスポートします。

| フィールド | 型 | 説明 |
|-------|------|-------------|
| id | string | 一意な識別子（manifest.id と一致） |
| name | string | 人間が読める名前 |
| tagline | string | キャッチフレーズ（一行） |
| genres | PackGenre[] | フィルタリング用のジャンルタグ |
| difficulty | PackDifficulty | 初心者、中級者、または上級者 |
| tones | PackTone[] | 物語の雰囲気の説明 |
| tags | string[] | 検索用の自由形式タグ |
| engineVersion | string | 最小エンジンバージョン（セマンティックバージョニング） |
| narratorTone | string | ナレーターの雰囲気（文字列） |

### 品質評価基準

パックを、以下の7つの特徴の観点から評価します。

```typescript
import { validatePackRubric } from '@ai-rpg-engine/pack-registry';

const result = validatePackRubric(packEntry);
// result.ok === true (score >= 5/7)
// result.score === 7
// result.checks === [{ dimension: 'distinct-verbs', passed: true, detail: '...' }, ...]
```

| 評価項目 | チェック項目 |
|-----------|---------------|
| distinct-verbs | 基本セット以外の独自の動詞があるか |
| distinct-resource-pressure | リソースの制約が、意味のある緊張感を生み出しているか |
| distinct-faction-topology | 派閥の構造が、他のパックと異なるか |
| distinct-presentation-rule | 知覚/ナレーションに独自の工夫があるか |
| distinct-audio-palette | サウンドデザインが、ジャンルに合っているか |
| distinct-failure-mode | 失敗が、他のパックとは異なる感覚を与えるか |
| distinct-narrative-fantasy | 物語の核となるファンタジーが、ユニークか |

スターターパックとして認められるためには、7つの評価項目の中で5つ以上が満たされる必要があります。

### 利用可能なタイプ

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

## AI RPG Engine の一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のモノレポの一部です。スタンドアロンでパックの検索に使用することもできますし、claude-rpg と連携してパック選択UIを構築することもできます。

## ライセンス

MIT
