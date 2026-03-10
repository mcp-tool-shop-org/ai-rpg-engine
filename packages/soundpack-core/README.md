<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Content-addressable sound registry and pack specification for the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Part of the **Immersion Runtime** — manages audio assets as tagged, queryable collections.

## Install

```bash
npm install @ai-rpg-engine/soundpack-core
```

## What It Does

Sound packs are loadable collections of audio entries (SFX, ambient loops, music, voice) with rich metadata for discovery. The registry supports tag-based queries, intensity filtering, and mood matching.

Ships with a **core sound pack** that maps to [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) procedural effects.

## Usage

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

## Core Sound Pack

13 entries mapped to voice-soundboard procedural effects:

| ID | Effect | Domain | Tags |
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

## Custom Sound Packs

Create your own sound pack by providing a `SoundPackManifest`:

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

## Part of AI RPG Engine

This package is part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) monorepo. See the root README for the full architecture.

## License

MIT
