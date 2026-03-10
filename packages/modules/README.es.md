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

# @ai-rpg-engine/modules

17 módulos de simulación componibles para el motor de RPG de IA: combate, diálogo, cognición, percepción, facciones, y más.

## Instalación

```bash
npm install @ai-rpg-engine/modules
```

## Módulos

| Módulo | Descripción |
|--------|-------------|
| `combatCore` | Ataque/defensa, daño, derrota, resistencia, guardia, desenganchar. |
| `dialogueCore` | Árboles de diálogo basados en gráficos con condiciones. |
| `inventoryCore` | Objetos, equipo, usar/equipar/desequipar. |
| `traversalCore` | Movimiento y validación de salida de zonas. |
| `statusCore` | Efectos de estado con duración y acumulación. |
| `environmentCore` | Propiedades dinámicas de la zona, peligros, decadencia. |
| `cognitionCore` | Creencias, intenciones, moral y memoria de la IA. |
| `perceptionFilter` | Canales sensoriales, claridad, audición entre zonas. |
| `narrativeAuthority` | Verdad versus presentación, ocultamiento, distorsión. |
| `progressionCore` | Progresión basada en moneda, árboles de habilidades. |
| `factionCognition` | Creencias de la facción, confianza, conocimiento entre facciones. |
| `rumorPropagation` | Difusión de información con disminución de la confianza. |
| `knowledgeDecay` | Erosión de la confianza basada en el tiempo. |
| `districtCore` | Memoria espacial, métricas de la zona, umbrales de alerta. |
| `beliefProvenance` | Reconstrucción de rastros a través de la percepción/cognición/rumor. |
| `observerPresentation` | Filtrado de eventos por observador, seguimiento de divergencias. |
| `simulationInspector` | Inspección en tiempo de ejecución, comprobaciones de estado, diagnósticos. |
| `combatIntent` | Sesgos en la toma de decisiones de la IA, moral, lógica de huida. |
| `engagementCore` | Posicionamiento de primera/segunda línea, intercepción de guardaespaldas. |
| `combatRecovery` | Estados de heridas después del combate, curación en zonas seguras. |
| `combatReview` | Explicación de fórmulas, desglose de la probabilidad de impacto. |
| `defeatFallout` | Consecuencias de la facción después del combate, cambios de reputación. |
| `bossPhaseListener` | Transiciones de fase basadas en el umbral de HP del jefe. |

### Creación de combate (funciones puras)

| Exportación | Propósito |
|--------|---------|
| `combat-roles` | 8 plantillas de roles, tipos de composición de encuentros, clasificación de peligro, definiciones de jefes. |
| `encounter-library` | 5 fábricas de arquetipos de encuentros, 3 fábricas de plantillas de jefes, auditoría de paquetes. |
| `combat-summary` | Consultar, auditar, formatear e inspeccionar contenido de combate. |

## Uso

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { combatCore, dialogueCore, cognitionCore, perceptionFilter } from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: { /* ... */ },
  seed: 42,
  modules: [combatCore(), dialogueCore(), cognitionCore(), perceptionFilter()],
});
```

## Documentación

- [Módulos (Cap. 6)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/06-modules/)
- [Cognición de la IA (Cap. 8)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/08-ai-cognition/)
- [Percepción (Cap. 9)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/09-perception-layers/)
- [Sistema de combate (Cap. 47)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/47-combat-system/)
- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
