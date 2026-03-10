<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Registre de sons et spécification de packs audio adressables par contenu pour le [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Fait partie de l'**Immersion Runtime** — gère les ressources audio comme des collections étiquetées et interrogeables.

## Installation

```bash
npm install @ai-rpg-engine/soundpack-core
```

## Fonctionnalités

Les packs audio sont des collections de fichiers audio (effets sonores, boucles d'ambiance, musique, voix) avec des métadonnées riches pour faciliter la découverte. Le registre prend en charge les requêtes basées sur des étiquettes, le filtrage par intensité et la correspondance d'ambiance.

Livré avec un **pack audio de base** qui correspond aux effets procéduraux de [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard).

## Utilisation

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

## Pack audio de base

13 éléments correspondant aux effets procéduraux de voice-soundboard :

| ID | Effet | Domaine | Étiquettes |
|----|--------|--------|------|
| `ui_notification` | `chime_notification` | sfx | ui, alerte |
| `ui_success` | `chime_success` | sfx | ui, positif |
| `ui_error` | `chime_error` | sfx | ui, négatif |
| `ui_click` | `click` | sfx | ui, entrée |
| `ui_pop` | `pop` | sfx | ui, lumière |
| `ui_whoosh` | `whoosh` | sfx | ui, transition |
| `alert_warning` | `warning` | sfx | alerte, prudence |
| `alert_critical` | `critical` | sfx | alerte, danger |
| `alert_info` | `info` | sfx | alerte, information |
| `ambient_rain` | `rain` | ambiance | météo, calme |
| `ambient_white_noise` | `white_noise` | ambiance | arrière-plan |
| `ambient_drone` | `drone` | ambiance | sombre, tension |

## Packs audio personnalisés

Créez votre propre pack audio en fournissant un `SoundPackManifest` :

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

## Fait partie de AI RPG Engine

Ce paquet fait partie du dépôt monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Consultez le fichier README principal pour l'architecture complète.

## Licence

MIT
