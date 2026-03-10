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

# @ai-rpg-engine/modules

AI RPG エンジン用の 17 個のモジュール式シミュレーション機能。戦闘、会話、認知、知覚、派閥など、多岐にわたる機能を提供します。

## インストール

```bash
npm install @ai-rpg-engine/modules
```

## モジュール

| モジュール | 説明 |
|--------|-------------|
| `combatCore` | 攻撃/防御、ダメージ、敗北、スタミナ、防御、離脱 |
| `dialogueCore` | 条件付きのグラフベースの会話ツリー |
| `inventoryCore` | アイテム、装備、使用/装備/解除 |
| `traversalCore` | エリア移動と、エリアからの脱出の検証 |
| `statusCore` | 持続時間と累積効果を持つステータス |
| `environmentCore` | 動的なエリアの特性、危険、減衰 |
| `cognitionCore` | AI の信念、意図、士気、記憶 |
| `perceptionFilter` | 感覚チャネル、鮮明度、エリア間の聴覚 |
| `narrativeAuthority` | 真実と表現、隠蔽、歪曲 |
| `progressionCore` | 通貨ベースの成長、スキルツリー |
| `factionCognition` | 派閥の信念、信頼、派閥間の知識 |
| `rumorPropagation` | 信頼度の低下を伴う情報伝播 |
| `knowledgeDecay` | 時間経過による信頼度の低下 |
| `districtCore` | 空間記憶、エリアの指標、警戒レベル |
| `beliefProvenance` | 知覚/認知/噂に基づいた追跡の再構築 |
| `observerPresentation` | 観察者ごとのイベントフィルタリング、乖離の追跡 |
| `simulationInspector` | 実行時検査、ヘルスチェック、診断 |
| `combatIntent` | AI の意思決定におけるバイアス、士気、回避行動 |
| `engagementCore` | 前線/後方の配置、護衛の介入 |
| `combatRecovery` | 戦闘後の負傷状態、安全エリアでの回復 |
| `combatReview` | 数式の解説、命中率の内訳 |
| `defeatFallout` | 戦闘後の派閥への影響、評判の変化 |
| `bossPhaseListener` | ボス HP の閾値に基づくフェーズ移行 |

### 能力モジュール

| モジュール | 説明 |
|--------|-------------|
| `abilityCore` | 能力の処理：コスト、判定、対象、効果の発動、クールダウン |
| `abilityEffects` | 効果ハンドラ：ダメージ、回復、ステータス変更、状態異常の付与/解除 |
| `abilityReview` | 実行時トレース：使用ごとの詳細、インスペクタ、整形された出力 |
| `abilityIntent` | AIの評価：自己攻撃/範囲攻撃/単体攻撃のパス、耐性への意識、浄化の効果評価 |

### 能力の作成（純粋関数）

| エクスポート | 目的 |
|--------|---------|
| `ability-summary` | パッケージ概要、バランス調整、Markdown/JSON形式でのエクスポート |
| `ability-builders` | 便利な関数：buildDamageAbility（ダメージ能力の作成）、buildHealAbility（回復能力の作成）、buildStatusAbility（状態異常能力の作成）、buildCleanseAbility（浄化能力の作成）、buildAbilitySuite（能力セットの作成） |
| `status-semantics` | 11個のタグを持つ語彙、状態登録、耐性への対応 |

### 戦闘の作成 (純粋関数)

| エクスポート | 目的 |
|--------|---------|
| `combat-roles` | 8 種類のロールテンプレート、遭遇の構成タイプ、危険度、ボス定義 |
| `encounter-library` | 5 種類の遭遇アーキタイプ生成器、3 種類のボステンプレート生成器、パックの監査 |
| `combat-summary` | 戦闘コンテンツのクエリ、監査、整形、検査 |

## 使用方法

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { combatCore, dialogueCore, cognitionCore, perceptionFilter } from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: { /* ... */ },
  seed: 42,
  modules: [combatCore(), dialogueCore(), cognitionCore(), perceptionFilter()],
});
```

## ドキュメント

- [モジュール (第6章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/06-modules/)
- [AIの認知 (第8章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/08-ai-cognition/)
- [知覚 (第9章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/09-perception-layers/)
- [戦闘システム (第47章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/47-combat-system/)
- [能力システム (第48章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/48-abilities-system/)
- [ハンドブック](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

作成者: <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
