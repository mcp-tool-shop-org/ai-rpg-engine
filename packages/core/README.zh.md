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

# @ai-rpg-engine/core

AI RPG 引擎的基础：世界状态、实体、动作、事件、规则、可预测的随机数生成器以及持久化功能。

## 安装

```bash
npm install @ai-rpg-engine/core
```

## 包含内容

- **引擎 (Engine)**：基于时间步进的模拟循环，具有可重现性。
- **世界状态 (WorldState)**：房间、实体、全局标志、时间步计数器。
- **实体状态 (EntityState)**：资源、物品栏、状态效果、信仰、记忆。
- **动作流水线 (Action Pipeline)**：验证 → 预处理 → 解析 → 后处理 → 提交。
- **事件总线 (Event Bus)**：结构化事件，包含类型、源、目标和数据。
- **可预测的随机数生成器 (Seeded RNG)**：从单个种子生成可重复的随机数。
- **模块系统 (Module System)**：注册/组合模拟模块。
- **测试框架 (Test Harness)**：用于确定性模块测试的辅助工具。

## 快速开始

```typescript
import { Engine } from '@ai-rpg-engine/core';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game',
    version: '1.0.0', engineVersion: '1.0.0',
    ruleset: 'fantasy', modules: [],
    contentPacks: [],
  },
  seed: 42,
  modules: [],
});

const state = engine.getState();
```

## 文档

- [手册 (Handbook)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)：25 章 + 4 个附录
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
