<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/audio-director"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/audio-director.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/audio-director

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 用の、決定論的なオーディオキュー（効果音）スケジュールエンジン。

**Immersion Runtime** の一部であり、ナレーション計画を、時間指定された優先順位付けされたオーディオコマンドに変換します。

## インストール

```bash
npm install @ai-rpg-engine/audio-director
```

## 機能

Audio Director は、`NarrationPlan` を受け取り、実行可能な `AudioCommand[]` の順序付けされたリストを生成します。 以下の機能を処理します。

- **優先順位**: 音声 > 効果音 > 音楽 > 環境音 (設定可能)
- **音量調整**: 音声が再生される際に、環境音/音楽が自動的に音量を下げる
- **クールダウン**: 効果音の連続再生を防ぐ (リソースごとに設定可能)
- **タイミング**: 効果音を、音声の長さに合わせて調整
- **レイヤー追跡**: どの環境音レイヤーがアクティブであるかを認識

## 使用方法

```typescript
import { AudioDirector } from '@ai-rpg-engine/audio-director';
import type { NarrationPlan } from '@ai-rpg-engine/presentation';

const director = new AudioDirector({
  defaultCooldownMs: 2000,
});

// Schedule commands from a narration plan
const commands = director.schedule(plan);

// Execute commands through your audio backend
for (const cmd of commands) {
  await audioBackend.execute(cmd);
}

// Check cooldowns
director.isOnCooldown('alert_warning'); // true if recently played

// Clear cooldowns on scene change
director.clearCooldowns();
```

## デフォルトの音量調整ルール

| トリガー | 対象 | 音量調整レベル |
|---------|--------|-----------|
| 音声 | 環境音 | 音量30% |
| 音声 | 音楽 | 音量40% |
| 効果音 | 環境音 | 音量60% |

## AI RPG Engine の一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のモノレポの一部です。 詳細なアーキテクチャについては、ルートの README を参照してください。

## ライセンス

MIT
