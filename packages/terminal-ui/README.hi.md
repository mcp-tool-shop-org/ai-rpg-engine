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

# @ai-rpg-engine/terminal-ui

एआई आरपीजी इंजन के लिए टर्मिनल रेंडरर और इनपुट लेयर - इवेंट स्ट्रीम को पठनीय टर्मिनल आउटपुट में बदलें।

## इंस्टॉलेशन

```bash
npm install @ai-rpg-engine/terminal-ui
```

## इसमें क्या है

- **इवेंट रेंडरर** — इंजन के इवेंट को फॉर्मेट किए गए टर्मिनल टेक्स्ट में बदलता है।
- **इनपुट पार्सर** — खिलाड़ी के कमांड को इंजन की क्रियाओं में बदलता है।
- **कलर थीम** — विभिन्न गेम शैलियों के लिए एएनएसआई कलर पैलेट।
- **लेआउट हेल्पर** — स्टेटस बार, कमरे का विवरण, एंटिटी लिस्ट।

## उपयोग

```typescript
import { TerminalRenderer, InputParser } from '@ai-rpg-engine/terminal-ui';

const renderer = new TerminalRenderer();
const parser = new InputParser();

// Render engine events
for (const event of events) {
  renderer.render(event);
}

// Parse player input into actions
const action = parser.parse('attack guard');
```

## दस्तावेज़

- [हैंडबुक](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

यह <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा बनाया गया है।
