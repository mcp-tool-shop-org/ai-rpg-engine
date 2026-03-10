<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/image-gen

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/image-gen)](https://www.npmjs.com/package/@ai-rpg-engine/image-gen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Pipeline per la generazione di ritratti senza interfaccia utente, con astrazione del provider per [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installazione

```bash
npm install @ai-rpg-engine/image-gen
```

## Cosa fa

Converte i metadati del personaggio (archetipo, background, tratti, disciplina) in istruzioni per la generazione, le invia a un provider di immagini configurabile e memorizza il risultato nel registro delle risorse. Include un provider di esempio senza dipendenze e un provider per ComfyUI per la generazione locale tramite GPU.

## Utilizzo

### Genera un ritratto (esempio)

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

### Genera con ComfyUI (GPU locale)

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

### Crea istruzioni manualmente

```typescript
import { buildPortraitPrompt, buildNegativePrompt } from '@ai-rpg-engine/image-gen';

const prompt = buildPortraitPrompt(request);
// "Portrait of Aldric, Grave Warden, Penitent Knight and Occultist, Oath-Breaker origin, known for being Iron Frame and Cursed Blood, dark fantasy oil painting, dramatic lighting..."

const negative = buildNegativePrompt(request);
// "modern clothing, technology, cartoon, anime, blurry, deformed"
```

### Assicura la generazione del ritratto (rimuove i duplicati)

```typescript
import { ensurePortrait } from '@ai-rpg-engine/image-gen';

// Generates only if no matching portrait exists in the store
const meta = await ensurePortrait(request, provider, store);
```

## Provider

| Provider | Backend | Dipendenze | Caso d'uso |
|----------|---------|------|----------|
| `PlaceholderProvider` | SVG con iniziali | Nessuno | Test, sviluppo |
| `ComfyUIProvider` | API HTTP di ComfyUI | Server ComfyUI | Generazione locale tramite GPU |

### Provider personalizzato

Implementa l'interfaccia `ImageProvider`:

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

## Preset di stile per genere

Preset di stile integrati per 9 generi:

| Genere | Stile |
|-------|-------|
| fantasy | Dipinto ad olio dark fantasy, illuminazione drammatica |
| cyberpunk | Illuminazione al neon, cromo e pelle, alto contrasto |
| mystery | Noir vittoriano, atmosfera di lampade a gas, nebbia e ombre |
| pirate | Età dell'oro marittima, texture vissute |
| horror | Illustrazione oscura, palette desaturata e smorzata |
| western | Dipinto ad olio del selvaggio West, frontiera polverosa |
| sci-fi | Concept art, ambientazione futuristica, cinematografica |
| post-apocalyptic | Ambiente urbano in rovina, equipaggiamento di sopravvivenza, texture ruvide |
| historical | Accurato per l'epoca, composizione classica |

## Integrazione

Funziona con [comfy-headless](https://github.com/mcp-tool-shop/comfy-headless) per una maggiore intelligenza delle istruzioni e la generazione di video sulla tua GPU locale.

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Dipende da `@ai-rpg-engine/asset-registry` per l'archiviazione.

## Licenza

MIT
