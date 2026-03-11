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

TypeScriptを使用した、決定論的なRPGシミュレーションを構築するためのツールキットです。 プレイヤーはステータスを定義し、モジュールを選択し、戦闘システムを構築し、コンテンツを作成します。 エンジンは、状態、イベント、乱数生成、アクションの解決、およびAIの意思決定を処理します。 毎回、同じ結果が得られます。

これは、完成したゲームではなく、**コンポジションエンジン**です。 10個のスターターワールドは、学習し、再利用できる構成要素の例です。 プレイヤーのゲームは、エンジンが必要とするモジュールのサブセットを使用します。

---

## このツールの概要

- **モジュールライブラリ**: 戦闘、知覚、認知、派閥、噂、移動、仲間など、27以上のモジュールが含まれています。
- **コンポジションツールキット**: `buildCombatStack()` を使用すると、約7行で戦闘システムを構築できます。 `new Engine({ modules })` を使用すると、ゲームを起動できます。
- **シミュレーション実行環境**: 決定論的な動作、リプレイ可能なアクションログ、シードされた乱数生成。
- **AIデザインスタジオ** (オプション): スキャフォールディング、批評、バランス分析、チューニング、Ollamaを使用した実験。

## このツールではないもの

- すぐにプレイできるゲームではありません。 モジュールとコンテンツを組み合わせて作成する必要があります。
- 視覚的なエンジンではありません。 ピクセルではなく、構造化されたイベントを出力します。
- ストーリー生成ツールではありません。 世界をシミュレートし、そのメカニズムから物語が生まれます。

---

## 現在の状態 (v2.3.0)

**動作し、テストされているもの:**
- コア実行環境: ワールドの状態、イベント、アクション、ティック、リプレイ - v1.0以降、安定しています。
- 戦闘システム: 5つのアクション、4つの戦闘状態、4つのエンゲージメント状態、仲間の介入、敗北の流れ、AI戦術 - 1099件のテストを実施済み。
- アビリティ: コスト、クールダウン、ステータスチェック、タイプ付きの効果、ステータス語彙、AI対応の選択。
- 統合された意思決定レイヤー: 戦闘とアビリティのスコアリングが1つの呼び出し (`selectBestAction`) に統合されています。
- ステータスが異なる敵を持つ10個のスターターワールドと、完全な戦闘統合。
- `buildCombatStack()` を使用すると、各ワールドの戦闘設定に関する約40行のコードを削減できます。
- コンテンツ作成のためのタグ分類と検証ユーティリティ。
- フェーズ間のタグ追跡によるボスフェーズの検証。

**未完成または粗い部分:**
- AIワールド構築ツール (Ollamaレイヤー) は動作しますが、シミュレーションと比較してテストが不十分です。
- CLIスタジオシェルは機能しますが、洗練されていません。
- 10個のスターターワールドのうち、`buildCombatStack` を使用しているのは「Weird West」のみで、他のワールドは詳細な手動での設定が必要です。
- プロファイルシステムはまだありません。 ワールドはスタンドアロンであり、共有プロファイルから構成することはできません。
- ドキュメントは詳細 (57章) ですが、すべての章が最新のAPIを反映しているわけではありません。

---

