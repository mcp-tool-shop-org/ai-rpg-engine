<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/image-gen

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/image-gen)](https://www.npmjs.com/package/@ai-rpg-engine/image-gen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Pipeline de geração de retratos sem interface, com abstração de provedor para o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalação

```bash
npm install @ai-rpg-engine/image-gen
```

## O que faz

Converte metadados de personagens (arquétipo, histórico, características, disciplina) em prompts de geração, envia-os para um provedor de imagens configurável e armazena o resultado no registro de ativos. Inclui um provedor de exemplo sem dependências e um provedor para ComfyUI para geração local na GPU.

## Uso

### Gerar um Retrato (Exemplo)

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

### Gerar com ComfyUI (GPU Local)

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

### Criar Prompts Manualmente

```typescript
import { buildPortraitPrompt, buildNegativePrompt } from '@ai-rpg-engine/image-gen';

const prompt = buildPortraitPrompt(request);
// "Portrait of Aldric, Grave Warden, Penitent Knight and Occultist, Oath-Breaker origin, known for being Iron Frame and Cursed Blood, dark fantasy oil painting, dramatic lighting..."

const negative = buildNegativePrompt(request);
// "modern clothing, technology, cartoon, anime, blurry, deformed"
```

### Garantir a Qualidade do Retrato (Remover Duplicatas)

```typescript
import { ensurePortrait } from '@ai-rpg-engine/image-gen';

// Generates only if no matching portrait exists in the store
const meta = await ensurePortrait(request, provider, store);
```

## Provedores

| Provedor | Backend | Dependências | Caso de Uso |
|----------|---------|------|----------|
| `PlaceholderProvider` | SVG com iniciais | Nenhum | Testes, desenvolvimento |
| `ComfyUIProvider` | API HTTP do ComfyUI | Servidor ComfyUI | Geração local na GPU |

### Provedor Personalizado

Implemente a interface `ImageProvider`:

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

## Predefinições de Estilo por Gênero

Predefinições de estilo integradas para 9 gêneros:

| Gênero | Estilo |
|-------|-------|
| Fantasia | Pintura a óleo de fantasia sombria, iluminação dramática |
| Cyberpunk | Iluminação neon, cromo e couro, alto contraste |
| Mistério | Noir vitoriano, atmosfera de lampiões a gás, névoa e sombra |
| Pirata | Era de ouro marítima, texturas desgastadas |
| Horror | Ilustração sombria, paleta desaturada |
| Western | Pintura a óleo do velho oeste, fronteira empoeirada |
| Ficção Científica | Arte conceitual, cenário futurista, cinematográfico |
| Pós-apocalíptico | Cidades em ruínas, equipamentos de sobrevivência, texturas ásperas |
| Histórico | Precisão de época, composição clássica |

## Integração

Funciona com [comfy-headless](https://github.com/mcp-tool-shop/comfy-headless) para maior inteligência de prompts e geração de vídeo na sua GPU local.

## Parte do AI RPG Engine

Este pacote faz parte do monorepository [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Depende de `@ai-rpg-engine/asset-registry` para armazenamento.

## Licença

MIT
