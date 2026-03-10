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

# @ai-rpg-engine/core

La base de AI RPG Engine: estado del mundo, entidades, acciones, eventos, reglas, generador de números aleatorios con semilla y persistencia.

## Instalación

```bash
npm install @ai-rpg-engine/core
```

## ¿Qué hay dentro?

- **Motor (Engine)**: bucle de simulación basado en "ticks" con reproducción determinista.
- **Estado del Mundo (WorldState)**: habitaciones, entidades, banderas globales, contador de "ticks".
- **Estado de la Entidad (EntityState)**: recursos, inventario, efectos de estado, creencias, recuerdos.
- **Canal de Acciones (Action Pipeline)**: validación → preprocesamiento → resolución → postprocesamiento → confirmación.
- **Bus de Eventos (Event Bus)**: eventos estructurados con tipo, origen, objetivos y carga útil.
- **Generador de Números Aleatorios con Semilla (Seeded RNG)**: aleatoriedad reproducible a partir de una única semilla.
- **Sistema de Módulos (Module System)**: registro y composición de módulos de simulación.
- **Entorno de Pruebas (Test Harness)**: herramientas para pruebas deterministas de módulos.

## Comienzo rápido

```typescript
import { Engine } from '@ai-rpg-engine/core';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game',
    version: '1.0.0', engineVersion: '1.0.0',
    ruleset: 'fantasy', modules: [],
    contentPacks: [],
  },
  seed: 42,
  modules: [],
});

const state = engine.getState();
```

## Documentación

- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/) — 25 capítulos + 4 apéndices
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Desarrollado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
