<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/asset-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/asset-registry)](https://www.npmjs.com/package/@ai-rpg-engine/asset-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

用于[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)中人物头像、图标和媒体资源的基于内容寻址的资源注册表。

## 安装

```bash
npm install @ai-rpg-engine/asset-registry
```

## 功能

资源通过其SHA-256内容哈希进行存储，这意味着相同的字节始终映射到相同的地址。这使得去重自动，引用可移植，缓存变得简单。 包含两种存储后端：内存（用于测试和临时会话）和文件系统（用于持久的本地存储，带有分片目录）。

## 用法

### 存储和检索资源

```typescript
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';

const store = new MemoryAssetStore();

// Store portrait bytes
const pngBytes = await readFile('portrait.png');
const meta = await store.put(pngBytes, {
  kind: 'portrait',
  mimeType: 'image/png',
  width: 512,
  height: 512,
  tags: ['character', 'fantasy', 'knight'],
  source: 'generated',
});

console.log(meta.hash);  // 'a3f2b8c1...' (SHA-256 hex)

// Retrieve by hash
const bytes = await store.get(meta.hash);
const info = await store.getMeta(meta.hash);
```

### 文件系统持久化

```typescript
import { FileAssetStore } from '@ai-rpg-engine/asset-registry';

const store = new FileAssetStore('./assets');

// Directory layout:
//   assets/
//     a3/
//       a3f2b8c1...64chars.bin   — raw bytes
//       a3f2b8c1...64chars.json  — metadata sidecar

const meta = await store.put(bytes, { kind: 'portrait', mimeType: 'image/png' });
```

### 过滤和搜索

```typescript
// List all portraits
const portraits = await store.list({ kind: 'portrait' });

// Filter by tag
const fantasy = await store.list({ tag: 'fantasy' });

// Filter by size range
const large = await store.list({ minSize: 100_000 });

// Filter by MIME type
const pngs = await store.list({ mimeType: 'image/png' });
```

### 基于内容的寻址

```typescript
import { hashBytes, isValidHash } from '@ai-rpg-engine/asset-registry';

const hash = hashBytes(someBytes);       // SHA-256 hex digest
const valid = isValidHash(hash);          // true
const invalid = isValidHash('not-a-hash'); // false
```

## 资源类型

| 类型 | 描述 |
|------|-------------|
| portrait | 角色头像（玩家、NPC） |
| icon | UI图标、物品精灵 |
| background | 场景背景、区域美术 |
| audio | 音效、音乐片段 |
| document | 文本文件、模板 |

## 存储后端

| 后端 | 使用场景 | 持久性 |
|---------|----------|-------------|
| `MemoryAssetStore` | 测试、临时会话 | 无（进程内） |
| `FileAssetStore` | 本地游戏、开发 | 文件系统 |

这两种后端都实现了`AssetStore`接口，因此它们可以互换使用。

## 与角色创建的集成

`CharacterBuild`中的`portraitRef`字段存储资源哈希。 使用注册表解析它：

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, catalog, ruleset);
const portraitHash = entity.custom?.portraitRef as string;

if (portraitHash) {
  const bytes = await store.get(portraitHash);
  // Render the portrait in your UI
}
```

## AI RPG Engine的一部分

此包是[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)单体仓库的一部分。 它没有外部依赖，可以独立运行，也可以与角色创建和呈现系统集成。

## 许可证

MIT
