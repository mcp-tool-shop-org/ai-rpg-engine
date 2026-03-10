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

# @ai-rpg-engine/starter-pirate

**ब्लैक फ्लैग रिक्विएम** — एआई आरपीजी इंजन के लिए एक समुद्री डाकू साहसिक दुनिया।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/starter-pirate
```

## आप क्या सीखेंगे

यह शुरुआती संस्करण, एक समुद्री डाकू साहसिक कार्य के माध्यम से, इंजन के सभी पहलुओं को दर्शाता है:

| विशेषताएं | यह समुद्री डाकू साहसिक कार्य क्या दिखाता है: |
|---|---|
| **Rulesets** | `pirateMinimalRuleset` — आँकड़े (शक्ति/चालाकी/समुद्री कौशल), संसाधन (स्वास्थ्य/मनोबल), क्रियाएं, सूत्र। |
| **Zones & traversal** | 3 कमरों में 5 क्षेत्र, जिनमें आस-पास का संबंध, प्रकाश स्तर, इंटरैक्टिव तत्व और खतरे शामिल हैं। |
| **Districts** | पोर्ट हेवन (औपनिवेशिक नौसेना गुट) बनाम अभिशप्त जल (खतरनाक समुद्र)। |
| **Dialogue** | शाखाओं वाला मानचित्रकार वार्तालाप, जिसमें खोज का संकेत और वैश्विक प्रभाव शामिल हैं। |
| **Combat** | नौसैनिक (आक्रामक) और डूबे हुए रक्षक (अभिशप्त समुद्री जीव)। |
| **Cognition & perception** | स्मृति क्षय, धारणा फ़िल्टर, अभिशप्त रक्षक प्रस्तुति नियम। |
| **Progression** | 3 नोड वाला समुद्री कौशल वृक्ष, जिसमें शत्रु को हराने पर अनुभव अंक (एक्सपी) पुरस्कार मिलते हैं। |
| **Environment** | तूफान की लहरों से मनोबल में कमी, डूबने के दबाव से नुकसान। |
| **Factions** | औपनिवेशिक नौसेना गुट, जिसमें गवर्नर और नाविक शामिल हैं। |
| **Belief provenance** | अफवाहों का प्रसार, जिसमें देरी और विश्वास का पता लगाना शामिल है। |
| **Inventory** | रम की बोतल, जिसमें स्क्रिप्टेड आइटम-उपयोग प्रभाव से मनोबल बहाल होता है। |
| **Simulation inspector** | पुनरावृत्ति विश्लेषण के लिए पूरी तरह से जांच की सुविधा। |

## इसके अंदर क्या है

- **5 क्षेत्र** — जहाज का डेक, द रस्टी एंकर (तavern), गवर्नर का किला, खुला पानी, डूबी हुई मंदिर।
- **3 एनपीसी** — क्वार्टरमास्टर ब्लि (क्रू), मारा द कार्टोग्राफर (तटस्थ), गवर्नर वेन (औपनिवेशिक प्राधिकरण)।
- **2 दुश्मन** — नौसैनिक (आक्रामक), डूबे हुए रक्षक (अभिशप्त समुद्री जीव)।
- **1 आइटम** — रम की बोतल (8 मनोबल बहाल करती है)।
- **1 प्रगति वृक्ष** — समुद्री कौशल (समुद्री-कठोर → निर्दयी → भयानक कप्तान)।
- **1 प्रस्तुति नियम** — अभिशप्त जीव सभी आगंतुकों को अतिक्रमणकर्ता मानते हैं।
- **15 मॉड्यूल** — नेविगेशन, स्थिति, युद्ध, इन्वेंट्री, संवाद, अनुभूति, धारणा, प्रगति, पर्यावरण, गुट, अफवाहें, जिले, विश्वास, पर्यवेक्षक प्रस्तुति, निरीक्षक।

## उपयोग

```typescript
import { createGame } from '@ai-rpg-engine/starter-pirate';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, pirateMinimalRuleset, seamanshipTree } from '@ai-rpg-engine/starter-pirate';
```

## दस्तावेज़

- [हैंडबुक](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा निर्मित।
