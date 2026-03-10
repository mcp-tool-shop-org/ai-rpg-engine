<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/audio-director"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/audio-director.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/audio-director

[AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए एक नियतात्मक ऑडियो संकेत शेड्यूलिंग इंजन।

यह **इमर्शन रनटाइम** का हिस्सा है - यह कथा योजनाओं को समयबद्ध, प्राथमिकता वाले ऑडियो कमांड में बदलता है।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/audio-director
```

## यह क्या करता है

ऑडियो डायरेक्टर एक `NarrationPlan` लेता है और क्रमबद्ध `AudioCommand[]` उत्पन्न करता है - जो किसी भी ऑडियो बैकएंड द्वारा निष्पादित करने के लिए तैयार है। यह निम्नलिखित कार्य करता है:

- **प्राथमिकता**: आवाज > ध्वनि प्रभाव > संगीत > परिवेश (कॉन्फ़िगर करने योग्य)
- **डकिंग**: जब आवाज बजती है तो परिवेश/संगीत स्वचालित रूप से कम हो जाता है।
- **कूलडाउन**: ध्वनि प्रभावों के अत्यधिक उपयोग को रोकता है (प्रत्येक संसाधन के लिए कॉन्फ़िगर करने योग्य)।
- **समय**: संकेतों को भाषण की अवधि के सापेक्ष अनुक्रमित करता है।
- **लेयर ट्रैकिंग**: यह जानता है कि कौन सी परिवेश परतें सक्रिय हैं।

## उपयोग

```typescript
import { AudioDirector } from '@ai-rpg-engine/audio-director';
import type { NarrationPlan } from '@ai-rpg-engine/presentation';

const director = new AudioDirector({
  defaultCooldownMs: 2000,
});

// Schedule commands from a narration plan
const commands = director.schedule(plan);

// Execute commands through your audio backend
for (const cmd of commands) {
  await audioBackend.execute(cmd);
}

// Check cooldowns
director.isOnCooldown('alert_warning'); // true if recently played

// Clear cooldowns on scene change
director.clearCooldowns();
```

## डिफ़ॉल्ट डकिंग नियम

| ट्रिगर | लक्ष्य | डकिंग स्तर |
|---------|--------|-----------|
| आवाज | परिवेश | 30% वॉल्यूम |
| आवाज | संगीत | 40% वॉल्यूम |
| ध्वनि प्रभाव | परिवेश | 60% वॉल्यूम |

## AI RPG इंजन का हिस्सा

यह पैकेज [AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरिपो का हिस्सा है। पूर्ण आर्किटेक्चर के लिए रूट README देखें।

## लाइसेंस

MIT
