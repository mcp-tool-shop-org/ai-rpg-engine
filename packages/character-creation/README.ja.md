<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-creation

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-creation)](https://www.npmjs.com/package/@ai-rpg-engine/character-creation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

ヘッドレスなキャラクター作成システム。アーキタイプ、背景、特性、マルチクラス、および[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)のためのビルド検証機能を提供します。

## インストール

```bash
npm install @ai-rpg-engine/character-creation
```

## 機能概要

キャラクターは単なるスプレッドシートではありません。それはアイデンティティです。このパッケージは、主要なアーキタイプ、背景、性格特性、およびオプションの二次専門分野を構造的に統合し、検証済みのプレイヤーキャラクターを作成します。各アーキタイプと専門分野の組み合わせは、キャラクターのアイデンティティを表現するクロスディシプリンの称号を生成し、単に数値を積み重ねるだけではありません。

## 使い方

### ビルドの検証

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

### EntityStateへの変換

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, buildCatalog, content.ruleset);
// Full EntityState ready for the engine:
// entity.id === 'player'
// entity.blueprintId === 'penitent-knight'
// entity.stats, entity.resources, entity.tags, entity.inventory all computed
// entity.custom === { archetypeId, backgroundId, disciplineId, title, portraitRef }
```

### 利用可能なオプションの参照

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

### 保存ファイル用のシリアライズ

```typescript
import { serializeBuild, deserializeBuild, validateSerializedBuild } from '@ai-rpg-engine/character-creation';

const json = serializeBuild(build);
const restored = deserializeBuild(json);
const check = validateSerializedBuild(json); // { ok: true, errors: [] }
```

## 概念

| 概念 | 説明 |
|---------|-------------|
| **Archetype** | 主要なクラス：基本ステータス、初期タグ、成長ツリー |
| **Background** | オリジンストーリー：ステータス修正、初期タグ、オプションのインベントリ |
| **Trait** | 特技または欠点：ステータス、リソース、タグ、動詞、または派閥への影響 |
| **Discipline** | 二次クラス：1つの動詞、1つのパッシブ効果、1つのデメリット |
| **Cross-Title** | アーキタイプと専門分野から生成される統合されたアイデンティティ（例：「墓守」） |
| **Entanglement** | 特定のアーキタイプと専門分野の組み合わせによる摩擦効果 |
| **Build Catalog** | キャラクターのすべてのオプションを含む、パック固有のメニュー |

## マルチクラス

このシステムは、加算的な積み重ねではなく、構造化されたアイデンティティの融合を使用します。

- **主要なアーキタイプ**は、コアとなるアイデンティティ（基本ステータス、成長ツリー、初期タグ）を定義します。
- **二次専門分野**はコンパクトで、1つの動詞、1つのパッシブ、1つのデメリットを含みます。
- 各組み合わせは、**クロスディシプリンの称号**（「ヘックスピストル」、「シナプス外科医」、「検疫警備隊長」など）を生成します。
- 一部の組み合わせは、**エンタングルメント**（物語上の摩擦効果）を生み出します。

## 特性の効果

| タイプ | 例 |
|------|---------|
| stat-modifier (ステータス修正) | `{ stat: 'dex', amount: 1 }` |
| resource-modifier (リソース修正) | `{ resource: 'hp', amount: -3 }` |
| grant-tag (タグ付与) | `{ tag: 'curse-touched' }` |
| verb-access (動詞アクセス) | `{ verb: 'steal' }` |
| faction-modifier (派閥修正) | `{ faction: 'guard', amount: -10 }` |

## ビルドカタログ

すべての7つのスターターパックは、パック固有のオプションを含む`buildCatalog`をエクスポートします。各カタログには、3つのアーキタイプ、3つの背景、4つの特性（2つの特技 + 2つの欠点）、2つの専門分野、および6つのクロスディシプリンの称号が含まれています。

## AI RPG Engineの一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)モノレポの一部です。型定義のインポートには `@ai-rpg-engine/core` のみを使用し、エンジン実行時の依存関係はありません。

## ライセンス

MIT
