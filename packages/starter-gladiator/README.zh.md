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

**铁血竞技场**——一个位于衰败帝国地下的地下角斗士竞技场。为自由而战，赢得赞助，并赢得观众的认可。

是[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 启动包目录的一部分。

## 主题

罗马竞技场战斗 + 赞助政治。观众的喜爱程度会剧烈波动——高喜爱度可以获得赞助者的礼物，低喜爱度则意味着死亡。赞助者将角斗士视为“血腥娱乐的投资”。

## 快速开始

```typescript
import { createGame } from '@ai-rpg-engine/starter-gladiator';

const engine = createGame();
engine.start();
```

## 内容

- **5个区域：** 拘留室、竞技场、赞助者看台、军械库、隧道出口
- **3个NPC：** 兰尼斯特·布鲁图斯（竞技场管理者）、多米娜·瓦莱里亚（赞助者）、内尔瓦（老兵盟友）
- **2个敌人：** 竞技场冠军、战争野兽
- **1个对话树：** 关于赞助和竞技场政治的赞助者对话
- **1个成长树：** 竞技场荣耀（取悦观众 → 钢铁意志 → 自由战士）
- **1个物品：** 赞助令牌（增加观众喜爱度10点）

## 独特机制

| 动词 | 描述 |
|------|-------------|
| `taunt` | 激怒敌人，取悦观众 |
| `showboat` | 牺牲效率，追求视觉效果和喜爱度 |

## 属性与资源

| 属性 | 角色 |
|------|------|
| 力量 | 原始力量，重击 |
| 敏捷 | 速度，闪避，精准 |
| 表演技巧 | 操纵观众，戏剧化的战斗 |

| 资源 | 范围 | 备注 |
|----------|-------|-------|
| HP | 0–40 | 标准生命值 |
| 疲劳 | 0–50 | 负压——战斗中增加，每刻恢复-2点 |
| 观众喜爱度 | 0–100 | 不稳定——>75解锁赞助者礼物，<25意味着死亡 |

## 许可证

MIT
