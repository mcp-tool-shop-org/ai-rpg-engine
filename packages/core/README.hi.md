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

# @ai-rpg-engine/core

एआई आरपीजी इंजन का आधार — दुनिया की स्थिति, इकाइयां, क्रियाएं, घटनाएं, नियम, पूर्वनिर्धारित यादृच्छिक संख्या जनरेटर (आरएनजी), और डेटा का स्थायी रूप से सहेजा जाना।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/core
```

## इसमें क्या है

- **इंजन** — समय-आधारित सिमुलेशन लूप जिसमें नियतात्मक पुन: प्ले की सुविधा है।
- **वर्ल्डस्टेट** — कमरे, इकाइयां, वैश्विक ध्वज, टिक काउंटर।
- **एंटिटीस्टेट** — संसाधन, इन्वेंट्री, स्थिति प्रभाव, मान्यताएं, यादें।
- **एक्शन पाइपलाइन** — सत्यापन → पूर्व-प्रसंस्करण → समाधान → पोस्ट-प्रसंस्करण → प्रतिबद्धता।
- **इवेंट बस** — संरचित घटनाएं जिनमें प्रकार, स्रोत, लक्ष्य और डेटा शामिल हैं।
- **सीडेड आरएनजी** — एक ही बीज से पुन: उत्पन्न होने योग्य यादृच्छिकता।
- **मॉड्यूल सिस्टम** — सिमुलेशन मॉड्यूल को पंजीकृत/संयोजित करें।
- **टेस्ट हार्नेस** — नियतात्मक मॉड्यूल परीक्षण के लिए सहायक उपकरण।

## शुरुआत कैसे करें

```typescript
import { Engine } from '@ai-rpg-engine/core';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game',
    version: '1.0.0', engineVersion: '1.0.0',
    ruleset: 'fantasy', modules: [],
    contentPacks: [],
  },
  seed: 42,
  modules: [],
});

const state = engine.getState();
```

## दस्तावेज़

- [हैंडबुक](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/) — 25 अध्याय + 4 परिशिष्ट
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

यह <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा बनाया गया है।
