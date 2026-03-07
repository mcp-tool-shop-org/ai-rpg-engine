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

<p align="center">A simulation-first terminal RPG engine for worlds shaped by perception, cognition, and consequence.</p>

---

## それが何であるか

AI RPG Engineは、ターミナル上で動作するロールプレイングゲームを開発するためのモジュール式の実行環境です。この環境では、キャラクターの行動が情報を生成し、その情報が歪められ、キャラクターが信じている事に基づいて結果が生まれます。

このシステムは、客観的な世界の真実を維持しながら、信頼できない語り口、登場人物間の認識のずれ、そして多層的な物語構造をサポートします。また、特定のジャンルに限定されず、ダークファンタジー、サイバーパンク、その他あらゆる設定に対応しており、プラグイン可能なルールセットによって柔軟に対応できます。

## インストールする

```bash
npm install @ai-rpg-engine/core @ai-rpg-engine/modules @ai-rpg-engine/content-schema
```

## クイックスタートガイド

```typescript
import { Engine } from '@ai-rpg-engine/core';
import {
  combatCore, dialogueCore, inventoryCore, traversalCore,
  statusCore, environmentCore, cognitionCore, perceptionFilter,
} from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game', version: '1.0.0',
    engineVersion: '1.0.0', ruleset: 'fantasy',
    modules: ['combat-core', 'dialogue-core', 'cognition-core'],
    contentPacks: [],
  },
  seed: 42,
  modules: [
    combatCore(), dialogueCore(), inventoryCore(),
    traversalCore(), statusCore(), environmentCore(),
    cognitionCore(), perceptionFilter(),
  ],
});

// Submit an action
const events = engine.submitAction('attack', {
  targetIds: ['guard-01'],
});

// Every action produces structured events
for (const event of events) {
  console.log(event.type, event.payload);
}
```

## アーキテクチャ

```
Engine
  WorldStore      — entities, zones, quests, factions, RNG, event log
  ActionDispatcher — verb handlers, validators
  ModuleManager   — modules, formulas, rules, persistence
  Presentation    — channels that route (and can distort) events
```

すべての状態変化は、単一のパイプラインを経由して処理されます。

```
action --> validation --> resolution --> events --> presentation
```

## パッケージ

| パッケージ | 目的。 |
|---------|---------|
| `@ai-rpg-engine/core` | 状態、エンティティ、アクション、イベント、ルール、乱数生成、永続性。 |
| `@ai-rpg-engine/modules` | 17種類の組み込みシミュレーション機能。 |
| `@ai-rpg-engine/content-schema` | コンテンツスキーマとバリデータ。 |
| `@ai-rpg-engine/terminal-ui` | ターミナルレンダラーと入力レイヤー。 |
| `@ai-rpg-engine/cli` | 開発者向けコマンドラインインターフェース：実行、リプレイ、検査。 |
| `@ai-rpg-engine/starter-fantasy` | 「チャペル・スレッショルド」（ファンタジー体験版） |
| `@ai-rpg-engine/starter-cyberpunk` | ネオン・ロックボックス（サイバーパンク体験版） |

## 内蔵モジュール

| モジュール | その機能・役割. |
|--------|-------------|
| 戦闘スタイル、または戦闘をテーマにしたファッション。 | 攻撃/防御、ダメージ、敗北、スタミナ。 |
| 対話コア (または 対話の中核) | 条件付きのグラフベースの対話フロー。 |
| 在庫管理コア機能 | アイテム、装備、使用/装備/装備解除。 |
| トラバーサルコア (または、トラバーサルの中核部分) | エリアの移動と、エリアからの退出の確認。 |
| ステータス・コア | 持続時間と重ね掛け可能な状態異常効果。 |
| 環境コア機能。 | 動的なゾーンの特性、危険性、および減衰。 |
| 認知機能の中核部分。 | AIの信念、意図、士気、記憶。 |
| 知覚フィルター | 感覚伝達、鮮明さ、広範囲の聴取機能。 |
| 物語の権威。
物語における権威。
語り手の権威。
（文脈によっては）物語の信頼性。 | 真実と、提示、隠蔽、歪曲の関係。 |
| プログレッシブ・コア (音楽ジャンル) | 通貨に基づくレベルアップ、スキルツリー。 |
| 派閥認識 | 派閥の信条、信頼、派閥間の知識。 |
| 噂の拡散 | 情報が伝播する際に、信頼性が徐々に低下する現象。 |
| 知識の陳腐化。 | 時間経過に伴う信頼度の低下。 |
| 地区の中心部 | 空間記憶、エリア指標、アラート閾値。 |
| 信念の根拠、または信念の出所。 | 知覚、認知、噂といった様々な経路を通じた情報伝達の追跡。 |
| 観察者向けプレゼンテーション。 | 各観測者ごとのイベントフィルタリング、およびデータ変動の追跡。 |
| シミュレーション検査ツール | 実行時検査、ヘルスチェック、診断機能。 |

## 主要な設計上の決定事項

- **シミュレーションの真実は絶対である** - エンジンは客観的な状態を維持します。表示レイヤーは誤った情報を表示する可能性がありますが、世界の真実は常に正しい状態です。
- **アクションはイベントを発生させる** - 意味のある状態の変化は、常に何らかのイベントを伴います。すべての操作は、構造化された、問い合わせ可能なイベントを発生させます。
- **決定的なリプレイ** - シード値が設定された乱数生成器とアクションパイプラインにより、同一の入力に対して常に同一の結果が得られます。
- **コンテンツはデータである** - 部屋、エンティティ、会話、アイテムなどは、コードではなくデータとして定義されます。
- **ジャンルはルールセットに依存する** - エンジンは、剣とレーザーのどちらが良いかについては意見を持っていません。

## セキュリティと信頼性

AI RPG Engineは、ローカル環境でのみ動作するシミュレーションライブラリです。

- **アクセスされるデータ:** メモリ上のゲームの状態のみ。 コマンドラインインターフェース（CLI）によるセーブ機能を使用した場合、`.ai-rpg-engine/` フォルダにセーブファイルが書き込まれます。
- **アクセスされないデータ:** セーブファイル以外のファイルシステムへのアクセス、ネットワーク接続、環境変数、システムリソースは一切使用しません。
- **テレメトリー機能はありません。** データの収集や送信は一切行いません。
- **機密情報は保護されています。** エンジンは、認証情報などを読み込んだり、保存したり、送信したりすることはありません。

セキュリティポリシーの詳細については、[SECURITY.md](SECURITY.md) を参照してください。

## 要件

- Node.js >= 20
- TypeScript (ESM モジュール)

## ドキュメント

- [ハンドブック](docs/handbook/index.md) - 25章 + 4つの付録
- [設計概要](docs/DESIGN.md) - アーキテクチャの詳細解説
- [変更履歴](CHANGELOG.md)

## ライセンス

[MIT](LICENSE)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> が作成しました。
