<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPG Engine

专为构建、分析和平衡 RPG 世界而设计的模拟原生工具包。

AI RPG Engine 将确定性模拟运行时与 AI 辅助设计工作室相结合，让创作者能够构建世界、通过模拟进行测试，并基于证据而非猜测来改进设计。

> 传统工具帮助你编写故事。
> AI RPG Engine 帮助你**测试世界**。

---

## 功能概述

```
build → critique → simulate → analyze → tune → experiment
```

你可以生成世界内容、评审设计、运行确定性模拟、分析回放行为、调整机制、在大量种子上运行实验并比较结果。每个结果都是可复现、可检查和可解释的。

---

## 核心能力

### 确定性模拟

基于刻度（tick）的 RPG 世界模拟引擎。涵盖世界状态、事件系统、感知与认知层、派系信仰传播、谣言系统、带情绪派生的区域指标、具有忠诚度断点和后果链的 NPC 自主行为、带士气和离队风险的同伴系统、玩家影响力与政治行动、战略地图分析、行动顾问、物品识别与装备来历、遗物成长里程碑、由世界状况生成的涌现机遇（合同、悬赏、人情、补给任务、调查）、战役弧线检测（从累积状态派生出 10 种弧线类型）、终局触发检测（8 种结局类别），以及具有结构化尾声的确定性终局渲染。可重放的行动日志与确定性随机数生成器。每次运行都可以精确重现。

### AI 辅助世界构建

可选的 AI 层，能够根据主题自动搭建房间、派系、任务和区域的脚手架。可以评审设计、修正模式错误、提出改进建议，并引导多步骤的世界构建工作流。AI 永远不会直接修改模拟状态——它只生成内容或建议。

### 引导式设计工作流

具有会话感知能力、计划优先的工作流，适用于世界搭建、评审循环、设计迭代、引导式构建和结构化调整计划。将确定性工具与 AI 辅助相结合。

### 模拟分析

回放分析功能，能够解释事件发生的原因、机制在哪里失效、哪些触发器从未激活，以及哪些系统产生了不稳定性。结构化的分析结果可直接用于调整。

### 引导式调整

平衡分析结果会生成结构化的调整计划，包含建议的修复方案、预期影响、置信度估计和变更预览。按步骤逐一应用，具有完整的可追溯性。

### 场景实验

跨多个种子批量运行模拟以了解典型行为。提取场景指标、检测方差、扫描参数，并比较调整后的世界与基准世界。将世界设计变成一个可测试的过程。

### 工作室命令行

命令行设计工作室，具备项目仪表板、问题浏览、实验检查、会话历史、引导式新手入门和上下文感知的命令发现功能。一个用于构建和测试世界的工作空间。

---

## 快速入门

```bash
# 安装命令行工具
npm install -g @ai-rpg-engine/cli

# 启动交互式工作室
ai chat

# 运行新手引导
/onboard

# 创建你的第一个内容
create-room haunted chapel

# 运行模拟
simulate

# 分析结果
analyze-balance

# 调整设计
tune paranoia

# 运行实验
experiment run --runs 50
```

---

## 示例工作流

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

构建一个世界，并通过模拟证据来改进它。

---

## 架构

系统分为四个层级。

| 层级 | 职责 |
|-------|------|
| **Simulation** | 确定性引擎——世界状态、事件、动作、感知、认知、派系、谣言传播、区域指标、回放 |
| **Authoring** | 内容生成——脚手架搭建、评审、标准化、修复循环、内容包生成器 |
| **AI Cognition** | 可选的 AI 辅助——聊天界面、上下文路由、检索、记忆塑造、工具编排 |
| **Studio UX** | 命令行设计环境——仪表板、问题跟踪、实验浏览、会话历史、引导式工作流 |

---

## 软件包

| 软件包 | 用途 |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | 确定性模拟运行时——世界状态、事件、随机数生成器、刻度、动作解析 |
| [`@ai-rpg-engine/modules`](packages/modules) | 29 个内置模块——战斗、感知、认知、派系、谣言、区域、NPC 自主行为、同伴、玩家影响力、战略地图、行动顾问、物品识别、涌现机遇、弧线检测、终局触发 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 世界内容的规范模式与验证器 |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | 角色成长状态、伤害、里程碑、声望 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | 原型选择、构建生成、初始装备 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装备类型、物品来历、遗物成长、物品编年史 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | 跨会话记忆、关系效果、战役状态 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | 可选的 AI 创作——脚手架搭建、评审、引导式工作流、调整、实验 |
| [`@ai-rpg-engine/cli`](packages/cli) | 命令行设计工作室——聊天界面、工作流、实验工具 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | 终端渲染器与输入层 |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold——奇幻入门世界 |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox——赛博朋克入门世界 |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective——维多利亚推理入门世界 |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem——海盗入门世界 |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead——丧尸生存入门世界 |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain——诡异西部入门世界 |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss——科幻殖民地入门世界 |

---

## 文档

| 资源 | 描述 |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 43 章 + 4 个附录，涵盖每个系统 |
| [Design Document](docs/DESIGN.md) | 架构深度解析——动作管线、真实与呈现、模拟层级 |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | 脚手架搭建、诊断、调优、实验工作流 |
| [Philosophy](PHILOSOPHY.md) | 为什么选择确定性世界、证据驱动设计，以及 AI 作为助手 |
| [Changelog](CHANGELOG.md) | 发布历史 |

---

## 设计理念

AI RPG Engine 围绕三个核心理念构建：

1. **确定性世界**——模拟结果必须可复现。
2. **证据驱动设计**——世界机制应通过模拟来测试。
3. **AI 作为助手，而非权威**——AI 工具帮助生成和评审设计，但不取代确定性系统。

详见 [PHILOSOPHY.md](PHILOSOPHY.md)。

---

## 安全性

AI RPG Engine 是一个**纯本地模拟库**。无遥测、无网络、无密钥。存档文件仅在明确请求时保存至 `.ai-rpg-engine/`。详情请参阅 [SECURITY.md](SECURITY.md)。

## 系统要求

- Node.js >= 20
- TypeScript（ESM 模块）

## 许可证

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建
