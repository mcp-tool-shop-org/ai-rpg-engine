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

# @ai-rpg-engine/starter-pirate

**Black Flag Requiem** — Un mundo de inicio para aventuras piratas en alta mar, diseñado para el motor de juegos de rol con IA.

## Instalación

```bash
npm install @ai-rpg-engine/starter-pirate
```

## Lo que aprenderá

Este ejemplo de inicio demuestra toda la estructura del motor a través de una aventura pirata:

| Características | Lo que muestra el ejemplo del pirata: |
|---|---|
| **Rulesets** | `pirateMinimalRuleset` — estadísticas (fuerza/astucia/habilidad náutica), recursos (puntos de vida/moral), verbos, fórmulas. |
| **Zones & traversal** | 5 zonas en 3 áreas, con adyacencia, niveles de luz, elementos interactivos y peligros. |
| **Districts** | Puerto Haven (facción de la marina colonial) contra Aguas Malditas (mar peligroso). |
| **Dialogue** | Conversación con el cartógrafo con ramificaciones, un gancho de misión y efectos de bandera global. |
| **Combat** | Marinero de la Marina (agresivo) y Guardián Ahogado (bestia marina maldita). |
| **Cognition & perception** | Decaimiento de la memoria, filtro de percepción, regla de presentación del guardián maldito. |
| **Progression** | Árbol de habilidades de navegación de 3 nodos con recompensas de experiencia al derrotar a las entidades. |
| **Environment** | Oleaje que reduce la moral, presión de ahogamiento que inflige daño. |
| **Factions** | Facción de la Marina Colonial con gobernador y marineros. |
| **Belief provenance** | Propagación de rumores con retraso, seguimiento de la creencia. |
| **Inventory** | Barril de ron con un efecto de uso de objeto programado que restaura la moral. |
| **Simulation inspector** | Inspección completa para análisis de repeticiones. |

## Qué hay dentro

- **5 zonas:** Cubierta del barco, El Rusty Anchor (taberna), Fortaleza del Gobernador, Aguas Abiertas, Santuario Hundido.
- **3 PNJ:** Quartermaster Bly (tripulación), Mara la Cartógrafa (neutral), Gobernador Vane (autoridad colonial).
- **2 enemigos:** Marinero de la Marina (agresivo), Guardián Ahogado (bestia marina maldita).
- **1 objeto:** Barril de ron (restaura 8 puntos de moral).
- **1 árbol de progreso:** Navegación (Endurecido por el mar → Implacable → Capitán Temido).
- **1 regla de presentación:** Las criaturas malditas perciben a todos los visitantes como intrusos.
- **15 módulos conectados:** movimiento, estado, combate, inventario, diálogo, cognición, percepción, progreso, entorno, facciones, rumores, distritos, creencia, presentación del observador, inspector.

## Uso

```typescript
import { createGame } from '@ai-rpg-engine/starter-pirate';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, pirateMinimalRuleset, seamanshipTree } from '@ai-rpg-engine/starter-pirate';
```

## Documentación

- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
