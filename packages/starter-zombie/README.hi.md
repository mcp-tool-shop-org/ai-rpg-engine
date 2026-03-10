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

# @ai-rpg-engine/starter-zombie

**एशफॉल डेड** — एआई आरपीजी इंजन के लिए एक ज़ॉम्बी सर्वाइवल स्टार्टर वर्ल्ड।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/starter-zombie
```

## आप क्या सीखेंगे

यह स्टार्टर सर्वाइवल परिदृश्य के माध्यम से इंजन के सभी पहलुओं को दर्शाता है:

| विशेषताएं | ज़ॉम्बी क्या दिखाता है |
|---|---|
| **Rulesets** | `zombieMinimalRuleset` — आंकड़े (फिटनेस/बुद्धि/तंत्रिका), संसाधन (एचपी/स्टैमिना/संक्रमण), क्रियाएं, सूत्र |
| **Zones & traversal** | 3 कमरों में 5 ज़ोन, जिनमें आस-पास का संबंध, प्रकाश स्तर, इंटरैक्टिव तत्व और खतरे शामिल हैं। |
| **Districts** | सुरक्षित ठिकाना (उत्तरजीवी गुट) बनाम डेड ज़ोन (दुश्मन, अकालमृत) |
| **Dialogue** | शाखाओं वाला डॉक्टर के साथ संवाद, जिसमें अस्पताल से आपूर्ति लाने का मिशन शामिल है। |
| **Combat** | शंबलर (धीमा, मजबूत) और रनर (तेज, नाजुक) ज़ॉम्बी, जिनमें आक्रामक एआई है। |
| **Cognition & perception** | मेमोरी का क्षरण, धारणा फ़िल्टर, ज़ॉम्बी भूख प्रस्तुति नियम। |
| **Progression** | 3-नोड सर्वाइवल ट्री, जिसमें दुश्मनों को हराने पर एक्सपी रिवॉर्ड मिलता है। |
| **Environment** | घूमने वाले अकालमृत, जो स्टैमिना को खत्म करते हैं, और संक्रमण-जोखिम वाले ज़ोन, जो संक्रमण को बढ़ाते हैं। |
| **Factions** | उत्तरजीवी गुट में डॉक्टर, खूंखार और सैन्य नेता शामिल हैं। |
| **Belief provenance** | अफवाहों का प्रसार, जिसमें देरी और विश्वास ट्रैकिंग शामिल है। |
| **Inventory** | एंटीबायोटिक्स, जो स्क्रिप्टेड आइटम-उपयोग प्रभाव के माध्यम से संक्रमण को कम करते हैं। |
| **Simulation inspector** | पुनरावृत्ति विश्लेषण के लिए पूरी तरह से जांच की सुविधा। |

## इसके अंदर क्या है

- **5 ज़ोन** — सुरक्षित ठिकाना लॉबी, परित्यक्त गैस स्टेशन, भीड़भाड़ वाला सड़क, अस्पताल का पूर्वी भाग, अस्पताल की छत
- **3 एनपीसी** — डॉ. चेन (डॉक्टर), रूक (खूंखार), सार्जेंट मार्श (सैन्य नेता)
- **2 दुश्मन** — शंबलर (धीमा, मजबूत अकालमृत), रनर (तेज, नाजुक अकालमृत)
- **1 आइटम** — एंटीबायोटिक्स (संक्रमण को 25% तक कम करता है)
- **1 प्रगति ट्री** — सर्वाइवल (स्क्रैपर → कूल-हेडेड → लास्ट वन स्टैंडिंग)
- **1 प्रस्तुति नियम** — ज़ॉम्बी सभी जीवित प्राणियों को शिकार के रूप में देखते हैं।
- **15 मॉड्यूल** — नेविगेशन, स्थिति, मुकाबला, इन्वेंट्री, संवाद, अनुभूति, धारणा, प्रगति, वातावरण, गुट, अफवाहें, जिले, विश्वास, पर्यवेक्षक प्रस्तुति, इंस्पेक्टर।

## उपयोग

```typescript
import { createGame } from '@ai-rpg-engine/starter-zombie';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zombieMinimalRuleset, survivalTree } from '@ai-rpg-engine/starter-zombie';
```

## दस्तावेज़

- [हैंडबुक](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा बनाया गया।
