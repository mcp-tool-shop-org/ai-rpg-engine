<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-colony

**信号中断** — 一个偏远的殖民地与地球失去了联系。 在地下的洞穴中，似乎有什么东西是活着的。

是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 启动包目录的一部分。

## 主题

科幻殖民地管理 + 外星接触。 能源是殖民地共享的资源——当能源下降时，系统会依次失效。 外星生物将殖民者视为“干扰谐振模式”。

## 快速开始

```typescript
import { createGame } from '@ai-rpg-engine/starter-colony';

const engine = createGame();
engine.start();
```

## 内容

- **5 个区域：** 指挥模块、水培区、外围围栏、信号塔、外星洞穴
- **2 个 NPC：** 瓦斯奎兹博士（科学家）、奥卡福警长（安保）
- **2 个敌人：** 破损无人机、谐振实体
- **1 个对话树：** 瓦斯奎兹博士关于外星信号和殖民地政治的简报
- **1 个成长树：** 指挥官路线（现场工程师 → 敏锐感知 → 坚不可摧）
- **1 个物品：** 应急电池（恢复 20 点能量）

## 独特机制

| 动词 | 描述 |
|------|-------------|
| `scan` | 使用感知进行扫描 |
| `allocate` | 在殖民地系统之间重新分配能量 |

## 属性与资源

| 属性 | 角色 |
|------|------|
| 工程 | 修复和构建系统 |
| 指挥 | 领导力和船员士气 |
| 感知 | 传感器和感知 |

| 资源 | 范围 | 备注 |
|----------|-------|-------|
| HP | 0–25 | 标准生命值 |
| 能量 | 0–100 | 殖民地共享资源，每刻恢复 2 点 |
| 士气 | 0–30 | 船员凝聚力 |

## 许可证

MIT
