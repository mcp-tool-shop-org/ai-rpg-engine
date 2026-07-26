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

# @ai-rpg-engine/starter-merchant

> **構成例** — このスターターは、戦闘ではなく義務がゲームのサイクルとなるゲームをどのように構築するかを示しています。これは模倣するテンプレートではなく、学習するための例です。独自のゲームを構築するには、[構成ガイド](../../docs/handbook/57-composition-guide.md)を参照してください。

**ソルト・ロード台帳** — あなたは小さな貿易会社の担当者です。あなたは取引する商品を所有していません。それらに対して負債を抱えています。あなたが受け取るすべてのコインは、誰かが持っているナイフなのです。

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)スターターパックカタログの一部です。

## テーマ

商業的なプレッシャー、皮肉っぽく、そして破滅的。ソルト・ロードには不足しているものは何もありません。制約は、あなたが約束したことです。`liquidity`は、負債を呼び起こさずにデプロイできるものです。`lien`は、それができない場合に蓄積され、70になると鑑定ギルドが委託資産を受け取ります。90になると、あなたの印が奪われます。

戦闘は存在し、意図的に**不利益な取引**です。HPの最大値は24で、カタログの中で最も低い上限であり、戦闘リソースプロファイルには空の`gains`配列があります。つまり、どこにも暴力に報いる要素はありません。攻撃は流動性を消費し、ダメージを受けるとそれが減少し、勝利するとさらに5減少します。なぜなら、あなたは誰かの財産を破壊したからです。

## クイックスタート

```typescript
import { createGame } from '@ai-rpg-engine/starter-merchant';

const engine = createGame(71);

// Register with the Assay Guild — the seal is what makes consignment possible
engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
engine.submitAction('choose', { parameters: { choiceId: 'register' } });

// Read the goods, contest the terms, then hand them over
engine.submitAction('appraise', { parameters: { itemId: 'bale-of-flax' } });
engine.submitAction('move', { targetIds: ['long-quay'] });
engine.submitAction('move', { targetIds: ['crooked-stair'] });
engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

// Reconcile your own books
engine.submitAction('audit');
```

## デモンストレーションされるパターン

- **非戦闘の主要サイクル** — 5つの商業動詞がゲームを進行させます。戦闘スタックは接続されていますが、ペナルティとして価格設定されています。
- **反転したリソースプロファイル** — `CombatResourceProfile`に`gains`がなく、AIは流動性の低い担当者を離脱させるように誘導します。
- **パックローカルモジュール** — `contract-core`はスターター内に存在し、`@ai-rpg-engine/modules`内にはありません。なぜなら、消費者が正確に1つしかないからです。2番目で昇格させます。
- **新しい依存関係の代わりに注入されたオペレーション** — ステータスマシナリーと認識評価器が渡されます。これは、`createEquipmentCore`が使用するのと同じ方法です。
- **統計ではなくメカニクスを制御するツール** — ギルドシールは`consign`を付与し、台帳は`audit`を付与するため、没収により動詞が削除されます。
- **制御されていない地区をメカニズムとして使用** — ワレンズには支配的な勢力がなく、それがエスクローや救済策がない唯一の場所である理由です。

## ユニークなメカニクス

| 動詞 | その機能 |
|------|--------------|
| `appraise` | 提示価格に対して、真の価値、希少性、および来歴を読み取ります。より優れた`ledger`は範囲を狭めます。 |
| `haggle` | 価格に異議を唱えます。流動性を消費します。勝った差額は、その相手先に対するものとして記録され、次の`consign`で使用されます。 |
| `consign` | 将来の支払いに応じて商品を渡します。これにより、期日が設定された義務が作成されます。商品はすぐにあなたのインベントリから消えます。このギャップこそがリスク全体です。 |
| `underwrite` | 他の当事者のリスクを手数料で引き受けます。流動性が得られます。保証した当事者がデフォルトした場合、請求が発生し、留置権が付与されます。 |
| `audit` | あなたの帳簿を照合し、相違点を報告します。台帳が必要です。記憶から監査することはできません。 |

**義務クロック**はタイマーではなく、移動に基づいて実行されます。期限切れの委託品には、`overdueTicks × value ÷ 10`で留置権が累積されます。留置権70での没収では、アイテムIDが最も低い義務が対象となります。これは決定論的であり、ランダムではありません。

## コンテンツ

- 4つの地区にまたがる**8つのゾーン**：ソルトゲート（合法的な市場）、ドックワード（関税と遅延）、ワレンズ（現金取引）、ハイ・カウンティングハウス
- **4人のNPC** — 鑑定長のコルヴァーヌ、港湾長のドレル、仲介業者のイナヤ、会計官のナル
- **3体の敵対勢力+1体のボス** — スタンディングアカウントは生き物ではなく、あなたが到着したときの装備量に応じて段階が変化する清算です。
- **3つのクエスト** — 台帳を開く、遅れたキャラバン、スタンディングアカウント
- 14個のアイテムで、取引可能な商品と5つのユニークなツールに分割されています。

## 統計とリソース

| 統計 | 役割 |
|------|------|
| `ledger` | 算術、記憶力、詐欺の検出 |
| `tongue` | 交渉と誤誘導 |
| `standing` | 誰があなたを保証するか |

| リソース | 動作 |
|----------|-----------|
| `hp` | 最大24 — カタログの中で最も低い値です。 |
| `stamina` | 標準的なアクションエコノミー |
| `coin` | あなたが持っているもの |
| `liquidity` | 負債を呼び起こさずにデプロイできるもの |
| `lien` | **逆** — 空で始まり、没収に向かって増加します。 |

戦闘マップは`attack → tongue`、`precision → ledger`、`resolve → standing`です。最終的に武器を振るう担当者は、力ずくではなく、威圧と裏付けによってそうします。

## オン台帳プレイ（オプション）

これは`@ai-rpg-engine/ledger-adapter`の参照パックです。これに依存関係はありません。テストにより、今後も依存関係を持つことはないことが確認されていますが、そのメカニクスはアダプターを構築するために使用されたものです。`consign`はプロットデバイスを装った決済プリミティブであり、`audit`はプレイ可能な動詞としての外部検証者であり、留置権の没収はフィクションで発生する名目上の補償です。[第60章](../../docs/handbook/60-xrpl-ledger-adapter.md)と[第61章](../../docs/handbook/61-xrpl-nft-gear.md)を参照してください。

## 何を借りるか

ゲームに負債がある場合は、義務のライフサイクルを。パックにシステムが必要な場合は、注入されたオペレーションパターンを。そして、`anti-inert.test.ts`における反動的な監査 — それはすべての主要なメカニクスを実際のプレイセッションを通して追跡し、6つのメカニクスが接続され、スキーマ検証され、ユニットテストで合格し、使用されていないことを発見しました。

## ライセンス

MIT
