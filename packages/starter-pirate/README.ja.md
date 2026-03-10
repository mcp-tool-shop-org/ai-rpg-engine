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

# @ai-rpg-engine/starter-pirate

**Black Flag Requiem** — AI RPG Engine用の、海賊をテーマにした入門ワールド。

## インストール

```bash
npm install @ai-rpg-engine/starter-pirate
```

## 学習内容

この入門ワールドは、海賊のアドベンチャーを通じて、AI RPG Engineの機能を幅広く紹介します。

| 特徴 | この海賊ワールドで紹介されている機能 |
|---|---|
| **Rulesets** | `pirateMinimalRuleset` — 属性（腕力/狡猾さ/航海術）、リソース（体力/士気）、動詞、数式 |
| **Zones & traversal** | 隣接関係、照度、インタラクション要素、危険要素を持つ、3つの部屋に5つのエリア |
| **Districts** | 植民地海軍（Port Haven） vs 呪われた海域（Cursed Waters） |
| **Dialogue** | クエストの導入とグローバルフラグに影響を与える、分岐型の地図製作者との会話 |
| **Combat** | 海軍兵士（攻撃的）と、呪われた海の怪物（Drowned Guardian） |
| **Cognition & perception** | 記憶の減衰、知覚フィルター、呪われた怪物の表示ルール |
| **Progression** | 経験値報酬のある、3つのノードを持つ航海術のスキルツリー |
| **Environment** | 士気を低下させる突風、ダメージを与える水圧 |
| **Factions** | 総督と水兵がいる植民地海軍の派閥 |
| **Belief provenance** | 遅延付きの噂の伝播、信念の追跡 |
| **Inventory** | 士気を回復させる効果のあるアイテムを使用する、ラム酒樽 |
| **Simulation inspector** | リプレイ分析のために完全な検査機能が実装されています。 |

## 内容

- **5つのエリア** — 船の甲板、The Rusty Anchor（酒場）、総督の砦、広大な海、沈没した神殿
- **3つのNPC** — クォーターマスター・ブライ（乗組員）、地図製作者のマラ（中立）、総督ヴェーン（植民地政府）
- **2つの敵** — 海軍兵士（攻撃的）、呪われた海の怪物（Drowned Guardian）
- **1つのアイテム** — ラム酒樽（士気を8回復）
- **1つのスキルツリー** — 航海術（Sea-Hardened → Ruthless → Dread Captain）
- **1つの表示ルール** — 呪われた生物は、すべての訪問者を侵入者とみなす
- **15のモジュール** — 移動、状態、戦闘、インベントリ、会話、認知、知覚、成長、環境、派閥、噂、地区、信念、観察表示、検査

## 使用方法

```typescript
import { createGame } from '@ai-rpg-engine/starter-pirate';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, pirateMinimalRuleset, seamanshipTree } from '@ai-rpg-engine/starter-pirate';
```

## ドキュメント

- [ハンドブック](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

制作：<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
