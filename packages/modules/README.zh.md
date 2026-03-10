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

# @ai-rpg-engine/modules

17个可组合的模拟模块，用于AI RPG引擎，涵盖战斗、对话、认知、感知、派系等。

## 安装

```bash
npm install @ai-rpg-engine/modules
```

## 模块

| 模块 | 描述 |
|--------|-------------|
| `combatCore` | 攻击/防御、伤害、击败、体力、防御、脱离 |
| `dialogueCore` | 基于图的对话树，带有条件判断 |
| `inventoryCore` | 物品、装备、使用/装备/卸载 |
| `traversalCore` | 区域移动和出口验证 |
| `statusCore` | 带有持续时间和叠加效果的状态 |
| `environmentCore` | 动态区域属性、危险、衰减 |
| `cognitionCore` | AI的信念、意图、士气、记忆 |
| `perceptionFilter` | 感官通道、清晰度、跨区域听觉 |
| `narrativeAuthority` | 真实与呈现、隐藏、扭曲 |
| `progressionCore` | 基于货币的升级、技能树 |
| `factionCognition` | 派系的信念、信任、派系间的知识 |
| `rumorPropagation` | 信息传播，并伴随置信度衰减 |
| `knowledgeDecay` | 基于时间的置信度降低 |
| `districtCore` | 空间记忆、区域指标、警戒阈值 |
| `beliefProvenance` | 追踪重建，涉及感知/认知/传闻 |
| `observerPresentation` | 针对每个观察者的事件过滤、偏差追踪 |
| `simulationInspector` | 运行时检查、健康检查、诊断 |
| `combatIntent` | AI的决策偏差、士气、逃跑逻辑 |
| `engagementCore` | 前线/后线位置、保镖拦截 |
| `combatRecovery` | 战斗后的伤情状态、安全区域的治疗 |
| `combatReview` | 公式解释、命中率分析 |
| `defeatFallout` | 战斗后的派系影响、声誉变化 |
| `bossPhaseListener` | Boss的生命值阈值阶段转换 |

### 战斗内容编辑（纯函数）

| 导出 | 目的 |
|--------|---------|
| `combat-roles` | 8个角色模板、遭遇类型、危险等级、Boss定义 |
| `encounter-library` | 5个遭遇原型工厂、3个Boss模板工厂、数据包审计 |
| `combat-summary` | 查询、审计、格式化和检查战斗内容 |

## 用法

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { combatCore, dialogueCore, cognitionCore, perceptionFilter } from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: { /* ... */ },
  seed: 42,
  modules: [combatCore(), dialogueCore(), cognitionCore(), perceptionFilter()],
});
```

## 文档

- [模块 (第6章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/06-modules/)
- [AI认知 (第8章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/08-ai-cognition/)
- [感知 (第9章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/09-perception-layers/)
- [战斗系统 (第47章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/47-combat-system/)
- [手册](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