## クイックスタートガイド

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, createTraversalCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [...combat.modules, createTraversalCore(), createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

完全なワークフローについては、[コンポジションガイド](docs/handbook/57-composition-guide.md) を参照してください。

---

## アーキテクチャ

| レイヤー | 役割 |
|-------|------|
| **Core Runtime** | 決定論的なエンジン - ワールドの状態、イベント、アクション、ティック、乱数生成、リプレイ。 |
| **Modules** | 27以上の構成可能なシステム - 戦闘、知覚、認知、派閥、移動、仲間など。 |
| **Content** | エンティティ、ゾーン、ダイアログ、アイテム、アビリティ、ステータス - ユーザーが作成。 |
| **AI Studio** | オプションのOllamaレイヤー - スキャフォールディング、批評、バランス分析、チューニング、実験。 |

---

## 戦闘システム

5つのアクション (攻撃、防御、離脱、防御態勢、再配置)、4つの戦闘状態 (防御状態、体勢を崩された状態、防御が薄れた状態、逃走状態)、4つのエンゲージメント状態 (交戦状態、防御状態、後衛、孤立状態)。 3つのステータス次元がすべての数式に影響を与え、素早いデュエリストと、重装甲の近接戦闘家、または冷静な防御型キャラクターでは、プレイスタイルが大きく異なります。

AIの敵は、統合された意思決定スコアリングを使用します。 戦闘アクションとアビリティが単一の評価で競合し、設定可能な閾値によって、無意味なアビリティの使用を抑制します。

パックの作成者は、`buildCombatStack()`を使用して、わずか7行のコードで戦闘システムを構築します。 これには、能力値のマッピング、リソースの定義、およびバイアスタグの設定が含まれます。 詳細については、[戦闘システムの概要](docs/handbook/49a-combat-overview.md)と[パック作成者ガイド](docs/handbook/55-combat-pack-guide.md)を参照してください。

---

## アビリティ

ジャンルに特化したアビリティシステムで、コスト、ステータスチェック、クールダウン、およびタイプ付きの効果 (ダメージ、回復、ステータス付与、浄化) があります。 ステータス効果には、耐性/脆弱性プロファイルを持つ11個のタグの語彙を使用します。 AI対応の選択は、自己/範囲/単体攻撃のパスを評価します。

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## パッケージ

| パッケージ | 目的。 |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | 決定論的なシミュレーション実行環境 — 世界の状態、イベント、乱数生成、ティック、アクションの解決 |
| [`@ai-rpg-engine/modules`](packages/modules) | 27種類以上のモジュールを組み合わせることで、戦闘、認識、認知、派閥、噂、移動、仲間、NPCの行動、戦略マップ、アイテム認識、新たな機会の創出、物語の展開、ゲーム終盤のイベントなどを実現できます。 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 世界のコンテンツのための標準的なスキーマとバリデータ |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | キャラクターの成長状態、負傷、成長段階、評判 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | アーキタイプ選択、ビルド生成、初期装備 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装備の種類、アイテムの由来、遺物の成長 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | セッション間の記憶、関係性の効果、キャンペーンの状態 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | オプションのAIによるコンテンツ作成 — スキャフォールディング、評価、ガイド付きワークフロー、調整、実験 |
| [`@ai-rpg-engine/cli`](packages/cli) | コマンドラインによるゲームデザインツール |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | ターミナルレンダラーと入力レイヤー。 |

### スターターサンプル

10個のスターターワールドは、**モジュールの組み合わせ例**です。これらは、エンジンモジュールを組み合わせて完全なゲームを作成する方法を示しています。それぞれが異なるパターン（ステータスのマッピング、リソースのプロファイル、エンゲージメントの設定、アビリティセット）を示しています。各スターターのREADMEファイルで、「示されているパターン」と「利用できるもの」を確認してください。

| スターター | ジャンル | 主要なパターン |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | ダークファンタジー | 戦闘は控えめ、会話が中心 |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | サイバーパンク | リソース、エンゲージメントの役割 |
| [`starter-detective`](packages/starter-detective) | ヴィクトリア朝のミステリー | ソーシャル要素が強く、認識が重要 |
| [`starter-pirate`](packages/starter-pirate) | 海賊 | 海戦＋近接戦闘、複数のエリア |
| [`starter-zombie`](packages/starter-zombie) | ゾンビサバイバル | 資源の枯渇、感染 |
| [`starter-weird-west`](packages/starter-weird-west) | ワイルドウエスト | `buildCombatStack` の参照、パックの優先順位 |
| [`starter-colony`](packages/starter-colony) | SFコロニー | 隘路、待ち伏せポイント |
| [`starter-ronin`](packages/starter-ronin) | 封建時代の日本 | 隠し通路、複数の守護役 |
| [`starter-vampire`](packages/starter-vampire) | ヴァンパイアホラー | 血資源、社会操作 |
| [`starter-gladiator`](packages/starter-gladiator) | 歴史的なグラディエーター | アリーナでの戦闘、観客の評価 |

---

## ドキュメント

| リソース | 説明 |
|----------|-------------|
| [Composition Guide](docs/handbook/57-composition-guide.md) | エンジンモジュールを組み合わせて、独自のゲームを作成しましょう。ここから始めましょう。 |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | 6つの戦闘の基本要素、5つのアクション、ステータスの一覧 |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | 段階的な `buildCombatStack` の構築、ステータスマッピング、リソースプロファイル |
| [Handbook](docs/handbook/index.md) | すべてのシステムを網羅する26章と4つの付録 |
| [Composition Model](docs/composition-model.md) | 6つの再利用可能なレイヤーとその組み合わせ方 |
| [Examples](docs/examples/) | 実行可能なTypeScriptのサンプルコード：混合パーティー、ワールド間の連携、ゼロから作成 |
| [Design Document](docs/DESIGN.md) | アーキテクチャの詳細：アクションパイプライン、真実と表現 |
| [Philosophy](PHILOSOPHY.md) | 決定論的な世界、データに基づいた設計、そしてAIをアシスタントとして |
| [Changelog](CHANGELOG.md) | リリース履歴 |

---

## ロードマップ

### 現在の状況

シミュレーションの実行エンジンと戦闘システムは安定しています。2661件のテスト、10種類のジャンル例、再現可能な結果、完全なAIによる意思決定スコアリングが可能です。このエンジンは、モジュールを選択し、ステータスを定義し、接続し、コンテンツを作成するツールキットとして機能します。ドキュメントはすべてのシステムをカバーしていますが、最新の追加機能についてはAPIの同期が必要です。

### 今後数週間

- 残りの9つのスターターを `buildCombatStack` に移行します（ワイルドウエストが参照です）。
- APIドキュメントの同期：`submitActionAs`、`selectBestAction`、`resourceCaps`、タグの分類
- スターターのREADMEの改善：より明確な「利用できるもの」と、リミックスに関するガイダンス
- 相互リンクの追加：README、モジュール構成ガイド、サンプル、ハンドブックを関連付けます。

### 目標：プラグインプロファイル

このエンジンの最終目標は、**ユーザー定義のプロファイル**です。これは、任意のゲームに組み込むことができる、ポータブルなバンドルです。プロファイルは、ステータスマッピング、リソースの動作、AIのバイアス、アビリティ、エンカウンターのトリガーなどを、単一のインポート可能なユニットにパッケージ化します。異なるプロファイルを持つ2人のプレイヤーが同じワールドを共有でき、それぞれが独自のプレイスタイルを楽しむことができます。

プロファイルは、モジュールの組み合わせ（すでに動作中）と、統一された意思決定レイヤー（v2.3.0でリリース）を基盤としています。残りの作業は、プロファイルのスキーマを定義し、ローダーを構築し、プロファイル間の相互作用を検証することです。詳細については、[プロファイルのロードマップ](docs/profile-roadmap.md) を参照してください。

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
