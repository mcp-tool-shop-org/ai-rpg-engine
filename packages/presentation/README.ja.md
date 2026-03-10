<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/presentation"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/presentation.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/presentation

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 用の、ナレーション計画スキーマ、レンダリング契約、およびプレゼンテーションの状態型。

**Immersion Runtime** の一部です。これは、ゲームの状態を構造化されたオーディオビジュアル体験に変換する、マルチモーダルなプレゼンテーションパイプラインです。

## インストール

```bash
npm install @ai-rpg-engine/presentation
```

## 機能

この機能は、生のテキストを出力する代わりに、ナレーターが **NarrationPlan**（テキスト、効果音、環境音、音楽、UI 効果、および音声合成パラメータを記述した構造化されたレシピ）を生成します。

どのフロントエンド（ターミナル、ウェブ、Electron）も、`PresentationRenderer` インターフェースを実装して、これらの計画を受け取り、実行します。

## 主要な型

| 型 | 目的 |
|------|---------|
| `NarrationPlan` | 構造化されたナレーションレシピ（テキスト + 効果音 + 環境音 + 音楽 + UI） |
| `SpeakerCue` | 音声合成パラメータ（音声ID、感情、速度） |
| `SfxCue` | 効果音トリガー（効果音ID、タイミング、強度） |
| `AmbientCue` | 環境音制御（開始、停止、クロスフェード） |
| `MusicCue` | BGM制御（再生、停止、強調、弱める） |
| `UiEffect` | ターミナル/画面の視覚効果（点滅、揺れ、フェード） |
| `VoiceProfile` | 音声合成の設定 |
| `PresentationRenderer` | レンダリング契約 — どのフロントエンドもこれを実装します。 |

## 使用方法

```typescript
import type { NarrationPlan, PresentationRenderer } from '@ai-rpg-engine/presentation';
import { validateNarrationPlan, isValidNarrationPlan } from '@ai-rpg-engine/presentation';

// Validate a plan from Claude's output
const errors = validateNarrationPlan(planFromClaude);
if (errors.length === 0) {
  // Plan is valid, execute it
}

// Type guard
if (isValidNarrationPlan(data)) {
  console.log(data.sceneText);
}
```

## AI RPG Engine の一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のモノレポの一部です。詳細なアーキテクチャについては、ルートの README を参照してください。

## ライセンス

MIT
