<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

Registro de sons e especificação de pacotes de áudio endereçáveis por conteúdo para o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Parte do **Immersion Runtime** — gerencia ativos de áudio como coleções etiquetadas e pesquisáveis.

## Instalação

```bash
npm install @ai-rpg-engine/soundpack-core
```

## O que ele faz

Pacotes de som são coleções de arquivos de áudio (efeitos sonoros, loops de ambiente, música, voz) com metadados ricos para descoberta. O registro suporta consultas baseadas em tags, filtragem por intensidade e correspondência de humor.

Vem com um **pacote de som principal** que mapeia para efeitos procedurais do [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard).

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

## Pacote de Som Principal

13 entradas mapeadas para efeitos procedurais do voice-soundboard:

| ID | Efeito | Domínio | Tags |
|----|--------|--------|------|
| `ui_notification` | `chime_notification` | sfx | ui, alerta |
| `ui_success` | `chime_success` | sfx | ui, positivo |
| `ui_error` | `chime_error` | sfx | ui, negativo |
| `ui_click` | `click` | sfx | ui, entrada |
| `ui_pop` | `pop` | sfx | ui, luz |
| `ui_whoosh` | `whoosh` | sfx | ui, transição |
| `alert_warning` | `warning` | sfx | alerta, cuidado |
| `alert_critical` | `critical` | sfx | alerta, perigo |
| `alert_info` | `info` | sfx | alerta, informação |
| `ambient_rain` | `rain` | ambiente | clima, calmo |
| `ambient_white_noise` | `white_noise` | ambiente | fundo |
| `ambient_drone` | `drone` | ambiente | escuro, tensão |

## Pacotes de Som Personalizados

Crie seu próprio pacote de som fornecendo um `SoundPackManifest`:

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

## Parte do AI RPG Engine

Este pacote faz parte do monorepository [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Consulte o arquivo README raiz para a arquitetura completa.

## Licença

MIT
