<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/asset-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/asset-registry)](https://www.npmjs.com/package/@ai-rpg-engine/asset-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)で使用される、キャラクター画像、アイコン、メディアなどのアセットを管理するためのコンテンツベースのアセットレジストリ。

## インストール

```bash
npm install @ai-rpg-engine/asset-registry
```

## 機能概要

アセットは、そのSHA-256ハッシュ値によって保存されます。これにより、同一のバイト列は常に同じアドレスにマッピングされ、重複排除が自動的に行われ、参照が移植可能になり、キャッシュが容易になります。 2種類のストレージバックエンドが用意されています。メモリ内（テストや一時的なセッション用）とファイルシステム（永続的なローカルストレージで、ディレクトリごとに分割）。

## 使い方

### アセットの保存と取得

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

### ファイルシステムによる永続化

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

### フィルタリングと検索

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

### コンテンツベースのアドレス指定

```typescript
import { hashBytes, isValidHash } from '@ai-rpg-engine/asset-registry';

const hash = hashBytes(someBytes);       // SHA-256 hex digest
const valid = isValidHash(hash);          // true
const invalid = isValidHash('not-a-hash'); // false
```

## アセットの種類

| 種類 | 説明 |
|------|-------------|
| portrait | キャラクターのポートレート（プレイヤー、NPC） |
| icon | UIアイコン、アイテムのスプライト |
| background | シーンの背景、ゾーンアート |
| audio | サウンドエフェクト、音楽 |
| document | テキストファイル、テンプレート |

## ストレージバックエンド

| バックエンド | 用途 | 永続化 |
|---------|----------|-------------|
| `MemoryAssetStore` | テスト、一時的なセッション | なし（プロセス内） |
| `FileAssetStore` | ローカルゲーム、開発 | ファイルシステム |

両方のバックエンドが`AssetStore`インターフェースを実装しているため、相互に置き換えることができます。

## キャラクター作成機能との連携

`CharacterBuild`の`portraitRef`フィールドには、アセットのハッシュ値が格納されます。レジストリを使用して、このハッシュ値を解決します。

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, catalog, ruleset);
const portraitHash = entity.custom?.portraitRef as string;

if (portraitHash) {
  const bytes = await store.get(portraitHash);
  // Render the portrait in your UI
}
```

## AI RPG Engineの一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)のモノレポの一部です。依存関係はゼロで、スタンドアロンで使用することも、キャラクター作成および表示システムと統合することもできます。

## ライセンス

MIT
