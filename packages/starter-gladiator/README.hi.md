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

# @ai-rpg-engine/starter-gladiator

**आयरन कोलोसियम** — एक ढहते हुए साम्राज्य के नीचे स्थित एक भूमिगत ग्लेडिएटर अखाड़ा। स्वतंत्रता के लिए लड़ें, संरक्षक (पैट्रन) अर्जित करें, और दर्शकों के निर्णय से बचें।

[एआई आरपीजी इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) स्टार्टर पैक कैटलॉग का हिस्सा।

## विषय-वस्तु

रोमन अखाड़ा युद्ध + संरक्षण राजनीति। दर्शकों का समर्थन नाटकीय प्रदर्शन पर निर्भर करता है — उच्च समर्थन से संरक्षक के उपहार मिलते हैं, कम समर्थन का मतलब मृत्युदंड है। संरक्षक ग्लेडिएटरों को "खून और तमाशे में निवेश" मानते हैं।

## त्वरित शुरुआत

```typescript
import { createGame } from '@ai-rpg-engine/starter-gladiator';

const engine = createGame();
engine.start();
```

## सामग्री

- **5 क्षेत्र:** बंदी कक्ष, अखाड़ा, संरक्षक गैलरी, शस्त्रागार, सुरंग का निकास
- **3 गैर-खिलाड़ी पात्र (एनपीसी):** लैनिस्टा ब्रूटस (अखाड़े का स्वामी), डोमिना वैलेरिया (संरक्षक), नेर्वा (अनुभवी सहयोगी)
- **2 दुश्मन:** अखाड़ा चैंपियन, युद्ध जानवर
- **1 संवाद वृक्ष:** प्रायोजन और अखाड़े की राजनीति पर संरक्षक का संवाद
- **1 प्रगति वृक्ष:** अखाड़ा गौरव (दर्शकों का मनोरंजन → लौह सहनशक्ति → स्वतंत्रता सेनानी)
- **1 वस्तु:** संरक्षक टोकन (दर्शकों के समर्थन को 10 से बढ़ाता है)

## अद्वितीय यांत्रिकी

| क्रिया | विवरण |
|------|-------------|
| `taunt` | दुश्मनों को उकसाएं और दर्शकों को उत्साहित करें। |
| `showboat` | दक्षता का त्याग करके तमाशे और समर्थन प्राप्त करें। |

## आंकड़े और संसाधन

| आंकड़ा | भूमिका |
|------|------|
| शक्ति | कच्ची शक्ति, भारी प्रहार। |
| फुर्ती | गति, बचाव, सटीकता। |
| कलात्मकता | दर्शकों का नियंत्रण, नाटकीय युद्ध। |

| संसाधन | दायरा | टिप्पणियाँ |
|----------|-------|-------|
| HP | 0–40 | मानक स्वास्थ्य |
| थकान | 0–50 | विपरीत दबाव — युद्ध में बढ़ता है, -2/टिक पर ठीक होता है। |
| दर्शकों का समर्थन | 0–100 | अस्थिर — >75 से संरक्षक के उपहार मिलते हैं, <25 से मृत्युदंड होता है। |

## लाइसेंस

एमआईटी
