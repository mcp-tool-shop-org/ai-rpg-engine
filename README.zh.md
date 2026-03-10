<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

用于构建、分析和平衡角色扮演游戏世界的模拟原生工具包。

AI 角色扮演游戏引擎将确定性模拟运行时与 AI 辅助设计工作室相结合，使作者能够构建世界，通过模拟进行测试，并根据证据进行改进，而不是猜测。

> 传统的工具可以帮助您编写故事。
> AI 角色扮演游戏引擎可以帮助您**测试世界**。

---

## 主要功能

```
build → critique → simulate → analyze → tune → experiment
```

您可以生成世界内容，评估设计，运行确定性模拟，分析游戏行为，调整机制，在大量不同的初始状态下进行实验，并比较结果。 每一个结果都是可重现的、可检查的，并且可以解释的。

---

## 核心功能

### 确定性模拟

用于角色扮演游戏世界的基于时间步进的模拟引擎。 包括世界状态、事件系统、感知和认知层、派系信仰传播、谣言系统、区域指标（包含情绪推导）、NPC 行为（包含忠诚度阈值和后果链）、同伴（包含士气和离开风险）、玩家影响力与政治行动、战略地图分析、移动建议、物品识别与装备来源、遗物成长里程碑、基于世界条件的 emergent 机会（合同、赏金、恩惠、补给任务、调查）、战役弧线检测（从积累的状态中推导出的 10 种弧线类型）、游戏结束触发检测（8 种解决方案类别），以及具有结构化尾声的确定性结局渲染。 可重播的游戏行为日志和确定性随机数生成器。 每次运行都可以完全重播。

### AI 辅助世界构建

可选的 AI 层，可以根据主题生成房间、派系、任务和区域。 评估设计，纠正模式错误，提出改进建议，并指导多步骤的世界构建流程。 AI 永远不会直接修改模拟状态，它只生成内容或建议。

### 引导式设计流程

具有会话感知、以计划为先的流程，用于世界构建、设计评估、设计迭代、引导式构建和结构化调整计划。 结合确定性工具和 AI 辅助。

### 能力与技能

游戏内置一套能力系统，包含10个不同类型的能力，覆盖多种游戏类型。这些能力具有消耗、属性检查、冷却时间和特定效果（伤害、治疗、状态附加、净化）。状态效果使用11个标签的语义词汇，并为实体定义了抗性和易受性属性。人工智能会根据抗性和净化效果的评估，为玩家选择最佳的能力，包括自攻击、范围攻击和单体攻击。平衡性审计和能力包摘要工具可以在创作阶段发现异常情况。

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }, { resourceId: 'infection', amount: 5 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

### 模拟分析

重播分析，解释事件发生的原因，机制出现故障的地方，哪些触发器从未启动，以及哪些系统导致不稳定。 结构化的发现结果直接用于调整。

### 引导式调整

平衡分析生成结构化的调整计划，包含建议的修复方案、预期的影响、置信度估计和预览的更改。 逐步应用，并具有完整的可追溯性。

### 场景实验

在不同的初始状态下运行大量模拟，以了解典型的行为。 提取场景指标，检测方差，调整参数，并比较调整后的世界与基准世界。 将世界设计转化为一个可测试的过程。

### 工作室环境

命令行设计工作室，具有项目仪表板、问题浏览、实验检查、会话历史记录、引导式入门和上下文感知的命令发现。 用于构建和测试世界的环境。

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
| **Simulation** | 确定性引擎 — 世界状态、事件、行动、感知、认知、派系、谣言传播、区域指标、重播 |
| **Authoring** | 内容生成 — 框架构建、评估、标准化、修复循环、内容包生成器 |
| **AI Cognition** | 可选的 AI 辅助 — 聊天界面、上下文路由、检索、记忆塑造、工具编排 |
| **Studio UX** | CLI 设计环境：仪表盘、问题跟踪、实验浏览、会话历史、引导式工作流程。 |

---

## 包

| 包 | 目的 |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | 确定性模拟运行时：世界状态、事件、随机数生成器、时间步长、动作解析。 |
| [`@ai-rpg-engine/modules`](packages/modules) | 29 个内置模块：战斗、感知、认知、派系、传闻、区域、NPC 行为、同伴、玩家优势、战略地图、移动建议、物品识别、新兴机会、情节检测、游戏结束触发器。 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 用于世界内容的规范模式和验证器。 |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | 角色成长状态、伤势、里程碑、声望。 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | 原型选择、构建生成、初始装备。 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装备类型、物品来源、遗物成长、物品编年史。 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | 跨会话记忆、关系效果、战役状态。 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | 可选的 AI 内容创作：框架、评论、引导式工作流程、调优、实验。 |
| [`@ai-rpg-engine/cli`](packages/cli) | 命令行设计工作室：聊天界面、工作流程、实验工具。 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | 终端渲染器和输入层。 |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | Chapel Threshold：奇幻世界入门。 |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox：赛博朋克世界入门。 |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective：维多利亚时代神秘世界入门。 |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem：海盗世界入门。 |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead：僵尸生存世界入门。 |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain：西部奇幻世界入门。 |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss：科幻殖民世界入门。 |

---

## 文档

| 资源 | 描述 |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 43 个章节 + 4 个附录，涵盖所有系统。 |
| [Design Document](docs/DESIGN.md) | 架构深入剖析：动作流水线、真实与呈现、模拟层。 |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | 框架、诊断、调优、实验工作流程。 |
| [Philosophy](PHILOSOPHY.md) | 为什么是确定性世界、基于证据的设计以及 AI 作为助手。 |
| [Changelog](CHANGELOG.md) | 发布历史 |

---

## 哲学

AI RPG Engine 的构建基于以下三个理念：

1. **确定性世界**：模拟结果必须可重现。
2. **基于证据的设计**：世界机制应通过模拟进行测试。
3. **AI 作为助手，而非权威**：AI 工具用于帮助生成和评估设计，但不能替代确定性系统。

请参阅 [PHILOSOPHY.md](PHILOSOPHY.md) 以获取完整说明。

---

## 安全

AI RPG Engine 是一个**仅本地运行的模拟库**。没有遥测数据，没有网络连接，没有敏感信息。保存文件仅在明确请求时才会保存到 `.ai-rpg-engine/` 目录。详情请参阅 [SECURITY.md](SECURITY.md)。

## 要求

- Node.js >= 20
- TypeScript (ESM 模块)

## 许可证

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
