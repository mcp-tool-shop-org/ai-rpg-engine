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

# @ai-rpg-engine/starter-cyberpunk

**नियॉन लॉकबॉक्स** — एआई आरपीजी इंजन के लिए एक साइबरपंक शुरुआती दुनिया।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/starter-cyberpunk
```

## आप क्या सीखेंगे

यह शुरुआती संस्करण शैली की लचीलापन दर्शाता है - एक ही इंजन, लेकिन पूरी तरह से अलग आँकड़ों का मॉडल:

| विशेषताएँ | लॉकबॉक्स में क्या दिखाया गया है |
|---|---|
| **Rulesets** | `cyberpunkMinimalRuleset` — आँकड़े (क्रोम/रिफ्लेक्स/नेटरनिंग), संसाधन (एचपी/आइस/बैंडविड्थ), 8 क्रियाएं, जिनमें `हैक` और `जैक-इन` शामिल हैं। |
| **Zones & traversal** | 3 क्षेत्र (सड़क → सर्वर रूम → वॉल्ट) जिनमें रोशनी, खतरे और इंटरैक्टिव तत्व हैं। |
| **Districts** | नियॉन स्ट्रीट ब्लॉक (सार्वजनिक) बनाम वॉल्ट कॉम्प्लेक्स (सुरक्षित, गुट-नियंत्रित)। |
| **Dialogue** | फिक्सर की जानकारी, जिसमें 3 शाखाएं और वैश्विक-ध्वज प्रभाव हैं। |
| **Combat** | आक्रामक एआई वाला आई.सी.ई. सेंट्री, जिसका लक्ष्य वॉल्ट की रक्षा करना है। |
| **Cognition & perception** | उच्च क्षरण + अस्थिरता, `रिफ्लेक्स` पर आधारित धारणा, जिसमें `नेटरनिंग` संवेदी आँकड़ा शामिल है। |
| **Progression** | 3-नोड नेटरनिंग कौशल वृक्ष (पैकेट स्निफर → आई.सी.ई. हार्डनिंग → न्यूरल बूस्ट)। |
| **Environment** | एक्सपोज्ड वायरिंग का खतरा, जो क्षेत्र में प्रवेश करने पर 2 एचपी का नुकसान पहुंचाता है। |
| **Factions** | वॉल्ट-आई.सी.ई. गुट 0.95 सामंजस्य पर। |
| **Belief provenance** | तेजी से अफवाह फैलना (विलंब=1) जिसमें प्रति चरण 3% विकृति होती है। |
| **Inventory** | आई.सी.ई. ब्रेकर प्रोग्राम — लक्षित आई.सी.ई. को 8 से कम करता है। |
| **Presentation rules** | आई.सी.ई. एजेंट सभी गैर-आई.सी.ई. को घुसपैठ के रूप में चिह्नित करते हैं। |

### फंतासी बनाम साइबरपंक — एक ही इंजन, अलग-अलग नियम सेट।

| | चैपल थ्रेशोल्ड | नियॉन लॉकबॉक्स |
|---|---|---|
| आँकड़े | ऊर्जा / प्रवृत्ति / इच्छाशक्ति | क्रोम / रिफ्लेक्स / नेटरनिंग |
| संसाधन | एचपी, सहनशक्ति | एचपी, आइस, बैंडविड्थ |
| अद्वितीय क्रियाएं | — | हैक, जैक-इन |
| धारणा | डिफ़ॉल्ट | रिफ्लेक्स-आधारित + नेटरनिंग संवेदी |
| धारणा क्षरण | 0.02 आधार | 0.03 आधार, 0.8 अस्थिरता |
| अफवाह का प्रसार | विलंब=2, कोई विकृति नहीं | विलंब=1, 3% विकृति |

## इसके अंदर क्या है

- **3 क्षेत्र** — नियॉन ब्लॉक स्ट्रीट लेवल, परित्यक्त सर्वर रूम, डेटा वॉल्ट
- **1 एनपीसी** — किरा द फिक्सर (जानकारी संवाद, 3 वार्तालाप पथ)
- **1 दुश्मन** — आई.सी.ई. सेंट्री (आक्रामक एआई, वॉल्ट की रक्षा करने का लक्ष्य)
- **1 आइटम** — आई.सी.ई. ब्रेकर प्रोग्राम (लक्षित आई.सी.ई. संसाधन को कम करता है)
- **1 प्रगति वृक्ष** — नेटरनिंग कौशल (पैकेट स्निफर → आई.सी.ई. हार्डनिंग → न्यूरल बूस्ट)
- **1 प्रस्तुति नियम** — आई.सी.ई. एजेंट सभी गैर-आई.सी.ई. संस्थाओं को घुसपैठ के रूप में मानते हैं।
- **15 मॉड्यूल जुड़े हुए** — चैपल थ्रेशोल्ड के समान पूर्ण स्टैक, लेकिन अलग कॉन्फ़िगरेशन।

## उपयोग

```typescript
import { createGame } from '@ai-rpg-engine/starter-cyberpunk';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(77);

// Or import pieces individually:
import { manifest, zones, fixerDialogue, cyberpunkMinimalRuleset } from '@ai-rpg-engine/starter-cyberpunk';
```

## दस्तावेज़

- [नियॉन लॉकबॉक्स (अध्याय 21)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/21-neon-lockbox/)
- [हैंडबुक](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

द्वारा निर्मित <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
