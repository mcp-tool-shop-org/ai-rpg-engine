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

# @ai-rpg-engine/starter-vampire

> **示例配置** — 这个入门项目展示了如何将引擎配置用于哥特式吸血鬼恐怖主题。它是一个学习的示例，而不是一个可以复制的模板。请参考[配置指南](../../docs/handbook/57-composition-guide.md)，以构建您自己的游戏。

**Crimson Court（猩红法庭）** — 一个在化装舞会上逐渐衰败的贵族庄园。三个吸血鬼家族为了争夺统治地位而相互竞争，而饥饿的威胁随时可能吞噬你。

这是[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)入门包的一部分。

## 主题

哥特式恐怖 + 吸血鬼贵族政治。血欲值每时钟周期都会上升——如果达到100，玩家将失去控制。进食可以降低血欲值，但会消耗人性。吸血鬼将人类视为“温暖的载体”。

## 快速开始

```typescript
import { createGame } from '@ai-rpg-engine/starter-vampire';

const engine = createGame();
engine.start();
```

## 演示模式

| 特性 | “吸血鬼”展示的内容 |
|---------|---------------------|
| **Resources** | 对立的双重资源（血欲值上升，人性下降），形成一种道德经济。 |
| **Cognition** | 吸血鬼对人类的看法不同——关于活体生物的呈现规则。 |
| **Dialogue** | 选项受限——低人性会锁定对话分支。 |
| **Progression** | 具有升级的超自然力量树，提供社会控制能力。 |

## 内容

- **5个区域：** 舞厅、东画廊、酒窖、月光花园、钟楼
- **3个NPC：** 莫尔韦恩公爵夫人（年长的吸血鬼）、卡修斯（竞争对手）、侍女艾拉拉（人类）
- **2个敌人：** 猎巫者、野蛮奴隶
- **1个对话树：** 公爵夫人的会面，讨论贵族政治和控制饥饿。
- **1个成长树：** 血统精通（钢铁意志 → 催眠师 → 顶级掠食者）
- **1个物品：** 血液瓶（降低15点血欲值）

## 独特机制

| 动词 | 描述 |
|------|-------------|
| `enthrall` | 利用存在进行超自然社会统治。 |
| `feed` | 通过消耗血液来降低血欲值，但会消耗人性。 |

## 属性与资源

| 属性 | 作用 |
|------|------|
| 存在 | 社会统治，超自然权威。 |
| 活力 | 身体素质，进食效率。 |
| 狡猾 | 欺骗，感知，宫廷阴谋。 |

| 资源 | 范围 | 备注 |
|----------|-------|-------|
| HP | 0–30 | 标准生命值 |
| 血欲值 | 0–100 | 反向压力——每时钟周期上升，达到100时失去控制。 |
| 人性 | 0–30 | 道德锚点——低于1时锁定对话选项。 |

## 可以借鉴的内容

对立的双重资源（血欲值与人性）。研究两个方向相反的资源如何形成一种道德经济——进食可以降低血欲值，但会消耗人性，使每个资源决策都成为一个具有永久后果的叙事选择。

## 许可证

MIT
