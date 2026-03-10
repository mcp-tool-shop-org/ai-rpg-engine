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

# @ai-rpg-engine/starter-zombie

**灰烬之死 (Ashfall Dead)** — 一个用于 AI RPG 引擎的僵尸生存主题入门世界。

## 安装

```bash
npm install @ai-rpg-engine/starter-zombie
```

## 您将学到的内容

这个入门示例通过一个生存场景，展示了完整的引擎架构：

| 特性 | 僵尸展示的内容 |
|---|---|
| **Rulesets** | `zombieMinimalRuleset` — 属性（体格/智慧/神经）、资源（生命值/体力/感染）、动词、公式 |
| **Zones & traversal** | 3个房间，共5个区域，具有相邻关系、光照等级、可交互对象和危险因素。 |
| **Districts** | 安全屋（幸存者派系） vs 死亡区域（敌对、不死生物） |
| **Dialogue** | 与医生进行的分支对话，包含医院补给任务的触发点。 |
| **Combat** | 蹒跚者（缓慢、坚韧）和奔跑者（快速、脆弱），具有攻击性人工智能。 |
| **Cognition & perception** | 记忆衰减、感知过滤器、僵尸饥饿呈现规则。 |
| **Progression** | 3个节点的生存技能树，击败实体时获得经验值奖励。 |
| **Environment** | 游荡的僵尸会消耗体力，感染风险区域会增加感染几率。 |
| **Factions** | 幸存者派系，包括医生、拾荒者和军事领导者。 |
| **Belief provenance** | 谣言传播，带有延迟，并跟踪信念。 |
| **Inventory** | 抗生素，具有脚本化的使用效果，可降低感染。 |
| **Simulation inspector** | 完整的检查功能，用于回放分析。 |

## 内容

- **5个区域** — 安全屋大厅、废弃加油站、被占领的街道、医院东翼、医院屋顶
- **3个NPC** — 陈医生（医生）、鲁克（拾荒者）、马什中士（军事领导者）
- **2个敌人** — 蹒跚者（缓慢、坚韧的不死生物）、奔跑者（快速、脆弱的不死生物）
- **1个物品** — 抗生素（降低25%的感染）
- **1个技能树** — 生存（拾荒者 → 冷静沉着 → 最后的幸存者）
- **1个呈现规则** — 僵尸将所有生物视为猎物
- **15个模块** — 移动、状态、战斗、物品、对话、认知、感知、技能、环境、派系、谣言、区域、信念、观察者呈现、检查器

## 使用方法

```typescript
import { createGame } from '@ai-rpg-engine/starter-zombie';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zombieMinimalRuleset, survivalTree } from '@ai-rpg-engine/starter-zombie';
```

## 文档

- [手册](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
