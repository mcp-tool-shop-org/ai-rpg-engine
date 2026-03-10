<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-colony

**信号の喪失** — 遠くの植民地が地球との通信を途絶。地中の洞窟には何かが生息している。

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のスターターパックカタログの一部。

## テーマ

SF風の植民地運営 + 異星人との接触。電力は植民地全体の共有資源であり、低下するとシステムが次々と停止する。異星人は植民者を「干渉する共鳴パターン」として認識する。

## クイックスタート

```typescript
import { createGame } from '@ai-rpg-engine/starter-colony';

const engine = createGame();
engine.start();
```

## 内容

- **5つのエリア:** コマンドモジュール、水耕栽培施設、外周フェンス、信号塔、異星人の洞窟
- **2人のNPC:** Dr. バスケス（科学者）、チーフ・オカフォア（警備）
- **2種類の敵:** 侵入ドローン、共鳴体
- **1つの会話ツリー:** Dr. バスケスによる異星人の信号と植民地の政治に関する説明
- **1つの成長ツリー:** コマンド官の道 (現場エンジニア → 高度なセンサー → 不動心)
- **1つのアイテム:** 非常用バッテリー (電力20を回復)

## 独自のシステム

| 動詞 | 説明 |
|------|-------------|
| `scan` | 意識を使ってセンサーをスキャンする |
| `allocate` | 植民地のシステム間で電力を再配分する |

## ステータスと資源

| ステータス | 役割 |
|------|------|
| 工学 | システムを修理し、構築する |
| 指揮 | リーダーシップと乗組員の士気 |
| 認識 | センサーと知覚 |

| 資源 | 範囲 | 備考 |
|----------|-------|-------|
| HP | 0–25 | 標準体力 |
| 電力 | 0–100 | 植民地全体の共有資源。1ティックあたり2回復。 |
| 士気 | 0–30 | 乗組員の結束力 |

## ライセンス

MIT
