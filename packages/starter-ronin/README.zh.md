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

# @ai-rpg-engine/starter-ronin

> **示例配置** — 这个入门项目演示了如何将引擎配置用于封建时代的神秘故事。它是一个学习的示例，而不是一个可以复制的模板。请参考[配置指南](../../docs/handbook/57-composition-guide.md)，以构建您自己的游戏。

**碧玉之幕 (Jade Veil)** — 紧张政治峰会期间的一座封建城堡。一位领主中毒身亡。在荣誉耗尽之前，找出凶手。

这是[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)入门包的一部分。

## 主题

封建时代的神秘事件 + 宫廷阴谋。荣誉是脆弱的——错误的指控会付出惨重的代价，并且几乎无法挽回。每一个问题都至关重要，每一次指控都有后果。刺客将浪人视为“没有主人的剑——不可预测”。

## 快速开始

```typescript
import { createGame } from '@ai-rpg-engine/starter-ronin';

const engine = createGame();
engine.start();
```

## 演示模式

| 特性 | 浪人展示的内容 |
|---------|------------------|
| **Engagement** | 多种保护者角色（保镖 + 武士），隐藏通道 |
| **Resources** | 双层机制：气（恢复）与荣誉（脆弱，难以恢复） |
| **Social** | 带有后果的调查——错误的指控会损失荣誉 |
| **Cognition** | 刺客感知规则，针对未隶属的浪人 |

## 内容

- **5个区域：** 城堡大门，大厅，茶园，领主房间，隐藏通道
- **3个NPC：** 武田领主（中毒领主），姬子女士（嫌疑人），佐藤法官（调查员）
- **2个敌人：** 暗影刺客，腐败武士
- **1个对话树：** 法官关于中毒事件和宫廷嫌疑人的简报
- **1个成长树：** 剑道之路（稳健之手 → 内心平静 → 正义之怒）
- **1个道具：** 熏香套装（恢复5点气）

## 独特机制

| 动词 | 描述 |
|------|-------------|
| `duel` | 正式的武术挑战，使用纪律 |
| `meditate` | 以一回合的代价，恢复气和镇定 |

## 属性与资源

| 属性 | 角色 |
|------|------|
| 纪律 | 武术技能，剑术，专注 |
| 感知 | 洞察力，推理，识破意图 |
| 镇定 | 社交控制，情绪控制 |

| 资源 | 范围 | 备注 |
|----------|-------|-------|
| HP | 0–30 | 标准生命值 |
| 荣誉 | 0–30 | 脆弱——错误的指控会损失5点，难以恢复 |
| Ki | 0–20 | 精神能量，每刻恢复2点 |

## 可以借鉴的内容

多种保护者角色（保镖 + 武士）和双层资源（气 + 荣誉）。研究一下，如何通过不同的触发条件，创建多层防御的两种保护者角色，以及如何通过“气”（恢复）与“荣誉”（脆弱，难以恢复）来强制不同的战斗和调查方式。

## 许可证

MIT
