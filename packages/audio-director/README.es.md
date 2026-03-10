<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/audio-director"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/audio-director.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/audio-director

Motor de programación determinista de señales de audio para el [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Forma parte de **Immersion Runtime** y convierte planes de narración en comandos de audio temporizados y priorizados.

## Instalación

```bash
npm install @ai-rpg-engine/audio-director
```

## ¿Qué hace?

El Audio Director recibe un `NarrationPlan` y produce un array ordenado de `AudioCommand[]`, listo para ser ejecutado por cualquier sistema de audio. Gestiona:

- **Prioridad**: Voz > Efectos de sonido > Música > Ambiente (configurable)
- **Atenuación**: El sonido ambiente/música se atenúa automáticamente cuando se reproduce la voz.
- **Enfriamiento**: Evita la repetición excesiva de efectos de sonido (configurable por recurso).
- **Temporización**: Secuencias las señales en relación con la duración del discurso.
- **Seguimiento de capas**: Conoce qué capas de sonido ambiente están activas.

## Uso

```typescript
import { AudioDirector } from '@ai-rpg-engine/audio-director';
import type { NarrationPlan } from '@ai-rpg-engine/presentation';

const director = new AudioDirector({
  defaultCooldownMs: 2000,
});

// Schedule commands from a narration plan
const commands = director.schedule(plan);

// Execute commands through your audio backend
for (const cmd of commands) {
  await audioBackend.execute(cmd);
}

// Check cooldowns
director.isOnCooldown('alert_warning'); // true if recently played

// Clear cooldowns on scene change
director.clearCooldowns();
```

## Reglas de atenuación predeterminadas

| Disparador | Objetivo | Nivel de atenuación |
|---------|--------|-----------|
| Voz | Ambiente | 30% de volumen |
| Voz | Música | 40% de volumen |
| Efectos de sonido | Ambiente | 60% de volumen |

## Forma parte de AI RPG Engine

Este paquete forma parte del repositorio monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Consulte el archivo README principal para obtener información sobre la arquitectura completa.

## Licencia

MIT
