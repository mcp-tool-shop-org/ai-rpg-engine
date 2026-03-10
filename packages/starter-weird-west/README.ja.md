<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-weird-west

**砂塵の取引** — 辺境の町には、赤い岩山から何かを呼び出すカルトが隠されている。

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のスターターパックカタログの一部。

## テーマ

西部劇 + 超自然。ガンマン、砂の精霊、そして岩山のカルト。 「砂」という資源は時間とともに蓄積され、100に達すると、放浪者は砂漠に飲み込まれる。

## クイックスタート

```typescript
import { createGame } from '@ai-rpg-engine/starter-weird-west';

const engine = createGame();
engine.start();
```

## 内容

- **5つのエリア:** 放浪者の交差点、酒場、保安官事務所、赤い岩山の道、精霊の洞窟
- **2人のNPC:** 酒場の用心棒サイラス、保安官ヘイル
- **2種類の敵:** 砂の亡霊、岩山のクリーパー
- **1つの会話ツリー:** 酒場の用心棒からの、岩山のカルトに関する情報
- **1つの成長ツリー:** ガンマンの道 (素早い腕 → 鋼の意志 → 鋭い眼)
- **1つのアイテム:** セージの束 (砂を20減少させる)

## 独自のシステム

| 動詞 | 説明 |
|------|-------------|
| `draw` | 抜き打ちの決闘 — 反射の対決 |
| `commune` | 知識を使って精霊と会話する |

## ステータスと資源

| ステータス | 役割 |
|------|------|
| グリット | タフネスと意志力 |
| ドロー・スピード | 反射と反応速度 |
| 知識 | 超自然に関する知識 |

| 資源 | 範囲 | 備考 |
|----------|-------|-------|
| HP | 0–30 | 標準的な体力 |
| 精神力 | 0–20 | 精神的な強さ。1ティックごとに回復する。 |
| 砂 | 0–100 | **逆圧** — 蓄積される。100に達すると死亡する。 |

## ライセンス

MIT
