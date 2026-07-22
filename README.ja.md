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

## 現在の状況（v2.7.0）

**動作し、テスト済みの機能：**
- コアランタイム：ワールドの状態、イベント、アクション、ティック、リプレイ — v1.0以降安定；決定的なバイト単位でのリプレイ（インスタンスごとのIDカウンター、シードされた乱数生成器）
- 戦闘システム：5つのアクション、4つの戦闘状態、4つのエンゲージメント状態、仲間による迎撃、敗北時の流れ、AI戦術
- アビリティ：コスト、クールダウン、ステータスチェック、タイプ付きの効果、11種類のステータスタグのボキャブラリー、AIに対応した選択
- **パーティ戦闘（v2.4）：** 味方へのターゲット指定（回復／バフ／蘇生）、味方／敵に対する範囲攻撃フィルタリング、ターゲットセレクター — 回復役がチームメイトを回復できる；敵の範囲攻撃は味方を巻き込まない
- **ステータス効果（v2.4）：** パッシブなステータス修正が戦闘に影響する、ティックカウンターに基づいた決定的なDoT/HoT、深さ制限された反応型トリガー（棘／反射）
- **プラグインプロファイル — エンティティごとのルール解決（v2.5）：** 「力」の戦士と「意志」のミスティックが1回の戦闘で互いのステータスを読み取りながら戦闘を行う。`RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` はプロファイル（ステータスマッピング、リソースプール、エンティティごとのアビリティ）を適用する；`buildProfile()`、`validateProfileSet()`（重複IDは拒否）、10種類のスターターから派生したテンプレート、および `profile` CLIコマンド
- **実行可能な「run」ループ（v2.6）：** 最終的なゲームはデモではなく実物である — 敵は独自のAI意図プロファイル（「攻撃的」／「慎重」／「縄張り意識が強い」／「計算的」）に基づいて行動する、戦闘は勝利または敗北で終了し、保存して再開でき、アビリティと経験値はアクションメニューに表示される。`run <path>` は、作成したゲームをロードする。見やすいHUDとアクセスしやすい色（`NO_COLOR` / 非TTYに対応）を備えた統合されたターミナルUI
- **AIデザインスタジオは独自の `ai` コマンドとして提供される（v2.6）：** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — ローカルのOllamaモデルを使用して、コンテンツを構築、評価、および調整する
- 統合された意思決定レイヤー：戦闘 + アビリティスコアリングが1つの呼び出しにマージ（`selectBestAction`）
- すべての10種類のスターターワールドは `buildCombatStack()` を使用する — 実証済みの構成の基盤
- コンテンツ作成のための認知タクソノミーと検証ユーティリティ
- **世界が反応する（v2.7）：** キル数は熱を蓄積し、地区の安全性を低下させる；ラウンドごとにワールドティックが発生し、噂として表面化する隠れたプレッシャーが生じる（「囁き声が聞こえてくる…」）、エスカレートし、結果とともに消滅する；約30種類の作成されたエンカウンター構成が、すべての10種類のスターターでゾーンへの進入時に発動される — シードごとに決定的なものとなり、より危険な地区ではエンカウンターが増加し、ボス戦のセットピースは保護される
- **再びプレイする理由（v2.7）：** 長い間提供されてきたスキーマに基づいた最小限のクエストループ — クエストはトリガーに応じて開始され、キル数／到達地点／進捗状況を追跡し、経験値とアイテムを正確に1回だけ報酬として与える；4つの作成されたクエスト、**ジャーナル**画面、ラウンドのナレーションにおけるクエストの展開
- **装備が戦闘に影響する（v2.7）：** `equip`/`unequip` は実際の数値をステータスレイヤーを通じて移動させ、戦闘式はすでにそれらを読み取る — 戦闘コードの変更はゼロ；グラディエーターの三叉戟と網は最初から最後までテストでピン留めされたヒット率の変化と連携している
- **シードされた実行（v2.7）：** すべての新しいセッションは、正確なリプレイコマンドとともにそのシードを出力する；`--seed <n>` はセッションをバイト単位で再現する；戦闘、抵抗、アビリティ、および戦術ロールはすべてワールドシードを使用する — そしてエンディングは実際にプレイした実行（ライブの熱、プレッシャー、派閥の蓄積、プレイヤーレベル）を読み取る
- **`buildWorldStack()`（v2.7）：** `buildCombatStack()` に加えて戦略的な構成の基盤である — 1つの呼び出しで環境、派閥、噂、地区、敗北後の影響、エンカウンター、およびクエストが組み立てられる；さらに、**ディレクターズ・レジャー**戦略画面、`AI_RPG_DEBUG=1` シミュレーションインスペクター、Continueと同じ権限によってゲートされた `inspect-save`、および出荷された復元パス上のモジュール保存移行シーム
- `ai-rpg-engine create-starter <name>` — 新しいゲームを構築する（スタンドアロンで、モノリポジトリの外で実行可能）；`validate` + `scaffold` コンテンツコマンド；JSONからパックをロードする
- npmに公開されたスターターテンプレート（`@ai-rpg-engine/starter-template`）
- 完全なテストスイート：**4797個のテスト**（繰り返し実行しても決定的な結果、テストファイルはCIで型チェックされる、カバレッジラチェットが強制される）

