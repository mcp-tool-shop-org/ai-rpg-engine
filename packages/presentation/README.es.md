<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Esquema del plan de narración, contratos de renderizado y tipos de estado de presentación para el [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Parte de **Immersion Runtime**, la canalización de presentación multimodal que transforma el estado del juego en experiencias audiovisuales estructuradas.

## Instalación

```bash
npm install @ai-rpg-engine/presentation
```

## ¿Qué hace?

En lugar de generar texto sin formato, el narrador produce un **NarrationPlan** (plan de narración), una receta estructurada que describe texto, efectos de sonido, capas ambientales, pistas de música, efectos de interfaz de usuario y parámetros de síntesis de voz.

Cualquier interfaz (terminal, web, Electron) implementa la interfaz `PresentationRenderer` para recibir y ejecutar estos planes.

## Tipos clave

| Tipo | Propósito |
|------|---------|
| `NarrationPlan` | Receta de narración estructurada (texto + efectos de sonido + ambiente + música + interfaz de usuario) |
| `SpeakerCue` | Parámetros de síntesis de voz (ID de voz, emoción, velocidad) |
| `SfxCue` | Activación de efecto de sonido (ID del efecto, temporización, intensidad) |
| `AmbientCue` | Control de capa ambiental (inicio, parada, fundido cruzado) |
| `MusicCue` | Control de música de fondo (reproducir, detener, intensificar, suavizar) |
| `UiEffect` | Efectos visuales en la terminal/pantalla (parpadeo, temblor, fundido) |
| `VoiceProfile` | Configuración de voz para la síntesis de voz |
| `PresentationRenderer` | Contrato de renderizado: cualquier interfaz lo implementa. |

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

## Parte del AI RPG Engine

Este paquete es parte del repositorio monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Consulte el archivo README principal para obtener la arquitectura completa.

## Licencia

MIT
