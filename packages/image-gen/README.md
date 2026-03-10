<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/image-gen

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/image-gen)](https://www.npmjs.com/package/@ai-rpg-engine/image-gen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Headless portrait generation pipeline with provider abstraction for [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Install

```bash
npm install @ai-rpg-engine/image-gen
```

## What It Does

Converts character metadata (archetype, background, traits, discipline) into generation prompts, sends them to a pluggable image provider, and stores the result in the asset registry. Ships with a zero-dependency placeholder provider and a ComfyUI provider for local GPU generation.

## Usage

### Generate a Portrait (Placeholder)

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

### Generate with ComfyUI (Local GPU)

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

### Build Prompts Manually

```typescript
import { buildPortraitPrompt, buildNegativePrompt } from '@ai-rpg-engine/image-gen';

const prompt = buildPortraitPrompt(request);
// "Portrait of Aldric, Grave Warden, Penitent Knight and Occultist, Oath-Breaker origin, known for being Iron Frame and Cursed Blood, dark fantasy oil painting, dramatic lighting..."

const negative = buildNegativePrompt(request);
// "modern clothing, technology, cartoon, anime, blurry, deformed"
```

### Ensure Portrait (Deduplicate)

```typescript
import { ensurePortrait } from '@ai-rpg-engine/image-gen';

// Generates only if no matching portrait exists in the store
const meta = await ensurePortrait(request, provider, store);
```

## Providers

| Provider | Backend | Deps | Use Case |
|----------|---------|------|----------|
| `PlaceholderProvider` | SVG with initials | None | Testing, development |
| `ComfyUIProvider` | ComfyUI HTTP API | ComfyUI server | Local GPU generation |

### Custom Provider

Implement the `ImageProvider` interface:

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

## Genre Style Presets

Built-in style presets for 9 genres:

| Genre | Style |
|-------|-------|
| fantasy | Dark fantasy oil painting, dramatic lighting |
| cyberpunk | Neon lighting, chrome and leather, high contrast |
| mystery | Victorian noir, gaslight atmosphere, fog and shadow |
| pirate | Golden age maritime, weathered textures |
| horror | Dark illustration, muted desaturated palette |
| western | Weird west oil painting, dusty frontier |
| sci-fi | Concept art, futuristic setting, cinematic |
| post-apocalyptic | Ruined urban, survival gear, gritty textures |
| historical | Period-accurate, classical composition |

## Integration

Works with [comfy-headless](https://github.com/mcp-tool-shop/comfy-headless) for enhanced prompt intelligence and video generation on your local GPU.

## Part of AI RPG Engine

This package is part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) monorepo. Depends on `@ai-rpg-engine/asset-registry` for storage.

## License

MIT
