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

# @ai-rpg-engine/starter-vampire

**構成例**：このサンプルは、ゴシック・ヴァンパイアホラーのゲームを構築するためのエンジン設定方法を示しています。これは参考例であり、そのままコピーするためのテンプレートではありません。独自のゲームをビルドするには、[構成ガイド](../../docs/handbook/57-composition-guide.md)を参照してください。

**クリムゾン・コート** — マスク舞踏会が開催される、荒れ果てた貴族の邸宅。3つのヴァンパイア一族が覇権を争いながら、飢餓感があなたを蝕もうとします。

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のスターターパックカタログの一部。

## テーマ

ゴシックホラー + ヴァンパイア貴族の政治。血への渇望は常に高まり、100に達するとプレイヤーは自我を失います。血を吸うことで渇望は満たされますが、人間性を失うことになります。ヴァンパイアは人間を「暖かさの器」と認識します。

## クイックスタート

```typescript
import { createGame } from '@ai-rpg-engine/starter-vampire';

const engine = createGame();
engine.start();
```

## 示されているパターン

| 特徴 | ヴァンパイアが示すもの |
|---------|---------------------|
| **Resources** | 対立する二つの要素（血への渇望が増し、人間性が低下）が、倫理的な経済圏を形成する。 |
| **Cognition** | ヴァンパイアは人間を異なる視点で認識する — 生きている存在に対する表示ルール。 |
| **Dialogue** | 制限付きの選択肢 — 人間性が低いと、会話のブランチが制限される。 |
| **Progression** | 超自然的な力ツリー。社会的な支配能力が段階的に上昇する。 |

## コンテンツ

- **5つのエリア:** 大広間、東の回廊、ワインセラー、月光庭園、鐘楼
- **3人のNPC:** デューク・モルヴェイン（長老ヴァンパイア）、カシウス（ライバルの新米ヴァンパイア）、使用人のエララ（人間）
- **2種類の敵:** 魔女狩り、野獣のしもべ
- **1つの会話ツリー:** デュークとの謁見。貴族の政治や飢餓のコントロールについて。
- **1つの成長ツリー:** ブラッド・マスター（鉄の意志 → 魅了術師 → 頂点捕食者）
- **1つのアイテム:** ブラッド・バイアル（渇望を15減少させる）

## 独自のシステム

| 動詞 | 説明 |
|------|-------------|
| `enthrall` | 存在感を使った超自然的な社会的支配。 |
| `feed` | 血を吸うことで渇望を軽減するが、人間性を失う。 |

## ステータスとリソース

| ステータス | 役割 |
|------|------|
| 存在感 | 社会的支配力、超自然的な権威。 |
| 生命力 | 身体能力、血を吸う効率。 |
| 狡猾さ | 欺瞞、洞察力、貴族の陰謀。 |

| リソース | 範囲 | 備考 |
|----------|-------|-------|
| HP | 0–30 | 標準体力 |
| 渇望 | 0–100 | 逆圧。常に高まり、100に達すると自我を失う。 |
| 人間性 | 0–30 | 道徳的な基準。10を下回ると会話の選択肢が制限される。 |

## 利用できるもの

対立する二つの要素（血への渇望と人間性）。 互いに逆方向に動く二つの要素が、どのように倫理的な経済圏を形成するかを研究してください。 血を吸うことで血への渇望は減少しますが、人間性が失われます。そのため、すべての資源に関する決定は、永続的な結果をもたらす物語上の選択となります。

## ライセンス

MIT
