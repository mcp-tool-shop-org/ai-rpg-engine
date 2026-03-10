<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Deterministic audio cue scheduling engine for the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Part of the **Immersion Runtime** — converts narration plans into timed, prioritized audio commands.

## Install

```bash
npm install @ai-rpg-engine/audio-director
```

## What It Does

The Audio Director takes a `NarrationPlan` and produces ordered `AudioCommand[]` — ready for any audio backend to execute. It handles:

- **Priority**: Voice > SFX > Music > Ambient (configurable)
- **Ducking**: Ambient/music automatically lower when voice plays
- **Cooldowns**: Prevents SFX spam (configurable per-resource)
- **Timing**: Sequences cues relative to speech duration
- **Layer tracking**: Knows which ambient layers are active

## Usage

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

## Default Ducking Rules

| Trigger | Target | Duck Level |
|---------|--------|-----------|
| Voice | Ambient | 30% volume |
| Voice | Music | 40% volume |
| SFX | Ambient | 60% volume |

## Part of AI RPG Engine

This package is part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) monorepo. See the root README for the full architecture.

## License

MIT
