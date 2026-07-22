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

## 現在の状況（v2.8.0）

**動作し、テスト済みの機能：**
- コアランタイム：ワールドの状態、イベント、アクション、ティック、リプレイ — v1.0以降安定；決定的なバイト単位でのリプレイ（インスタンスごとのIDカウンター、シードされた乱数生成器）
- 戦闘システム：5つのアクション、4つの戦闘状態、4つのエンゲージメント状態、コンパニオンによる迎撃、敗北時の流れ、AI戦術
- アビリティ：コスト、クールダウン、ステータスチェック、種類の異なる効果、11個のタグを持つステータスの語彙、AIを考慮した選択
- **パーティー戦闘（v2.4）：** 味方へのターゲット指定（回復／バフ／蘇生）、味方／敵に対する範囲攻撃フィルター、ターゲットセレクター — 回復役はチームメイトを回復できる；敵の範囲攻撃は味方を巻き込まない
- **ステータス効果（v2.4）：** パッシブなステータス変更が戦闘に影響を与える、ティックカウンターに基づいた決定的なDoT/HoT、深さ制限のある反応型トリガー（棘／反射）
- **プラグインプロファイル — エンティティごとのルール解決（v2.5）：** 「力」の戦士と「意志」のミスティックが1回の戦闘で互いに協力し、それぞれ独自のステータスマッピングを通じてステータスを読み取る。`RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()`はプロファイル（ステータスマッピング、リソースプール、エンティティごとのアビリティ）を適用する；`buildProfile()`、`validateProfileSet()`（重複したIDは拒否）、10個の初期テンプレート、および`profile` CLIコマンド
- **実行可能な「run」ループ（v2.6）：** 最終的なゲームはデモではなく、実際に動作するもの — 敵は独自のAI意図プロファイル（「攻撃的」／「慎重」／「縄張り意識が強い」／「計算的」）に基づいて行動する、戦闘は勝利または敗北で終了し、保存して再開でき、アビリティと経験値はアクションメニューに表示される。`run <path>`は、作成したゲームをロードする。一目でわかるHUDとアクセスしやすい色（`NO_COLOR` / 非TTYに対応）を備えた統合されたターミナルUI
- **AIデザインスタジオが独自の「ai」コマンドとして提供（v2.6）：** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — ローカルのOllamaモデルを使用して、コンテンツを構築、評価、および調整する
- 統合された意思決定レイヤー：戦闘とアビリティのスコアリングが1つの呼び出し（`selectBestAction`）にマージされる
- すべての10個の初期ワールドは`buildCombatStack()`を使用する — 実証済みの構成の基盤
- 初期AIチューニングのためのコグニション設定API（`cognition: CognitionCoreConfig | false`）
- コンテンツ作成のためのタグ分類と検証ユーティリティ
- **世界が反応する（v2.7）：** 殺害は熱を蓄積し、地区の安全性を低下させる；ラウンドごとにワールドティックが発生し、噂として表面化する隠れたプレッシャー（「囁き声が聞こえてくる…」）が生じ、エスカレートして結果とともに消滅する；約30個の作成された遭遇構成が、すべての10個の初期ワールドでゾーンへの進入時にトリガーされる — シードごとに決定的に、より危険な地区ではより多くの敵が出現し、ボス戦は保護されている
- **再び戻ってくる理由（v2.7）：** 長い間提供されてきたスキーマに基づく最小限のクエストループ — クエストはトリガーに応じて提供され、殺害／到達／進捗の目標を追跡し、経験値とアイテムを正確に1回支払う；4つの作成されたクエスト、**ジャーナル**画面、ラウンドのナレーションにおけるクエストの展開
- **装備が戦闘に影響を与える（v2.7）：** `equip`/`unequip`は実際の数値をステータスレイヤーを通じて移動させ、戦闘式はすでにそれらを読み取る — 変更された戦闘コードはない；グラディエーターの三叉戟と網は、テストでピン留めされたヒット率の変化とともに、最初から最後まで接続されている
- **シードされた実行（v2.7）：** すべての新しいセッションは、正確なリプレイコマンドとともにそのシードを出力する；`--seed <n>`はセッションをバイト単位で再現する；戦闘、抵抗、アビリティ、および戦術ロールはすべてワールドシードを使用する — そしてエンディングは実際にプレイした実行（ライブの熱、プレッシャー、派閥の蓄積、プレイヤーレベル）を読み取る
- **`buildWorldStack()`（v2.7）：** `buildCombatStack()`に加えて戦略的な構成の基盤 — 1つの呼び出しで環境、派閥、噂、地区、敗北後の影響、遭遇、およびクエストが組み立てられる；さらに、**ディレクターズ・レジャー**戦略画面、`AI_RPG_DEBUG=1`シミュレーションインスペクター、Continueと同じ権限によってゲートされた`inspect-save`、および出荷された復元パス上のモジュール保存移行の接合部
- **生きた経済に基づいて行動する（v2.8）：** `createEconomyCore`は、パックロード時に地区ごとの経済をシードし、各ラウンドでそれをティックする；新しい`sell`動詞は、`computeItemValue`（希少性／派閥／起源／違法品）を通じて戦利品の価格を設定し、地域の供給をシフトさせる。1つの書き込みワイヤーが5つのシステムを起動し、v2.7では暗黙的に提供されていた — ディレクターのマーケット概要＋派閥スコアリング、終盤の商人プリンスのアークと崩壊トリガー、および4種類の経済的プレッシャー
- **コンパニオン（v2.8）：** `recruit`動詞はパーティーを構築する — ステータス、タグ、および派閥。したがって、コンパニオンは*あなたと一緒に*戦う；コンパニオンの戦闘は、戦闘コアの迎撃メカニズム（`isAlly`が設定されるまで暗黙的）に基づいて行われ、コンパニオンは士気に応じて反応し、離脱する可能性があり、採用すると7つの待機中の消費者（終盤のCOMPANIONSロールコール、パーティーターゲット指定、NPCエージェンシー目標、好意クエスト、およびディレクターのPARTYセクション）が起動される。**このサイクルではパッシブな迎撃**（独立したターン→v2.9）
- **ディレクターは全体を把握する（v2.8）：** 新しいEQUIPMENTレジャーセクション（CLI→装備の起源への依存関係）、ディレクターズ・サマリーの終盤トレーラー、マーケット概要＋パーティーセクションがライブプロデューサーから供給されるようになり、地区の安定性と経済的なトーンが終盤のDISTRICTSセクションに表示される
- `ai-rpg-engine create-starter <name>` — 新しいゲームを構築する（スタンドアロンで、モノリポジトリの外で実行可能）；`validate` + `scaffold`コンテンツコマンド；JSONからパックをロードする
- npmで公開された初期テンプレート（`@ai-rpg-engine/starter-template`）
- 完全なテストスイート：**4975個のテスト**（繰り返しの実行で決定的な結果、テストファイルはCIで型チェックされ、カバレッジラチェットが強制される）

