<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/presentation"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/presentation.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/presentation

[AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए कथा योजना स्कीमा, रेंडर अनुबंध और प्रस्तुति अवस्था प्रकार।

यह **इमर्शन रनटाइम** का हिस्सा है — यह मल्टी-मॉडल प्रस्तुति पाइपलाइन है जो गेम की अवस्था को संरचित ऑडियो-विजुअल अनुभवों में बदल देती है।

## इंस्टॉल करें

```bash
npm install @ai-rpg-engine/presentation
```

## यह क्या करता है

कथाकार सीधे पाठ के बजाय, एक **नैरेशन प्लान** उत्पन्न करता है — एक संरचित रेसिपी जो टेक्स्ट, ध्वनि प्रभावों, परिवेशीय परतों, संगीत संकेतों, यूआई प्रभावों और वॉयस सिंथेसिस मापदंडों का वर्णन करती है।

कोई भी फ्रंटएंड (टर्मिनल, वेब, इलेक्ट्रॉन) इन योजनाओं को प्राप्त करने और निष्पादित करने के लिए `PresentationRenderer` इंटरफ़ेस को लागू करता है।

## मुख्य प्रकार

| प्रकार | उद्देश्य |
|------|---------|
| `NarrationPlan` | संरचित कथा रेसिपी (टेक्स्ट + एसएफएक्स + परिवेश + संगीत + यूआई) |
| `SpeakerCue` | वॉयस सिंथेसिस पैरामीटर (वॉयस आईडी, भावना, गति) |
| `SfxCue` | ध्वनि प्रभाव ट्रिगर (प्रभाव आईडी, समय, तीव्रता) |
| `AmbientCue` | परिवेशीय परत नियंत्रण (शुरू, बंद, क्रॉसफ़ेड) |
| `MusicCue` | पृष्ठभूमि संगीत नियंत्रण (प्ले, स्टॉप, तीव्र, हल्का) |
| `UiEffect` | टर्मिनल/स्क्रीन विज़ुअल प्रभाव (फ्लैश, शेक, फ़ेड) |
| `VoiceProfile` | भाषण संश्लेषण के लिए वॉयस कॉन्फ़िगरेशन |
| `PresentationRenderer` | रेंडर अनुबंध — कोई भी फ्रंटएंड इसे लागू करता है |

## उपयोग

```typescript
import type { NarrationPlan, PresentationRenderer } from '@ai-rpg-engine/presentation';
import { validateNarrationPlan, isValidNarrationPlan } from '@ai-rpg-engine/presentation';

// Validate a plan from Claude's output
const errors = validateNarrationPlan(planFromClaude);
if (errors.length === 0) {
  // Plan is valid, execute it
}

// Type guard
if (isValidNarrationPlan(data)) {
  console.log(data.sceneText);
}
```

## AI RPG इंजन का हिस्सा

यह पैकेज [AI RPG इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) मोनोरेपो का हिस्सा है। पूर्ण आर्किटेक्चर के लिए रूट README देखें।

## लाइसेंस

MIT
