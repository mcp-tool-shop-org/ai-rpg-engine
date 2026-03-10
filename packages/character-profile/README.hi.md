<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-profile

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-profile)](https://www.npmjs.com/package/@ai-rpg-engine/character-profile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए, प्रगति, चोटों, महत्वपूर्ण घटनाओं और सेव/लोड सुविधाओं के साथ, स्थायी चरित्र प्रोफाइल।

## इंस्टॉलेशन

```bash
npm install @ai-rpg-engine/character-profile
```

## यह क्या करता है

यह चरित्र निर्माण, लाइव आंकड़े, उपकरण, अनुभव/स्तर, चोटें, महत्वपूर्ण घटनाएं और गुट की प्रतिष्ठा को एक ही स्थायी प्रोफाइल में जोड़ता है, जो सत्रों के बीच भी बरकरार रहता है। इसमें सेव फ़ाइलों के लिए सीरियललाइज़ेशन शामिल है।

## उपयोग

### प्रोफाइल बनाना

```typescript
import { createProfile } from '@ai-rpg-engine/character-profile';

const profile = createProfile(
  build,       // CharacterBuild from character-creation
  { vigor: 7, instinct: 4, will: 1 },  // resolved stats
  { hp: 25, stamina: 8 },               // resolved resources
  ['martial', 'oath-broken'],            // resolved tags
  'chapel-threshold',                    // pack ID
);
```

### अनुभव और स्तर

```typescript
import { grantXp, advanceArchetypeRank } from '@ai-rpg-engine/character-profile';

const { profile: leveled, leveledUp } = grantXp(profile, 100);
// leveledUp === true, leveled.progression.level === 2

const { profile: ranked } = advanceArchetypeRank(leveled);
// ranked.progression.archetypeRank === 2
```

### चोटें

```typescript
import { addInjury, healInjury, computeInjuryPenalties } from '@ai-rpg-engine/character-profile';

let wounded = addInjury(profile, {
  name: 'Broken Arm',
  description: 'Fractured in combat.',
  statPenalties: { vigor: -2 },
  resourcePenalties: {},
  grantedTags: ['injured'],
  sustainedAt: 'turn-10',
});

const penalties = computeInjuryPenalties(wounded);
// penalties.statPenalties.vigor === -2
```

### महत्वपूर्ण घटनाएं और प्रतिष्ठा

```typescript
import { recordMilestone, adjustReputation, getReputation } from '@ai-rpg-engine/character-profile';

let updated = recordMilestone(profile, {
  label: 'Chapel Entered',
  description: 'First entered the ruined chapel.',
  at: 'turn-1',
  tags: ['exploration'],
});

updated = adjustReputation(updated, 'chapel-undead', -10);
// getReputation(updated, 'chapel-undead') === -10
```

### सेव/लोड

```typescript
import { serializeProfile, deserializeProfile } from '@ai-rpg-engine/character-profile';

const json = serializeProfile(profile);
const { profile: loaded, errors } = deserializeProfile(json);
```

## प्रगति प्रणाली

| स्तर | आवश्यक अनुभव |
|-------|------------|
| 1 | 0 |
| 2 | 100 |
| 3 | 250 |
| 4 | 500 |
| 5 | 1,000 |
| 6 | 2,000 |
| 7 | 4,000 |
| 8 | 7,000 |
| 9 | 11,000 |
| 10 | 16,000 |

आर्किटाइप रैंक की अधिकतम संख्या: 5। अनुशासन रैंक की अधिकतम संख्या: 3।

## AI RPG इंजन का हिस्सा

यह पैकेज [AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरिपो का हिस्सा है। यह `@ai-rpg-engine/character-creation` और `@ai-rpg-engine/equipment` पर निर्भर है।

## लाइसेंस

MIT
