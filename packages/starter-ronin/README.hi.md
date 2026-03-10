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

# @ai-rpg-engine/starter-ronin

**जेड वेल** — एक सामंती किला, जो एक तनावपूर्ण राजनीतिक शिखर सम्मेलन के दौरान है। एक सरदार को ज़हर दिया गया है। सम्मान खत्म होने से पहले हत्यारे को ढूंढें।

[AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) स्टार्टर पैक कैटलॉग का हिस्सा।

## विषय-वस्तु

सामंती रहस्य + दरबार की साजिश। सम्मान नाजुक है - झूठे आरोप बहुत महंगा पड़ते हैं और उनसे उबरना लगभग असंभव है। हर सवाल का महत्व है, हर आरोप के परिणाम होते हैं। हत्यारे रोंइन को "एक ऐसा तलवार जो किसी सरदार का नहीं है - अप्रत्याशित" मानते हैं।

## त्वरित शुरुआत

```typescript
import { createGame } from '@ai-rpg-engine/starter-ronin';

const engine = createGame();
engine.start();
```

## सामग्री

- **5 क्षेत्र:** किले का द्वार, मुख्य हॉल, चाय का बगीचा, सरदार का कक्ष, गुप्त मार्ग
- **3 NPC:** लॉर्ड ताकेदा (ज़हर दिए गए सरदार), लेडी हिमिको (संदिग्ध), मजिस्ट्रेट सातो (जांचकर्ता)
- **2 दुश्मन:** छाया हत्यारा, भ्रष्ट समुराई
- **1 संवाद वृक्ष:** मजिस्ट्रेट द्वारा ज़हर देने और दरबार के संदिग्धों पर जानकारी
- **1 प्रगति वृक्ष:** ब्लेड का मार्ग (स्थिर हाथ → आंतरिक शांति → धर्मी क्रोध)
- **1 वस्तु:** धूप किट (5 कि को पुनर्स्थापित करता है)

## अद्वितीय यांत्रिकी

| क्रिया | विवरण |
|------|-------------|
| `duel` | अनुशासन का उपयोग करके औपचारिक मार्शल चुनौती |
| `meditate` | एक टर्न की कीमत पर कि और संयम को पुनर्स्थापित करें |

## आंकड़े और संसाधन

| आंकड़ा | भूमिका |
|------|------|
| अनुशासन | मार्शल कौशल, तलवार तकनीक, एकाग्रता |
| अनुभव | जागरूकता, अनुमान, इरादे को समझना |
| संयम | सामाजिक नियंत्रण, भावनात्मक महारत |

| संसाधन | रेंज | टिप्पणियाँ |
|----------|-------|-------|
| HP | 0–30 | मानक स्वास्थ्य |
| सम्मान | 0–30 | नाजुक - झूठे आरोपों से -5, ठीक करना मुश्किल |
| Ki | 0–20 | आध्यात्मिक ऊर्जा, 2/टिक पर पुनर्जीवित होती है |

## लाइसेंस

MIT
