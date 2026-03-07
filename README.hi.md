<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

<p align="center">A simulation-first terminal RPG engine for worlds shaped by perception, cognition, and consequence.</p>

---

## यह क्या है

AI RPG इंजन एक मॉड्यूलर रनटाइम है जिसका उपयोग टर्मिनल RPG बनाने के लिए किया जाता है, जहाँ क्रियाएं जानकारी बनाती हैं, जानकारी विकृत होती है, और परिणाम उन चीजों से उत्पन्न होते हैं जिन पर पात्रों का मानना है कि क्या हुआ।

यह इंजन दुनिया की वास्तविक स्थिति को बनाए रखता है, साथ ही अविश्वसनीय कथा, पात्रों के बीच धारणा में अंतर और परतदार कहानी कहने का समर्थन करता है। यह शैली-अज्ञेयवादी है - एक ही मूल कोड डार्क फंतासी, साइबरपंक या किसी अन्य सेटिंग को प्लग करने योग्य नियमों के माध्यम से चलाता है।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/core @ai-rpg-engine/modules @ai-rpg-engine/content-schema
```

## शुरुआत कैसे करें

```typescript
import { Engine } from '@ai-rpg-engine/core';
import {
  combatCore, dialogueCore, inventoryCore, traversalCore,
  statusCore, environmentCore, cognitionCore, perceptionFilter,
} from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game', version: '1.0.0',
    engineVersion: '1.0.0', ruleset: 'fantasy',
    modules: ['combat-core', 'dialogue-core', 'cognition-core'],
    contentPacks: [],
  },
  seed: 42,
  modules: [
    combatCore(), dialogueCore(), inventoryCore(),
    traversalCore(), statusCore(), environmentCore(),
    cognitionCore(), perceptionFilter(),
  ],
});

// Submit an action
const events = engine.submitAction('attack', {
  targetIds: ['guard-01'],
});

// Every action produces structured events
for (const event of events) {
  console.log(event.type, event.payload);
}
```

## आर्किटेक्चर

```
Engine
  WorldStore      — entities, zones, quests, factions, RNG, event log
  ActionDispatcher — verb handlers, validators
  ModuleManager   — modules, formulas, rules, persistence
  Presentation    — channels that route (and can distort) events
