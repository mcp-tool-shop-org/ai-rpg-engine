<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/soundpack-core.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/soundpack-core

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए सामग्री-आधारित ध्वनि रजिस्ट्री और पैक विनिर्देश।

**इमर्शन रनटाइम** का हिस्सा — ऑडियो संपत्तियों को टैग किए गए, खोज योग्य संग्रह के रूप में प्रबंधित करता है।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/soundpack-core
```

## यह क्या करता है

ध्वनि पैक ऑडियो प्रविष्टियों (एसएफएक्स, परिवेशीय लूप, संगीत, आवाज) का लोड करने योग्य संग्रह है, जिसमें खोज के लिए समृद्ध मेटाडेटा होता है। रजिस्ट्री टैग-आधारित प्रश्नों, तीव्रता फ़िल्टरिंग और मूड मिलान का समर्थन करती है।

यह एक **कोर ध्वनि पैक** के साथ आता है जो [वॉयस-साउंडबोर्ड](https://github.com/mcp-tool-shop-org/original_voice-soundboard) प्रक्रियात्मक प्रभावों से मेल खाता है।

## उपयोग

```typescript
import { SoundRegistry, CORE_SOUND_PACK } from '@ai-rpg-engine/soundpack-core';

const registry = new SoundRegistry();
registry.load(CORE_SOUND_PACK);

// Query by domain
const ambient = registry.query({ domain: 'ambient' });

// Query by tags + mood
const tenseSfx = registry.query({ tags: ['alert'], mood: ['dread'] });

// Get specific entry
const entry = registry.get('ui_success');
console.log(entry?.voiceSoundboardEffect); // "chime_success"
```

## कोर ध्वनि पैक

13 प्रविष्टियाँ जो वॉयस-साउंडबोर्ड प्रक्रियात्मक प्रभावों से मेल खाती हैं:

| ID | प्रभाव | डोमेन | टैग |
|----|--------|--------|------|
| `ui_notification` | `chime_notification` | sfx | ui, alert |
| `ui_success` | `chime_success` | sfx | ui, positive |
| `ui_error` | `chime_error` | sfx | ui, negative |
| `ui_click` | `click` | sfx | ui, input |
| `ui_pop` | `pop` | sfx | ui, light |
| `ui_whoosh` | `whoosh` | sfx | ui, transition |
| `alert_warning` | `warning` | sfx | alert, caution |
| `alert_critical` | `critical` | sfx | alert, danger |
| `alert_info` | `info` | sfx | alert, info |
| `ambient_rain` | `rain` | ambient | weather, calm |
| `ambient_white_noise` | `white_noise` | ambient | background |
| `ambient_drone` | `drone` | ambient | dark, tension |

## कस्टम ध्वनि पैक

`SoundPackManifest` प्रदान करके अपना ध्वनि पैक बनाएं:

```typescript
import type { SoundPackManifest } from '@ai-rpg-engine/soundpack-core';

const myPack: SoundPackManifest = {
  name: 'medieval-tavern',
  version: '1.0.0',
  description: 'Tavern ambience and interaction sounds',
  author: 'your-name',
  entries: [
    {
      id: 'tavern_chatter',
      tags: ['ambient', 'social'],
      domain: 'ambient',
      intensity: 'low',
      mood: ['calm', 'social'],
      durationClass: 'long-loop',
      cooldownMs: 0,
      variants: ['tavern_chatter_01.wav'],
      source: 'file',
    },
  ],
};

registry.load(myPack);
```

## AI RPG Engine का हिस्सा

यह पैकेज [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरिपो का हिस्सा है। पूर्ण आर्किटेक्चर के लिए रूट README देखें।

## लाइसेंस

MIT
