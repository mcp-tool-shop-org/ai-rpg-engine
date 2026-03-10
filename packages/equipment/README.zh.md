<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

为 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 提供的装备槽位、物品定义和装备管理功能。

## 安装

```bash
npm install @ai-rpg-engine/equipment
```

## 功能

管理角色装备，包括 5 个槽位（武器、护甲、饰品、工具、饰物），提供物品目录、装备操作、基于标签的要求以及效果计算。所有操作都是不可变的。

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

### 物品管理

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

## 槽位

| 槽位 | 用途 |
|------|---------|
| `weapon` | 主要攻击型物品 |
| `armor` | 防御装备 |
| `accessory` | 戒指、护身符、增益 |
| `tool` | 实用物品（开锁器、扫描仪） |
| `trinket` | 护身符、徽章、被动物品 |

## 物品稀有度

`common` | `uncommon` | `rare` | `legendary`

## AI RPG Engine 的一部分

此包是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 单仓库项目的一部分。

## 许可证

MIT
