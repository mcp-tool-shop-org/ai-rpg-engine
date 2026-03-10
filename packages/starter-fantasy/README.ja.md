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

# @ai-rpg-engine/starter-fantasy

**The Chapel Threshold**：AI RPG Engine用の、ダークファンタジーをテーマにした入門ワールド。

## インストール

```bash
npm install @ai-rpg-engine/starter-fantasy
```

## 学習内容

この入門サンプルは、コンパクトな世界の中で、エンジン全体の機能を網羅的に示しています。

| 特徴 | The Chapelで示されている機能 |
|---|---|
| **Rulesets** | `fantasyMinimalRuleset`：ステータス（体力/本能/意志）、リソース（HP/スタミナ）、動詞、数式 |
| **Zones & traversal** | 隣接関係、光量、インタラクション可能なオブジェクト、危険要素を持つ、2つの部屋に5つのエリア |
| **Districts** | 聖域であるChapel Groundsと、呪われ、特定の勢力によって支配されているCrypt Depths |
| **Dialogue** | 3つの選択肢とグローバルフラグの効果を持つ、巡礼者の会話 |
| **Combat** | 攻撃的なAIプロファイル、恐怖のタグ、守護目標を持つAsh Ghoul |
| **Cognition & perception** | 記憶の減衰、知覚フィルター、アンデッドの表示ルール |
| **Progression** | 敵を倒すと経験値が得られる、3つのノードを持つCombat Mastery（戦闘スキル）ツリー |
| **Environment** | エリアに入る際にスタミナを消費する、不安定な床の危険要素 |
| **Factions** | 結束度を設定可能な、Chapelのアンデッド勢力 |
| **Belief provenance** | 遅延付きの噂の伝播、信念の追跡 |
| **Inventory** | 使用時にスクリプトによってHPを8回復する、回復薬 |
| **Simulation inspector** | リプレイ分析のために、詳細な情報が記録されている |

## 内容

- **5つのエリア**：廃墟の礼拝堂入口、中央聖堂、影の隠れ場所、聖具室の通路、地下墓所の前室
- **1人のNPC**：怪しい巡礼者（分岐する会話、3つの会話ルート）
- **1体の敵**：Ash Ghoul（攻撃的なAI、火と聖域に対する恐怖）
- **1つのアイテム**：回復薬（使用時にスクリプトによってHPを8回復）
- **1つのスキルツリー**：Combat Mastery（タフネス → 鋭い観察眼 → 戦闘狂）
- **1つの表示ルール**：アンデッドはすべての生者を脅威として認識する
- **15のモジュール**：移動、状態、戦闘、インベントリ、会話、認知、知覚、成長、環境、勢力、噂、地区、信念、観察表示、検査

## 使い方

```typescript
import { createGame } from '@ai-rpg-engine/starter-fantasy';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zones, pilgrimDialogue, fantasyMinimalRuleset } from '@ai-rpg-engine/starter-fantasy';
```

## ドキュメント

- [The Chapel Threshold (第20章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/20-chapel-threshold/)
- [ハンドブック](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

制作：<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
