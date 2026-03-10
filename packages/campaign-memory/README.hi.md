<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/campaign-memory

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/campaign-memory)](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए स्थायी एनपीसी (चरित्र) मेमोरी, बहु-आयामी संबंध और अभियान जर्नल।

## इंस्टॉलेशन

```bash
npm install @ai-rpg-engine/campaign-memory
```

## यह क्या करता है

एनपीसी (चरित्र) याद रखते हैं कि क्या हुआ। सिर्फ "दुश्मन: सत्य" नहीं, बल्कि वे हर बातचीत में विश्वास, डर, प्रशंसा और परिचितता को ट्रैक करते हैं। समय के साथ यादें फीकी पड़ जाती हैं: स्पष्ट → फीका → धुंधला → भुला दिया गया। अभियान जर्नल सत्रों में महत्वपूर्ण घटनाओं को बरकरार रखता है।

## उपयोग

### अभियान जर्नल

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

### एनपीसी मेमोरी बैंक

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

### संबंधों के आयाम

| आयाम | रेंज (दायरा) | अर्थ |
|------|-------|---------|
| विश्वास | -1 से 1 | अविश्वास → विश्वास |
| डर | 0 से 1 | बेखबर → भयभीत |
| प्रशंसा | -1 से 1 | तिरस्कार → प्रशंसा |
| परिचितता | 0 से 1 | अजनबी → करीबी |

### रिकॉर्ड श्रेणियां

`action` (क्रिया) · `combat` (लड़ाई) · `kill` (मारना) · `betrayal` (गद्दार) · `gift` (उपहार) · `theft` (चोरी) · `debt` (कर्ज) · `discovery` (खोज) · `alliance` (गठबंधन) · `insult` (अपमान) · `rescue` (बचाव) · `death` (मृत्यु)

प्रत्येक श्रेणी में डिफ़ॉल्ट संबंध प्रभाव होते हैं। एक बचाव विश्वास (+0.4) और प्रशंसा (+0.3) बढ़ाता है। एक गद्दार विश्वास को नष्ट कर देता है (-0.5)।

### मेमोरी कंसोलिडेशन (स्मृति समेकन)

यादें समय के साथ तीन चरणों में कमजोर होती जाती हैं:

- **vivid** (स्पष्ट) — उच्च महत्व, हाल ही में बनाई गई
- **faded** (फीका) — महत्व फीका होने की सीमा से नीचे
- **dim** (धुंधला) — मुश्किल से याद है, भुलाने वाला

प्रत्येक एनपीसी के लिए या वैश्विक स्तर पर क्षय दरें कॉन्फ़िगर करें।

## सीरियलाइजेशन (क्रमिकरण)

`CampaignJournal` और `NpcMemoryBank` दोनों ही सत्रों में निरंतरता के लिए `serialize()` और `deserialize()` का समर्थन करते हैं।

## AI RPG इंजन का हिस्सा

यह पैकेज [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरिपो का हिस्सा है। यह स्टैंडअलोन रूप से काम करता है या इंजन की अनुभूति और अफवाह प्रणालियों के साथ एकीकृत होता है।

## लाइसेंस

MIT
