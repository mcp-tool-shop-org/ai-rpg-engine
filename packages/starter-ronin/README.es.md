<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-ronin

> **Ejemplo de estructura** — Este programa de inicio demuestra cómo integrar el motor para un misterio feudal. Es un ejemplo para aprender, no una plantilla para copiar. Consulte la [Guía de estructura](../../docs/handbook/57-composition-guide.md) para crear su propio juego.

**Velo de Jade** — Un castillo feudal durante una tensa cumbre política. Un señor ha sido envenenado. Encuentre al asesino antes de que se agote el honor.

Parte del catálogo de programas de inicio del [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Misterio feudal + intrigas palaciegas. El honor es frágil: las falsas acusaciones tienen un alto costo y son casi imposibles de recuperar. Cada pregunta tiene peso, cada acusación tiene consecuencias. Los asesinos perciben al ronin como "una espada sin señor: impredecible".

## Inicio rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-ronin';

const engine = createGame();
engine.start();
```

## Patrones demostrados

| Característica | Lo que muestra Ronin |
|---------|------------------|
| **Engagement** | Múltiples roles de protector (cuerpo de guardia + samurái), pasajes ocultos. |
| **Resources** | Sistema de doble capa: ki (regenerativo) vs. honor (frágil, difícil de recuperar). |
| **Social** | Investigación con consecuencias: las falsas acusaciones cuestan honor. |
| **Cognition** | Regla de percepción de los asesinos dirigida a los ronin no afiliados. |

## Contenido

- **5 zonas:** Puerta del castillo, Gran salón, Jardín de té, Cámara del señor, Pasaje oculto.
- **3 PNJ:** Lord Takeda (señor envenenado), Lady Himiko (sospechosa), Magistrado Sato (investigador).
- **2 enemigos:** Asesino de las sombras, Samurái corrupto.
- **1 árbol de diálogo:** El magistrado informa sobre el envenenamiento y los sospechosos de la corte.
- **1 árbol de progresión:** Camino de la Espada (Mano firme → Calma interior → Furia justa).
- **1 objeto:** Kit de incienso (restaura 5 ki).

## Mecánicas únicas

| Verbo | Descripción |
|------|-------------|
| `duel` | Desafío marcial formal utilizando la disciplina. |
| `meditate` | Restaura ki y compostura a costa de un turno. |

## Estadísticas y recursos

| Estadística | Rol |
|------|------|
| Disciplina | Habilidad marcial, técnica de espada, concentración. |
| Percepción | Conciencia, deducción, lectura de intenciones. |
| Compostura | Control social, dominio emocional. |

| Recurso | Rango | Notas |
|----------|-------|-------|
| HP | 0–30 | Salud estándar |
| Honor | 0–30 | Frágil: las falsas acusaciones cuestan -5, difícil de recuperar. |
| Ki | 0–20 | Energía espiritual, se regenera 2 por "tick". |

## Qué tomar prestado

Múltiples roles de protector (cuerpo de guardia + samurái) y recursos de doble capa (ki + honor). Estudie cómo dos roles de protección con diferentes condiciones de activación crean una defensa en capas, y cómo el ki (regenerativo) frente al honor (frágil, difícil de recuperar) fuerzan diferentes estilos de juego en combate e investigación.

## Licencia

MIT