**未完成または不完全な点:**
- AIによる世界構築スタジオ（Ollamaレイヤー）は、シミュレーションコアよりもテストが少ないため、ローカルのOllamaデーモンが必要です。これは完全にオプションであり、エンジンと`run`ループにはネットワーク接続は必要ありません。
- ナレーション/オーディオスタックは決定的なオーディオコマンドを生成しますが、**ターミナルオーディオバックエンドはありません**。つまり、音は再生されません。これらのコマンドは、GUI/Web埋め込みのための統合フックです。
- マルチプレイヤー（1つの世界を共有する2人の人間プレイヤー）は**実装されていません**。これはネットワークレイヤーであり、意図的にスコープ外にしています。現在のプロファイルは、単一のコントローラーを対象としています。
- `replay --replay` は、再シミュレーションではなく、保存データを復元します。再シミュレーションは、ワールドの状態モジュール（ワールドの経過時間とエンカウンターの生成）がアクションログの外で進化するため、適切に機能しません。整合性はv2.8での作業です。
- クエストは、まずファンタジーおよびゾンビのスターターパックに含まれ、装備ループはまずグラディエーターに組み込まれます。これはエンジン全体に適用される仕組みであり、コンテンツの展開は意図的に行われます。
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

両方の構成フレームワークは完成しています。273個のファイルで4975回のテストが行われ、`buildCombatStack`と`buildWorldStack`の10個すべてのスターターパック、印刷されたシードに基づいて決定的なバイト単位の一致するリプレイ、完全なAIによる意思決定スコアリング、およびスキャフォールディング、実行、検証、検査を行うCLIが含まれます。**v2.8では、v2.7で構築された生きた世界に対してアクションを実行できます。取引経済があり、`sell`コマンドを使用して操作したり、仲間を募集して一緒に戦ったり、ディレクターズ・レジャーでゲーム全体を把握したりできます。各システムは単一の書き込み可能なインターフェースであり、以前は利用されていなかった約12個のコンシューマーが活用されます。**