**未完成または粗い点：**
- AIワールド構築スタジオ（Ollamaレイヤー）は、シミュレーションコアよりもテストが少ないため、ローカルのOllamaデーモンが必要である；完全にオプションである — エンジンと「run」ループにはネットワーク接続は必要ない
- ナレーション/オーディオスタックは決定的なオーディオコマンドを構築するが、**ターミナルオーディオバックエンドはない** — 音は再生されない；コマンドはGUI / Web埋め込み用の統合フックである
- マルチプレイヤー（1つのワールドを共有する2人の人間プレイヤー）は**構築されていない** — 意図的にスコープ外である；プロファイルは現在、単一のコントローラーを対象としている
- `replay --replay` は保存を復元し、再シミュレーションしない：再シミュレーションは、ワールドステートモジュール（ワールドティックとエンカウンターの生成）がアクションログの外で進化するため、適切ではない；パリティはv2.8での作業である
- クエストはまずファンタジーとゾンビのスターターに搭載され、装備ループはまずグラディエーターに組み込まれる — メカニズムはエンジン全体で使用される；コンテンツの展開は意図的である
- ドキュメントは豊富だが、すべてのハンドブックページが最新のAPIを反映しているわけではない

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

両方の構成基盤は完成している — 259個のファイルにわたる4797個のテスト、すべての10種類のスターターで `buildCombatStack` **と** `buildWorldStack` を使用、出力されたシードに基づいて決定的なバイト単位でのリプレイ、完全なAI意思決定スコアリング、および構築、実行、検証、および検査を行うCLI。**v2.7は戦略的レイヤーを強化する：世界はあなたのプレイスタイルに反応する（熱、プレッシャー、エンカウンター）、クエストは実行に基盤を与える、装備は実際の数値を変更し、すべてのセッションは出力されたシードからリプレイ可能になる。**

**最近のリリース（v2.4.0～v2.7.0）：**
- v2.4.0 — パーティー戦闘（味方へのターゲット指定／回復／強化／蘇生、仲間と敵に対する範囲攻撃）、状態異常システム（修正値＋持続ダメージ/継続回復効果＋反応型トリガー）、プラグインプロファイルフェーズ1、コンテンツの`validate`/`scaffold` CLI
- v2.5.0 — エンティティごとのルール解決（多様なプレイスタイルに対応した戦闘）、`applyProfile`ローダー＋エンティティごとの能力、プロファイルテンプレート＋`profile` CLI、および完全なヘルスチェック機能
- v2.6.0 — `run`コマンドが実際のゲームとして機能：敵は独自のAIプロファイルに基づいて行動し、勝利／敗北の判定、セーブ／再開機能、メニューに表示される能力と経験値、`ai`スタジオバイナリ、およびナレーションスタックを実装
- **v2.7.0 — 世界が反応し、再び訪れる理由が生まれる：熱→圧力→ナレーションによる結果、ゾーンへの進入時に発生するイベント、クエストループ＋ジャーナル、戦闘中の装備、再現可能なランの導入、ライブエンドゲーム入力、`buildWorldStack`、ディレクターズ・レジャー、およびセーブデータの移行機能**

### 次（v2.8の開発）

- 経済システム — リアルタイムの地区経済、`computeItemValue`によって価格が決定される取引システム、クラフト／リサイクルループ（モジュールは本日リリース；配線は次回のリリースで実装）
- コンパニオンとソーシャルアクション — 仲間を仲間に加える／パーティーを組む機能、および影響力システムの上に構築された、賄賂／威嚇／噂を流すプレイスタイルレイヤー
- `--replay`による再シミュレーションの整合性確保（ワールドステートモジュールとの連携）、および残りのディレクターフォーマッターサーフェスの実装
- マルチプレイヤー — 2人の*人間*プレイヤーが1つの世界を共有（ネットワーク層、意図的に後回し；単一コントローラーによる共有プロファイルは本日[`shared-profiles.ts`](docs/examples/shared-profiles.ts)としてリリース）
- シリアライズ可能な数式オーバーライド — プロファイルごとの数式の調整（数式DSLの実装に依存；プロファイルには現在、クロージャではなくステータスマッピングが含まれる）
- APIドキュメントの同期 — すべてのマニュアルページがv2.7のAPIを反映していることを確認

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
