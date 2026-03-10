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

# @ai-rpg-engine/starter-detective

**Gaslight Detective**——一个为AI RPG引擎提供的维多利亚时代神秘故事的入门世界。

## 安装

```bash
npm install @ai-rpg-engine/starter-detective
```

## 您将学到的内容

这个入门示例通过一个调查场景，展示了完整的引擎功能：

| 特性 | “侦探”示例展示的内容 |
|---|---|
| **Rulesets** | `detectiveMinimalRuleset`——属性（感知/口才/意志力），资源（生命值/冷静值），动词，公式。 |
| **Zones & traversal** | 2个房间，共5个区域，包含相邻关系、光照等级、可交互对象、危险区域。 |
| **Districts** | 阿什福德庄园（贵族） vs. 码头工人（码头工人派系）。 |
| **Dialogue** | 带有证据收集和全局标志影响的、分支式的对寡妇的审问。 |
| **Combat** | 带有攻击性AI配置和领地目标的码头混混。 |
| **Cognition & perception** | 记忆衰减、感知过滤器、嫌疑人偏执的呈现规则。 |
| **Progression** | 3个节点的推理专长树，击败实体时获得经验值奖励。 |
| **Environment** | 黑暗小巷的危险区域，进入时会消耗冷静值。 |
| **Factions** | 码头工人派系，带有凝聚力设置。 |
| **Belief provenance** | 谣言传播，带有延迟，并跟踪信念度。 |
| **Inventory** | 复方氨基酸（具有脚本化的物品使用效果）。 |
| **Simulation inspector** | 完整的检查功能，用于回放分析。 |

## 内容

- **5个区域**——书房（犯罪现场）、客厅、仆人餐厅、前门、小巷。
- **3个NPC**——阿什福德夫人（寡妇/嫌疑人）、派克警官（执法人员）、卡洛韦夫人（仆人/证人）。
- **1个敌人**——码头混混（具有攻击性AI，领地意识）。
- **1个物品**——复方氨基酸（恢复6点冷静值）。
- **1个专长树**——推理专长（敏锐的观察力 → 银色的舌头 → 坚强的意志）。
- **1个呈现规则**——嫌疑人将调查视为一种威胁。
- **15个模块**——移动、状态、战斗、物品、对话、认知、感知、专长、环境、派系、谣言、区域、信念、观察者呈现、检查员。

## 使用方法

```typescript
import { createGame } from '@ai-rpg-engine/starter-detective';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, detectiveMinimalRuleset, deductionMasteryTree } from '@ai-rpg-engine/starter-detective';
```

## 文档

- [手册](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

由<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>制作。
