<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

AI 设计工作室，用于 AI 角色扮演游戏引擎，提供脚手架、评论、引导工作流程、调优、实验以及工作室用户体验。

连接到本地的 [Ollama](https://ollama.ai) 实例。绝不会直接修改模拟结果，所有输出默认输出到标准输出。

## 安装

```bash
npm install @ai-rpg-engine/ollama
```

## 包含内容

- **内容脚手架** — 根据主题生成房间、派系、任务、区域、地点包、遭遇包。
- **评论与修复** — 验证生成的 内容是否符合引擎的结构，如果失败则自动修复。
- **聊天界面** — 具有上下文感知路由、工具编排和记忆的交互式设计会话。
- **引导构建** — 基于会话，采用计划优先的、多步骤的世界构建工作流程。
- **模拟分析** — 带有结构化平衡分析的回放。
- **引导调优** — 根据平衡分析结果，提供结构化的调优计划，并提供逐步执行的指导。
- **场景实验** — 批量模拟运行，方差检测，参数扫描，以及前后比较。
- **工作室用户体验** — 提供仪表盘、问题浏览、实验检查、会话历史、命令发现以及新手引导。

## 使用方法

```typescript
import { translateMarkdown, ChatEngine, createSession } from '@ai-rpg-engine/ollama';

// Start a design session
const session = createSession('haunted-chapel');

// Use the chat engine
const engine = new ChatEngine({ session });
const response = await engine.chat('scaffold a haunted chapel district');
```

## 文档

- [AI 世界构建指南](AI_WORLDBUILDING.md) — 完整的流程文档。
- [手册](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

构建者：<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
