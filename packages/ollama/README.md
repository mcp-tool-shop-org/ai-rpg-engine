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

# @ai-rpg-engine/ollama

AI design studio for AI RPG Engine — scaffolding, critique, guided workflows, tuning, experiments, and studio UX.

Connects to a local [Ollama](https://ollama.ai) instance. Never mutates simulation truth directly — all output goes to stdout by default.

## Install

```bash
npm install @ai-rpg-engine/ollama
```

## What's Inside

- **Content scaffolding** — generate rooms, factions, quests, districts, location packs, encounter packs from a theme
- **Critique & repair** — validate generated content against engine schemas, auto-repair on failure
- **Chat shell** — interactive design session with context-aware routing, tool orchestration, and memory
- **Guided builds** — session-aware, plan-first multi-step worldbuilding workflows
- **Simulation analysis** — replay analysis with structured balance findings
- **Guided tuning** — structured tuning plans from balance findings with step-by-step execution
- **Scenario experiments** — batch simulation runs, variance detection, parameter sweeps, before/after comparison
- **Studio UX** — dashboards, issue browsing, experiment inspection, session history, command discovery, onboarding

## Usage

```typescript
import { translateMarkdown, ChatEngine, createSession } from '@ai-rpg-engine/ollama';

// Start a design session
const session = createSession('haunted-chapel');

// Use the chat engine
const engine = new ChatEngine({ session });
const response = await engine.chat('scaffold a haunted chapel district');
```

## Documentation

- [AI Worldbuilding Guide](AI_WORLDBUILDING.md) — full workflow documentation
- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
