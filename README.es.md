<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

<p align="center">A simulation-first terminal RPG engine for worlds shaped by perception, cognition, and consequence.</p>

---

## ¿Qué es?

AI RPG Engine es un motor de ejecución modular para crear juegos de rol de terminal, donde las acciones crean información, la información se distorsiona y las consecuencias surgen de lo que los personajes creen que sucedió.

El motor mantiene la verdad objetiva del mundo, al tiempo que admite narraciones poco fiables, diferencias de percepción entre los personajes y narrativas en capas. Es independiente del género; el mismo núcleo puede ejecutar fantasía oscura, cyberpunk o cualquier otro escenario a través de conjuntos de reglas configurables.

## Instalación

```bash
npm install @ai-rpg-engine/core @ai-rpg-engine/modules @ai-rpg-engine/content-schema
```

## Guía de inicio rápido

```typescript
import { Engine } from '@ai-rpg-engine/core';
import {
  combatCore, dialogueCore, inventoryCore, traversalCore,
  statusCore, environmentCore, cognitionCore, perceptionFilter,
} from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game', version: '1.0.0',
    engineVersion: '1.0.0', ruleset: 'fantasy',
    modules: ['combat-core', 'dialogue-core', 'cognition-core'],
    contentPacks: [],
  },
  seed: 42,
  modules: [
    combatCore(), dialogueCore(), inventoryCore(),
    traversalCore(), statusCore(), environmentCore(),
    cognitionCore(), perceptionFilter(),
  ],
});

// Submit an action
const events = engine.submitAction('attack', {
  targetIds: ['guard-01'],
});

// Every action produces structured events
for (const event of events) {
  console.log(event.type, event.payload);
}
```

## Arquitectura

```
Engine
  WorldStore      — entities, zones, quests, factions, RNG, event log
  ActionDispatcher — verb handlers, validators
  ModuleManager   — modules, formulas, rules, persistence
  Presentation    — channels that route (and can distort) events
```

Cada cambio de estado fluye a través de una única canalización:

```
action --> validation --> resolution --> events --> presentation
```

## Paquetes

| Paquete | Propósito |
|---------|---------|
| `@ai-rpg-engine/core` | Estado, entidades, acciones, eventos, reglas, generador de números aleatorios, persistencia. |
| `@ai-rpg-engine/modules` | 17 módulos de simulación integrados. |
| `@ai-rpg-engine/content-schema` | Esquemas y validadores de contenido. |
| `@ai-rpg-engine/terminal-ui` | Motor de renderizado de terminal y capa de entrada. |
| `@ai-rpg-engine/cli` | CLI para desarrolladores: ejecutar, reproducir, inspeccionar. |
| `@ai-rpg-engine/starter-fantasy` | The Chapel Threshold (demostración de fantasía). |
| `@ai-rpg-engine/starter-cyberpunk` | Neon Lockbox (demostración de cyberpunk). |

## Módulos integrados

| Módulo | ¿Qué hace? |
|--------|-------------|
| combat-core | Ataque/defensa, daño, derrota, resistencia. |
| dialogue-core | Árboles de diálogo basados en gráficos con condiciones. |
| inventory-core | Objetos, equipo, usar/equipar/desequipar. |
| traversal-core | Movimiento y validación de salida de zona. |
| status-core | Efectos de estado con duración y acumulación. |
| environment-core | Propiedades dinámicas de la zona, peligros, deterioro. |
| cognition-core | Creencias, intenciones, moral, memoria de la IA. |
| perception-filter | Canales sensoriales, claridad, audición entre zonas. |
| narrative-authority | Verdad versus presentación, ocultamiento, distorsión. |
| progression-core | Avance basado en moneda, árboles de habilidades. |
| faction-cognition | Creencias de la facción, confianza, conocimiento inter-facción. |
| rumor-propagation | Propagación de información con disminución de la confianza. |
| knowledge-decay | Erosión de la confianza basada en el tiempo. |
| district-core | Memoria espacial, métricas de la zona, umbrales de alerta. |
| belief-provenance | Reconstrucción de la procedencia a través de la percepción/cognición/rumor. |
| observer-presentation | Filtrado de eventos por observador, seguimiento de la divergencia. |
| simulation-inspector | Inspección en tiempo de ejecución, comprobaciones de estado, diagnósticos. |

## Decisiones clave de diseño

- **La verdad de la simulación es sagrada:** el motor mantiene el estado objetivo. Las capas de presentación pueden mentir, pero la verdad del mundo es canónica.
- **Las acciones crean eventos:** ningún cambio de estado significativo ocurre silenciosamente. Todo emite eventos estructurados y consultables.
- **Reproducción determinista:** el generador de números aleatorios con semilla y la canalización de acciones garantizan resultados idénticos a partir de entradas idénticas.
- **El contenido es datos:** las habitaciones, entidades, diálogos y objetos se definen como datos, no como código.
- **El género pertenece a los conjuntos de reglas:** el motor no tiene opinión sobre espadas frente a lásers.

## Seguridad y Confianza

AI RPG Engine es una **biblioteca de simulación solo local**.

- **Datos accedidos:** solo el estado del juego en memoria. Los archivos de guardado se escriben en la carpeta `.ai-rpg-engine/` cuando se utiliza el comando de guardado de la CLI.
- **Datos NO accedidos:** no hay acceso al sistema de archivos más allá de los archivos de guardado, no hay red, no hay variables de entorno, no hay recursos del sistema.
- **Sin telemetría.** No se recopilan ni se envían datos a ningún lugar.
- **Sin secretos.** El motor no lee, almacena ni transmite credenciales.

Consulte [SECURITY.md](SECURITY.md) para obtener la política de seguridad completa.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Documentación

- [Manual](docs/handbook/index.md) — 25 capítulos + 4 apéndices
- [Descripción general del diseño](docs/DESIGN.md) — análisis profundo de la arquitectura
- [Registro de cambios](CHANGELOG.md)

## Licencia

[MIT](LICENSE)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
