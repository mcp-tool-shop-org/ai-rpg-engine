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

# @ai-rpg-engine/content-schema

एआई आरपीजी इंजन के लिए सामग्री स्कीमा और सत्यापनकर्ता - कमरों, इकाइयों, संवादों, वस्तुओं और खोजों को डेटा के रूप में परिभाषित करें।

## स्थापना

```bash
npm install @ai-rpg-engine/content-schema
```

## इसमें क्या है

- **कमरा स्कीमा** — निकास, गुण और पर्यावरणीय स्थिति वाले क्षेत्र।
- **इकाई स्कीमा** — गैर-खिलाड़ी पात्र (एनपीसी), जीव और खिलाड़ी चरित्र परिभाषाएं।
- **संवाद स्कीमा** — शर्तों और प्रभावों के साथ ग्राफ-आधारित संवाद वृक्ष।
- **वस्तु स्कीमा** — उपकरण, उपभोग्य वस्तुएं, खोज वस्तुएं जिनमें आँकड़ों में बदलाव होता है।
- **सामग्री पैक लोडर** — JSON/TypeScript सामग्री पैकों को मान्य और लोड करें।
- **क्षमता स्कीमा** — क्षमता परिभाषाएं, स्थिति परिभाषाएं और संतुलन संबंधी सलाह के साथ पैक सत्यापन।
- **स्कीमा सत्यापनकर्ता** — संरचित त्रुटि संदेशों के साथ रनटाइम सत्यापन।

## उपयोग

```typescript
import { validateContentPack, RoomSchema, EntitySchema } from '@ai-rpg-engine/content-schema';

const result = validateContentPack(myContentData);
if (!result.valid) {
  console.error(result.errors);
}
```

## दस्तावेज़

- [सामग्री फ़ाइलें (अध्याय 13)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/13-content-files/) — सामग्री पैकों का निर्माण।
- [हैंडबुक](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

यह <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा बनाया गया है।
