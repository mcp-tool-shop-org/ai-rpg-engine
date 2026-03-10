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

# @ai-rpg-engine/starter-fantasy

**圣殿门槛** — 一个用于 AI 角色扮演引擎的黑暗奇幻入门世界。

## 安装

```bash
npm install @ai-rpg-engine/starter-fantasy
```

## 您将学到什么

这个入门示例在一个紧凑的世界中展示了完整的引擎架构：

| 特性 | “圣殿”展示的内容 |
|---|---|
| **Rulesets** | `fantasyMinimalRuleset` — 属性（活力/本能/意志），资源（生命值/体力），动词，公式 |
| **Zones & traversal** | 2个房间，共5个区域，包含相邻关系、光照等级、可交互对象、危险 |
| **Districts** | 圣殿广场（神圣） vs 墓穴深处（被诅咒，由派系控制） |
| **Dialogue** | 具有3个分支和全局标志效果的朝圣者对话 |
| **Combat** | 灰烬亡灵，具有攻击性AI配置、恐惧标签、警戒目标 |
| **Cognition & perception** | 记忆衰减、感知过滤器、不死生物呈现规则 |
| **Progression** | 3个节点的战斗精通树，击败实体时获得经验奖励 |
| **Environment** | 不稳定的地板，进入区域时会消耗体力 |
| **Factions** | 圣殿不死生物派系，具有凝聚力设置 |
| **Belief provenance** | 谣言传播，带有延迟，跟踪信仰 |
| **Inventory** | 治疗药剂，具有脚本化的使用效果，恢复8点生命值 |
| **Simulation inspector** | 完整的检查功能，用于回放分析 |

## 内容

- **5个区域** — 废弃的教堂入口、中殿、阴影角落、储物室通道、墓穴前厅
- **1个NPC** — 疑心朝圣者（分支对话，3个对话路径）
- **1个敌人** — 灰烬亡灵（具有攻击性AI，害怕火焰和神圣事物）
- **1个物品** — 治疗药剂（脚本化的使用效果，恢复8点生命值）
- **1个成长树** — 战斗精通（坚韧 → 敏锐 → 战斗狂暴）
- **1个呈现规则** — 不死生物将所有生物视为威胁
- **15个模块** — 移动、状态、战斗、物品、对话、认知、感知、成长、环境、派系、谣言、区域、信仰、观察者呈现、检查器

## 用法

```typescript
import { createGame } from '@ai-rpg-engine/starter-fantasy';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zones, pilgrimDialogue, fantasyMinimalRuleset } from '@ai-rpg-engine/starter-fantasy';
```

## 文档

- [圣殿门槛 (第20章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/20-chapel-threshold/)
- [手册](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
