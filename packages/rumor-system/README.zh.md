<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/rumor-system

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/rumor-system)](https://www.npmjs.com/package/@ai-rpg-engine/rumor-system)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

用于 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的传言生命周期引擎，具有变异机制、传播追踪和派系影响功能。

## 安装

```bash
npm install @ai-rpg-engine/rumor-system
```

## 功能

传言在传播过程中会发生变异。例如，“玩家杀了一个商人”可能会在经过几轮恐慌的守卫传播后变成“玩家屠杀了五个商人”。该引擎会跟踪可信度衰减、情感强度、传播路径、变异次数以及派系影响，使 NPC 的八卦成为一个模拟系统，而不是简单的复制粘贴。

## 用法

### 创建和传播传言

```typescript
import { RumorEngine } from '@ai-rpg-engine/rumor-system';

const engine = new RumorEngine();

// A guard witnesses a killing
const rumor = engine.create({
  claim: 'player killed merchant_1',
  subject: 'player',
  key: 'killed_merchant',
  value: true,
  sourceId: 'guard_1',
  originTick: 42,
  confidence: 0.9,
  emotionalCharge: -0.7,
});

// The rumor spreads — mutations may apply
const spread = engine.spread(rumor.id, {
  spreaderId: 'guard_1',
  spreaderFactionId: 'town_guard',
  receiverId: 'guard_2',
  receiverFactionId: 'town_guard',
  environmentInstability: 0.3,
  hopCount: 1,
});

// Track which factions absorbed the rumor
engine.recordFactionUptake(rumor.id, 'town_guard');
```

### 变异规则

在每次传播过程中，有五个内置的变异规则会以概率触发：

| 变异类型 | 概率 | 效果 |
|----------|------------|--------|
| **exaggerate** | 15% | 数值增加 20-50% |
| **minimize** | 10% | 数值减少 |
| **invert** | 5% | 布尔值翻转（罕见，效果显著） |
| **attribute-shift** | 8% | 归属者更改为传播者 |
| **embellish** | 20% | 情感强度加剧 |

环境不稳定会使所有概率倍增。

### 传言生命周期

```
spreading → established → fading → dead
```

- **spreading（传播中）**：正在在实体之间传递。
- **established（已建立）**：已达到最大传播次数，广为人知。
- **fading（逐渐消失）**：在 `fadingThreshold` 周期内没有新的传播。
- **dead（已失效）**：在 `deathThreshold` 周期内没有活动。

```typescript
// Update lifecycle statuses
engine.tick(currentTick);

// Query active rumors
const activeRumors = engine.query({ status: 'spreading', minConfidence: 0.5 });
const playerRumors = engine.aboutSubject('player');
```

### 配置

```typescript
const engine = new RumorEngine({
  maxHops: 5,              // Transitions to 'established' after this
  confidenceDecayPerHop: 0.1,
  fadingThreshold: 10,     // Ticks inactive → 'fading'
  deathThreshold: 30,      // Ticks inactive → 'dead'
  mutations: customRules,  // Replace default mutations
});
```

### 自定义变异规则

```typescript
import type { MutationRule } from '@ai-rpg-engine/rumor-system';

const panicMutation: MutationRule = {
  id: 'panic',
  type: 'exaggerate',
  probability: 0.30,
  apply: (rumor, ctx) => ({
    ...rumor,
    emotionalCharge: Math.max(-1, rumor.emotionalCharge - 0.3),
    mutationCount: rumor.mutationCount + 1,
  }),
};
```

## 序列化

`RumorEngine` 支持 `serialize()` 和 `RumorEngine.deserialize()` 方法，用于持久化数据。

## AI RPG Engine 的一部分

此包是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 单一代码仓库的一部分。它可以独立使用，也可以与引擎的认知和派系系统集成。

## 许可证

MIT
