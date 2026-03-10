<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/pack-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/pack-registry)](https://www.npmjs.com/package/@ai-rpg-engine/pack-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए शुरुआती पैकों का कैटलॉग, खोज, फ़िल्टरिंग और गुणवत्ता मानदंड।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/pack-registry
```

## यह क्या करता है

पैकेज रजिस्ट्री शुरुआती पैकों का एक रनटाइम कैटलॉग है। पैकों को रजिस्टर करें, उन्हें शैली/कठिनाई/टोन के अनुसार ब्राउज़ करें, और उन्हें 7 आयामों के गुणवत्ता मानदंड के अनुसार मान्य करें। यह पैकेज चयन यूआई को सक्षम करता है और यह सुनिश्चित करता है कि प्रत्येक शुरुआती दुनिया एक न्यूनतम गुणवत्ता मानक को पूरा करे।

## उपयोग

### पैकों को रजिस्टर और खोजें

```typescript
import { registerPack, getAllPacks, filterPacks, getPackSummaries } from '@ai-rpg-engine/pack-registry';
import { content, createGame, packMeta } from '@ai-rpg-engine/starter-fantasy';

// Register a pack
registerPack({
  meta: packMeta,
  manifest: content.manifest,
  ruleset: content.ruleset,
  createGame,
});

// Browse all registered packs
const summaries = getPackSummaries();
// [{ id: 'chapel-threshold', name: 'The Chapel Threshold', tagline: '...', genres: ['fantasy'], difficulty: 'beginner' }]

// Filter by genre, difficulty, or tone
const darkPacks = filterPacks({ tone: 'dark' });
const beginnerPacks = filterPacks({ difficulty: 'beginner' });
```

### पैकेज मेटाडेटा

प्रत्येक शुरुआती पैकेज `packMeta: PackMetadata` के साथ संरचित फ़ील्ड निर्यात करता है:

| फ़ील्ड | प्रकार | विवरण |
|-------|------|-------------|
| id | string | अद्वितीय पहचानकर्ता (manifest.id से मेल खाता है) |
| नाम | string | मानव-पठनीय नाम |
| टैगलाइन | string | एक-पंक्ति मार्केटिंग टैगलाइन |
| genres | PackGenre[] | फ़िल्टरिंग के लिए शैली टैग |
| कठिनाई | PackDifficulty | शुरुआती, मध्यवर्ती या उन्नत |
| टोन | PackTone[] | कथात्मक टोन विवरण |
| टैग | string[] | खोज के लिए स्वतंत्र टैग |
| engineVersion | string | न्यूनतम इंजन संस्करण (सेमवर्) |
| narratorTone | string | वक्ता के लिए टोन स्ट्रिंग |

### गुणवत्ता मानदंड

विशिष्टता के 7 आयामों के आधार पर पैकों को मान्य करें:

```typescript
import { validatePackRubric } from '@ai-rpg-engine/pack-registry';

const result = validatePackRubric(packEntry);
// result.ok === true (score >= 5/7)
// result.score === 7
// result.checks === [{ dimension: 'distinct-verbs', passed: true, detail: '...' }, ...]
```

| आयाम | यह क्या जांचता है |
|-----------|---------------|
| distinct-verbs | पैकेज में बेस सेट से अलग क्रियाएं हैं |
| distinct-resource-pressure | संसाधन यांत्रिकी सार्थक तनाव पैदा करती हैं |
| distinct-faction-topology | गुट संरचना अन्य पैकों से अलग है |
| distinct-presentation-rule | धारणा/कथा में एक अनूठा मोड़ है |
| distinct-audio-palette | ध्वनि डिज़ाइन शैली का समर्थन करता है |
| distinct-failure-mode | विफलता अन्य पैकों से अलग महसूस होती है |
| distinct-narrative-fantasy | मुख्य कल्पना अद्वितीय है |

शुरुआती पैकेज के रूप में योग्य होने के लिए स्कोर >= 5/7 होना चाहिए।

### उपलब्ध प्रकार

```typescript
import type {
  PackGenre,        // 'fantasy' | 'sci-fi' | 'cyberpunk' | 'horror' | ...
  PackDifficulty,   // 'beginner' | 'intermediate' | 'advanced'
  PackTone,         // 'dark' | 'gritty' | 'heroic' | 'noir' | ...
  PackMetadata,     // Full pack metadata
  PackEntry,        // Registry entry (meta + manifest + ruleset + createGame)
  PackSummary,      // Compact display format
  PackFilter,       // Filter criteria
  RubricResult,     // Quality rubric output
} from '@ai-rpg-engine/pack-registry';
```

## AI RPG इंजन का हिस्सा

यह पैकेज [AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरेपो का हिस्सा है। यह पैकेज खोज के लिए स्वतंत्र रूप से काम करता है या पैकेज चयन यूआई के लिए claude-rpg के साथ एकीकृत होता है।

## लाइसेंस

MIT
