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

# @ai-rpg-engine/core

AI RPG Engine の基盤。世界の状態、エンティティ、アクション、イベント、ルール、シード値に基づく乱数生成、および永続化機能を提供します。

## インストール

```bash
npm install @ai-rpg-engine/core
```

## 構成要素

- **エンジン:** 決定的なリプレイが可能な、ティックベースのシミュレーションループ
- **ワールドステート:** 部屋、エンティティ、グローバルフラグ、ティックカウンター
- **エンティティステート:** リソース、インベントリ、ステータス効果、信念、記憶
- **アクションパイプライン:** 検証 → 前処理 → 解決 → 後処理 → コミット
- **イベントバス:** タイプ、送信元、ターゲット、ペイロードを持つ構造化されたイベント
- **シード値に基づく乱数生成:** 単一のシード値から再現可能な乱数を生成
- **モジュールシステム:** シミュレーションモジュールの登録と組み合わせ
- **テスト環境:** 決定的なモジュールテストのためのユーティリティ

## クイックスタート

```typescript
import { Engine } from '@ai-rpg-engine/core';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game',
    version: '1.0.0', engineVersion: '1.0.0',
    ruleset: 'fantasy', modules: [],
    contentPacks: [],
  },
  seed: 42,
  modules: [],
});

const state = engine.getState();
```

## ドキュメント

- [ハンドブック](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)：25章 + 4つの付録
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> が開発しました。
