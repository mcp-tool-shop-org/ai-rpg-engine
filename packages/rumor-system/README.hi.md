<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/rumor-system

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/rumor-system)](https://www.npmjs.com/package/@ai-rpg-engine/rumor-system)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए अफवाहों के जीवनचक्र को नियंत्रित करने वाला इंजन, जिसमें परिवर्तन (mutation) की क्रियाविधि, प्रसार (spread) का पता लगाना और गुटों (factions) द्वारा इसे अपनाना शामिल है।

## स्थापना

```bash
npm install @ai-rpg-engine/rumor-system
```

## यह क्या करता है

अफवाहें फैलने के साथ-साथ बदलती हैं। "खिलाड़ी ने एक व्यापारी को मार डाला" यह बात कुछ घबराए हुए गार्डों के माध्यम से फैलने के बाद "खिलाड़ी ने पांच व्यापारियों को मार डाला" में बदल जाती है। यह इंजन विश्वास में कमी, भावनात्मक प्रभाव, प्रसार के मार्गों, परिवर्तनों की संख्या और गुटों द्वारा इसे अपनाने की जानकारी रखता है - जिससे NPC की गपशप एक सिमुलेशन प्रणाली बन जाती है, न कि कॉपी-पेस्ट।

## उपयोग

### अफवाहें बनाएं और फैलाएं

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

### परिवर्तन नियम

प्रत्येक प्रसार के दौरान, पांच अंतर्निहित परिवर्तन संभाव्यता के आधार पर लागू होते हैं:

| परिवर्तन | संभावना | प्रभाव |
|----------|------------|--------|
| **exaggerate** | 15% | संख्यात्मक मान 20-50% तक बढ़ जाते हैं |
| **minimize** | 10% | संख्यात्मक मान घट जाते हैं |
| **invert** | 5% | बूलियन मान बदल जाते हैं (दुर्लभ, नाटकीय) |
| **attribute-shift** | 8% | जिम्मेदारी फैलाने वाले पर स्थानांतरित हो जाती है |
| **embellish** | 20% | भावनात्मक प्रभाव तीव्र हो जाता है |

पर्यावरण अस्थिरता सभी संभावनाओं को बढ़ा देती है।

### अफवाह का जीवनचक्र

```
spreading → established → fading → dead
```

- **प्रसार (spreading)** — सक्रिय रूप से संस्थाओं के बीच प्रसारित हो रहा है
- **स्थापित (established)** — अधिकतम प्रसार (maxHops) तक पहुंच गया है, व्यापक रूप से ज्ञात है
- **लुप्त हो रहा (fading)** — fadingThreshold टिक के लिए कोई नया प्रसार नहीं
- **मृत (dead)** — deathThreshold टिक के लिए कोई गतिविधि नहीं

```typescript
// Update lifecycle statuses
engine.tick(currentTick);

// Query active rumors
const activeRumors = engine.query({ status: 'spreading', minConfidence: 0.5 });
const playerRumors = engine.aboutSubject('player');
```

### कॉन्फ़िगरेशन

```typescript
const engine = new RumorEngine({
  maxHops: 5,              // Transitions to 'established' after this
  confidenceDecayPerHop: 0.1,
  fadingThreshold: 10,     // Ticks inactive → 'fading'
  deathThreshold: 30,      // Ticks inactive → 'dead'
  mutations: customRules,  // Replace default mutations
});
```

### कस्टम परिवर्तन

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

## सीरियलाइज़ेशन

`RumorEngine` में `serialize()` और `RumorEngine.deserialize()` फ़ंक्शन हैं, जिनका उपयोग डेटा को सहेजने और पुनः प्राप्त करने के लिए किया जा सकता है।

## AI RPG Engine का हिस्सा

यह पैकेज [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरिपो का हिस्सा है। यह स्वतंत्र रूप से काम करता है या इंजन की अनुभूति और गुट प्रणालियों के साथ एकीकृत हो सकता है।

## लाइसेंस

MIT
