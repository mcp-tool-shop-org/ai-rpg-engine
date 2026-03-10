<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/campaign-memory

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/campaign-memory)](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

为 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 提供的持久 NPC 记忆、多维度关系和战役日志。

## 安装

```bash
npm install @ai-rpg-engine/campaign-memory
```

## 功能

NPC 会记住发生的事情。 不仅仅是“敌对：true”，他们会跟踪信任、恐惧、钦佩和熟悉度，这些指标会随着每次互动而变化。 记忆会随着时间的推移而逐渐淡化：鲜明 → 模糊 → 黯淡 → 被遗忘。 战役日志会记录重要的事件，并在不同的游戏会话中保持一致。

## 用法

### 战役日志

```typescript
import { CampaignJournal } from '@ai-rpg-engine/campaign-memory';

const journal = new CampaignJournal();

// Record a significant event
const record = journal.record({
  tick: 42,
  category: 'kill',
  actorId: 'player',
  targetId: 'merchant_1',
  zoneId: 'market',
  description: 'Player killed the merchant during a robbery',
  significance: 0.9,
  witnesses: ['guard_1', 'bystander_2'],
  data: { weapon: 'dagger' },
});

// Query the journal
const playerActions = journal.query({ actorId: 'player', category: 'kill' });
const merchantHistory = journal.getInvolving('merchant_1');
```

### NPC 记忆库

```typescript
import { NpcMemoryBank, applyRelationshipEffect } from '@ai-rpg-engine/campaign-memory';

const guardMemory = new NpcMemoryBank('guard_1');

// Guard witnesses the player killing a merchant
guardMemory.remember(record, 0.9, -0.8);      // high salience, very negative
applyRelationshipEffect(guardMemory, record, 'witness');

// Check how the guard feels about the player
const rel = guardMemory.getRelationship('player');
// { trust: -0.15, fear: 0.25, admiration: -0.05, familiarity: 0 }

// Later, memories fade
guardMemory.consolidate(currentTick);
const memories = guardMemory.recall({ aboutEntity: 'player', minSalience: 0.5 });
```

### 关系维度

| 维度 | 范围 | 含义 |
|------|-------|---------|
| 信任 | -1 到 1 | 不信任 → 信任 |
| 恐惧 | 0 到 1 | 无惧 → 极度恐惧 |
| 钦佩 | -1 到 1 | 鄙视 → 钦佩 |
| 熟悉度 | 0 到 1 | 陌生人 → 亲密 |

### 记录类别

`action` (行动) · `combat` (战斗) · `kill` (杀戮) · `betrayal` (背叛) · `gift` (礼物) · `theft` (盗窃) · `debt` (债务) · `discovery` (发现) · `alliance` (联盟) · `insult` (侮辱) · `rescue` (救援) · `death` (死亡)

每个类别都有默认的关系影响。 救援会增加信任 (+0.4) 和钦佩 (+0.3)。 背叛会破坏信任 (-0.5)。

### 记忆巩固

记忆会通过三个阶段随着时间而衰减：

- **鲜明 (vivid)** — 显著性高，最近形成的
- **模糊 (faded)** — 显著性低于衰减阈值
- **黯淡 (dim)** — 几乎被遗忘，即将被遗忘

可以为每个 NPC 或全局配置衰减率。

## 序列化

`CampaignJournal` 和 `NpcMemoryBank` 都支持 `serialize()` 和 `deserialize()` 方法，以便在不同的游戏会话中保持持久性。

## AI RPG Engine 的一部分

此软件包是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 单一代码仓库的一部分。 它可以独立使用，也可以与引擎的认知和传闻系统集成。

## 许可证

MIT
