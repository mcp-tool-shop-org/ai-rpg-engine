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

# AI RPGエンジン

決定的なRPGシミュレーションを構築するためのTypeScriptツールキット。ステータスを定義し、モジュールを選択し、戦闘スタックを構成し、コンテンツを作成します。エンジンは、状態、イベント、乱数生成（RNG）、アクションの解決、およびAIによる意思決定を処理します。すべての実行結果は再現可能です。

これは完成したゲームではなく、**コンポジションエンジン**です。10個のスターターワールドは例であり、そこから学習して再構築できる分解可能なパターンです。ゲームでは、必要なエンジンのサブセットを使用します。

---

## このツールの概要

- **モジュールライブラリ** - 30以上のエンジンモジュールを搭載。戦闘、知覚、認知、派閥、噂、移動、仲間などをカバー。
- **コンポジションツールキット** - `buildCombatStack()` を使用して約7行で戦闘を構成。`new Engine({ modules })` でゲームを開始。
- **シミュレーションランタイム** - 決定的なティック、再生可能なアクションログ、シードされたRNG。
- **AIデザインスタジオ（オプション）** - スキャフォールディング、批評、バランス分析、調整、Ollamaを使用した実験。

## このツールではないもの

- 完成されたゲームは一つもない。代わりに、今日からすぐに試せる10個のプレイ可能な初期ワールドを提供し、エンジンはユーザーが独自のゲームを構築するためのツールキットとして機能する。

- グラフィックエンジンではない。ピクセルではなく、構造化されたイベントを出力する。

- ストーリー生成エンジンではない。世界をシミュレートし、物語はそこから自然に生まれる。

---

## 現在のバージョン（v2.6.0）

**動作し、テスト済みの機能：**
- コアランタイム：ワールドの状態、イベント、アクション、ティック、リプレイ — v1.0以降安定。決定的なバイト単位での同一のリプレイ（インスタンスごとのIDカウンター、シードされた乱数生成器）
- 戦闘システム：5つのアクション、4つの戦闘状態、4つの交戦状態、仲間による迎撃、敗北時の処理、AIの戦術
- アビリティ：コスト、クールダウン、ステータスのチェック、タイプ付きの効果、11種類のタグを持つステータス語彙、AIが認識する選択肢
- **パーティ戦闘（v2.4）：** 味方へのターゲット指定（回復／バフ／蘇生）、味方／敵の範囲攻撃フィルタリング、ターゲットセレクター — 回復役はチームメイトを回復できる。敵の範囲攻撃は味方を巻き込まない。
- **ステータス効果（v2.4）：** パッシブなステータス修正が戦闘に影響を与える、決定的なDoT/HoTがティックカウンターに基づいて発生する、深さ制限のある反応型トリガー（棘／反射）
- **プラグインプロファイル — エンティティごとのルール解決（v2.5）：** 「力」の戦士と「意志」のミスティックが1回の戦闘で互いに戦い、それぞれ独自のステータスマッピングを通じてステータスを読み取る。`RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`；`applyProfile()`はプロファイル（ステータスマッピング、リソースプール、エンティティごとのアビリティ）を適用する；`buildProfile()`、`validateProfileSet()`（重複したIDは拒否）、10種類のスターターから派生したテンプレート、および`profile` CLIコマンド
- **実行可能な「run」ループ（v2.6）：** 最終的なゲームはデモではなく、実際にプレイ可能 — 敵は独自のAI意図プロファイル（「攻撃的」／「慎重」／「縄張り意識が強い」／「計算的」）に基づいて行動し、戦闘は勝利または敗北で終了し、保存して再開でき、アビリティと経験値はアクションメニューに表示される。`run <path>`は、事前に作成したゲームをロードする。一目でわかるHUDとアクセスしやすい色（`NO_COLOR` / 非TTYに対応）を備えた、統合されたターミナルUI
- **AIデザインスタジオは独自の「ai」コマンドとして提供される（v2.6）：** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — ローカルのOllamaモデルを使用して、コンテンツを構築、評価、および調整する。
- 統合された意思決定レイヤー：戦闘とアビリティのスコアリングが1つの呼び出し（`selectBestAction`）にマージされる。
- すべての10種類のスターターワールドは`buildCombatStack()`を使用する — 実証済みの構成の基盤。
- スターターごとのAI調整のためのコグニション設定API（`cognition: CognitionCoreConfig | false`）。
- コンテンツ作成用のタグ分類と検証ユーティリティ。
- `ai-rpg-engine create-starter <name>` — 新しいゲームを構築する（スタンドアロン、モノリポジトリの外で実行可能）；`validate` + `scaffold`コンテンツコマンド；JSONからパックをロードする。
- npmに公開されたスターターテンプレート（`@ai-rpg-engine/starter-template`）。
- 完全なテストスイート：**4292個のテスト**（繰り返し実行しても決定的な結果、CIでカバレッジが強制される）。

