<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/presentation"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/presentation.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/presentation

Esquema de plano de narração, contratos de renderização e tipos de estado de apresentação para o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Parte do **Immersion Runtime** — o pipeline de apresentação multimodal que transforma o estado do jogo em experiências audiovisuais estruturadas.

## Instalação

```bash
npm install @ai-rpg-engine/presentation
```

## O que ele faz

Em vez de gerar texto bruto, o narrador produz um **NarrationPlan** — uma receita estruturada que descreve texto, efeitos sonoros, camadas de ambiente, pistas musicais, efeitos de interface do usuário e parâmetros de síntese de voz.

Qualquer interface (terminal, web, Electron) implementa a interface `PresentationRenderer` para receber e executar esses planos.

## Tipos Principais

| Tipo | Propósito |
|------|---------|
| `NarrationPlan` | Receita de narração estruturada (texto + efeitos sonoros + ambiente + música + interface do usuário) |
| `SpeakerCue` | Parâmetros de síntese de voz (ID da voz, emoção, velocidade) |
| `SfxCue` | Gatilho de efeito sonoro (ID do efeito, tempo, intensidade) |
| `AmbientCue` | Controle de camada de ambiente (iniciar, parar, crossfade) |
| `MusicCue` | Controle de música de fundo (tocar, parar, intensificar, suavizar) |
| `UiEffect` | Efeitos visuais na tela/terminal (piscar, tremer, desvanecer) |
| `VoiceProfile` | Configuração de voz para síntese de fala |
| `PresentationRenderer` | Contrato de renderização — qualquer interface implementa isso |

## Uso

```typescript
import type { NarrationPlan, PresentationRenderer } from '@ai-rpg-engine/presentation';
import { validateNarrationPlan, isValidNarrationPlan } from '@ai-rpg-engine/presentation';

// Validate a plan from Claude's output
const errors = validateNarrationPlan(planFromClaude);
if (errors.length === 0) {
  // Plan is valid, execute it
}

// Type guard
if (isValidNarrationPlan(data)) {
  console.log(data.sceneText);
}
```

## Parte do AI RPG Engine

Este pacote faz parte do monorepository [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Consulte o arquivo README principal para a arquitetura completa.

## Licença

MIT
