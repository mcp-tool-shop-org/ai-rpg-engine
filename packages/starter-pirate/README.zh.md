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

# @ai-rpg-engine/starter-pirate

**黑旗挽歌**——一个专为AI RPG引擎设计的海盗主题入门世界。

## 安装

```bash
npm install @ai-rpg-engine/starter-pirate
```

## 您将学到什么

这个入门示例通过一个海盗冒险，展示了完整的引擎功能：

| 特性 | “海盗”示例展示的内容： |
|---|---|
| **Rulesets** | `pirateMinimalRuleset`——属性（力量/狡猾/航海技能），资源（生命值/士气），动词，公式。 |
| **Zones & traversal** | 3个房间，共5个区域，包含相邻关系、光照等级、可交互对象、危险因素。 |
| **Districts** | 殖民海军势力（Port Haven） vs. 诅咒之海（危险海域）。 |
| **Dialogue** | 带有任务触发和全局标志效果的分支式地图绘制者对话。 |
| **Combat** | 海军水手（具有攻击性）和溺水守护者（被诅咒的海中生物）。 |
| **Cognition & perception** | 记忆衰减、感知过滤器、诅咒守护者呈现规则。 |
| **Progression** | 3个节点的航海技能树，击败敌人可获得经验值奖励。 |
| **Environment** | 风暴浪潮会消耗士气，水压会造成伤害。 |
| **Factions** | 殖民海军势力，包括总督和水手。 |
| **Belief provenance** | 谣言传播，带有延迟，并跟踪人们的信仰。 |
| **Inventory** | 带有预设物品使用效果，可恢复士气的朗姆酒桶。 |
| **Simulation inspector** | 完整的检查机制，用于回放分析。 |

## 内容

- **5个区域**：船甲板、生锈的锚（酒馆）、总督堡垒、开阔水域、沉没的神殿。
- **3个NPC**：船员布莱（Quartermaster Bly）、地图绘制者玛拉（Mara the Cartographer，中立）、总督韦恩（Governor Vane，殖民当局）。
- **2个敌人**：海军水手（具有攻击性）、溺水守护者（被诅咒的海中生物）。
- **1个物品**：朗姆酒桶（恢复8点士气）。
- **1个技能树**：航海技能（Sea-Hardened → Ruthless → Dread Captain）。
- **1个呈现规则**：被诅咒的生物将所有访客视为入侵者。
- **15个模块**：移动、状态、战斗、物品、对话、认知、感知、进度、环境、派系、谣言、区域、信仰、观察者呈现、检查器。

## 使用方法

```typescript
import { createGame } from '@ai-rpg-engine/starter-pirate';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, pirateMinimalRuleset, seamanshipTree } from '@ai-rpg-engine/starter-pirate';
```

## 文档

- [手册](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 创建。
