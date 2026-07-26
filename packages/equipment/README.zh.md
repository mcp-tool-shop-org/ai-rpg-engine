<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

用于[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)的装备栏、物品定义和装备管理。

## 安装

```bash
npm install @ai-rpg-engine/equipment
```

## 功能介绍

管理角色在五个装备栏（武器、盔甲、饰品、工具、小饰品）中的装备，使用物品目录、装备操作、基于标签的条件和综合效果计算。所有操作都是不可变的。

## 用法

### 创建和装备

```typescript
import {
  createEmptyLoadout,
  equipItem,
  computeLoadoutEffects,
} from '@ai-rpg-engine/equipment';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

const catalog: ItemCatalog = {
  items: [
    {
      id: 'iron-sword',
      name: 'Iron Sword',
      description: 'A sturdy blade.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { str: 2 },
      grantedTags: ['armed'],
      grantedVerbs: ['slash'],
    },
  ],
};

let loadout = createEmptyLoadout();
const result = equipItem(loadout, 'iron-sword', catalog, []);
// result.loadout.equipped.weapon === 'iron-sword'
// result.errors === []

const effects = computeLoadoutEffects(result.loadout, catalog);
// effects.statModifiers.str === 2
// effects.grantedTags === ['armed']
```

### 物品栏管理

```typescript
import { addToInventory, removeFromInventory } from '@ai-rpg-engine/equipment';

let loadout = createEmptyLoadout();
loadout = addToInventory(loadout, 'healing-potion');
const { loadout: updated, removed } = removeFromInventory(loadout, 'healing-potion');
```

### 验证

```typescript
import { validateLoadout } from '@ai-rpg-engine/equipment';

const result = validateLoadout(loadout, catalog, characterTags);
// result.ok, result.errors
```

## 装备栏

| 装备栏 | 用途 |
|------|---------|
| `weapon` | 主要攻击性武器 |
| `armor` | 防御装备 |
| `accessory` | 戒指、护身符、增强物品 |
| `tool` | 实用工具（开锁器、扫描仪） |
| `trinket` | 护身符、徽章、被动物品 |

## 物品稀有度

`common` | `uncommon` | `rare` | `legendary`

## 圣物成长——一件获得名称的装备

一件经历过某些事件的物品会积累历史，而历史则赋予它一个名称。一把夺走过三条人命的弯刀将变成**血染弯刀**。成长是根据物品的历史计算得出的，而不是人为设定的。

`evaluateRelicGrowth` 是读取部分——它将历史转化为等级和称号：

```typescript
import { evaluateRelicGrowth } from '@ai-rpg-engine/equipment';

const relic = evaluateRelicGrowth(item, chronicle, currentTick);
// -> { currentEpithet: 'Bloodied Cutlass', milestonesReached: [...], tier: 1 }
```

五个触发因素驱动着这个过程——`kill-count`（击杀数）、`age`（年龄）、`recognition-count`（被识别次数）、`faction-kills`（阵营击杀数）和 `boss-kill`（Boss 击杀数），这些数据都来自物品的历史记录。武器默认为 `DEFAULT_WEAPON_MILESTONES`，其他物品默认为 `DEFAULT_ARMOR_MILESTONES`；可以通过配置来为每个物品进行覆盖。

`createItemChronicleCore` 是写入部分：一个**可选的** `EngineModule`，用于记录实际游戏中的历史。

```typescript
import { createItemChronicleCore, getItemDisplayName } from '@ai-rpg-engine/equipment';
import { evaluateItemRecognition } from '@ai-rpg-engine/modules';

// add to your engine's module list
createItemChronicleCore({
  catalog: itemCatalog,
  recognition: { evaluate: evaluateItemRecognition }, // optional
})

getItemDisplayName(world, 'cutlass', 'Cutlass'); // 'Bloodied Cutlass'
```

它会记录 `acquired`（首次拾取或装备）、`used-in-kill`（归功于击杀者所装备的武器）和 `recognized`（当你的区域内有人对你的物品产生反应时）。`recognition` 是通过注入的方式添加，而不是导入，因为这个包不依赖于 `@ai-rpg-engine/modules`。可以使用 `getItemDisplayName`、`getRelicSummary`、`getItemChronicle` 来读取成长数据，或者使用 `refreshRelicSummaries` 在需要时重新计算。

记录是确定性的——基于事件驱动，以 `event.tick` 为关键，不依赖于系统时间或随机数生成器。如果游戏没有添加这个模块，那么它与在模块存在之前构建的游戏将完全相同，并且该模块不会注册任何默认命名空间，因此在一个没有任何物品被记录的世界中，也不会产生任何状态。

## AI RPG Engine 的一部分

这个包是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 单仓库项目的一部分。

## 许可证

MIT
