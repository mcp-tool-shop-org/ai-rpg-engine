<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/इमेज-जेन (image-gen)

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/image-gen)](https://www.npmjs.com/package/@ai-rpg-engine/image-gen)
[![लाइसेंस: एमआईटी](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[एआई आरपीजी इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) के लिए, बिना सिर वाले पोर्ट्रेट (चित्र) बनाने की प्रक्रिया, जिसमें प्रदाता (provider) को अलग रखने की सुविधा है।

## स्थापित करें।

```bash
npm install @ai-rpg-engine/image-gen
```

## यह क्या करता है।

यह उपकरण चरित्र संबंधी जानकारी (जैसे कि प्रकार, पृष्ठभूमि, विशेषताएं, अनुशासन) को पीढ़ी के लिए संकेत (प्रॉम्प्ट) में बदलता है, फिर उन्हें एक प्लगइन के माध्यम से चित्र प्रदान करने वाले सिस्टम को भेजता है, और परिणाम को एक संपत्ति रजिस्ट्री में संग्रहीत करता है। इसमें एक बुनियादी, अतिरिक्त निर्भरता-रहित प्रदाता और स्थानीय जीपीयू (GPU) पर चित्र बनाने के लिए एक कॉमफीयूआई (ComfyUI) प्रदाता शामिल है।

## उपयोग

### एक चित्र उत्पन्न करें (अस्थायी)।

```typescript
import { PlaceholderProvider, generatePortrait, buildPortraitPrompt } from '@ai-rpg-engine/image-gen';
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';

const provider = new PlaceholderProvider();
const store = new MemoryAssetStore();

const meta = await generatePortrait({
  characterName: 'Aldric',
  archetypeName: 'Penitent Knight',
  backgroundName: 'Oath-Breaker',
  traits: ['Iron Frame', 'Cursed Blood'],
  title: 'Grave Warden',
  tags: ['martial', 'oath-broken', 'curse-touched'],
  genre: 'fantasy',
}, provider, store);

// meta.hash is the portraitRef for CharacterBuild
console.log(meta.hash);  // SHA-256 content address
```

### कॉम्फीयूआई के साथ उत्पन्न करें (स्थानीय जीपीयू का उपयोग करके)।

```typescript
import { ComfyUIProvider, generatePortrait } from '@ai-rpg-engine/image-gen';
import { FileAssetStore } from '@ai-rpg-engine/asset-registry';

const provider = new ComfyUIProvider({
  baseUrl: 'http://localhost:8188',
  checkpoint: 'sd_xl_base_1.0.safetensors',
});

if (await provider.isAvailable()) {
  const store = new FileAssetStore('./assets');
  const meta = await generatePortrait(request, provider, store, {
    generation: { width: 512, height: 512, steps: 20, cfgScale: 7 },
  });
}
```

### प्रॉम्प्ट्स को मैन्युअल रूप से बनाएं।

```typescript
import { buildPortraitPrompt, buildNegativePrompt } from '@ai-rpg-engine/image-gen';

const prompt = buildPortraitPrompt(request);
// "Portrait of Aldric, Grave Warden, Penitent Knight and Occultist, Oath-Breaker origin, known for being Iron Frame and Cursed Blood, dark fantasy oil painting, dramatic lighting..."

const negative = buildNegativePrompt(request);
// "modern clothing, technology, cartoon, anime, blurry, deformed"
```

### पोर्ट्रेट (डुप्लिकेट हटाने) सुनिश्चित करें।

```typescript
import { ensurePortrait } from '@ai-rpg-engine/image-gen';

// Generates only if no matching portrait exists in the store
const meta = await ensurePortrait(request, provider, store);
```

## प्रदाता।

| प्रदाता। | बैकएंड | मुझे खेद है, लेकिन "Deps" शब्द का अर्थ मुझे स्पष्ट नहीं है। कृपया अधिक जानकारी प्रदान करें ताकि मैं इसका सही अनुवाद कर सकूं। | उपयोग परिदृश्य। |
|----------|---------|------|----------|
| `PlaceholderProvider` | एसवीजी (SVG) जिसमें प्रारंभिक अक्षर शामिल हैं। | कोई नहीं। | परीक्षण, विकास। |
| `ComfyUIProvider` | ComfyUI का HTTP एपीआई। | ComfyUI सर्वर। | स्थानीय जीपीयू (ग्राफिक्स प्रोसेसिंग यूनिट) द्वारा उत्पन्न। |

### अनुकूलित प्रदाता।

`ImageProvider` इंटरफ़ेस को लागू करें:

```typescript
import type { ImageProvider, GenerationResult, GenerationOptions } from '@ai-rpg-engine/image-gen';

class MyProvider implements ImageProvider {
  readonly name = 'my-provider';

  async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationResult> {
    // Your generation logic here
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
```

## शैली और डिज़ाइन के पूर्व-निर्धारित विकल्प।

नौ शैलियों (genres) के लिए अंतर्निहित स्टाइल प्रीसेट उपलब्ध हैं:

| शैली। | शैली। |
|-------|-------|
| काल्पनिक। | अंधेरे और रहस्यमय कल्पना पर आधारित तेल चित्रकला, जिसमें नाटकीय प्रकाश व्यवस्था का उपयोग किया गया है। |
| साइबरपंक | नियॉन रोशनी, क्रोम और चमड़े का उपयोग, और उच्च कंट्रास्ट। |
| रहस्य। | विक्टोरियन युग की रहस्यमय कहानी, गैस की रोशनी का माहौल, धुंध और छाया। |
| समुद्री डाकू | सुनहरा युग, समुद्री कला, और समय के साथ घिसे हुए बनावट वाले दृश्य। |
| भयानक, डरावना, भयावह। | गहरा रंग वाला चित्रण, फीके और बेजान रंगों का उपयोग। |
| पश्चिमी। | पश्चिमी इलाके का एक विचित्र तेल चित्र, धूल से भरा परिदृश्य। |
| विज्ञान-फाई (विज्ञान पर आधारित काल्पनिक कथाएं) | अवधारणा कला, भविष्यवादी परिवेश, सिनेमाई शैली। |
| प्रलय के बाद का। | खंडहर हो चुके शहरी इलाके, जीवित रहने के लिए आवश्यक उपकरण, खुरदरे बनावट। |
| ऐतिहासिक | समय के अनुरूप, शास्त्रीय रचना। |

## एकीकरण।

यह [comfy-headless](https://github.com/mcp-tool-shop/comfy-headless) के साथ मिलकर काम करता है, जिससे आपके स्थानीय जीपीयू पर बेहतर प्रॉम्प्ट इंटेलिजेंस और वीडियो निर्माण की सुविधा मिलती है।

## कृत्रिम बुद्धिमत्ता (एआई) आधारित रोल-प्लेइंग गेम इंजन का एक हिस्सा।

यह पैकेज [एआई आरपीजी इंजन](https://github.com/mcp-tool-shop-org/ai-rpg-engine) नामक एक बड़े प्रोजेक्ट का हिस्सा है। यह `@ai-rpg-engine/asset-registry` पर निर्भर करता है, जिसका उपयोग डेटा संग्रहीत करने के लिए किया जाता है।

## लाइसेंस।

एमआईटी।