**最近のリリースサイクル（v2.4.0〜v2.8.0）:**
- v2.4.0 — パーティー戦闘（味方ターゲティング/回復/バフ/蘇生、状態異常システム（修正子+DoT/HoT+リアクティブトリガー）、プラグインプロファイルフェーズ1、コンテンツの`validate`/`scaffold` CLI）
- v2.5.0 — エンティティごとのルール解決（混合プレイスタイルの戦闘）、`applyProfile`ローダー+エンティティごとのアビリティ、プロファイルテンプレート+`profile` CLI、および完全なヘルスパス
- v2.6.0 — `run`コマンドが実際のゲームになりました。敵は独自のAIプロファイルに基づいて行動し、勝利/敗北、保存/再開、メニューのアビリティと経験値、AIスタジオのバイナリ、およびナレーションスタックが含まれます。
- v2.7.0 — 世界が反応し、戻ってくる理由があります。熱→圧力→ナレーションによる結果、ゾーンエントリーエンカウンター、クエストループ+ジャーナル、戦闘中の装備、シードされたリプレイ可能な実行、ライブエンドゲーム入力、`buildWorldStack`、ディレクターズ・レジャー、および保存データの移行ポイント
- **v2.8.0 — 生きている世界に対してアクションを実行します。ライブ取引経済と`sell`コマンド、仲間を募集して一緒に戦う、そしてゲーム全体を把握できるディレクターズ・レジャーがあります。各システムは単一の書き込み可能なインターフェースであり、以前は利用されていなかった約12個のコンシューマーが活用されます。**

### 次（v2.9フレームワーク）

- 購入と商人在庫（通貨+ショップインベントリ）、および作成/回収ループ — 取引経済のもう半分
- 完全な仲間ターン（独立した行動、単なる迎撃ではない）、およびソーシャルコマンド — レバレッジシステムを使用した賄賂/威嚇/噂の流布
- ディレクターズ・PEOPLEセクションと仲間の士気と好感度の変化に影響を与えるNPCエージェンシーと機会コアプロデューサー。グラディエーターを超えた装備コンテンツ
- `--replay`による再シミュレーションとワールドの状態モジュールとの整合性、および残りのディレクターフォーマッターの表面
- マルチプレイヤー — 1つの世界を共有する2人の*人間*プレイヤー（ネットワークレイヤーであり、意図的に延期されています。単一コントローラーで共有されるプロファイルは、現在[`shared-profiles.ts`](docs/examples/shared-profiles.ts)として提供されています）
- シリアライズ可能な式の上書き — プロファイルごとの式の調整（式DSLに依存しています。プロファイルには現在、クロージャではなくステータスマッピングが含まれています）
- APIドキュメントの同期 — すべてのハンドブックページがv2.7のAPIを反映していることを確認します

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
