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

# @ai-rpg-engine/ollama

Estudio de diseño de IA para el motor de RPG de IA: estructura básica, revisión, flujos de trabajo guiados, ajuste, experimentos y experiencia de usuario del estudio.

Se conecta a una instancia local de [Ollama](https://ollama.ai). Nunca modifica directamente la simulación; toda la salida se dirige a la salida estándar (stdout) de forma predeterminada.

## Instalación

```bash
npm install @ai-rpg-engine/ollama
```

## ¿Qué hay dentro?

- **Estructura básica de contenido** — genera habitaciones, facciones, misiones, distritos, paquetes de ubicaciones, paquetes de encuentros a partir de un tema.
- **Revisión y corrección** — valida el contenido generado según los esquemas del motor, realiza correcciones automáticas en caso de error.
- **Interfaz de chat** — sesión de diseño interactiva con enrutamiento contextual, orquestación de herramientas y memoria.
- **Construcciones guiadas** — flujos de trabajo de construcción de mundos de varios pasos, conscientes del contexto de la sesión y basados en la planificación.
- **Análisis de simulación** — análisis de repeticiones con hallazgos estructurados sobre el equilibrio.
- **Ajuste guiado** — planes de ajuste estructurados basados en los hallazgos sobre el equilibrio, con ejecución paso a paso.
- **Experimentos de escenarios** — ejecuciones de simulación por lotes, detección de variaciones, barridos de parámetros, comparación antes/después.
- **Experiencia de usuario del estudio** — paneles de control, navegación de problemas, inspección de experimentos, historial de sesiones, descubrimiento de comandos, incorporación.

## Uso

```typescript
import { translateMarkdown, ChatEngine, createSession } from '@ai-rpg-engine/ollama';

// Start a design session
const session = createSession('haunted-chapel');

// Use the chat engine
const engine = new ChatEngine({ session });
const response = await engine.chat('scaffold a haunted chapel district');
```

## Documentación

- [Guía de construcción de mundos con IA](AI_WORLDBUILDING.md) — documentación completa del flujo de trabajo.
- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
