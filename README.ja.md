<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPG Engine

決定的なRPGシミュレーションを構築するためのTypeScriptツールキット。ステータスを定義し、モジュールを選択し、戦闘スタックを構成し、コンテンツを作成します。エンジンは、状態、イベント、乱数生成、アクションの解決、およびAIの意思決定を処理します。すべての実行は再現可能です。

これは、完成したゲームではなく、**コンポジションエンジン**です。12個のスターターワールドは例であり、そこから学習して再構築できる、分解可能なパターンです。ゲームでは、エンジンから必要なサブセットを使用します。

---

## これは何なのか

- **モジュールライブラリ** — 30以上のエンジンモジュールがあり、戦闘、知覚、認知、派閥、噂、移動、仲間などをカバー
- **コンポジションツールキット** — `buildCombatStack()`で戦闘を約7行で構成し、`new Engine({ modules })`でゲームを起動
- **シミュレーションランタイム** — 決定的なティック、再生可能なアクションログ、シードされた乱数生成
- **AIデザインスタジオ**（オプション）— スキャフォールディング、批評、バランス分析、調整、Ollamaを使用した実験
- **オプションのオンレジャーレイヤー** — `@ai-rpg-engine/ledger-adapter`は、ゲームのコインと取引可能なアイテムを実際のXRPL **テストネット**トークンで裏付け、チェックポイントで決済します。これは、決定的なコアとは完全に独立しています（オプトイン。これがない場合でも、実行はバイト単位で同一になります）。
- **オプションのビジュアルホスト** — `@ai-rpg-engine/sidecar`にGodot 4クライアント[`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage)を追加。エンジンはまだピクセルを出力しません。ステージは2:1のダイメトリック（二等角投影）の港を描画し、`felt`のオーディオを再生します。占有はゾーンIDのままです。

## これは何ではないのか

- 完成したゲームを 1 本提供するものではありません。今日すぐ `run` で動かせるプレイ可能なスターターワールドを 12 個、例として同梱しており、エンジンは*自分の*ゲームを組み立てるためのツールキットです
- これはグラフィックエンジンではありません。ピクセルではなく、構造化されたイベントを出力します。描画は、ホスト（ターミナルまたはGodot）の役割です。
- ストーリーを自動生成するものではなく、世界をシミュレーションするものです。物語は、そのメカニズムから自然に生まれます。

---

## 現在の状況

**動作し、テスト済みのもの:**
- シミュレーションのコア: 決定論的なティック、シード付き RNG、バイト単位で同一のリプレイ、セーブと再開
- パーティー戦闘: 味方を対象にする行動、状態効果、味方を巻き込まない範囲攻撃、独自の AI 意図プロファイルで行動する敵
- 反応する世界: 派閥、噂、交易経済、仲間、独自の目標を持つ名前付き NPC、そして行動の結果
- 12 個のスターターワールドすべて。今日から `run` で遊べます
- World Forge のパック。コンテンツとして読み込めます
- Godot 4 ホスト [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage)。サイドカー経由で、`felt` オーディオキューに対応します
- オプトインの XRPL テストネット台帳レイヤー

**未完成または荒削りなもの:**
- AI デザインスタジオ (Ollama) は任意で、シミュレーションのコアほどテストされていません
- ターミナルのオーディオバックエンドはありません。音を鳴らすのは Godot のステージだけです
- マルチプレイヤー（1 つの世界に 2 人の人間のプレイヤー）は作られていません
- `replay --replay` は再シミュレーションではなくセーブを復元します。これは設計どおりです
- ハンドブックの一部のページは最新の API に追いついていません

リリースの全履歴は [CHANGELOG.md](CHANGELOG.md) にあります。

---

## その外観

バンドルされた端末UIは、各ターンをラベル付きのセクション（シーン、ステータス、ログ、アクション）に構成し、一目でわかるHUDを提供する。デフォルトではプレーンテキストで出力され、TTY（ダメージは赤、回復は緑、拒否は黄）で意味のある色を追加し、`NO_COLOR`と非TTYパイプを尊重する。すべてのキューはテキストにも含まれており、色だけで表現されることはない。

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

## インストールとプレイ

スターターをプレイするか、端末から独自のゲームを構築する。

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

`run`ループは、実際のターンベースのセッションである。敵は独自のAIプロファイルに基づいて行動し、アビリティと経験値はメニューに表示され、保存して再開でき、戦闘は勝利または敗北で終了する。すべてのゲームは決定論的であり、再生可能である。

オプションとして、AIデザインスタジオを独自のコマンドとしてインストールできる。

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

スタジオは、ローカルの[Ollama](https://ollama.com)デーモンと通信する。まず、`ollama serve`と`ollama pull qwen2.5-coder`を実行する。これは完全にオプションであり、エンジンと`run`ループにはネットワークは不要。

コンテナイメージは、CIおよびサンドボックス化された実行のために、GHCRに`ghcr.io/mcp-tool-shop-org/ai-rpg-engine`として公開される。

---

## クイックスタート

コードで独自のゲームを構築することを希望する場合、エンジンをモジュールから構成する。

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

完全なワークフローについては、[構成ガイド](site/src/content/docs/handbook/57-composition-guide.md)を参照するか、新しいスターターを構築する。

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## アーキテクチャ

| レイヤー | 役割 |
|-------|------|
| **Core Runtime** | 決定論的なエンジン — ワールドの状態、イベント、アクション、ティック、RNG、リプレイ |
| **Modules** | 30以上の構成可能なシステム — 戦闘、知覚、認知、派閥、移動、仲間など |
| **Content** | エンティティ、ゾーン、ダイアログ、アイテム、アビリティ、ステータス — 作成者が作成 |
| **AI Studio** | オプションのOllamaレイヤー — スキャフォールディング、批評、バランス分析、調整、実験 |

---

## XRPL台帳アダプター（オプション）

`@ai-rpg-engine/ledger-adapter`は、ゲームの**プレイヤーが所有する取引可能なレイヤー**（`coin`の残高と消費可能なインベントリ。これは、`trade-core`の`buy`/`sell`の動詞によってすでに移動される）を**XRPLテストネット**にバインドする**オプションの**パッケージである。これにより、これらのアセットは、実際のオンチェーンのトークンによって裏付けられ、チェックポイントで決済される。アダプターが存在しない場合、それは今日出荷されるオフラインエンジンそのものである。

**決定論の不変性（最も重要な点）。** アダプターは*サイドチャネル*であり、シミュレーションの一部ではない。

- **決定論的なティック内では決して呼び出されない**。**チェックポイント**（保存、町/市場への入り口、チャプターの区切り）でのみ呼び出される。
- `@ai-rpg-engine/core`または`@ai-rpg-engine/modules`のいずれにも、アダプターをインポートするコードはない（エンジンへの唯一の依存関係は、コンパイル時の`import type`である）。
- **アダプターの有無にかかわらず、実行はバイト単位で同一である。** ファイアウォールテストでは、実際の `starter-pirate` の `createGame()` 商人ループを 2 つのエンジン（片方はアダプターを有効にしてチェックポイントで決済し、もう片方はアダプターなし）で実行し、2つのワールドが完全に等しいことを確認する。シード0のリプレイは変更されない。

**統合レベル — ゲームは、その設計に応じて、アダプターをどの程度深く組み込むかを決定する。** ファイアウォールは*決定論*の境界であり、統合を禁止するルールではない。上記の不変性は、すべてのレベルで保持される。

| レベル | アダプターに依存するもの | 適合性 |
|-------|-----------------------------|------|
| **L0 — 外部オブザーバー** | ゲーム内には何も依存しない。アダプターは、チェックポイントで外部から接続され、ゲームはそれを認識しない。 | 既存のゲームへの後付け（出荷される海賊デモ）。 |
| **L1 — ゲーム駆動型のチェックポイント** | ゲーム自体の保存/町/メタプログレッションフローが、定義された時点でアダプターを呼び出す。 | ゲームが、意図的な台帳の瞬間を必要とする場合。 |
| **L2 — 台帳ネイティブ設計** | ゲームの経済またはアイデンティティは、オンチェーンの所有権（永続的な発行者、実際の市場）を中心に設計されている。 | 台帳を重視した商人ゲーム。 |

リプレイを安全に保つための区別は、「どのパッケージがアダプターをインポートするか」ではなく、「呼び出しがティック内にあるかどうか」である。ゲームパッケージは、アダプターを自由にインポートして駆動してもよいが、すべての呼び出しが、シード駆動のリプレイループの外にあるチェックポイントで行われる必要がある。

**3つのプレイモード。** `offline`（デフォルト — チェーンなし、出荷されるエンジン）· `ledger`（テストネットの残高によって裏付けられたコイン/アイテム、チェックポイントで決済）· `diary`（オフラインでプレイし、次に実行の状態ハッシュを台帳に固定して、改ざん防止のレシートを作成する）。

**台帳に記録されているもの。** `coin` → トラストライン上の発行通貨の借用証；
消耗品 → 交換可能なトークン；チェックポイントにおける純取引量の差 → XLS-85トークンエスクローによる決済。ユニークな装備は XLS-20 NFT として出荷され、（v3.3）、遺物の成長により、変更可能な NFT のメタデータが XLS-46 `NFTokenModify` を介してその場で更新される。これは v3.4 の時点から実際のゲームプレイによって駆動される。抽象的な地区経済（`economy-core`）は *変更されない* — 純粋なシミュレーションのまま維持される。

**安全対策。** テストネットのみで使用。コード内に「メインネットでは不可能」という構造的なガード（設定フラグではない）を設ける。ウォレットのシードは、Git で無視される secrets 側のファイルに保存され、決してセーブファイルには保存されない。決済はべき等であり、再試行パス上では安全にリソースを保護する。証明は、**実際のオンチェーンメモ**（エンジン独自の文字列ではない）を検証する。チェーンにアクセスできない場合、実行は単に継続され、*アンカーされていない*とマークされる。

**実証済みの稼働。** 実際の `starter-pirate` マーチャントの実行 — サーベルを販売し、大砲の砲弾を購入する — トークンエスクローを介して XRPL テストネットで決済を行い、次に `reconcile()` が、エンジン内の経済に対して、台帳上の残高とメモを確認する（すべてのトークンに対してリソース保護が有効）。台帳は、エンジンとは異なるシステムファミリーであるため、エンジンはそれを偽装することはできない。整合性は、真の外部検証者によって行われる。テストネットのみで使用。アセットはゲームスコープのレシートであり、有価証券ではない。

---

## 戦闘システム

5つのアクション（攻撃、防御、離脱、態勢、位置変更）、4つの戦闘状態（防御、体勢を崩す、無防備、逃走）、4つの交戦状態（交戦、防御、後方、孤立）。3つのステータス次元がすべての計算を駆動するため、素早い剣士は、重装の戦士や冷静な歩哨とは異なる動きをする。

AI 相手は、統一された意思決定スコアリングを使用する。戦闘アクションと能力が、単一の評価で競い合い、設定可能な閾値により、些細な能力の乱用を防ぐ。

パックの作成者は、`buildCombatStack()` を使用して、ステータスマッピング、リソースプロファイル、およびバイアスタグから戦闘を構成する。 [戦闘の概要](site/src/content/docs/handbook/49a-combat-overview.md) および [パック作成者ガイド](site/src/content/docs/handbook/55-combat-pack-guide.md) を参照。

---

## 能力

ジャンルに特化した能力システム。コスト、ステータスチェック、クールダウン、および型付きの効果（ダメージ、回復、ステータスの付与、浄化）を持つ。ステータス効果は、抵抗/脆弱性のプロファイルを持つ 11 タグのセマンティック語彙を使用する。AI は、自己/AoE/単一ターゲットのパスを認識してスコアリングする。

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
| [`@ai-rpg-engine/core`](packages/core) | 決定論的なシミュレーションランタイム — ワールドの状態、イベント、乱数生成、ティック、アクションの解決 |
| [`@ai-rpg-engine/modules`](packages/modules) | 30 以上の組み合わせ可能なモジュール — 戦闘、知覚、認知、派閥、噂、移動、仲間、NPC の行動、戦略マップ、アイテム認識、偶発的な機会、アーク検出、ゲーム終了トリガー |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | ワールドコンテンツの標準的なスキーマとバリデーター |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | キャラクターの成長、負傷、マイルストーン、評判 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | アーキタイプの選択、ビルドの生成、初期装備 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装備の種類、アイテムの起源、および遺物の成長 — これには、実際のゲームプレイから装備の履歴を記録し、アイテムが称号とレベルを獲得できるようにする、オプションのモジュール `item-chronicle-core` が含まれる |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | セッション間のメモリ、関係の効果、キャンペーンの状態 |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | 噂のライフサイクル、変異メカニズム、拡散の追跡 |
| [`@ai-rpg-engine/presentation`](packages/presentation) | ナレーションプランのスキーマ、レンダリング契約、音声プロファイル |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | キューのスケジュール、優先順位、ダッキング（音量減衰）、クールダウンロジック |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | サウンドパックのマニフェスト、コンテンツアドレス指定可能なレジストリ |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | パックの登録、評価、パックの検出 |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | ポートレート、アイコン、メディアのコンテンツアドレス指定ストレージ |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | プラグイン可能なプロバイダーを備えた、ヘッドレスのポートレート生成 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | オプションの AI 作成 — スキャフォールディング、批評、ガイド付きワークフロー、調整、実験 |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI：ゲームの実行、スターターの作成、セーブの検査 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | ターミナルレンダラーと入力レイヤー |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | 商業スターター — 台帳アダプターの参照パックであり、それ自体には依存関係がない |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | 泥棒狩りスターター — ループとしての追跡、および都市のどちら側があなたのためにドアを開けるか |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **オプション** — プレイヤーが所有する取引可能なレイヤー（コイン/インベントリ/取引）の、XRPL テストネットでの決済（チェックポイントでの XLS-85 トークンエスクローを介して）、完全に決定論的なコアの外で行われる |

### スターターの例

12 個のスターターワールドは、**構成の例**である。これらは、エンジンモジュールを組み合わせて完全なゲームを作成する方法を示す。それぞれが異なるパターン（ステータスマッピング、リソースプロファイル、交戦構成、能力セット）を示す。各スターターの README を参照して、「示されたパターン」と「借用できるもの」を確認する。

| スターター | ジャンル | 主なパターン |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | ダークファンタジー | 最小限の戦闘、対話主導 |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | サイバーパンク | リソース、交戦ロール |
| [`starter-detective`](packages/starter-detective) | ビクトリア朝のミステリー | ソーシャル優先、知覚重視 |
| [`starter-pirate`](packages/starter-pirate) | 海賊 | 海戦 + 近接戦闘、マルチゾーン |
| [`starter-zombie`](packages/starter-zombie) | ゾンビサバイバル | 希少性、感染リソース |
| [`starter-weird-west`](packages/starter-weird-west) | 奇妙な西部劇 | パックバイアス、安全地帯での回復 |
| [`starter-colony`](packages/starter-colony) | SF コロニー | 隘路、待ち伏せゾーン |
| [`starter-ronin`](packages/starter-ronin) | 封建時代の日本 | 隠された通路、複数の保護者ロール |
| [`starter-merchant`](packages/starter-merchant) | 商業 | 義務をループとして、戦闘をペナルティとして価格設定 |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | 追跡 | お金のために人々を狩る。暴力は騒がしいが、禁止されているわけではない |
| [`starter-vampire`](packages/starter-vampire) | ヴァンパイアホラー | 血のリソース、社会的操作 |
| [`starter-gladiator`](packages/starter-gladiator) | 歴史的なグラディエーター | アリーナでの戦闘、群衆の支持 |

---

## ドキュメント

| リソース | 説明 |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | 新しいゲームをスキャフォールディングする — CLI または手動テンプレートルート |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | エンジンモジュールを組み合わせて、独自のゲームを作成しましょう。 |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | エンティティごとのルール解決 — 混合プレイスタイルの戦闘、`applyProfile`、プロファイルテンプレート、`profile` CLI |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | オプトインのオンレジャー決済 — 決定論的なファイアウォール、L0/L1/L2統合レベル、プレイモード、安全対策、実証済みの海賊デモ |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | 6つの戦闘の柱、5つのアクション、一目でわかる状態 |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | 段階的なbuildCombatStack、ステータスマッピング、リソースプロファイル |
| [Visual Clients](site/src/content/docs/handbook/66-visual-clients.md) | サイドカーホスト、felt ペイロード、Godot のダイメトリック（二等角投影）の港 — 表示上の演出は自由だが、所在（占有）はゾーン ID のまま |
| [Handbook](site/src/content/docs/handbook/index.md) | 包括的なハンドブック — すべてのシステムと4つの付録 |
| [Composition Model](docs/composition-model.md) | 6つの再利用可能なレイヤーとその組み合わせ方 |
| [Examples](docs/examples/) | 実行可能なTypeScriptの例（型チェック済みで、CIで動作とテスト済み） — エンティティごとの混合パーティー、共有プロファイル、クロスワールド、ゼロから |
| [Design Document](docs/DESIGN.md) | アーキテクチャの詳細 — アクションパイプライン、真実と表現 |
| [Philosophy](PHILOSOPHY.md) | 決定論的な世界、証拠に基づいた設計、アシスタントとしてのAI |
| [Changelog](CHANGELOG.md) | リリース履歴 |

---

## ロードマップ

### 現在の状況

2 つの構成の柱はどちらも完成しています。12 個のスターターワールドすべてが `buildCombatStack` **と** `buildWorldStack` で動作し、表示されたシードでのリプレイは決定論的でバイト単位で同一です。AI の意思決定スコアリングも完成しており、CLI でスキャフォールド、実行、検証、検査ができます。

リリースの全履歴は [CHANGELOG.md](CHANGELOG.md) にあります。

### 次

残っているのは、後のサイクルで行う作業です。

- prosperous（繁栄）系統のアンビエントベッド（環境音トラック）（トーンブリッジとゾーンごとの抽選は出荷済みですが、CORE サウンドパックにはまだ prosperous のステムがありません）
- マルチプレイヤー — 2人の*人間*プレイヤーが1つの世界を共有（ネットワークレイヤー、意図的に延期。単一コントローラーでの共有プロファイルは現在 [`shared-profiles.ts`](docs/examples/shared-profiles.ts) として提供されています）
- シリアライズ可能な式の上書き — プロファイルごとの式調整（式DSLが完了するまで保留。プロファイルは現在、ステータスマッピングを保持しており、クロージャではありません）

### 目的：プラグインプロファイル

エンジンの最終的な目標は、**ユーザー定義のプロファイル**です。これは、任意のゲームにスロットインできる、ポータブルなバンドルです。プロファイルは、ステータスマッピング、リソースの動作、AIのバイアスタグ、および能力を、1つのインポート可能なユニットにパッケージ化します。v2.5では、1つの世界内のエンティティはそれぞれ独自のプロファイルを保持し、エンティティごとに戦闘を解決できます。`might`のファイターと`will`のミスティックが1つのパーティーを共有し、それぞれが独自のプレイスタイルを持ちます。

スキーマ、`applyProfile`ローダー、エンティティごとの能力解決、およびクロスプロファイル検証はすべてリリースされています。残っているのは、2人の*人間*プレイヤー（単なる2つのエンティティではなく）が1つの世界を共有できるようにするマルチプレイヤーです。これはネットワークレイヤーです。[プロファイルロードマップ](docs/profile-roadmap.md)と[feature-architecture.md](docs/feature-architecture.md)を参照して、設計を確認してください。

---

## 哲学

AI RPG Engineは、次の3つのアイデアに基づいて構築されています。

1. **決定論的な世界** — シミュレーションの結果は再現可能でなければなりません。
2. **証拠に基づいた設計** — 世界のメカニズムは、シミュレーションを通じてテストされるべきです。
3. **AIはアシスタントであり、権威ではありません** — AIツールは、設計の生成と批判を支援しますが、決定論的なシステムに取って代わるものではありません。

完全な説明については、[PHILOSOPHY.md](PHILOSOPHY.md) を参照してください。

---

## セキュリティ

コアエンジンは、**ローカルでのみ動作するシミュレーションライブラリ**です。テレメトリ、ネットワーク、秘密情報は一切使用しません。保存ファイルは、明示的に要求された場合にのみ、`.ai-rpg-engine/` に保存されます。2つの**オプション**のレイヤーがアウトバウンドパスを追加しますが、それらを呼び出した場合にのみ有効になります。

- AIレイヤー（`@ai-rpg-engine/ollama`）は、**ローカルの**Ollamaデーモンと通信します。オプションの機能（RAG用、`webfetch`）は、SSRFガードによって制限されており、ループバック、リンクローカル、CGNAT、クラウドメタデータ、およびそれらに相当するもの（IPv6-tunnelled）へのアクセスをブロックします。
- レジャーレイヤー（`@ai-rpg-engine/ledger-adapter`）は、**XRPLテストネット**に接続します。ただし、テストネットのみです。コード構造上メインネット接続を不可能にするガード（設定フラグではありません）により、構築時にテストネット以外のホストは拒否されます。ウォレットのシードは、Gitで無視される秘密情報コンテナに保存され、決して保存ファイルには保存されません。また、決定的なコアはアダプターをインポートしません。

詳細については、[SECURITY.md](SECURITY.md) を参照してください。

## 要件

- Node.js >= 20
- TypeScript（ESMモジュール）

## ライセンス

[MIT](LICENSE)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>によって作成。