**未完成または不完全な点：**
- AIを活用したワールド構築スタジオ（Ollamaレイヤー）は、シミュレーションコアよりもテストが十分に行われておらず、ローカルのOllamaデーモンが必要です。これは完全にオプションであり、エンジンと「run」ループにはネットワーク接続は必要ありません。
- ナレーション/オーディオスタックは決定的なオーディオコマンドを生成しますが、**ターミナルオーディオバックエンドは存在しません**。つまり、音は再生されません。これらのコマンドは、GUI/Web埋め込みのための統合フックとして機能します。
- マルチプレイヤー（2人の人間が1つのワールドを共有）は**実装されていません**。これはネットワークレイヤーであり、意図的にスコープ外に置かれています。現在のプロファイルは、単一のコントローラーを対象としています。
- ドキュメントは豊富ですが、すべてのハンドブックページが最新のAPIを反映しているわけではありません。

---

## どのような外観をしているか

パッケージに含まれるターミナルUIは、各ターンを「シーン」「状態」「ログ」「アクション」というラベル付きのセクションに分割し、一目で状況が把握できるHUDを表示します。デフォルトではプレーンテキストで出力され、TTY（損傷は赤色、回復は緑色、拒否は黄色）で意味のある色を追加します。`NO_COLOR`や非TTYパイプにも対応しており、すべての情報はテキスト内に含まれるため、色だけでは意味が伝わることはありません。

```text
── The Crypt Gate ──────────────────────────────────────────
  [dark, unhallowed]

  ! Crypt Warden · HP 6/14 · Off Balance
  ! Bone Thrall · defeated
  + Mira · HP 11/16

  * rusted portcullis winch

  Exits: Ossuary, Churchyard

── Status ──────────────────────────────────────────────────
  HP 9/20 [#####-----]  Stamina 4/10
  Status: Guarded
  Items: healing-draught, grave-key

── Log ─────────────────────────────────────────────────────
  > Ash takes a guarded stance.
  > Hit!  4 damage dealt (HP: 6)
  > Bone Thrall defeated!
  > You can't do that: not enough stamina

── Actions ─────────────────────────────────────────────────
  [ 1] Move to Ossuary      [ 3] Attack Crypt Warden
  [ 2] Move to Churchyard   [ 4] Inspect Crypt Warden
────────────────────────────────────────────────────────────
```

---

## インストールしてプレイしましょう

ターミナルから、既存のゲームを起動するか、独自のゲームを作成することができます。

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

「実行」ループは、まさにターン制のゲームです。敵はそれぞれ独自のAIに基づいて行動し、能力や経験値などがメニューに表示されます。また、ゲームを保存して再開することもでき、戦闘は勝利か敗北で終了します。すべてのゲームは決定的な結果となり、何度でもプレイできます。

必要に応じて、AIデザインスタジオは独自のコマンドとしてインストールされます。

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

