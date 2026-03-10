<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/image-gen

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/image-gen)](https://www.npmjs.com/package/@ai-rpg-engine/image-gen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Pipeline de generación de retratos sin interfaz, con abstracción de proveedor para [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalación

```bash
npm install @ai-rpg-engine/image-gen
```

## ¿Qué hace?

Convierte los metadatos del personaje (arquetipo, trasfondo, características, disciplina) en indicaciones de generación, los envía a un proveedor de imágenes configurable y almacena el resultado en el registro de activos. Incluye un proveedor de ejemplo sin dependencias y un proveedor para ComfyUI para la generación local en la GPU.

## Uso

### Generar un retrato (ejemplo)

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

### Generar con ComfyUI (GPU local)

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

### Crear indicaciones manualmente

```typescript
import { buildPortraitPrompt, buildNegativePrompt } from '@ai-rpg-engine/image-gen';

const prompt = buildPortraitPrompt(request);
// "Portrait of Aldric, Grave Warden, Penitent Knight and Occultist, Oath-Breaker origin, known for being Iron Frame and Cursed Blood, dark fantasy oil painting, dramatic lighting..."

const negative = buildNegativePrompt(request);
// "modern clothing, technology, cartoon, anime, blurry, deformed"
```

### Asegurar el retrato (eliminar duplicados)

```typescript
import { ensurePortrait } from '@ai-rpg-engine/image-gen';

// Generates only if no matching portrait exists in the store
const meta = await ensurePortrait(request, provider, store);
```

## Proveedores

| Proveedor | Backend | Dependencias | Caso de uso |
|----------|---------|------|----------|
| `PlaceholderProvider` | SVG con iniciales | Ninguna | Pruebas, desarrollo |
| `ComfyUIProvider` | API HTTP de ComfyUI | Servidor de ComfyUI | Generación local en la GPU |

### Proveedor personalizado

Implemente la interfaz `ImageProvider`:

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

## Preajustes de estilo por género

Preajustes de estilo integrados para 9 géneros:

| Género | Estilo |
|-------|-------|
| fantasía | Pintura al óleo de fantasía oscura, iluminación dramática |
| cyberpunk | Iluminación de neón, cromo y cuero, alto contraste |
| misterio | Noir victoriano, atmósfera de farol, niebla y sombra |
| pirata | Era dorada marítima, texturas desgastadas |
| horror | Ilustración oscura, paleta apagada y desaturada |
| western | Pintura al óleo del "oeste extraño", frontera polvorienta |
| ciencia ficción | Arte conceptual, entorno futurista, cinematográfico |
| post-apocalíptico | Entorno urbano en ruinas, equipo de supervivencia, texturas ásperas |
| histórico | Preciso para la época, composición clásica |

## Integración

Funciona con [comfy-headless](https://github.com/mcp-tool-shop/comfy-headless) para una mayor inteligencia de las indicaciones y generación de video en su GPU local.

## Parte de AI RPG Engine

Este paquete es parte del monorepositorio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Depende de `@ai-rpg-engine/asset-registry` para el almacenamiento.

## Licencia

MIT
