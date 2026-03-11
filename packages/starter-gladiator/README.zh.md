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

# @ai-rpg-engine/starter-gladiator

> **示例配置** — 这个入门项目演示了如何将引擎配置用于竞技场战斗。它是一个学习的示例，而不是一个可以复制的模板。请参考[配置指南](../../docs/handbook/57-composition-guide.md)，以构建您自己的游戏。

**铁质竞技场** — 位于一个衰败帝国的地下的角斗士竞技场。为自由而战，赢得赞助，并承受观众的评判。

是[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)入门包的一部分。

## 主题

罗马竞技场战斗 + 赞助政治。观众的喜爱程度会随着精彩程度而剧烈波动——高喜爱度可以获得赞助商的礼物，低喜爱度则意味着死亡。赞助商将角斗士视为“血腥娱乐的投资”。

## 快速开始

```typescript
import { createGame } from '@ai-rpg-engine/starter-gladiator';

const engine = createGame();
engine.start();
```

## 演示模式

| 特性 | 角斗士展示的内容 |
|---------|----------------------|
| **Resources** | 一种易变的元资源（观众喜爱度），由精彩程度驱动，而非效率。 |
| **Combat** | 具有三阶段的Boss设计，战斗过程中会动态变化。 |
| **Custom verbs** | 嘲讽和炫耀作为非伤害性的战斗行为，会影响资源。 |
| **Social** | 赞助系统，受观众喜爱度阈值限制。 |

## 内容

- **5个区域：** 拘留室、竞技场、赞助商看台、军械库、隧道出口
- **3个NPC：** 竞技场管理员布鲁图斯、赞助商瓦莱里亚、老兵内尔瓦
- **2个敌人：** 竞技场冠军、战争野兽
- **1个对话树：** 赞助商的对话，关于赞助和竞技场政治
- **1个成长树：** 竞技场荣耀（取悦观众 → 钢铁意志 → 自由战士）
- **1个物品：** 赞助令牌（增加10点观众喜爱度）

## 独特机制

| 动词 | 描述 |
|------|-------------|
| `taunt` | 激怒敌人，取悦观众 |
| `showboat` | 为了精彩程度和喜爱度，牺牲效率 |

## 属性与资源

| 属性 | 角色 |
|------|------|
| 力量 | 原始力量，重击 |
| 敏捷 | 速度，闪避，精准 |
| 表演技巧 | 操纵观众，戏剧化的战斗 |

| 资源 | 范围 | 备注 |
|----------|-------|-------|
| HP | 0–40 | 标准生命值 |
| 疲劳 | 0–50 | 反向压力——在战斗中增加，每刻恢复-2点 |
| 观众喜爱度 | 0–100 | 易变——>75解锁赞助商的礼物，<25意味着死亡 |

## 可以借鉴的内容

性能资源经济（观众喜爱度）和三阶段Boss设计。研究观众喜爱度如何作为一种易变的元资源，它会随着精彩程度而波动，而不是效率，以及竞技场冠军的战斗如何使用阶段转换，在战斗过程中动态地改变战斗方式。

## 许可证

MIT
