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

# @ai-rpg-engine/starter-gladiator

**構成例**：このサンプルは、エンジンをアリーナでの戦闘用に設定する方法を示しています。これは、参考として学ぶためのものであり、コピーするためのテンプレートではありません。独自のゲームをビルドするには、[構成ガイド](../../docs/handbook/57-composition-guide.md)を参照してください。

**アイアンコロシアム** — 崩壊しつつある帝国の地下にある、剣闘士の競技場。自由のために戦い、スポンサーを獲得し、観客の評価を生き残る。

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のスターターパックカタログの一部。

## テーマ

ローマの剣闘士の戦い + スポンサーシップと政治。観客の評価は、派手な演出によって大きく変動する。高い評価を得るとスポンサーからの贈り物があり、低い評価だと死を意味する。スポンサーは剣闘士を「血と派手さへの投資」と見なす。

## クイックスタート

```typescript
import { createGame } from '@ai-rpg-engine/starter-gladiator';

const engine = createGame();
engine.start();
```

## 示されているパターン

| 特徴 | 「Gladiator」が示している内容 |
|---------|----------------------|
| **Resources** | 効率ではなく、派手さによって変動する、不安定なメタリソース（観客の評価） |
| **Combat** | 戦闘中に状況が変化する、3段階のボスデザイン |
| **Custom verbs** | ダメージを与えない戦闘アクションとして、嘲笑やパフォーマンスがリソースに影響を与える |
| **Social** | 観客の評価の閾値によって制限される、パトロンシステム |

## 内容

- **5つのエリア:** 収容所、競技場、スポンサー席、武器庫、トンネル出口
- **3人のNPC:** ラニスタ・ブルータス（競技場管理者）、ドミナ・ヴァレリア（スポンサー）、ネルヴァ（ベテランの協力者）
- **2種類の敵:** 競技場チャンピオン、戦獣
- **1つの会話ツリー:** スポンサーシップと競技場の政治に関する観客との対話
- **1つの成長ツリー:** 競技場での名声 (観客を喜ばせる → 鉄の耐久力 → 自由の戦士)
- **1つのアイテム:** スポンサー トークン (観客の評価を10ポイント向上させる)

## 独自のシステム

| 動詞 | 説明 |
|------|-------------|
| `taunt` | 敵を挑発し、観客を興奮させる |
| `showboat` | 効率を犠牲にして、派手さと思いやりを得る |

## ステータスとリソース

| ステータス | 役割 |
|------|------|
| 力 | 生々しい力、重い攻撃 |
| 敏捷性 | スピード、回避、正確さ |
| 演技力 | 観客の操作、演劇的な戦闘 |

| リソース | 範囲 | 備考 |
|----------|-------|-------|
| HP | 0–40 | 標準体力 |
| 疲労 | 0–50 | 逆圧 — 戦闘中に上昇し、-2/ティックで回復 |
| 観客の評価 | 0–100 | 不安定 — 75%を超えるとスポンサーからの贈り物があり、25%を下回ると死 |

## 参考にするべき点

パフォーマンスリソースの経済システム（観客の評価）と、3段階のボスデザイン。観客の評価が、効率ではなく派手さによって変動する不安定なメタリソースとしてどのように機能するか、そして、アリーナチャンピオンとの戦闘が、戦闘中に状況を変化させるために段階的な移行を利用しているかについて、参考にしてください。

## ライセンス

MIT
