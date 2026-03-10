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

# @ai-rpg-engine/ollama

एआई आरपीजी इंजन के लिए एआई डिज़ाइन स्टूडियो — ढांचा तैयार करना, समीक्षा, निर्देशित कार्यप्रवाह, ट्यूनिंग, प्रयोग और स्टूडियो यूएक्स।

यह स्थानीय [Ollama](https://ollama.ai) इंस्टेंस से जुड़ता है। यह सिमुलेशन की सच्चाई को सीधे कभी नहीं बदलता है — डिफ़ॉल्ट रूप से, सभी आउटपुट stdout पर जाते हैं।

## इंस्टॉलेशन

```bash
npm install @ai-rpg-engine/ollama
```

## इसमें क्या है

- **सामग्री ढांचा:** एक थीम से कमरे, गुट, खोज, जिले, स्थान पैकेज और मुठभेड़ पैकेज उत्पन्न करें।
- **समीक्षा और सुधार:** उत्पन्न सामग्री को इंजन स्कीमा के विरुद्ध मान्य करें, विफलता होने पर स्वचालित रूप से सुधार करें।
- **चैट शेल:** संदर्भ-जागरूक रूटिंग, टूल ऑर्केस्ट्रेशन और मेमोरी के साथ इंटरैक्टिव डिज़ाइन सत्र।
- **निर्देशित निर्माण:** सत्र-जागरूक, योजना-आधारित, बहु-चरणीय विश्व निर्माण कार्यप्रवाह।
- **सिमुलेशन विश्लेषण:** संरचित संतुलन निष्कर्षों के साथ रीप्ले विश्लेषण।
- **निर्देशित ट्यूनिंग:** चरण-दर-चरण निष्पादन के साथ, संतुलन निष्कर्षों से संरचित ट्यूनिंग योजनाएं।
- **परिदृश्य प्रयोग:** बैच सिमुलेशन रन, विचलन का पता लगाना, पैरामीटर स्वीप, पहले/बाद की तुलना।
- **स्टूडियो यूएक्स:** डैशबोर्ड, समस्या ब्राउज़िंग, प्रयोग निरीक्षण, सत्र इतिहास, कमांड खोज, ऑनबोर्डिंग।

## उपयोग

```typescript
import { translateMarkdown, ChatEngine, createSession } from '@ai-rpg-engine/ollama';

// Start a design session
const session = createSession('haunted-chapel');

// Use the chat engine
const engine = new ChatEngine({ session });
const response = await engine.chat('scaffold a haunted chapel district');
```

## दस्तावेज़

- [एआई विश्व निर्माण गाइड](AI_WORLDBUILDING.md) — संपूर्ण कार्यप्रवाह दस्तावेज़।
- [हैंडबुक](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा निर्मित।
