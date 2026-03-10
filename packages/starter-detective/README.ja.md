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

# @ai-rpg-engine/starter-detective

**Gaslight Detective** — AI RPG エンジンのための、ヴィクトリア朝を舞台にしたミステリー体験を提供するスターターワールド。

## インストール

```bash
npm install @ai-rpg-engine/starter-detective
```

## 学習内容

このスターターは、捜査というシナリオを通して、AI RPG エンジンの機能をすべて紹介しています。

| 特徴 | 「detective」で示されている機能 |
|---|---|
| **Rulesets** | `detectiveMinimalRuleset` — 属性（知覚/雄弁/精神力）、リソース（体力/冷静さ）、動詞、数式 |
| **Zones & traversal** | 隣接関係、明るさ、インタラクション可能なオブジェクト、危険要素を持つ、2つの部屋に5つのエリア |
| **Districts** | アシュフォード邸（貴族） vs. 港湾地区（港湾労働者グループ） |
| **Dialogue** | 証拠収集とグローバルフラグの効果を持つ、分岐型の未亡人の尋問 |
| **Combat** | 攻撃的なAIプロファイルと縄張り意識を持つ、港湾のチンピラ |
| **Cognition & perception** | 記憶の減衰、知覚フィルター、容疑者のパラノイアに関する表示ルール |
| **Progression** | 敵を倒すと経験値を獲得できる、3つのノードを持つ「推理の達人」スキルツリー |
| **Environment** | 暗い路地での危険要素：エリアに入る際に冷静さを消耗する |
| **Factions** | 結束度を設定できる、港湾労働者グループ |
| **Belief provenance** | 遅延付きの噂の広がり、信憑性の追跡 |
| **Inventory** | スクリプトによるアイテム使用効果を持つ、洋行香水 |
| **Simulation inspector** | リプレイ分析のために、詳細な調査機能 |

## 内容

- **5つのエリア** — 書斎（事件現場）、応接間、使用人の食堂、正面玄関、裏路地
- **3つのNPC** — アシュフォード夫人（未亡人/容疑者）、パイク警官（警察官）、キャロウエイト夫人（使用人/目撃者）
- **1体の敵** — 港湾のチンピラ（攻撃的なAI、縄張り意識）
- **1つのアイテム** — 洋行香水（冷静さを6回復）
- **1つのスキルツリー** — 推理の達人（鋭い観察眼 → 巧みな弁舌 → 鋼の精神）
- **1つの表示ルール** — 容疑者は捜査を脅威だと認識する
- **15のモジュール** — 移動、状態、戦闘、インベントリ、会話、認知、知覚、成長、環境、派閥、噂、地区、信念、観察者の表示、捜査官

## 使い方

```typescript
import { createGame } from '@ai-rpg-engine/starter-detective';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, detectiveMinimalRuleset, deductionMasteryTree } from '@ai-rpg-engine/starter-detective';
```

## ドキュメント

- [ハンドブック](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

制作：<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
