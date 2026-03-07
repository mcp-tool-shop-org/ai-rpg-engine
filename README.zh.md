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

<p align="center">A simulation-first terminal RPG engine for worlds shaped by perception, cognition, and consequence.</p>

---

## 它的定义/ 它的含义

AI RPG 引擎是一个模块化的运行时环境，用于构建基于终端的角色扮演游戏。在这个游戏中，行动会产生信息，信息会产生扭曲，而角色的行为后果则源于他们所认为的事件。

该引擎在保持客观世界真实性的同时，支持不可靠的叙述、不同角色之间的感知差异，以及多层次的叙事结构。它不局限于特定类型——相同的核心机制可以驱动黑暗奇幻、赛博朋克或其他任何类型的世界，只需通过可替换的规则集进行调整。

## 安装

```bash
npm install @ai-rpg-engine/core @ai-rpg-engine/modules @ai-rpg-engine/content-schema
```

## 快速入门指南

```typescript
import { Engine } from '@ai-rpg-engine/core';
import {
  combatCore, dialogueCore, inventoryCore, traversalCore,
  statusCore, environmentCore, cognitionCore, perceptionFilter,
} from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game', version: '1.0.0',
    engineVersion: '1.0.0', ruleset: 'fantasy',
    modules: ['combat-core', 'dialogue-core', 'cognition-core'],
    contentPacks: [],
  },
  seed: 42,
  modules: [
    combatCore(), dialogueCore(), inventoryCore(),
    traversalCore(), statusCore(), environmentCore(),
    cognitionCore(), perceptionFilter(),
  ],
});

// Submit an action
const events = engine.submitAction('attack', {
  targetIds: ['guard-01'],
});

// Every action produces structured events
for (const event of events) {
  console.log(event.type, event.payload);
}
```

## 架构

```
Engine
  WorldStore      — entities, zones, quests, factions, RNG, event log
  ActionDispatcher — verb handlers, validators
  ModuleManager   — modules, formulas, rules, persistence
  Presentation    — channels that route (and can distort) events
```

每个状态变化都经过一个单一的流水线：

```
action --> validation --> resolution --> events --> presentation
```

## 套餐

| 包装。 | 目的。 |
|---------|---------|
| `@ai-rpg-engine/core` | 状态、实体、行为、事件、规则、随机数生成 (RNG)、持久性。 |
| `@ai-rpg-engine/modules` | 17个内置模拟模块。 |
| `@ai-rpg-engine/content-schema` | 内容模式和验证器。 |
| `@ai-rpg-engine/terminal-ui` | 终端渲染器和输入层。 |
| `@ai-rpg-engine/cli` | 开发者命令行工具：运行、重放、检查。 |
| `@ai-rpg-engine/starter-fantasy` | 圣殿入口（奇幻游戏试玩版） |
| `@ai-rpg-engine/starter-cyberpunk` | 霓虹色保险箱（赛博朋克演示版） |

## 内置模块

| 模块。 | 它的功能。 |
|--------|-------------|
| 战斗核心 (zhàn dì hé xīn) | 攻击/防御、伤害、击败、体力。 |
| 对话核心。 | 基于图的、带有条件的对话流程图。 |
| 库存核心模块。 | 物品、设备、使用/配备/取消配备。 |
| 遍历核心模块。 | 区域移动和出口验证。 |
| 状态核心。 | 具有持续时间和可叠加效果的状态。 |
| 环境核心组件。 | 动态区域属性、风险、衰减。 |
| 认知核心。 | 人工智能的信念、意图、士气、记忆。 |
| 感知过滤器 | 感官通道、清晰度、跨区域听觉。 |
| 叙事权威。 | 真相与呈现、隐瞒、歪曲。 |
| 进展核心。 | 基于货币的技能提升系统，技能树。 |
| 派系认知 | 派系信仰、信任、派系间的知识。 |
| 谣言传播。 | 信息传播过程中，可信度会逐渐降低。 |
| 知识衰退。 | 基于时间的置信度下降。 |
| 区域核心。 | 空间记忆、区域指标、警报阈值。 |
| 信念来源。 | 追踪信息在感知、认知和传言中的传播和演变。 |
| 观察者呈现 (或：观察者展示) | 针对每个观察者的事件过滤，以及偏差跟踪。 |
| 模拟检查器 | 运行时检查、健康状况检测、诊断。 |

## 关键设计决策

- **模拟的真实性至关重要**——引擎保持客观状态。表现层可能会出现偏差，但世界的真实状态是标准化的。
- **操作会产生事件**——任何有意义的状态改变都不会悄无声息地发生。所有操作都会产生结构化、可查询的事件。
- **确定性回放**——通过使用种子随机数生成器和操作流水线，可以保证从相同输入获得完全相同的结果。
- **内容是数据**——房间、实体、对话、物品等都被定义为数据，而不是代码。
- **游戏类型属于规则集**——引擎对剑与激光枪没有明确的偏好。

## 安全与信任

AI RPG 引擎是一个仅支持本地模拟的软件库。

- **涉及的数据：** 仅限于内存中的游戏状态。当使用命令行保存功能时，会保存文件到 `.ai-rpg-engine/` 目录下。
- **未涉及的数据：** 除了保存文件之外，不访问任何文件系统，不使用网络，不读取任何环境变量，也不使用任何系统资源。
- **无任何数据收集。** 不会收集或发送任何数据。
- **无任何敏感信息。** 引擎不会读取、存储或传输任何凭据。

请参阅 [SECURITY.md](SECURITY.md) 文件，了解完整的安全策略。

## 需求

- Node.js >= 20
- TypeScript (ESM 模块)

## 文档

- [手册](docs/handbook/index.md) — 25 章 + 4 个附录
- [设计概述](docs/DESIGN.md) — 深入了解架构
- [更新日志](CHANGELOG.md)

## 许可证

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
