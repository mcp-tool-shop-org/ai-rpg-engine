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

# @ai-rpg-engine/starter-zombie

**Ashfall Dead** — AI RPG Engine用の、ゾンビサバイバルをテーマにしたスターターワールド。

## インストール

```bash
npm install @ai-rpg-engine/starter-zombie
```

## 学習内容

このスターターは、サバイバルシナリオを通じて、AIエンジンの機能をすべて紹介しています。

| 特徴 | ゾンビの動作 |
|---|---|
| **Rulesets** | `zombieMinimalRuleset` — 属性（体力/知力/精神力）、資源（HP/スタミナ/感染）、動詞、数式 |
| **Zones & traversal** | 隣接関係、明るさ、インタラクション可能なオブジェクト、危険要素を持つ、3つの部屋に5つのエリア |
| **Districts** | 安全地帯（生存者派閥） vs デッドゾーン（敵対、アンデッド） |
| **Dialogue** | 病院の物資調達クエストにつながる、医療担当者との会話分岐 |
| **Combat** | ゆっくりとしたが頑丈な「シャムラー」と、素早くも脆い「ランナー」のゾンビ。それぞれに攻撃AIを搭載。 |
| **Cognition & perception** | 記憶の減衰、知覚フィルター、ゾンビの飢餓状態の表示ルール |
| **Progression** | 敵を倒すと経験値を獲得できる、3つのノードからなるサバイバルツリー |
| **Environment** | 徘徊するゾンビによるスタミナの消耗、感染リスクのあるエリアによる感染の増加 |
| **Factions** | 医療担当者、スカベンジャー、軍事指導者を含む生存者派閥 |
| **Belief provenance** | 遅延付きの噂の伝播、信念の追跡 |
| **Inventory** | 感染を軽減するスクリプトによるアイテム使用効果を持つ抗生物質 |
| **Simulation inspector** | リプレイ分析のための完全な検査機能 |

## 内容

- **5つのエリア** — 安全地帯ロビー、廃墟となったガソリンスタンド、占拠された通り、病院東棟、病院屋上
- **3人のNPC** — Dr.チェン（医療担当者）、ルーク（スカベンジャー）、軍曹マーシュ（軍事指導者）
- **2種類の敵** — シャムラー（ゆっくりとした頑丈なアンデッド）、ランナー（素早くも脆いアンデッド）
- **1つのアイテム** — 抗生物質（感染を25%軽減）
- **1つの成長ツリー** — サバイバル（スカッパー → 冷静沈着 → 最後の生き残り）
- **1つの表示ルール** — ゾンビはすべての生き物を獲物として認識する
- **15のモジュール** — 移動、状態、戦闘、インベントリ、会話、認知、知覚、成長、環境、派閥、噂、地区、信念、観察表示、検査

## 使用方法

```typescript
import { createGame } from '@ai-rpg-engine/starter-zombie';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zombieMinimalRuleset, survivalTree } from '@ai-rpg-engine/starter-zombie';
```

## ドキュメント

- [ハンドブック](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

制作：<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
