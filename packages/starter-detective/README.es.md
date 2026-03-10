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

# @ai-rpg-engine/starter-detective

**Gaslight Detective** — Un mundo de misterio victoriano para el motor de juegos de rol con IA.

## Instalación

```bash
npm install @ai-rpg-engine/starter-detective
```

## Lo que aprenderá

Este ejemplo demuestra toda la estructura del motor a través de un escenario de investigación:

| Características | Lo que muestra el "Detective" |
|---|---|
| **Rulesets** | `detectiveMinimalRuleset` — estadísticas (percepción/elocuencia/determinación), recursos (puntos de vida/compostura), verbos, fórmulas. |
| **Zones & traversal** | 5 zonas en 2 habitaciones, con adyacencia, niveles de luz, elementos interactivos y peligros. |
| **Districts** | La mansión Ashford (aristocrática) contra los muelles (facción de los estibadores). |
| **Dialogue** | Interrogatorio con múltiples opciones a la viuda, con recopilación de pruebas y efectos en variables globales. |
| **Combat** | Matón de los muelles con un perfil de IA agresivo y objetivos territoriales. |
| **Cognition & perception** | Decaimiento de la memoria, filtro de percepción, regla de presentación de paranoia del sospechoso. |
| **Progression** | Árbol de maestría de deducción de 3 nodos, con recompensas de experiencia al derrotar a las entidades. |
| **Environment** | Peligro en un callejón oscuro que reduce la compostura al entrar en la zona. |
| **Factions** | Facción de los estibadores con ajuste de cohesión. |
| **Belief provenance** | Propagación de rumores con retraso, seguimiento de la creencia. |
| **Inventory** | Amonia (restaura 6 puntos de compostura) con un efecto de uso programado. |
| **Simulation inspector** | Inspección completa preparada para el análisis de repeticiones. |

## Qué hay dentro

- **5 zonas** — El estudio (escena del crimen), Salón, Comedor de los sirvientes, Entrada principal, Callejón trasero.
- **3 PNJ** — Lady Ashford (viuda/sospechosa), Constable Pike (policía), Mrs. Calloway (sirvienta/testigo).
- **1 enemigo** — Matón de los muelles (IA agresiva, territorial).
- **1 objeto** — Amonia (restaura 6 puntos de compostura).
- **1 árbol de progresión** — Maestría de deducción (Ojo agudo → Lengua de plata → Nervios de acero).
- **1 regla de presentación** — Los sospechosos perciben la investigación como una amenaza.
- **15 módulos conectados** — movimiento, estado, combate, inventario, diálogo, cognición, percepción, progresión, entorno, facciones, rumores, distritos, creencia, presentación del observador, inspector.

## Uso

```typescript
import { createGame } from '@ai-rpg-engine/starter-detective';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, detectiveMinimalRuleset, deductionMasteryTree } from '@ai-rpg-engine/starter-detective';
```

## Documentación

- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
