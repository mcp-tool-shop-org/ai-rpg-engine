<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Registro de sonidos y especificación de paquetes direccionables por contenido para el [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Parte del **Immersion Runtime** — gestiona los activos de audio como colecciones etiquetadas y consultables.

## Instalación

```bash
npm install @ai-rpg-engine/soundpack-core
```

## ¿Qué hace?

Los paquetes de sonido son colecciones de archivos de audio (efectos de sonido, bucles ambientales, música, voz) con metadatos detallados para facilitar su descubrimiento. El registro admite consultas basadas en etiquetas, filtrado por intensidad y coincidencia de estado de ánimo.

Viene con un **paquete de sonido básico** que se asocia con efectos procedurales de [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard).

## Uso

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

## Paquete de Sonido Básico

13 elementos asociados a efectos procedurales de voice-soundboard:

| ID | Efecto | Dominio | Etiquetas |
|----|--------|--------|------|
| `ui_notification` | `chime_notification` | sfx | ui, alerta |
| `ui_success` | `chime_success` | sfx | ui, positivo |
| `ui_error` | `chime_error` | sfx | ui, negativo |
| `ui_click` | `click` | sfx | ui, entrada |
| `ui_pop` | `pop` | sfx | ui, luz |
| `ui_whoosh` | `whoosh` | sfx | ui, transición |
| `alert_warning` | `warning` | sfx | alerta, precaución |
| `alert_critical` | `critical` | sfx | alerta, peligro |
| `alert_info` | `info` | sfx | alerta, información |
| `ambient_rain` | `rain` | ambiental | clima, calma |
| `ambient_white_noise` | `white_noise` | ambiental | fondo |
| `ambient_drone` | `drone` | ambiental | oscuro, tensión |

## Paquetes de Sonido Personalizados

Cree su propio paquete de sonido proporcionando un `SoundPackManifest`:

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

## Parte del AI RPG Engine

Este paquete es parte del monorepositorio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Consulte el archivo README principal para obtener información completa sobre la arquitectura.

## Licencia

MIT
