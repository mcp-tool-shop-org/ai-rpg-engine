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

# @ai-rpg-engine/starter-cyberpunk

**ネオン・ロックボックス** — AI RPG Engine用のサイバーパンク入門ワールド。

## インストール

```bash
npm install @ai-rpg-engine/starter-cyberpunk
```

## 学習内容

この入門サンプルは、ジャンルの柔軟性を示しています。同じエンジンを使用しながら、完全に異なるステータスモデルを採用しています。

| 特徴 | ロックボックスでできること |
|---|---|
| **Rulesets** | `cyberpunkMinimalRuleset` — ステータス（クロム/反射/ネットランニング）、リソース（HP/ICE/帯域幅）、8つのアクション（ハッキング、ネット接続など） |
| **Zones & traversal** | 3つのエリア（ストリート → サーバー室 → 金庫）に、照明、危険、インタラクション要素 |
| **Districts** | ネオン街（公共エリア）と金庫複合施設（セキュリティ強化、派閥管理エリア） |
| **Dialogue** | フィクサーからのブリーフィング。3つの選択肢と、グローバルフラグによる影響。 |
| **Combat** | 攻撃的なAIを持つICEセンチネル。金庫の警備が目的。 |
| **Cognition & perception** | 高い減衰と不安定性。反射能力に基づいた知覚と、ネットランニングによる感覚。 |
| **Progression** | 3つのノードからなるネットランニングスキルツリー（パケットスニッファー → ICE硬化 → 脳内ブースト）。 |
| **Environment** | 露出した配線による危険。エリアへの侵入時に2HPのダメージ。 |
| **Factions** | 金庫のICE派閥の結束力：0.95 |
| **Belief provenance** | 噂の伝播速度が速い（遅延=1）。ホップごとに3%の歪み。 |
| **Inventory** | ICEブレイカープログラム。ターゲットのICEを8減少させる。 |
| **Presentation rules** | ICEエージェントは、ICEではないものをすべて侵入とみなす。 |

### ファンタジーとサイバーパンク。同じエンジン、異なるルールセット

| | チャペル・スレッショルド | ネオン・ロックボックス |
|---|---|---|
| ステータス | 体力 / 本能 / 意志 | クロム / 反射 / ネットランニング |
| リソース | HP、スタミナ | HP、ICE、帯域幅 |
| ユニークなアクション | — | ハッキング、ネット接続 |
| 知覚 | デフォルト | 反射能力ベース + ネットランニング感覚 |
| 知性の減衰 | 基本値：0.02 | 基本値：0.03、不安定性：0.8 |
| 噂の伝播 | 遅延：2、歪みなし | 遅延：1、3%の歪み |

## 内容

- **3つのエリア** — ネオン街、放棄されたサーバー室、データ金庫
- **1人のNPC** — フィクサーのキラ（ブリーフィングの会話、3つの会話ルート）
- **1体の敵** — ICEセンチネル（攻撃的なAI、金庫の警備が目的）
- **1つのアイテム** — ICEブレイカープログラム（ターゲットのICEリソースを減少させる）
- **1つのスキルツリー** — ネットランニングスキル（パケットスニッファー → ICE硬化 → 脳内ブースト）
- **1つのルール** — ICEエージェントは、ICEではないものをすべて侵入とみなす。
- **15つのモジュール** — チャペル・スレッショルドと同じフルスタックだが、異なる設定。

## 使い方

```typescript
import { createGame } from '@ai-rpg-engine/starter-cyberpunk';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(77);

// Or import pieces individually:
import { manifest, zones, fixerDialogue, cyberpunkMinimalRuleset } from '@ai-rpg-engine/starter-cyberpunk';
```

## ドキュメント

- [ネオン・ロックボックス (第21章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/21-neon-lockbox/)
- [ハンドブック](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

制作：<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
