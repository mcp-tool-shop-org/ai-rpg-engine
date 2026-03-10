<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए उपकरण स्लॉट, आइटम परिभाषाएं और उपकरण प्रबंधन।

## इंस्टॉलेशन

```bash
npm install @ai-rpg-engine/equipment
```

## यह क्या करता है

यह 5 स्लॉट (हथियार, कवच, एक्सेसरी, उपकरण, आभूषण) में पात्रों के उपकरणों का प्रबंधन करता है, जिसमें आइटम कैटलॉग, उपकरण संचालन, टैग-आधारित आवश्यकताएं और समग्र प्रभाव गणना शामिल हैं। सभी संचालन अपरिवर्तनीय हैं।

## उपयोग

### बनाएं और उपकरण पहनें

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

### इन्वेंट्री प्रबंधन

```typescript
import { addToInventory, removeFromInventory } from '@ai-rpg-engine/equipment';

let loadout = createEmptyLoadout();
loadout = addToInventory(loadout, 'healing-potion');
const { loadout: updated, removed } = removeFromInventory(loadout, 'healing-potion');
```

### सत्यापन

```typescript
import { validateLoadout } from '@ai-rpg-engine/equipment';

const result = validateLoadout(loadout, catalog, characterTags);
// result.ok, result.errors
```

## स्लॉट

| स्लॉट | उद्देश्य |
|------|---------|
| `weapon` | मुख्य आक्रामक वस्तु |
| `armor` | सुरक्षात्मक उपकरण |
| `accessory` | अंगूठी, ताबीज, संवर्धक |
| `tool` | उपयोगी वस्तु (ताला खोलने का उपकरण, स्कैनर) |
| `trinket` | ताबीज, बैज, निष्क्रिय वस्तु |

## आइटम की दुर्लभता

`सामान्य` | `असामान्य` | `दुर्लभ` | `पौराणिक`

## AI RPG Engine का हिस्सा

यह पैकेज [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरिपो का हिस्सा है।

## लाइसेंस

MIT
