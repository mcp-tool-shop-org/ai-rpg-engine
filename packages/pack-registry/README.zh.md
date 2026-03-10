<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/pack-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/pack-registry)](https://www.npmjs.com/package/@ai-rpg-engine/pack-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

用于 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的启动包目录，提供浏览、过滤和质量评估功能。

## 安装

```bash
npm install @ai-rpg-engine/pack-registry
```

## 功能介绍

启动包注册表是一个启动包的运行时目录。它可以注册启动包，并根据类型/难度/风格进行浏览，同时根据 7 个维度的质量标准进行验证。它为启动包选择界面提供支持，并确保每个启动世界都符合最低质量标准。

## 使用方法

### 注册和发现启动包

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

### 启动包元数据

每个启动包都会导出 `packMeta: PackMetadata` 对象，其中包含结构化的字段：

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| id | string | 唯一标识符（与 manifest.id 匹配） |
| name | string | 可读的名称 |
| tagline | string | 一句营销标语 |
| genres | PackGenre[] | 用于过滤的类型标签 |
| difficulty | PackDifficulty | 初级、中级或高级 |
| tones | PackTone[] | 叙事风格描述 |
| tags | string[] | 用于搜索的自由标签 |
| engineVersion | string | 最小引擎版本（语义化版本） |
| narratorTone | string | 旁白风格 |

### 质量评估标准

根据 7 个独特的维度对启动包进行评估：

```typescript
import { validatePackRubric } from '@ai-rpg-engine/pack-registry';

const result = validatePackRubric(packEntry);
// result.ok === true (score >= 5/7)
// result.score === 7
// result.checks === [{ dimension: 'distinct-verbs', passed: true, detail: '...' }, ...]
```

| 维度 | 评估内容 |
|-----------|---------------|
| distinct-verbs | 启动包包含超出基础集的独特动词 |
| distinct-resource-pressure | 资源机制创造了有意义的紧张感 |
| distinct-faction-topology | 派系结构与其他启动包不同 |
| distinct-presentation-rule | 感知/叙述具有独特的特点 |
| distinct-audio-palette | 音效设计支持游戏类型 |
| distinct-failure-mode | 失败的方式与其他启动包不同 |
| distinct-narrative-fantasy | 核心幻想是独特的 |

达到 5/7 的分数才能被认为是启动包。

### 可用类型

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

## AI RPG Engine 的一部分

此包是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 单一代码仓库的一部分。它可以独立运行以进行启动包发现，也可以与 claude-rpg 集成以提供启动包选择界面。

## 许可证

MIT