```

प्रत्येक स्थिति परिवर्तन एक ही पाइपलाइन से होकर गुजरता है:

```
action --> validation --> resolution --> events --> presentation
```

## पैकेज

| पैकेज | उद्देश्य |
|---------|---------|
| `@ai-rpg-engine/core` | स्थिति, इकाइयां, क्रियाएं, घटनाएं, नियम, RNG, दृढ़ता |
| `@ai-rpg-engine/modules` | 17 अंतर्निहित सिमुलेशन मॉड्यूल |
| `@ai-rpg-engine/content-schema` | सामग्री स्कीमा और सत्यापनकर्ता |
| `@ai-rpg-engine/terminal-ui` | टर्मिनल रेंडरर और इनपुट लेयर |
| `@ai-rpg-engine/cli` | डेवलपर CLI: चलाएं, पुनः चलाएं, निरीक्षण करें |
| `@ai-rpg-engine/starter-fantasy` | द चैपल थ्रेशोल्ड (फंतासी डेमो) |
| `@ai-rpg-engine/starter-cyberpunk` | नियॉन लॉकबॉक्स (साइबरपंक डेमो) |

## अंतर्निहित मॉड्यूल

| मॉड्यूल | यह क्या करता है |
|--------|-------------|
| combat-core | हमला/रक्षा, क्षति, पराजय, सहनशक्ति |
| dialogue-core | शर्तों के साथ ग्राफ-आधारित संवाद पेड़ |
| inventory-core | वस्तुएं, उपकरण, उपयोग/उपकरण/हटाना |
| traversal-core | ज़ोन गति और निकास सत्यापन |
| status-core | अवधि और संचय के साथ स्थिति प्रभाव |
| environment-core | गतिशील ज़ोन गुण, खतरे, क्षरण |
| cognition-core | AI विश्वास, इरादा, मनोबल, स्मृति |
| perception-filter | संवेदी चैनल, स्पष्टता, क्रॉस-ज़ोन श्रवण |
| narrative-authority | सत्य बनाम प्रस्तुति, छिपाना, विकृति |
| progression-core | मुद्रा-आधारित उन्नति, कौशल पेड़ |
| faction-cognition | गुटों के विश्वास, विश्वास, गुटों के बीच ज्ञान |
| rumor-propagation | आत्मविश्वास के क्षरण के साथ जानकारी का प्रसार |
| knowledge-decay | समय-आधारित आत्मविश्वास का क्षरण |
| district-core | स्थानिक स्मृति, ज़ोन मेट्रिक्स, अलर्ट थ्रेशोल्ड |
| belief-provenance | धारणा/संज्ञा/अफवाह में ट्रेस पुनर्निर्माण |
| observer-presentation | प्रत्येक पर्यवेक्षक के लिए घटना फ़िल्टरिंग, विचलन ट्रैकिंग |
| simulation-inspector | रनटाइम निरीक्षण, स्वास्थ्य जांच, निदान |

## प्रमुख डिज़ाइन निर्णय

- **सिमुलेशन सत्य पवित्र है** - इंजन वस्तुनिष्ठ स्थिति बनाए रखता है। प्रस्तुति परतें झूठ बोल सकती हैं, लेकिन दुनिया का सत्य मानक है।
- **क्रियाएं घटनाएं बनाती हैं** - कोई भी सार्थक स्थिति परिवर्तन चुपचाप नहीं होता है। हर चीज संरचित, क्वेरी योग्य घटनाओं का उत्सर्जन करती है।
- **निर्धारित पुनः प्ले** - सीडेड RNG और क्रिया पाइपलाइन समान इनपुट से समान परिणाम की गारंटी देती है।
- **सामग्री डेटा है** - कमरे, इकाइयां, संवाद, वस्तुएं डेटा के रूप में परिभाषित हैं, कोड के रूप में नहीं।
- **शैली नियमों के सेट से संबंधित है** - इंजन तलवारों बनाम लेजर के बारे में कोई राय नहीं रखता है।

## सुरक्षा और विश्वास

AI RPG इंजन एक **स्थानीय-केवल सिमुलेशन लाइब्रेरी** है।

- **डेटा जिस पर संपर्क किया जाता है:** केवल इन-मेमोरी गेम स्थिति। CLI सहेजने का उपयोग किए जाने पर सहेजी फ़ाइलें `.ai-rpg-engine/` में लिखी जाती हैं।
- **डेटा जिस पर संपर्क नहीं किया जाता है:** सहेजी फ़ाइलों से परे कोई फ़ाइल सिस्टम एक्सेस नहीं, कोई नेटवर्क नहीं, कोई पर्यावरण चर नहीं, कोई सिस्टम संसाधन नहीं।
- **कोई टेलीमेट्री नहीं।** कोई डेटा एकत्र या कहीं भेजा नहीं जाता है।
- **कोई रहस्य नहीं।** इंजन क्रेडेंशियल नहीं पढ़ता, संग्रहीत नहीं करता या प्रसारित नहीं करता है।

सुरक्षा नीति के बारे में पूरी जानकारी के लिए, [SECURITY.md](SECURITY.md) देखें।

## आवश्यकताएं

- Node.js >= 20
- TypeScript (ESM मॉड्यूल)

## दस्तावेज़ीकरण

- [हैंडबुक](docs/handbook/index.md) — 25 अध्याय + 4 परिशिष्ट
- [डिज़ाइन अवलोकन](docs/DESIGN.md) — आर्किटेक्चर का गहन विश्लेषण
- [परिवर्तन लॉग](CHANGELOG.md)

## लाइसेंस

[MIT](LICENSE)

---

यह <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा बनाया गया है।
