<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/image-gen

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/image-gen)](https://www.npmjs.com/package/@ai-rpg-engine/image-gen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Pipeline de génération de portraits sans interface utilisateur, avec abstraction du fournisseur pour [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installation

```bash
npm install @ai-rpg-engine/image-gen
```

## Fonctionnalités

Convertit les métadonnées des personnages (archétype, historique, traits, discipline) en instructions de génération, les envoie à un fournisseur d'images configurable et stocke le résultat dans le registre des ressources. Livré avec un fournisseur de secours sans dépendance et un fournisseur ComfyUI pour la génération locale sur GPU.

## Utilisation

### Générer un portrait (fournisseur de secours)

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

### Générer avec ComfyUI (GPU local)

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

### Créer des instructions manuellement

```typescript
import { buildPortraitPrompt, buildNegativePrompt } from '@ai-rpg-engine/image-gen';

const prompt = buildPortraitPrompt(request);
// "Portrait of Aldric, Grave Warden, Penitent Knight and Occultist, Oath-Breaker origin, known for being Iron Frame and Cursed Blood, dark fantasy oil painting, dramatic lighting..."

const negative = buildNegativePrompt(request);
// "modern clothing, technology, cartoon, anime, blurry, deformed"
```

### Assurer la génération du portrait (suppression des doublons)

```typescript
import { ensurePortrait } from '@ai-rpg-engine/image-gen';

// Generates only if no matching portrait exists in the store
const meta = await ensurePortrait(request, provider, store);
```

## Fournisseurs

| Fournisseur | Backend | Dépendances | Cas d'utilisation |
|----------|---------|------|----------|
| `PlaceholderProvider` | SVG avec initiales | Aucune | Tests, développement |
| `ComfyUIProvider` | API HTTP ComfyUI | Serveur ComfyUI | Génération locale sur GPU |

### Fournisseur personnalisé

Implémentez l'interface `ImageProvider` :

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

## Présets de style par genre

Présets de style intégrés pour 9 genres :

| Genre | Style |
|-------|-------|
| fantasy | Peinture à l'huile de fantasy, éclairage dramatique |
| cyberpunk | Éclairage néon, chrome et cuir, contraste élevé |
| mystère | Film noir victorien, atmosphère de réverbères, brouillard et ombre |
| pirate | Âge d'or maritime, textures usées |
| horreur | Illustration sombre, palette désaturée |
| western | Peinture à l'huile du Far West, frontière poussiéreuse |
| science-fiction | Artwork conceptuel, environnement futuriste, cinématographique |
| post-apocalyptique | Ville en ruines, équipement de survie, textures rugueuses |
| historique | Précision historique, composition classique |

## Intégration

Fonctionne avec [comfy-headless](https://github.com/mcp-tool-shop/comfy-headless) pour une intelligence des instructions améliorée et la génération de vidéos sur votre GPU local.

## Fait partie de AI RPG Engine

Ce paquet fait partie du dépôt monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Dépend de `@ai-rpg-engine/asset-registry` pour le stockage.

## Licence

MIT
