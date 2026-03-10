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

# @ai-rpg-engine/starter-zombie

**Ashfall Dead** — Un mundo de inicio para juegos de rol con IA, centrado en la supervivencia contra zombis.

## Instalación

```bash
npm install @ai-rpg-engine/starter-zombie
```

## Lo que aprenderá

Este programa de inicio demuestra toda la estructura del motor a través de un escenario de supervivencia:

| Características | Lo que muestra el zombi |
|---|---|
| **Rulesets** | `zombieMinimalRuleset` — estadísticas (aptitud/astucia/nervio), recursos (puntos de vida/resistencia/infección), verbos, fórmulas. |
| **Zones & traversal** | 5 zonas en 3 habitaciones, con adyacencia, niveles de luz, elementos interactivos y peligros. |
| **Districts** | El Refugio Seguro (facción de supervivientes) contra la Zona Muerta (hostil, no muerta). |
| **Dialogue** | Conversación ramificada con un médico, con una misión secundaria para conseguir suministros en el hospital. |
| **Combat** | Zombis "Arrastrándose" (lentos, resistentes) y "Corredores" (rápidos, frágiles) con IA agresiva. |
| **Cognition & perception** | Decaimiento de la memoria, filtro de percepción, regla de presentación del hambre de los zombis. |
| **Progression** | Árbol de supervivencia de 3 nodos con recompensas de experiencia al derrotar a las entidades. |
| **Environment** | Zombis errantes que consumen resistencia, zonas de riesgo de infección que aumentan la infección. |
| **Factions** | Facción de supervivientes con un médico, un carroñero y un líder militar. |
| **Belief provenance** | Propagación de rumores con retraso, seguimiento de la creencia. |
| **Inventory** | Antibióticos con un efecto de uso de objeto predefinido que reduce la infección. |
| **Simulation inspector** | Inspección completa para el análisis de repeticiones. |

## Qué hay dentro

- **5 zonas** — Vestíbulo del Refugio Seguro, Gasolinera Abandonada, Calle Invadida, Ala Este del Hospital, Azotea del Hospital.
- **3 PNJ** — Dra. Chen (médico), Rook (carroñero), Sargento Marsh (líder militar).
- **2 enemigos** — Zombi "Arrastrándose" (no muerto, lento y resistente), Zombi "Corredor" (no muerto, rápido y frágil).
- **1 objeto** — Antibióticos (reduce la infección en un 25%).
- **1 árbol de progresión** — Supervivencia (Chatarrero → Calmado → El Último en Pie).
- **1 regla de presentación** — Los zombis perciben a todos los seres vivos como presas.
- **15 módulos conectados** — movimiento, estado, combate, inventario, diálogo, cognición, percepción, progresión, entorno, facciones, rumores, distritos, creencia, presentación del observador, inspector.

## Uso

```typescript
import { createGame } from '@ai-rpg-engine/starter-zombie';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zombieMinimalRuleset, survivalTree } from '@ai-rpg-engine/starter-zombie';
```

## Documentación

- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