まず、ローカルの[Ollama](https://ollama.com)デーモンを起動します。具体的には、`ollama serve`と`ollama pull qwen2.5-coder`を実行してください。これは完全にオプションであり、エンジンや`run`ループにはネットワーク接続は必要ありません。

コンテナイメージは、CI（継続的インテグレーション）およびサンドボックス環境での実行用に、GHCRに `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` として公開されます。

---

## クイックスタート

コードを使って自分でゲームを開発したいですか？モジュールからエンジンを構築しましょう。

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

完全なワークフローについては、[コンポジションガイド](docs/handbook/57-composition-guide.md) を参照するか、新しいスターターをスキャフォールディングしてください。

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## アーキテクチャ

| レイヤー | 役割 |
|-------|------|
| **Core Runtime** | 決定的なエンジン - ワールドの状態、イベント、アクション、ティック、RNG、再生 |
| **Modules** | 30以上のコンポーザブルなシステム - 戦闘、知覚、認知、派閥、移動、仲間など。 |
| **Content** | エンティティ、ゾーン、ダイアログ、アイテム、アビリティ、ステータス - 著者が作成。 |
| **AI Studio** | オプションのOllamaレイヤー - スキャフォールディング、批評、バランス分析、調整、実験。 |

---

## 戦闘システム

5つのアクション（攻撃、防御、離脱、構え、再配置）、4つの戦闘状態（防御、体勢を崩す、露出、逃走）、4つのエンゲージメント状態（交戦、保護、後方、孤立）。3つのステータス次元がすべての数式を駆動するため、素早いデュエリストは重いブルースや落ち着いたセンチネルとは異なるプレイスタイルになります。

AI対戦相手は、統合された意思決定スコアリングを使用します - 戦闘アクションとアビリティが単一の評価で競合し、構成可能な閾値により、わずかなアビリティの乱用を防ぎます。

パックの作成者は、`buildCombatStack()` を使用して、ステータスマッピング、リソースプロファイル、およびバイアスタグから戦闘を構成します。[戦闘概要](docs/handbook/49a-combat-overview.md) および [パック作成者ガイド](docs/handbook/55-combat-pack-guide.md) を参照してください。

---

## アビリティ

ジャンル固有のアビリティシステムで、コスト、ステータスチェック、クールダウン、および型付きの効果（ダメージ、回復、ステータスの適用、浄化）を備えています。ステータス効果は、抵抗/脆弱性のプロファイルを持つ11タグのセマンティック語彙を使用します。AI対応の選択により、自己/AoE/単体ターゲットのパスをスコアリングします。

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

| パッケージ | 目的 |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | 決定的なシミュレーションランタイム - ワールドの状態、イベント、RNG、ティック、アクションの解決 |
| [`@ai-rpg-engine/modules`](packages/modules) | 30以上のコンポーザブルなモジュール - 戦闘、知覚、認知、派閥、噂、移動、仲間、NPCエージェンシー、戦略マップ、アイテム認識、創発的な機会、アーク検出、ゲームエンドトリガー。 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | ワールドコンテンツの標準スキーマとバリデーター。 |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | キャラクターの成長、負傷、重要な出来事、評判。 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | アーキタイプ選択、ビルド生成、初期装備。 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装備の種類、アイテムの入手先、遺物の成長 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | セッションをまたいだ記憶、関係性の影響、キャンペーンの状態 |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | 噂のライフサイクル、変異メカニズム、拡散状況の追跡 |
| [`@ai-rpg-engine/presentation`](packages/presentation) | ナレーション計画の概要、レンダリング契約、音声プロファイル。 |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | キューのスケジュール設定、優先順位、音量調整、クールダウン処理。 |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | サウンドパックのマニフェスト、コンテンツアドレス指定レジストリ |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | パックの登録、評価基準による採点、パックの発見 |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | ポートレート、アイコン、メディアなどのコンテンツを識別子として管理するストレージシステム。 |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | プラグイン可能なプロバイダーを利用した、顔のない人物画像の生成。 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | オプションのAIによる文章作成機能：構成支援、批評、段階的なワークフロー、調整、実験 |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI：ゲームの実行、スタータープロジェクトの作成、セーブデータの確認 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | ターミナルレンダラーと入力レイヤー |

### スターターの例

用意されている10個のスターターワールドは、あくまで**構成例**です。これらは、ゲームエンジンモジュールを組み合わせて完全なゲームを作成する方法を示しています。それぞれのワールドは異なるパターン（ステータスマッピング、リソースプロファイル、エンゲージメント設定、アビリティセット）を紹介しています。「各スターターワールドのREADME」には、「示されているパターン」と「参考にできる点」が記載されています。

| 前菜 | ジャンル | 主なパターン |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | ダークファンタジー | 戦闘は最小限に、会話を重視した構成。 |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | サイバーパンク | リソース、関与すべき役割 |
| [`starter-detective`](packages/starter-detective) | ヴィクトリア朝時代のミステリー | ソーシャルメディアを重視し、印象的な体験を提供する。 |
| [`starter-pirate`](packages/starter-pirate) | 海賊 | 海戦＋近接戦闘、マルチゾーン |
| [`starter-zombie`](packages/starter-zombie) | ゾンビサバイバル | 希少性、感染資源 |
| [`starter-weird-west`](packages/starter-weird-west) | 奇妙な西部劇。 | 偏見をなくし、安全な環境を取り戻す。 |
| [`starter-colony`](packages/starter-colony) | SFコロニー | 隘路、待ち伏せ地点 |
| [`starter-ronin`](packages/starter-ronin) | 封建時代の日本 | 隠された通路、複数の防御役割 |
| [`starter-vampire`](packages/starter-vampire) | 吸血鬼ホラー。 | 血液資源、社会操作 |
| [`starter-gladiator`](packages/starter-gladiator) | 古代の剣闘士 | アリーナでの戦闘、観客からの支持。 |

---

## ドキュメント、文書

| リソース | 説明 |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | 新しいゲームの雛形を作成する——CLI（コマンドラインインターフェース）を使用するか、手動でテンプレートを設定するか。 |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | ゲームエンジンモジュールを組み合わせて、独自のゲームを作成しましょう。 |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | エンティティごとのルール解決——多様な戦闘スタイル、`applyProfile`、プロファイルテンプレート、`profile` コマンドラインインターフェース。 |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | 戦闘の6つの要素、5つの行動、一目でわかる状況 |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | 段階的に「ビルド」を進め、戦闘スタックを構築し、ステータスをマッピングし、リソースプロファイルを定義します。 |
| [Handbook](site/src/content/docs/handbook/index.md) | 包括的なハンドブック。すべてのシステムを網羅し、さらに付録が4つ追加されています。 |
| [Composition Model](docs/composition-model.md) | 再利用可能な6つの層とその構成方法 |
| [Examples](docs/examples/) | 実行可能なTypeScriptのサンプルコード（型チェックとCIによる動作テスト済み）— エンティティごとの混合パーティ、共有プロファイル、ワールド間の連携、ゼロから構築。 |
| [Design Document](docs/DESIGN.md) | アーキテクチャの詳細解説：アクションのパイプライン、実態と表示の違い |
| [Philosophy](PHILOSOPHY.md) | 決定論的な世界、エビデンスに基づいた設計、AIをアシスタントとして活用 |
| [Changelog](CHANGELOG.md) | リリース履歴 |

---

## ロードマップ

### 現在地はここです

シミュレーションの実行環境、戦闘構成の基本構造、および初期作成パスが完成しました。193個のファイルで3613回のテストを実施し、`buildCombatStack`内のすべての10種類の初期設定を検証、決定的なバイト単位での再現性、完全なAIによる意思決定スコアリング、そしてCLIスクリプトコマンドも実装されました。**v2.5では、エンティティごとのルール解決機能が提供され、主要なプラグインプロファイル機能として、「力」に特化した格闘家と「意志」に特化した神秘的なキャラクターが、それぞれのステータスを独自の方式で読み取りながら、1回の戦闘で決着をつけることができます。**

**最近のリリース（バージョン2.3.3～2.6.0）：**
- バージョン2.3.3～2.3.7：消費者向け成果物の検証、戦闘スタックの強化、10種類のスターターをすべて`buildCombatStack`に実装、スターターテンプレートの発行、`create-starter` CLI。
- バージョン2.4.0：パーティ戦闘（味方への攻撃／回復／バフ／蘇生、敵全体への攻撃）、状態異常システム（修正値＋DoT/HoT＋反応型トリガー）、プラグインプロファイルフェーズ1、コンテンツの`validate`/`scaffold` CLI。
- **バージョン2.5.0：エンティティごとのルール解決（多様なプレイスタイルの戦闘）、`applyProfile`ローダー＋エンティティごとの能力、プロファイルテンプレート＋`profile` CLI、および完全なヘルスチェック（バイト単位での再現性の修正、正確性の強化、品質ゲートの実装）。**

### 次へ

- マルチプレイヤー：2人の「人間」のプレイヤーが1つのワールドを共有（ネットワーク層は意図的に後回し。単一コントローラーで共有できるプロファイルは、本日[`shared-profiles.ts`](docs/examples/shared-profiles.ts)としてリリース）
- シリアライズ可能な数式の上書き：プロファイルごとの数式の調整（数式DSLに依存。現在はプロファイルに統計マッピングが格納され、クロージャは使用されない）
- APIドキュメントの同期：すべてのハンドブックページがv2.5のAPIを反映していることを確認

### 目的地：プラグインプロファイル

このエンジンが目指す最終的な目標は、**ユーザー定義のプロファイル**です。これは、どのゲームにも適用できるポータブルな設定パックであり、ステータスのマッピング、リソースの動作、AIの偏りタグ、能力などを1つのインポート可能なユニットにまとめています。バージョン2.5では、各ワールド内のエンティティがそれぞれ独自のプロファイルを持ち、個別に戦闘を行うことができます。例えば、「力」を重視する戦士と「意志」を重視する神秘主義者が同じパーティに所属し、それぞれが独自のプレイスタイルを発揮することができます。

スキーマ、`applyProfile`ローダー、エンティティごとの機能解決、およびプロファイル間の検証はすべて実装済みです。残る課題はマルチプレイヤー対応であり、2人の*人間*のプレイヤー（単なる2つのエンティティではなく）が同じ世界を共有できるようにすることです。これはネットワーク層の問題となります。設計については、[Profile Roadmap](docs/profile-roadmap.md)および[feature-architecture.md](docs/feature-architecture.md)を参照してください。

---

## 哲学

AI RPGエンジンは、以下の3つのコンセプトに基づいて構築されています。

1. **決定論的な世界** — シミュレーションの結果は再現可能でなければならない。
2. **証拠に基づいた設計** — 世界のメカニズムはシミュレーションを通じてテストされるべきである。
3. **AIはアシスタントであり、権威ではない** — AIツールは設計の生成と評価を支援するが、決定論的なシステムに取って代わるものではない。

詳細については、[PHILOSOPHY.md](PHILOSOPHY.md) を参照してください。

---

## セキュリティ

コアエンジンは**ローカルでのみ動作するシミュレーションライブラリ**です。テレメトリ、ネットワーク接続、機密情報は一切使用しません。保存ファイルは、明示的に要求された場合にのみ `.ai-rpg-engine/` に保存されます。**オプションの** AIレイヤー (`@ai-rpg-engine/ollama`) は、**ローカルの** Ollamaデーモンと通信します。そのオプトイン機能である `webfetch` (RAG用) は、唯一のアウトバウンドネットワークパスであり、SSRFガードによって制限されています（ループバック/リンクローカル/CGNAT/クラウドメタデータおよびIPv6トンネル相当をブロック）。明示的に呼び出さない限り、これにアクセスすることはありません。詳細については、[SECURITY.md](SECURITY.md) を参照してください。

## 要件

- Node.js >= 20
- TypeScript (ESMモジュール)

## ライセンス

[MIT](LICENSE)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> によって作成されました。
