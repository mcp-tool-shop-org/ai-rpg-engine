<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-weird-west

**尘暴之约 (Dust Devil's Bargain)** — 一个边境小镇隐藏着一个邪教，他们正在试图从红色高原召唤某种东西。

这是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 启动包的一部分。

## 主题

西部 + 超自然。 枪手、尘埃精灵和高原邪教。 “尘埃”资源会随着时间积累——当它达到100时，流浪者会被沙漠吞噬。

## 快速开始

```typescript
import { createGame } from '@ai-rpg-engine/starter-weird-west';

const engine = createGame();
engine.start();
```

## 内容

- **5个区域：** 流浪者路口、酒馆、警长办公室、红色高原小径、精灵洞穴
- **2个NPC：** 酒保西拉斯、警长海尔
- **2个敌人：** 尘埃复仇者、高原爬行者
- **1个对话树：** 酒保提供的关于高原邪教的情报
- **1个成长树：** 枪手路线（快速拔枪 → 坚韧意志 → 鹰眼）
- **1个物品：** 鼠尾草包（减少20点尘埃）

## 独特机制

| 动词 | 描述 |
|------|-------------|
| `draw` | 快速拔枪对决 — 反应能力比拼 |
| `commune` | 使用知识与精灵交流 |

## 属性与资源

| 属性 | 作用 |
|------|------|
| 坚韧 (grit) | 坚韧和意志力 |
| 拔枪速度 (draw-speed) | 反应速度 |
| 知识 (lore) | 超自然知识 |

| 资源 | 范围 | 备注 |
|----------|-------|-------|
| HP | 0–30 | 标准生命值 |
| 意志 (Resolve) | 0–20 | 精神强度，每刻恢复1点 |
| 尘埃 (Dust) | 0–100 | **负压** — 积累，达到100 = 死亡 |

## 许可证

MIT
