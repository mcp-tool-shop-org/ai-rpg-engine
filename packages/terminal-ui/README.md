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

- **Event Renderer** — converts engine events into formatted terminal text
- **Input Parser** — parses player commands into engine actions
- **Color Themes** — ANSI color palettes for different game genres
- **Layout Helpers** — status bars, room descriptions, entity lists

## Usage

```typescript
import { TerminalRenderer, InputParser } from '@ai-rpg-engine/terminal-ui';

const renderer = new TerminalRenderer();
const parser = new InputParser();

// Render engine events
for (const event of events) {
  renderer.render(event);
}

// Parse player input into actions
const action = parser.parse('attack guard');
```

## Documentation

- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
