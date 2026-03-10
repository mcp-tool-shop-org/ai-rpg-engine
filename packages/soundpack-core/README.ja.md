<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/soundpack-core.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/soundpack-core

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 用の、コンテンツベースのサウンド登録機能とパック仕様。

**Immersion Runtime** の一部。オーディオアセットをタグ付けされた、検索可能なコレクションとして管理します。

## インストール

```bash
npm install @ai-rpg-engine/soundpack-core
```

## 機能

サウンドパックは、発見を容易にするための豊富なメタデータを持つ、オーディオファイル（効果音、環境音、音楽、音声）のコレクションです。登録機能は、タグベースの検索、強度フィルタリング、および感情マッチングをサポートしています。

[voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) のプロシージャルエフェクトに対応した、**コアサウンドパック**が付属しています。

## 使用方法

```typescript
import { SoundRegistry, CORE_SOUND_PACK } from '@ai-rpg-engine/soundpack-core';

const registry = new SoundRegistry();
registry.load(CORE_SOUND_PACK);

// Query by domain
const ambient = registry.query({ domain: 'ambient' });

// Query by tags + mood
const tenseSfx = registry.query({ tags: ['alert'], mood: ['dread'] });

// Get specific entry
const entry = registry.get('ui_success');
console.log(entry?.voiceSoundboardEffect); // "chime_success"
```

## コアサウンドパック

voice-soundboard のプロシージャルエフェクトにマッピングされた13個のエントリ：

| ID | エフェクト | ドメイン | タグ |
|----|--------|--------|------|
| `ui_notification` | `chime_notification` | sfx | ui, alert |
| `ui_success` | `chime_success` | sfx | ui, positive |
| `ui_error` | `chime_error` | sfx | ui, negative |
| `ui_click` | `click` | sfx | ui, input |
| `ui_pop` | `pop` | sfx | ui, light |
| `ui_whoosh` | `whoosh` | sfx | ui, transition |
| `alert_warning` | `warning` | sfx | alert, caution |
| `alert_critical` | `critical` | sfx | alert, danger |
| `alert_info` | `info` | sfx | alert, info |
| `ambient_rain` | `rain` | ambient | weather, calm |
| `ambient_white_noise` | `white_noise` | ambient | background |
| `ambient_drone` | `drone` | ambient | dark, tension |

## カスタムサウンドパック

`SoundPackManifest` を提供することで、独自のサウンドパックを作成できます。

```typescript
import type { SoundPackManifest } from '@ai-rpg-engine/soundpack-core';

const myPack: SoundPackManifest = {
  name: 'medieval-tavern',
  version: '1.0.0',
  description: 'Tavern ambience and interaction sounds',
  author: 'your-name',
  entries: [
    {
      id: 'tavern_chatter',
      tags: ['ambient', 'social'],
      domain: 'ambient',
      intensity: 'low',
      mood: ['calm', 'social'],
      durationClass: 'long-loop',
      cooldownMs: 0,
      variants: ['tavern_chatter_01.wav'],
      source: 'file',
    },
  ],
};

registry.load(myPack);
```

## AI RPG Engine の一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のモノレポの一部です。詳細なアーキテクチャについては、ルートの README を参照してください。

## ライセンス

MIT
