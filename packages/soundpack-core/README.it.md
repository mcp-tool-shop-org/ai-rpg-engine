<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Registro e specifica dei pacchetti audio indirizzabili per il [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Parte di **Immersion Runtime** — gestisce le risorse audio come collezioni etichettate e interrogabili.

## Installazione

```bash
npm install @ai-rpg-engine/soundpack-core
```

## Cosa fa

I pacchetti audio sono collezioni di elementi audio (effetti sonori, loop ambientali, musica, voci) con metadati dettagliati per la ricerca. Il registro supporta query basate su tag, filtraggio per intensità e corrispondenza dell'umore.

Include un **pacchetto audio di base** che si interfaccia con gli effetti procedurali di [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard).

## Utilizzo

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

## Pacchetto audio di base

13 elementi collegati a effetti procedurali di voice-soundboard:

| ID | Effetto | Dominio | Tag |
|----|--------|--------|------|
| `ui_notification` | `chime_notification` | sfx | ui, alert |
| `ui_success` | `chime_success` | sfx | ui, positivo |
| `ui_error` | `chime_error` | sfx | ui, negativo |
| `ui_click` | `click` | sfx | ui, input |
| `ui_pop` | `pop` | sfx | ui, luce |
| `ui_whoosh` | `whoosh` | sfx | ui, transizione |
| `alert_warning` | `warning` | sfx | alert, attenzione |
| `alert_critical` | `critical` | sfx | alert, pericolo |
| `alert_info` | `info` | sfx | alert, info |
| `ambient_rain` | `rain` | ambientale | meteo, calma |
| `ambient_white_noise` | `white_noise` | ambientale | sfondo |
| `ambient_drone` | `drone` | ambientale | oscuro, tensione |

## Pacchetti audio personalizzati

Crea il tuo pacchetto audio fornendo un `SoundPackManifest`:

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

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Consultare il file README principale per l'architettura completa.

## Licenza

MIT
