<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/asset-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/asset-registry)](https://www.npmjs.com/package/@ai-rpg-engine/asset-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) में चित्रों, आइकन और मीडिया के लिए कंटेंट-आधारित एसेट रजिस्ट्री।

## इंस्टॉलेशन

```bash
npm install @ai-rpg-engine/asset-registry
```

## यह क्या करता है

एसेट्स को उनके SHA-256 कंटेंट हैश द्वारा संग्रहीत किया जाता है - समान बाइट्स हमेशा एक ही एड्रेस पर मैप होते हैं। इससे डुप्लीकेशन स्वचालित हो जाता है, संदर्भ पोर्टेबल हो जाते हैं, और कैशिंग आसान हो जाती है। दो स्टोरेज बैकएंड शामिल हैं: इन-मेमोरी (परीक्षण और अस्थायी सत्रों के लिए) और फ़ाइल सिस्टम (स्थायी स्थानीय स्टोरेज के लिए, जिसमें शार्ड डायरेक्टरी शामिल हैं)।

## उपयोग

### एसेट्स को स्टोर और पुनः प्राप्त करें

```typescript
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';

const store = new MemoryAssetStore();

// Store portrait bytes
const pngBytes = await readFile('portrait.png');
const meta = await store.put(pngBytes, {
  kind: 'portrait',
  mimeType: 'image/png',
  width: 512,
  height: 512,
  tags: ['character', 'fantasy', 'knight'],
  source: 'generated',
});

console.log(meta.hash);  // 'a3f2b8c1...' (SHA-256 hex)

// Retrieve by hash
const bytes = await store.get(meta.hash);
const info = await store.getMeta(meta.hash);
```

### फ़ाइल सिस्टम पर दृढ़ता

```typescript
import { FileAssetStore } from '@ai-rpg-engine/asset-registry';

const store = new FileAssetStore('./assets');

// Directory layout:
//   assets/
//     a3/
//       a3f2b8c1...64chars.bin   — raw bytes
//       a3f2b8c1...64chars.json  — metadata sidecar

const meta = await store.put(bytes, { kind: 'portrait', mimeType: 'image/png' });
```

### फ़िल्टर और खोज

```typescript
// List all portraits
const portraits = await store.list({ kind: 'portrait' });

// Filter by tag
const fantasy = await store.list({ tag: 'fantasy' });

// Filter by size range
const large = await store.list({ minSize: 100_000 });

// Filter by MIME type
const pngs = await store.list({ mimeType: 'image/png' });
```

### कंटेंट एड्रेसिंग

```typescript
import { hashBytes, isValidHash } from '@ai-rpg-engine/asset-registry';

const hash = hashBytes(someBytes);       // SHA-256 hex digest
const valid = isValidHash(hash);          // true
const invalid = isValidHash('not-a-hash'); // false
```

## एसेट प्रकार

| प्रकार | विवरण |
|------|-------------|
| पोर्ट्रेट | चरित्र पोर्ट्रेट (खिलाड़ी, NPC) |
| आइकन | UI आइकन, आइटम स्प्राइट |
| बैकग्राउंड | सीन बैकग्राउंड, ज़ोन आर्ट |
| ऑडियो | ध्वनि प्रभाव, संगीत क्लिप |
| दस्तावेज़ | टेक्स्ट फाइलें, टेम्पलेट |

## स्टोरेज बैकएंड

| बैकएंड | उपयोग का मामला | दृढ़ता |
|---------|----------|-------------|
| `MemoryAssetStore` | परीक्षण, अस्थायी सत्र | कोई नहीं (इन-प्रोसेस) |
| `FileAssetStore` | स्थानीय गेम, विकास | फ़ाइल सिस्टम |

दोनों बैकएंड `AssetStore` इंटरफ़ेस को लागू करते हैं, इसलिए वे आपस में बदल सकते हैं।

## चरित्र निर्माण के साथ एकीकरण

`CharacterBuild` पर `portraitRef` फ़ील्ड एक एसेट हैश संग्रहीत करता है। इसका समाधान करने के लिए रजिस्ट्री का उपयोग करें:

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, catalog, ruleset);
const portraitHash = entity.custom?.portraitRef as string;

if (portraitHash) {
  const bytes = await store.get(portraitHash);
  // Render the portrait in your UI
}
```

## AI RPG इंजन का हिस्सा

यह पैकेज [AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरिपो का हिस्सा है। इसमें कोई निर्भरता नहीं है - यह स्टैंडअलोन काम करता है या चरित्र निर्माण और प्रस्तुति प्रणालियों के साथ एकीकृत होता है।

## लाइसेंस

MIT
