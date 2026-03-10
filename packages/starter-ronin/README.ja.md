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

# @ai-rpg-engine/starter-ronin

**Jade Veil** — 緊迫した政治会議が行われる封建時代の城。ある領主が毒殺された。名誉が失われる前に、犯人を見つけ出せ。

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のスターターパックカタログの一部。

## テーマ

封建時代のミステリー + 権力闘争。名誉は脆く、誤った告発は大きな代償を伴い、回復は非常に困難。すべての質問には重みがあり、すべての告発には結果が伴う。暗殺者は、浪人を「主を持たない刃—予測不可能」と見なしている。

## クイックスタート

```typescript
import { createGame } from '@ai-rpg-engine/starter-ronin';

const engine = createGame();
engine.start();
```

## コンテンツ

- **5つのエリア:** 城門、大広間、茶庭、領主の部屋、隠し通路
- **3人のNPC:** 武田領主（毒殺された領主）、姫君ヒミコ（容疑者）、裁判官佐藤（捜査官）
- **2人の敵:** 影の暗殺者、堕落した武士
- **1つの会話ツリー:** 裁判官による毒殺事件と裁判所の関係者に関する説明
- **1つの成長ツリー:** 剣の道 (Steady Hand → Inner Calm → Righteous Fury)
- **1つのアイテム:** 香炉セット (5のキを回復)

## 独自のシステム

| 動詞 | 説明 |
|------|-------------|
| `duel` | 規律を用いた正式な武術の挑戦 |
| `meditate` | 1ターンを消費して、キと精神を回復 |

## ステータスとリソース

| ステータス | 役割 |
|------|------|
| 規律 | 武術スキル、剣技、集中力 |
| 洞察力 | 状況認識、推理、意図の察知 |
| 精神 | 社会的統制、感情のコントロール |

| リソース | 範囲 | 備考 |
|----------|-------|-------|
| HP | 0–30 | 標準体力 |
| 名誉 | 0–30 | 脆い。誤った告発は-5、回復は困難 |
| Ki | 0–20 | 精神エネルギー、1ティックごとに2回復 |

## ライセンス

MIT
