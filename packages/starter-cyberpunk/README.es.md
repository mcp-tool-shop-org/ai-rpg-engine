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

# @ai-rpg-engine/starter-cyberpunk

**Neon Lockbox** — un mundo de inicio cyberpunk para el motor de juegos de rol con IA.

## Instalación

```bash
npm install @ai-rpg-engine/starter-cyberpunk
```

## Lo que aprenderá

Este ejemplo demuestra la flexibilidad del género: el mismo conjunto de herramientas con un modelo de estadísticas completamente diferente.

| Características | Lo que muestra Neon Lockbox |
|---|---|
| **Rulesets** | `cyberpunkMinimalRuleset` — estadísticas (cromo/reflejos/conexión a la red), recursos (puntos de vida/cortafuegos/ancho de banda), 8 acciones, incluyendo `hackear` y `conectarse`. |
| **Zones & traversal** | 3 zonas (calle → sala de servidores → bóveda) con iluminación, peligros e interactuables. |
| **Districts** | Bloque de calle iluminado (público) vs. Complejo de la bóveda (seguro, controlado por facciones). |
| **Dialogue** | Briefing del intermediario con 3 ramas y efectos globales. |
| **Combat** | Centinela ICE con IA agresiva, objetivo: proteger la bóveda. |
| **Cognition & perception** | Mayor degradación + inestabilidad, percepción basada en "reflejos" con la estadística de "conexión a la red". |
| **Progression** | Árbol de habilidades de conexión a la red de 3 nodos (Analizador de paquetes → Endurecimiento de cortafuegos → Impulso neural). |
| **Environment** | Peligro de cables expuestos que infligen 2 puntos de daño. |
| **Factions** | Facción de cortafuegos de la bóveda con una cohesión de 0.95. |
| **Belief provenance** | Propagación de rumores más rápida (retraso=1) con un 3% de distorsión por salto. |
| **Inventory** | Programa "Rompedor de cortafuegos" — reduce el cortafuegos objetivo en 8. |
| **Presentation rules** | Los agentes de cortafuegos marcan a todas las entidades que no son cortafuegos como intrusiones. |

### Fantasía vs. Cyberpunk — el mismo motor, diferentes conjuntos de reglas

| | Chapel Threshold | Neon Lockbox |
|---|---|---|
| Estadísticas | vigor / instinto / voluntad | cromo / reflejos / conexión a la red |
| Recursos | puntos de vida, resistencia | puntos de vida, cortafuegos, ancho de banda |
| Acciones únicas | — | hackear, conectarse |
| Percepción | predeterminada | basada en reflejos + sentido de conexión a la red |
| Degradación cognitiva | 0.02 (base) | 0.03 (base), 0.8 de inestabilidad |
| Propagación de rumores | retraso=2, sin distorsión | retraso=1, 3% de distorsión |

## Qué hay dentro

- **3 zonas** — Calle a nivel de la calle iluminada, Sala de servidores abandonada, Bóveda de datos.
- **1 NPC** — Kira, la intermediaria (diálogo de briefing, 3 caminos de conversación).
- **1 enemigo** — Centinela ICE (IA agresiva, objetivo: proteger la bóveda).
- **1 objeto** — Programa "Rompedor de cortafuegos" (reduce el recurso de cortafuegos objetivo).
- **1 árbol de progresión** — Habilidades de conexión a la red (Analizador de paquetes → Endurecimiento de cortafuegos → Impulso neural).
- **1 regla de presentación** — Los agentes de cortafuegos marcan a todas las entidades que no son cortafuegos como intrusiones.
- **15 módulos conectados** — El mismo conjunto completo que Chapel Threshold, pero con una configuración diferente.

## Uso

```typescript
import { createGame } from '@ai-rpg-engine/starter-cyberpunk';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(77);

// Or import pieces individually:
import { manifest, zones, fixerDialogue, cyberpunkMinimalRuleset } from '@ai-rpg-engine/starter-cyberpunk';
```

## Documentación

- [Neon Lockbox (Cap. 21)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/21-neon-lockbox/)
- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
