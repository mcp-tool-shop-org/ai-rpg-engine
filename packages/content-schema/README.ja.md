<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/content-schema

AI RPG Engine 用のコンテンツスキーマとバリデータ。部屋、キャラクター、会話、アイテム、クエストなどをデータとして定義します。

## インストール

```bash
npm install @ai-rpg-engine/content-schema
```

## 内容

- **部屋のスキーマ**：出口、プロパティ、および環境の状態を持つエリア
- **キャラクターのスキーマ**：NPC、クリーチャー、およびプレイヤーキャラクターの定義
- **会話のスキーマ**：条件と効果を持つ、グラフベースの会話ツリー
- **アイテムのスキーマ**：装備品、消耗品、クエストアイテム、およびステータス修正値
- **コンテンツパックローダー**：JSON/TypeScript形式のコンテンツパックを検証し、読み込みます
- **スキーマバリデータ**：構造化されたエラーメッセージによる実行時検証

## 使い方

```typescript
import { validateContentPack, RoomSchema, EntitySchema } from '@ai-rpg-engine/content-schema';

const result = validateContentPack(myContentData);
if (!result.valid) {
  console.error(result.errors);
}
```

## ドキュメント

- [コンテンツファイル（第13章）](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/13-content-files/)：コンテンツパックの作成
- [ハンドブック](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

制作：<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
