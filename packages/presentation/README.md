<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Narration plan schema, render contracts, and presentation state types for the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Part of the **Immersion Runtime** — the multi-modal presentation pipeline that transforms game state into structured audio-visual experiences.

## Install

```bash
npm install @ai-rpg-engine/presentation
```

## What It Does

Instead of outputting raw prose, the narrator produces a **NarrationPlan** — a structured recipe describing text, sound effects, ambient layers, music cues, UI effects, and voice synthesis parameters.

Any frontend (terminal, web, Electron) implements the `PresentationRenderer` interface to receive and execute these plans.

## Key Types

| Type | Purpose |
|------|---------|
| `NarrationPlan` | Structured narration recipe (text + SFX + ambient + music + UI) |
| `SpeakerCue` | Voice synthesis parameters (voice ID, emotion, speed) |
| `SfxCue` | Sound effect trigger (effect ID, timing, intensity) |
| `AmbientCue` | Ambient layer control (start, stop, crossfade) |
| `MusicCue` | Background music control (play, stop, intensify, soften) |
| `UiEffect` | Terminal/screen visual effects (flash, shake, fade) |
| `VoiceProfile` | Voice configuration for speech synthesis |
| `PresentationRenderer` | Render contract — any frontend implements this |

## Usage

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

## Part of AI RPG Engine

This package is part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) monorepo. See the root README for the full architecture.

## License

MIT
