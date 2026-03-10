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

# @ai-rpg-engine/मॉड्यूल

एआई आरपीजी इंजन के लिए 17 कंपोज़ेबल सिमुलेशन मॉड्यूल - मुकाबला, संवाद, अनुभूति, धारणा, गुट, और बहुत कुछ।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/modules
```

## मॉड्यूल

| मॉड्यूल | विवरण |
|--------|-------------|
| `combatCore` | हमला/रक्षा, क्षति, पराजय, सहनशक्ति, रक्षा, पीछे हटना |
| `dialogueCore` | शर्तों के साथ ग्राफ-आधारित संवाद वृक्ष |
| `inventoryCore` | वस्तुएं, उपकरण, उपयोग/उपकरण/हटाना |
| `traversalCore` | क्षेत्र में गति और निकास सत्यापन |
| `statusCore` | अवधि और संचयी प्रभाव वाले स्थिति प्रभाव |
| `environmentCore` | गतिशील क्षेत्र गुण, खतरे, क्षरण |
| `cognitionCore` | एआई की मान्यताएं, इरादा, मनोबल, स्मृति |
| `perceptionFilter` | संवेदी चैनल, स्पष्टता, क्षेत्रों के बीच श्रवण |
| `narrativeAuthority` | सत्य बनाम प्रस्तुति, छिपाव, विकृति |
| `progressionCore` | मुद्रा-आधारित प्रगति, कौशल वृक्ष |
| `factionCognition` | गुटों की मान्यताएं, विश्वास, गुटों के बीच ज्ञान |
| `rumorPropagation` | आत्मविश्वास में कमी के साथ जानकारी का प्रसार |
| `knowledgeDecay` | समय-आधारित आत्मविश्वास में कमी |
| `districtCore` | स्थानिक स्मृति, क्षेत्र मेट्रिक्स, चेतावनी सीमाएं |
| `beliefProvenance` | धारणा/अनुभूति/अफवाह के माध्यम से पुनर्निर्माण |
| `observerPresentation` | प्रत्येक पर्यवेक्षक के लिए घटना फ़िल्टरिंग, विचलन ट्रैकिंग |
| `simulationInspector` | रनटाइम निरीक्षण, स्वास्थ्य जांच, निदान |
| `combatIntent` | एआई निर्णय लेने की पूर्वाग्रह, मनोबल, पलायन तर्क |
| `engagementCore` | सामने की पंक्ति/पीछे की पंक्ति की स्थिति, अंगरक्षक अवरोधन |
| `combatRecovery` | मुकाबले के बाद घाव की स्थिति, सुरक्षित क्षेत्र में उपचार |
| `combatReview` | सूत्र का स्पष्टीकरण, हिट-चैंस विश्लेषण |
| `defeatFallout` | मुकाबले के बाद गुटों के परिणाम, प्रतिष्ठा में बदलाव |
| `bossPhaseListener` | बॉस एचपी-सीमा चरण परिवर्तन |

### मुकाबला निर्माण (शुद्ध फ़ंक्शन)

| निर्यात करें | उद्देश्य |
|--------|---------|
| `combat-roles` | 8 भूमिका टेम्पलेट, मुठभेड़ रचना प्रकार, खतरे की रेटिंग, बॉस परिभाषाएं |
| `encounter-library` | 5 मुठभेड़ आर्किटेक्चर फैक्ट्रियां, 3 बॉस टेम्पलेट फैक्ट्रियां, पैक ऑडिट |
| `combat-summary` | मुकाबला सामग्री की जांच करें, ऑडिट करें, प्रारूपित करें और निरीक्षण करें |

## उपयोग

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { combatCore, dialogueCore, cognitionCore, perceptionFilter } from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: { /* ... */ },
  seed: 42,
  modules: [combatCore(), dialogueCore(), cognitionCore(), perceptionFilter()],
});
```

## दस्तावेज़

- [मॉड्यूल (अध्याय 6)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/06-modules/)
- [एआई अनुभूति (अध्याय 8)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/08-ai-cognition/)
- [धारणा (अध्याय 9)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/09-perception-layers/)
- [मुकाबला प्रणाली (अध्याय 47)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/47-combat-system/)
- [हैंडबुक](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा निर्मित।
