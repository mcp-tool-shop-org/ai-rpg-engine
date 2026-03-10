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

**猩红法庭 (Crimson Court)** — 一座衰败的贵族庄园，正举办一场蒙面舞会。三个吸血鬼家族为了争夺统治地位而展开斗争，而饥饿的威胁随时可能吞噬你。

这是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 启动包的一部分。

## 主题

哥特恐怖 + 吸血鬼贵族政治。血欲会随着时间逐渐增强——如果达到100，玩家将失去控制。进食可以降低血欲，但会消耗人性。吸血鬼将人类视为“温暖的容器”。

## 快速开始

```typescript
import { createGame } from '@ai-rpg-engine/starter-vampire';

const engine = createGame();
engine.start();
```

## 内容

- **5 个区域：** 舞厅、东画廊、酒窖、月光花园、钟楼
- **3 个 NPC：** 莫薇恩公爵夫人（年长的吸血鬼）、卡修斯（竞争对手的年轻吸血鬼）、侍女艾拉拉（人类）
- **2 个敌人：** 女巫猎人、野蛮奴隶
- **1 个对话树：** 公爵夫人的谈话，涉及贵族政治和控制饥饿
- **1 个成长树：** 血之掌握 (钢铁意志 → 催眠师 → 顶级掠食者)
- **1 个物品：** 血液瓶（降低15点血欲）

## 独特机制

| 动词 | 描述 |
|------|-------------|
| `enthrall` | 通过存在进行超自然社会统治。 |
| `feed` | 吸取血液以降低血欲，但会消耗人性。 |

## 属性与资源

| 属性 | 作用 |
|------|------|
| 存在 | 社会统治，超自然权威。 |
| 活力 | 身体素质，进食效率。 |
| 狡猾 | 欺骗，感知，贵族阴谋。 |

| 资源 | 范围 | 备注 |
|----------|-------|-------|
| HP | 0–30 | 标准生命值 |
| 血欲 | 0–100 | 反向压力——每Tick增加，达到100时失去控制。 |
| 人性 | 0–30 | 道德锚点——低于10时，会锁定部分对话选项。 |

## 许可证

MIT
