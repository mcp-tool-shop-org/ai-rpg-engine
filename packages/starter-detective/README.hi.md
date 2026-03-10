<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-detective

**गैसलाइट डिटेक्टिव** — एआई आरपीजी इंजन के लिए एक विक्टोरियन रहस्य से प्रेरित शुरुआती दुनिया।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/starter-detective
```

## आप क्या सीखेंगे

यह शुरुआती संस्करण एक जांच परिदृश्य के माध्यम से इंजन के सभी पहलुओं को दर्शाता है:

| विशेषताएं | 'डिटेक्टिव' क्या दिखाता है |
|---|---|
| **Rulesets** | `detectiveMinimalRuleset` — आँकड़े (धारणा/वाक्पटुता/दृढ़ता), संसाधन (स्वास्थ्य/आत्म-नियंत्रण), क्रियाएं, सूत्र। |
| **Zones & traversal** | 2 कमरों में 5 क्षेत्र, जिनमें आस-पास का संबंध, प्रकाश स्तर, इंटरैक्टिव तत्व और खतरे शामिल हैं। |
| **Districts** | एशफोर्ड एस्टेट (अभिजात वर्ग) बनाम डॉकयार्ड्स (डॉकर कार्यकर्ताओं का गुट)। |
| **Dialogue** | साक्ष्य एकत्र करने और वैश्विक प्रभाव वाले, शाखाओं वाले पूछताछ वाले विधवा। |
| **Combat** | डॉक थग, जिसमें आक्रामक एआई प्रोफाइल और क्षेत्रीय लक्ष्य हैं। |
| **Cognition & perception** | स्मृति क्षय, धारणा फ़िल्टर, संदिग्धों के संदेह को दर्शाने का नियम। |
| **Progression** | 3-नोड डिडक्शन मास्टरि ट्री, जिसमें इकाई को हराने पर एक्सपी पुरस्कार मिलते हैं। |
| **Environment** | एक खतरनाक गली जो क्षेत्र में प्रवेश करने पर आत्म-नियंत्रण को कम करती है। |
| **Factions** | डॉकर कार्यकर्ताओं का गुट, जिसमें सामंजस्य सेटिंग है। |
| **Belief provenance** | विलंब के साथ अफवाहों का प्रसार, विश्वास का पता लगाना। |
| **Inventory** | सुगंधित लवण, जिसमें स्क्रिप्टेड आइटम-उपयोग प्रभाव है। |
| **Simulation inspector** | पुनरावृत्ति विश्लेषण के लिए पूरी तरह से निरीक्षण प्रणाली। |

## इसके अंदर क्या है

- **5 क्षेत्र** — अध्ययन कक्ष (अपराध स्थल), बैठक कक्ष, नौकरों का हॉल, मुख्य प्रवेश द्वार, पिछला गली।
- **3 एनपीसी** — लेडी एशफोर्ड (विधवा/संदिग्ध), कांस्टेबल पाईक (कानून), श्रीमती कैलोवे (नौकरानी/गवाह)।
- **1 दुश्मन** — डॉक थग (आक्रामक एआई, क्षेत्रीय)।
- **1 वस्तु** — सुगंधित लवण (6 आत्म-नियंत्रण को बहाल करता है)।
- **1 प्रगति ट्री** — डिडक्शन मास्टरि (तीव्र दृष्टि → चांदी की जीभ → लोहे की नसें)।
- **1 प्रस्तुति नियम** — संदिग्ध जांच को धमकी भरा मानते हैं।
- **15 मॉड्यूल** — नेविगेशन, स्थिति, मुकाबला, इन्वेंट्री, संवाद, अनुभूति, धारणा, प्रगति, वातावरण, गुट, अफवाहें, जिले, विश्वास, पर्यवेक्षक प्रस्तुति, निरीक्षक।

## उपयोग

```typescript
import { createGame } from '@ai-rpg-engine/starter-detective';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, detectiveMinimalRuleset, deductionMasteryTree } from '@ai-rpg-engine/starter-detective';
```

## दस्तावेज़

- [हैंडबुक](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा निर्मित।
