<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPG エンジン

RPGの世界を構築、分析し、バランス調整するための、シミュレーションに特化したツールキット。

AI RPG エンジンは、決定論的なシミュレーション実行環境と、AIを活用したデザインスタジオを組み合わせることで、開発者が世界を構築し、シミュレーションを通じてテストし、推測ではなく、データに基づいて改善することができます。

> 従来のツールは、物語の作成を支援します。
> AI RPG エンジンは、**世界のテスト**を支援します。

---

## その機能・役割

```
build → critique → simulate → analyze → tune → experiment
```

世界の内容を生成したり、デザインを評価したり、決定論的なシミュレーションを実行したり、リプレイの挙動を分析したり、ゲームの仕組みを調整したり、多数のパラメータで実験を実行したり、結果を比較したりすることができます。すべての結果は、再現可能で、検証可能で、説明可能です。

---

## 主要機能

### 決定論的なシミュレーション

RPGの世界をシミュレーションする、時間経過に基づくエンジン。世界の状態、イベントシステム、知覚と認知のレイヤー、派閥の信念伝播、噂システム、地区の指標（感情に基づいて算出）、NPCの行動（忠誠心に基づく分岐点と結果連鎖）、仲間（士気と離脱リスク）、プレイヤーの行動力と政治的行動、戦略マップ分析、移動アドバイザー、アイテム認識と装備の由来、遺物の成長段階、世界の状況に基づいて生成される機会（契約、賞金、依頼、物資調達、調査）、キャンペーンの展開検出（累積状態から派生する10種類の展開）、ゲーム終盤のトリガー検出（8つの解決段階）、そして構造化されたエピローグによる決定的な結末。アクションログはリプレイ可能で、決定論的な乱数生成を使用。すべてのプレイは完全に再現可能です。

### AIを活用した世界構築

オプションのAIレイヤーが、テーマに基づいて、部屋、派閥、クエスト、地区などを自動生成します。デザインを評価し、スキーマのエラーを修正し、改善案を提示し、段階的な世界構築のワークフローを支援します。AIは、シミュレーションの状態を直接変更することはありません。コンテンツの生成や提案のみを行います。

### ガイド付きのデザインワークフロー

セッションを意識し、計画を優先するワークフローにより、世界の構築、デザインの評価、デザインの反復、ガイド付きのビルド、および構造化された調整計画を実現します。決定論的なツールとAIの支援を組み合わせます。

### 能力と力

