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

# @ai-rpg-engine/starter-fantasy

**El Umbral de la Capilla** — un mundo de fantasía oscura para el motor de juegos de rol con IA.

## Instalación

```bash
npm install @ai-rpg-engine/starter-fantasy
```

## Lo que aprenderá

Este ejemplo básico demuestra toda la estructura del motor en un mundo compacto:

| Características | Lo que muestra la Capilla |
|---|---|
| **Rulesets** | `fantasyMinimalRuleset` — estadísticas (vigor/instinto/voluntad), recursos (puntos de vida/resistencia), verbos, fórmulas. |
| **Zones & traversal** | 5 zonas en 2 habitaciones, con adyacencia, niveles de luz, elementos interactivos y peligros. |
| **Districts** | Terreno de la Capilla (sagrado) frente a las Profundidades del Cripta (maldito, controlado por facciones). |
| **Dialogue** | Conversación con un peregrino con ramificaciones, con 3 caminos y efectos de bandera global. |
| **Combat** | Ghoul de Ceniza con perfil de IA agresivo, etiquetas de miedo y objetivo de guardia. |
| **Cognition & perception** | Decaimiento de la memoria, filtro de percepción, regla de presentación de no-muertos. |
| **Progression** | Árbol de Maestría de Combate de 3 nodos con recompensas de experiencia al derrotar a una entidad. |
| **Environment** | Peligro de suelo inestable que drena la resistencia al entrar en la zona. |
| **Factions** | Facción de no-muertos de la Capilla con configuración de cohesión. |
| **Belief provenance** | Propagación de rumores con retraso, seguimiento de creencias. |
| **Inventory** | Poción curativa con efecto de uso programado que restaura 8 puntos de vida. |
| **Simulation inspector** | Inspección completa para análisis de repetición. |

## Qué hay dentro

- **5 zonas** — Entrada de la Capilla en Ruinas, Nave, Rincón Sombrío, Pasaje de la Sacristía, Antecámara del Cripta.
- **1 NPC** — Peregrino Sospechoso (diálogo con ramificaciones, 3 caminos de conversación).
- **1 enemigo** — Ghoul de Ceniza (IA agresiva, miedo al fuego y a lo sagrado).
- **1 objeto** — Poción Curativa (efecto de uso programado que restaura 8 puntos de vida).
- **1 árbol de progresión** — Maestría de Combate (Endurecido → Ojo Agudo → Furia de Batalla).
- **1 regla de presentación** — Los no-muertos perciben a todos los seres vivos como amenazas.
- **15 módulos conectados** — movimiento, estado, combate, inventario, diálogo, cognición, percepción, progresión, entorno, facciones, rumores, distritos, creencias, presentación del observador, inspector.

## Uso

```typescript
import { createGame } from '@ai-rpg-engine/starter-fantasy';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zones, pilgrimDialogue, fantasyMinimalRuleset } from '@ai-rpg-engine/starter-fantasy';
```

## Documentación

- [El Umbral de la Capilla (Cap. 20)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/20-chapel-threshold/)
- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
