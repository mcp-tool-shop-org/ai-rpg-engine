<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI 角色扮演游戏引擎

专为构建、分析和平衡角色扮演游戏世界的模拟原生工具包。

AI 角色扮演游戏引擎结合了确定性模拟运行时和 AI 辅助设计工作室，让创作者可以构建世界、通过模拟进行测试，并根据证据进行改进，而不是凭空猜测。

> 传统的工具可以帮助你编写故事。
> AI 角色扮演游戏引擎可以帮助你**测试世界**。

---

## 主要功能

```
build → critique → simulate → analyze → tune → experiment
```

你可以生成世界内容，评估设计，运行确定性模拟，分析游戏行为，调整机制，在大量不同的初始状态下运行实验，并比较结果。 每一个结果都是可重现、可检查和可解释的。

---

## 核心功能

### 确定性模拟

一个基于时间步进的模拟引擎，用于角色扮演游戏世界。 包括世界状态、事件系统、感知和认知层、派系信仰传播、谣言系统、区域指标、可重复的游戏记录以及确定性随机数生成器。 每次运行都可以完全重现。

### AI 辅助世界构建

一个可选的 AI 层，可以根据主题生成房间、派系、任务和区域。 它可以评估设计，纠正模式错误，提出改进建议，并指导多步骤的世界构建流程。 AI 永远不会直接修改模拟状态，它只生成内容或建议。

### 引导式设计流程

具有会话感知、以计划为先的流程，用于世界构建、设计评估、设计迭代、引导式构建和结构化调整计划。 结合确定性工具和 AI 辅助。

### 模拟分析

一种可以解释事件发生原因、机制失效的地方、未触发的事件以及导致系统不稳定之处的回放分析。 结构化的发现结果可以直接用于调整。

### 引导式调整

平衡分析会生成结构化的调整计划，其中包含建议的修复方案、预期的影响、置信度估计以及预览的更改。 采用分步方式进行，并提供完整的可追溯性。

### 场景实验

在不同的初始状态下运行大量模拟，以了解典型的行为。 提取场景指标，检测方差，调整参数，并比较调整后的世界和基准世界。 将世界设计转化为一个可测试的过程。

### 工作室环境

一个命令行设计工作室，具有项目仪表板、问题浏览、实验检查、会话历史记录、引导式入门以及上下文感知的命令发现功能。 这是一个用于构建和测试世界的环境。

---

## 快速入门

```bash
# Install the CLI
npm install -g @ai-rpg-engine/cli

# Start the interactive studio
ai chat

# Run onboarding
/onboard

# Create your first content
create-room haunted chapel

# Run a simulation
simulate

# Analyze the results
analyze-balance

# Tune the design
tune paranoia

# Run an experiment
experiment run --runs 50
```

---

## 示例流程

```bash
ai chat

/onboard
create-location-pack haunted chapel district
critique-content
simulate
analyze-balance
tune rumor propagation
experiment run --runs 50
compare-replays
```

构建一个世界，并通过模拟证据对其进行改进。

---

## 架构

该系统具有四层结构。

| 层级 | 角色 |
|-------|------|
| **Simulation** | 确定性引擎 — 世界状态、事件、动作、感知、认知、派系、谣言传播、区域指标、回放 |
| **Authoring** | 内容生成 — 骨架构建、评估、标准化、修复循环、内容生成器 |
| **AI Cognition** | 可选的 AI 辅助 — 聊天界面、上下文路由、检索、记忆塑造、工具编排 |
| **Studio UX** | 命令行设计环境 — 仪表板、问题跟踪、实验浏览、会话历史记录、引导式工作流程 |

---

## 软件包

| 软件包 | 用途 |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | 确定性模拟运行时 — 世界状态、事件、随机数生成器、时间步进、动作解析 |
| [`@ai-rpg-engine/modules`](packages/modules) | 17 个内置模块 — 战斗、感知、认知、派系、谣言、区域 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 世界内容的规范模式和验证器 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | 可选的 AI 内容创作 — 骨架构建、评估、引导式工作流程、调整、实验 |
| [`@ai-rpg-engine/cli`](packages/cli) | 命令行设计工作室——聊天界面、工作流程、实验工具 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | 终端渲染器和输入层 |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | Chapel Threshold——奇幻世界入门 |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox——赛博朋克世界入门 |

---

## 文档

| 资源 | 描述 |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 26 章 + 4 个附录，涵盖所有系统 |
| [Design Document](docs/DESIGN.md) | 架构深入分析——动作流水线、真实与呈现、模拟层 |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | 脚手架、诊断、调优、实验工作流程 |
| [Philosophy](PHILOSOPHY.md) | 为什么是确定性世界、基于证据的设计以及人工智能作为助手 |
| [Changelog](CHANGELOG.md) | 发布历史 |

---

## 理念

AI RPG 引擎围绕以下三个理念构建：

1. **确定性世界**——模拟结果必须可重复。
2. **基于证据的设计**——世界机制应通过模拟进行测试。
3. **人工智能作为助手，而非权威**——人工智能工具用于生成和评估设计，但不能替代确定性系统。

请参阅 [PHILOSOPHY.md](PHILOSOPHY.md) 以获取完整说明。

---

## 安全

AI RPG 引擎是一个**仅本地模拟的库**。没有遥测数据，没有网络连接，没有敏感信息。保存文件仅在明确请求时才会保存到 `.ai-rpg-engine/` 目录。详情请参阅 [SECURITY.md](SECURITY.md)。

## 要求

- Node.js >= 20
- TypeScript (ESM 模块)

## 许可证

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
