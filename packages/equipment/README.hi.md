<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/उपकरण

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![लाइसेंस: एमआईटी](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[एआई आरपीजी इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए उपकरण स्लॉट, आइटम परिभाषाएँ और लोडआउट प्रबंधन।

## स्थापना करें

```bash
npm install @ai-rpg-engine/equipment
```

## यह क्या करता है

पात्र के उपकरणों को 5 स्लॉट्स (हथियार, कवच, एक्सेसरी, उपकरण, आभूषण) में प्रबंधित करता है, जिसमें आइटम कैटलॉग, लोडआउट संचालन, टैग-आधारित आवश्यकताएं और एकत्रित प्रभाव गणना शामिल हैं। सभी संचालन अपरिवर्तनीय हैं।

## उपयोग

### बनाएँ और लैस करें

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
| `weapon` | प्राथमिक आक्रामक आइटम |
| `armor` | रक्षात्मक उपकरण |
| `accessory` | अंगूठी, ताबीज, संवर्धक |
| `tool` | उपयोगी वस्तु (लॉकपिक, स्कैनर) |
| `trinket` | आकर्षण, बैज, निष्क्रिय आइटम |

## आइटम दुर्लभता

`सामान्य` | `असाधारण` | `दुर्लभ` | `पौराणिक`

## पुरातन विकास - एक ऐसा उपकरण जो नाम अर्जित करता है

एक आइटम जिसने कुछ किया है, वह इतिहास जमा करता है, और इतिहास से एक नाम मिलता है। एक कटलास जिसने तीन लोगों की जान ली है, वह **ब्लडीड कटलास** बन जाता है। विकास आइटम के कालक्रम से गणना की जाती है, कभी भी लेखक द्वारा नहीं।

`evaluateRelicGrowth` रीड साइड है - यह एक कालक्रम को एक स्तर और एक उपनाम में बदल देता है:

```typescript
import { evaluateRelicGrowth } from '@ai-rpg-engine/equipment';

const relic = evaluateRelicGrowth(item, chronicle, currentTick);
// -> { currentEpithet: 'Bloodied Cutlass', milestonesReached: [...], tier: 1 }
```

पांच ट्रिगर इसे चलाते हैं - `किल-काउंट`, `आयु`, `मान्यता-गिनती`, `गुट-हत्याएं`, `बॉस-हत्या` - जो कालक्रम से गणना की जाती हैं। हथियार डिफ़ॉल्ट रूप से `DEFAULT_WEAPON_MILESTONES` पर सेट होते हैं, बाकी सब कुछ `DEFAULT_ARMOR_MILESTONES` पर; एक पैक प्रति आइटम इसे बदल सकता है।

`createItemChronicleCore` राइट साइड है: एक **ऑप्ट-इन** `EngineModule` जो वास्तविक गेमप्ले से इतिहास रिकॉर्ड करता है।

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

यह `अक्वायर्ड` (पहली बार उठाना या लैस करना), `यूस्ड-इन-किल` (हत्यारे के लैस किए गए हथियार को श्रेय दिया जाता है), और `रिकॉग्नाइज्ड` (जब आपके क्षेत्र में कोई व्यक्ति आपकी उत्पत्ति पर प्रतिक्रिया करता है) रिकॉर्ड करता है। `@ai-rpg-engine/modules` पर रनटाइम निर्भरता नहीं होने के कारण, `मान्यता` आयात करने के बजाय इंजेक्ट की जाती है। `getItemDisplayName`, `getRelicSummary`, `getItemChronicle` से विकास को वापस पढ़ें, या मांग पर `refreshRelicSummaries` से फिर से आयु निर्धारित करें।

रिकॉर्डिंग नियतात्मक है - घटना-संचालित, `event.tick` पर आधारित, कोई दीवार घड़ी और कोई आरएनजी ड्रा नहीं। एक ऐसा गेम जो मॉड्यूल को नहीं जोड़ता है, वह उससे पहले के संस्करण की तरह ही होगा, और मॉड्यूल कोई नामस्थान डिफ़ॉल्ट पंजीकृत नहीं करता है, इसलिए एक ऐसी दुनिया जहां कुछ भी कालक्रमबद्ध नहीं है, वह कभी भी उस स्थिति को उत्पन्न नहीं करेगी।

## एआई आरपीजी इंजन का हिस्सा

यह पैकेज [एआई आरपीजी इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरेपो का हिस्सा है।

## लाइसेंस

एमआईटी
