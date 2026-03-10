<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-creation

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-creation)](https://www.npmjs.com/package/@ai-rpg-engine/character-creation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

हेडलेस कैरेक्टर निर्माण प्रणाली — आर्चटाइप, पृष्ठभूमि, विशेषताएं, मल्टीक्लासिंग और [AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए बिल्ड सत्यापन।

## इंस्टॉलेशन

```bash
npm install @ai-rpg-engine/character-creation
```

## यह क्या करता है

कैरेक्टर केवल स्प्रेडशीट नहीं होते — वे पहचान होते हैं। यह पैकेज प्राथमिक आर्चटाइप, पृष्ठभूमि, व्यक्तित्व विशेषताओं और वैकल्पिक माध्यमिक अनुशासन के संरचित संयोजन को एक मान्य खिलाड़ी इकाई में परिवर्तित करता है। प्रत्येक आर्चटाइप + अनुशासन संयोजन एक क्रॉस-अनुशासन शीर्षक उत्पन्न करता है जो चरित्र की पहचान को संश्लेषित करता है, न कि केवल संख्याओं को जोड़ता है।

## उपयोग

### एक बिल्ड को मान्य करें

```typescript
import { validateBuild } from '@ai-rpg-engine/character-creation';
import { content, buildCatalog } from '@ai-rpg-engine/starter-fantasy';

const build = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: ['iron-frame', 'cursed-blood'],
  disciplineId: 'occultist',
  statAllocations: { vigor: 2, instinct: 1 },
};

const result = validateBuild(build, buildCatalog, content.ruleset);
// result.ok === true
// result.resolvedTitle === 'Grave Warden'
// result.finalStats === { vigor: 8, instinct: 6, will: 1 }
// result.resolvedTags includes 'martial', 'oath-broken', 'curse-touched', 'grave-warden'
```

### एंटिटीस्टेट में रूपांतरित करें

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, buildCatalog, content.ruleset);
// Full EntityState ready for the engine:
// entity.id === 'player'
// entity.blueprintId === 'penitent-knight'
// entity.stats, entity.resources, entity.tags, entity.inventory all computed
// entity.custom === { archetypeId, backgroundId, disciplineId, title, portraitRef }
```

### उपलब्ध विकल्पों को देखें

```typescript
import {
  getAvailableArchetypes,
  getAvailableBackgrounds,
  getAvailableTraits,
  getAvailableDisciplines,
  getStatBudgetRemaining,
} from '@ai-rpg-engine/character-creation';

const archetypes = getAvailableArchetypes(buildCatalog);
const backgrounds = getAvailableBackgrounds(buildCatalog);
const traits = getAvailableTraits(buildCatalog, ['iron-frame']); // filters incompatible
const disciplines = getAvailableDisciplines(buildCatalog, 'penitent-knight', ['martial']);
const remaining = getStatBudgetRemaining(build, buildCatalog); // points left to allocate
```

### सेव फ़ाइलों के लिए सीरियल करें

```typescript
import { serializeBuild, deserializeBuild, validateSerializedBuild } from '@ai-rpg-engine/character-creation';

const json = serializeBuild(build);
const restored = deserializeBuild(json);
const check = validateSerializedBuild(json); // { ok: true, errors: [] }
```

## अवधारणाएं

| अवधारणा | विवरण |
|---------|-------------|
| **Archetype** | प्राथमिक वर्ग — बेस आँकड़े, शुरुआती टैग, प्रगति वृक्ष |
| **Background** | उत्पत्ति कहानी — आँकड़े संशोधक, शुरुआती टैग, वैकल्पिक इन्वेंट्री |
| **Trait** | विशेषता या दोष — आँकड़ों, संसाधनों, टैग, क्रियाओं या गुटों पर प्रभाव |
| **Discipline** | माध्यमिक वर्ग — 1 क्रिया, 1 निष्क्रिय प्रभाव, 1 कमी |
| **Cross-Title** | आर्चटाइप + अनुशासन से संश्लेषित पहचान (उदाहरण के लिए, "ग्रेव वार्डन") |
| **Entanglement** | कुछ आर्चटाइप + अनुशासन संयोजनों से उत्पन्न होने वाला घर्षण प्रभाव |
| **Build Catalog** | सभी कैरेक्टर विकल्पों का पैक-विशिष्ट मेनू |

## मल्टीक्लासिंग

यह प्रणाली संरचित पहचान संलयन का उपयोग करती है, योगात्मक स्टैकिंग का नहीं:

- **प्राथमिक आर्चटाइप** मुख्य पहचान को परिभाषित करता है (बेस आँकड़े, प्रगति वृक्ष, शुरुआती टैग)
- **माध्यमिक अनुशासन** संक्षिप्त है: 1 क्रिया, 1 निष्क्रिय, 1 कमी
- प्रत्येक संयोजन एक **क्रॉस-अनुशासन शीर्षक** उत्पन्न करता है ("हेक्स पिस्टल", "सिनेप्स सर्जन", "क्वारंटाइन मार्शल")
- कुछ संयोजनों से **जटिलताएं** उत्पन्न होती हैं — कथा घर्षण प्रभाव

## विशेषता प्रभाव

| प्रकार | उदाहरण |
|------|---------|
| stat-modifier (आँकड़े संशोधक) | `{ stat: 'dex', amount: 1 }` |
| resource-modifier (संसाधन संशोधक) | `{ resource: 'hp', amount: -3 }` |
| grant-tag (टैग प्रदान करें) | `{ tag: 'curse-touched' }` |
| verb-access (क्रिया तक पहुंच) | `{ verb: 'steal' }` |
| faction-modifier (गुट संशोधक) | `{ faction: 'guard', amount: -10 }` |

## बिल्ड कैटलॉग

सभी 7 स्टार्टर पैक एक `buildCatalog` निर्यात करते हैं जिसमें पैक-विशिष्ट विकल्प होते हैं। प्रत्येक कैटलॉग में 3 आर्चटाइप, 3 पृष्ठभूमि, 4 विशेषताएं (2 लाभ + 2 दोष), 2 अनुशासन और 6 क्रॉस-अनुशासन शीर्षक शामिल हैं।

## AI RPG इंजन का हिस्सा

यह पैकेज [AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरेपो का हिस्सा है। यह केवल टाइप आयात के लिए `@ai-rpg-engine/core` पर निर्भर करता है — इंजन रनटाइम निर्भरता नहीं है।

## लाइसेंस

MIT
