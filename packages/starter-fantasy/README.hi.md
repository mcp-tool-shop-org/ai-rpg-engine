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

# @ai-rpg-engine/starter-fantasy

**द चैपल थ्रेशोल्ड** — एआई आरपीजी इंजन के लिए एक डार्क फैंटेसी शुरुआती दुनिया।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/starter-fantasy
```

## आप क्या सीखेंगे

यह शुरुआती संस्करण एक संक्षिप्त दुनिया में इंजन के सभी पहलुओं को दर्शाता है:

| विशेषताएं | "द चैपल" क्या दिखाता है |
|---|---|
| **Rulesets** | `fantasyMinimalRuleset` — आंकड़े (ऊर्जा/अंतर्ज्ञान/इच्छाशक्ति), संसाधन (स्वास्थ्य/ऊर्जा), क्रियाएं, सूत्र |
| **Zones & traversal** | 2 कमरों में 5 क्षेत्र, जिनमें आस-पास का संबंध, प्रकाश स्तर, इंटरैक्टिव तत्व और खतरे शामिल हैं। |
| **Districts** | चैपल के मैदान (पवित्र) बनाम क्रिप्ट की गहराई (शापित, गुट-नियंत्रित)। |
| **Dialogue** | 3 रास्तों और वैश्विक-ध्वज प्रभावों के साथ, एक तीर्थयात्री के साथ संवाद। |
| **Combat** | एश गूल, जिसमें आक्रामक एआई प्रोफाइल, डर के संकेत और रक्षात्मक लक्ष्य शामिल हैं। |
| **Cognition & perception** | स्मृति क्षय, धारणा फ़िल्टर, और मृतकों के प्रस्तुतीकरण नियम। |
| **Progression** | 3-नोड का मुकाबला महारत वृक्ष, जिसमें इकाई को हराने पर अनुभव अंक (एक्सपी) पुरस्कार मिलते हैं। |
| **Environment** | अस्थिर फर्श का खतरा, जो क्षेत्र में प्रवेश करने पर ऊर्जा को कम करता है। |
| **Factions** | चैपल-मृतकों का गुट, जिसमें सामंजस्य सेटिंग है। |
| **Belief provenance** | विलंब के साथ अफवाहों का प्रसार, और विश्वास का पता लगाना। |
| **Inventory** | स्क्रिप्टेड उपयोग प्रभाव के साथ उपचार का औषधि (8 एचपी पुनर्स्थापित करता है)। |
| **Simulation inspector** | पुनरावृत्ति विश्लेषण के लिए पूरी तरह से जांच की सुविधा। |

## इसके अंदर क्या है

- **5 क्षेत्र** — खंडित चैपल प्रवेश द्वार, मुख्य भाग, छायादार कोना, वस्त्र कक्ष मार्ग, क्रिप्ट अग्रभाग।
- **1 एनपीसी** — संदिग्ध तीर्थयात्री (शाखाओं वाला संवाद, 3 वार्तालाप मार्ग)।
- **1 दुश्मन** — एश गूल (आक्रामक एआई, आग और पवित्र चीजों का डर)।
- **1 वस्तु** — उपचार का औषधि (स्क्रिप्टेड उपयोग प्रभाव, 8 एचपी पुनर्स्थापित करता है)।
- **1 प्रगति वृक्ष** — मुकाबला महारत (मजबूत → तेज दृष्टि → युद्ध का उन्माद)।
- **1 प्रस्तुतीकरण नियम** — मृत सभी जीवित प्राणियों को खतरे के रूप में देखते हैं।
- **15 मॉड्यूल** — नेविगेशन, स्थिति, मुकाबला, इन्वेंट्री, संवाद, अनुभूति, धारणा, प्रगति, वातावरण, गुट, अफवाहें, जिले, विश्वास, पर्यवेक्षक प्रस्तुतीकरण, निरीक्षक।

## उपयोग

```typescript
import { createGame } from '@ai-rpg-engine/starter-fantasy';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zones, pilgrimDialogue, fantasyMinimalRuleset } from '@ai-rpg-engine/starter-fantasy';
```

## दस्तावेज़

- [द चैपल थ्रेशोल्ड (अध्याय 20)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/20-chapel-threshold/)
- [हैंडबुक](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा निर्मित।