ジャンルに特化した能力システム。10種類の能力パックで、様々なジャンルをカバーします。能力には、コスト、ステータスチェック、クールダウン、および種類ごとの効果（ダメージ、回復、状態異常付与、浄化）があります。状態異常は、11個のタグを持つ語彙を使用し、エンティティごとに抵抗/脆弱性のプロファイルが設定されています。AIが認識する能力選択スコアは、自己、範囲攻撃、単体攻撃のパスを、抵抗の認識と浄化の価値に基づいて評価します。バランス調整監査ツールとパック概要ツールは、作成時に異常値を検出します。

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }, { resourceId: 'infection', amount: 5 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

### シミュレーション分析

リプレイ分析により、イベントが発生した理由、ゲームの仕組みがどこで破綻しているか、どのトリガーが発火しないか、どのシステムが不安定を引き起こしているかを説明します。分析結果は、調整に直接反映されます。

### ガイド付きの調整

バランスの分析結果に基づいて、構造化された調整計画が生成されます。計画には、提案された修正、予想される影響、信頼度、およびプレビューされた変更が含まれます。段階的に適用され、完全なトレーサビリティが確保されます。

### シナリオ実験

多数のパラメータでシミュレーションを実行し、典型的な挙動を理解します。シナリオの指標を抽出し、ばらつきを検出し、パラメータを調整し、調整された世界とベースラインの世界を比較します。世界のデザインをテスト可能なプロセスに変えます。

### スタジオシェル

プロジェクトのダッシュボード、問題の閲覧、実験の検査、セッション履歴、ガイド付きのオンボーディング、およびコンテキストに応じたコマンドの発見機能を備えた、CLIデザインスタジオ。世界を構築およびテストするためのワークスペースです。

---

## クイックスタートガイド

```bash
# Install the CLI
npm install -g @ai-rpg-engine/cli

# Start the interactive studio
ai chat

# Run onboarding
/onboard

# Create your first content
create-room haunted chapel

# Run a simulation
simulate

# Analyze the results
analyze-balance

# Tune the design
tune paranoia

# Run an experiment
experiment run --runs 50
```

---

## ワークフローの例

```bash
ai chat

/onboard
create-location-pack haunted chapel district
critique-content
simulate
analyze-balance
tune rumor propagation
experiment run --runs 50
compare-replays
```

世界を構築し、シミュレーションのデータに基づいて改善します。

---

## アーキテクチャ

このシステムは、4つのレイヤーで構成されています。

| レイヤー | 役割 |
|-------|------|
| **Simulation** | 決定論的なエンジン — 世界の状態、イベント、アクション、知覚、認知、派閥、噂の伝播、地区の指標、リプレイ |
| **Authoring** | コンテンツ生成 — スキャフォールディング、評価、正規化、修正ループ、パックジェネレーター |
| **AI Cognition** | オプションのAIアシスタンス — チャットシェル、コンテキストルーティング、検索、メモリ整形、ツールオーケストレーション |
| **Studio UX** | CLIデザイン環境 — ダッシュボード、問題追跡、実験の閲覧、セッション履歴、ガイド付きワークフロー |

---

## パッケージ

| パッケージ | 目的。 |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | 決定論的なシミュレーション実行環境 — 世界の状態、イベント、乱数生成、ティック、アクションの解決 |
| [`@ai-rpg-engine/modules`](packages/modules) | 29個の組み込みモジュール：戦闘、知覚、認知、派閥、噂、地区、NPCの行動、仲間、プレイヤーの行動力、戦略マップ、移動アドバイザー、アイテム認識、機会、展開検出、ゲーム終盤のトリガー |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 世界のコンテンツのための標準的なスキーマとバリデータ |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | キャラクターの成長状態、負傷、成長段階、評判 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | アーキタイプ選択、ビルド生成、初期装備 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装備の種類、アイテムの由来、遺物の成長、アイテムの記録 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | セッション間の記憶、関係性の効果、キャンペーンの状態 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | オプションのAIによるコンテンツ作成 — スキャフォールディング、評価、ガイド付きワークフロー、調整、実験 |
| [`@ai-rpg-engine/cli`](packages/cli) | コマンドラインデザインスタジオ — チャットシェル、ワークフロー、実験ツール |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | ターミナルレンダラーと入力レイヤー。 |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold — ファンタジーのスターターワールド |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox — サイバーパンクのスターターワールド |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective：ヴィクトリア朝のミステリーをテーマにしたスターターワールド |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem：海賊をテーマにしたスターターワールド |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead：ゾンビサバイバルをテーマにしたスターターワールド |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain：西部劇をテーマにしたスターターワールド |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss：SFコロニーをテーマにしたスターターワールド |

---

## ドキュメント

| リソース | 説明 |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | すべてのシステムを網羅する26章と4つの付録 |
| [Design Document](docs/DESIGN.md) | アーキテクチャの詳細解説：アクションパイプライン、真実と表現、シミュレーションレイヤー |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | 構築、診断、調整、実験のワークフロー |
| [Philosophy](PHILOSOPHY.md) | 決定論的な世界、データに基づいた設計、そしてAIをアシスタントとして |
| [Changelog](CHANGELOG.md) | リリース履歴 |

---

## 哲学

AI RPG Engineは、以下の3つのアイデアに基づいて構築されています。

1. **決定論的な世界**：シミュレーションの結果は再現可能でなければなりません。
2. **データに基づいた設計**：世界の仕組みは、シミュレーションを通じてテストされるべきです。
3. **AIをアシスタントとして、権威としてではない**：AIツールは、設計の生成と評価を支援しますが、決定論的なシステムに取って代わるものではありません。

詳細については、[PHILOSOPHY.md](PHILOSOPHY.md) を参照してください。

---

## セキュリティ

AI RPG Engineは、**ローカルでのみ動作するシミュレーションライブラリ**です。テレメトリー、ネットワーク接続、機密情報は一切使用しません。セーブファイルは、明示的に要求された場合にのみ `.ai-rpg-engine/` フォルダに保存されます。詳細は、[SECURITY.md](SECURITY.md) を参照してください。

## 要件

- Node.js >= 20
- TypeScript (ESM モジュール)

## ライセンス

[MIT](LICENSE)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> が作成しました。
