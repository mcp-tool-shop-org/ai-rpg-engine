<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/terminal-ui

Terminal renderer and input layer for AI RPG Engine — turn event streams into readable terminal output.

## Install

```bash
npm install @ai-rpg-engine/terminal-ui
```

## What's Inside

- **Screen Renderer** — composes the full game screen from world state: labeled sections (Scene / Status / Log / Actions), an HP bar HUD (`HP 12/20 [######----]`), and a grouped, aligned action menu
- **Event Renderer** — converts engine events into player-grade log lines
- **Input Parser** — parses numbered menu picks and freeform text into engine actions
- **Accessible Color** — optional ANSI emphasis that auto-disables for `NO_COLOR`, piped output, and dumb terminals; every screen is byte-identical plain text with codes stripped, so nothing is ever communicated by color alone

## Usage

```typescript
import {
  renderFullScreen,
  parseActionSelection,
  parseTextInput,
} from '@ai-rpg-engine/terminal-ui';

// Compose the whole screen (color auto-detected; pass { color: false } to force plain)
console.log(renderFullScreen(world, world.eventLog.slice(-8)));

// Parse player input into actions
const picked = parseActionSelection('3', world);      // numbered menu
const typed = parseTextInput('attack warden', world); // freeform text
```

## Narration & Audio (integration hook)

`TurnPresenter` composes the presentation stack for each turn: it builds a validated `NarrationPlan` from the turn's events (tone/urgency from event kinds, sfx mapped through soundpack-core's cue table) and schedules it through the audio-director.

```typescript
import { TurnPresenter } from '@ai-rpg-engine/terminal-ui';

const presenter = new TurnPresenter(); // hold one per session (real cooldowns)
const { plan, styledNarration, audioCommands } = presenter.present(world, turnEvents);

console.log(styledNarration); // narration emphasized by tone/urgency (Stage-D palette)
// audioCommands → hand to your audio backend
```

**Honest ceiling:** this is a terminal — there is no terminal audio backend, and nothing here plays a sound. The terminal renders the plan's *text*. `audioCommands` (deterministic, cooldown/ducking-resolved, canonical soundpack `resourceId`s) are exposed so a GUI/web embedder with real audio output can play them via the `PresentationRenderer` contract from `@ai-rpg-engine/presentation`.

## Documentation

- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
