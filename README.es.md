<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Motor de RPG con IA

Un conjunto de herramientas diseñado para la simulación, que permite crear, analizar y equilibrar mundos de RPG.

El motor de RPG con IA combina un entorno de simulación determinista con un estudio de diseño asistido por IA, lo que permite a los creadores construir mundos, probarlos mediante simulaciones y mejorarlos basándose en datos concretos en lugar de conjeturas.

> Las herramientas tradicionales te ayudan a escribir historias.
> El motor de RPG con IA te ayuda a **probar mundos**.

---

## ¿Qué hace?

```
build → critique → simulate → analyze → tune → experiment
```

Puedes generar contenido para el mundo, evaluar diseños, ejecutar simulaciones deterministas, analizar el comportamiento de las partidas, ajustar mecánicas, realizar experimentos con múltiples configuraciones y comparar resultados. Cada resultado es reproducible, verificable y explicable.

---

## Funcionalidades principales

### Simulación determinista

Un motor de simulación basado en ciclos para mundos de RPG. Incluye el estado del mundo, sistema de eventos, capas de percepción y cognición, propagación de creencias de facciones, sistemas de rumores, métricas de distritos, registros de acciones reproducibles y un generador de números aleatorios determinista. Cada ejecución puede ser reproducida exactamente.

### Creación de mundos asistida por IA

Una capa de IA opcional que genera salas, facciones, misiones y distritos a partir de un tema. Evalúa diseños, corrige errores de esquema, propone mejoras y guía los flujos de trabajo de creación de mundos. La IA nunca modifica directamente el estado de la simulación; solo genera contenido o sugerencias.

### Flujos de trabajo de diseño guiados

Flujos de trabajo conscientes de la sesión y basados en la planificación para la creación de mundos, ciclos de evaluación, iteración de diseño, construcción guiada y planes de ajuste estructurados. Combina herramientas deterministas con asistencia de IA.

### Análisis de simulaciones

Análisis de repeticiones que explica por qué ocurrieron ciertos eventos, dónde fallan las mecánicas, qué desencadenantes no se activan y qué sistemas crean inestabilidad. Los resultados estructurados se integran directamente en el ajuste.

### Ajuste guiado

Los resultados del análisis generan planes de ajuste estructurados con correcciones propuestas, impacto esperado, estimaciones de confianza y cambios previstos. Se aplican paso a paso con total trazabilidad.

### Experimentos de escenarios

Ejecuta lotes de simulaciones con diferentes configuraciones para comprender el comportamiento típico. Extrae métricas de escenarios, detecta variaciones, ajusta parámetros y compara mundos ajustados con mundos de referencia. Convierte el diseño de mundos en un proceso comprobable.

### Entorno de desarrollo

Entorno de desarrollo de línea de comandos con paneles de proyectos, navegación de problemas, inspección de experimentos, historial de sesiones, incorporación guiada y descubrimiento de comandos contextuales. Un espacio de trabajo para construir y probar mundos.

---

## Cómo empezar

```bash
# Install the CLI
npm install -g @ai-rpg-engine/cli

# Start the interactive studio
ai chat

# Run onboarding
/onboard

# Create your first content
create-room haunted chapel

# Run a simulation
simulate

# Analyze the results
analyze-balance

# Tune the design
tune paranoia

# Run an experiment
experiment run --runs 50
```

---

## Flujo de trabajo de ejemplo

```bash
ai chat

/onboard
create-location-pack haunted chapel district
critique-content
simulate
analyze-balance
tune rumor propagation
experiment run --runs 50
compare-replays
```

Crea un mundo y mejóralo a través de la evidencia obtenida de la simulación.

---

## Arquitectura

El sistema tiene cuatro capas.

| Capa | Función |
|-------|------|
| **Simulation** | Motor de simulación determinista: estado del mundo, eventos, acciones, percepción, cognición, facciones, propagación de rumores, métricas de distritos, reproducción |
| **Authoring** | Generación de contenido: creación de estructuras, evaluación, normalización, bucles de corrección, generadores de paquetes |
| **AI Cognition** | Asistencia de IA opcional: shell de chat, enrutamiento contextual, recuperación, formación de memoria, orquestación de herramientas |
| **Studio UX** | Entorno de desarrollo de línea de comandos: paneles, seguimiento de problemas, navegación de experimentos, historial de sesiones, flujos de trabajo guiados |

---

## Paquetes

| Paquete | Propósito |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Entorno de simulación determinista: estado del mundo, eventos, generador de números aleatorios, ciclos, resolución de acciones |
| [`@ai-rpg-engine/modules`](packages/modules) | 17 módulos integrados: combate, percepción, cognición, facciones, rumores, distritos |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas y validadores canónicos para el contenido del mundo |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creación de contenido con IA opcional: creación de estructuras, evaluación, flujos de trabajo guiados, ajuste, experimentos |
| [`@ai-rpg-engine/cli`](packages/cli) | Estudio de diseño de línea de comandos: shell de chat, flujos de trabajo, herramientas de experimentación. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motor de renderizado de terminal y capa de entrada. |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | El Umbral de Chapel: mundo inicial de fantasía. |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox: mundo inicial de ciencia ficción cyberpunk. |

---

## Documentación

| Recursos. | Descripción. |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 26 capítulos + 4 apéndices que cubren todos los sistemas. |
| [Design Document](docs/DESIGN.md) | Análisis profundo de la arquitectura: canal de acciones, verdad vs. presentación, capas de simulación. |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | Flujos de trabajo para crear prototipos, diagnosticar, ajustar y experimentar. |
| [Philosophy](PHILOSOPHY.md) | ¿Por qué mundos deterministas, diseño basado en evidencia y la IA como asistente? |
| [Changelog](CHANGELOG.md) | Historial de versiones. |

---

## Filosofía

El motor de RPG con IA se basa en tres ideas:

1. **Mundos deterministas:** los resultados de la simulación deben ser reproducibles.
2. **Diseño basado en evidencia:** la mecánica del mundo debe ser probada a través de la simulación.
3. **La IA como asistente, no como autoridad:** las herramientas de IA ayudan a generar y evaluar diseños, pero no reemplazan los sistemas deterministas.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para obtener una explicación completa.

---

## Seguridad

AI RPG Engine es una **biblioteca de simulación solo local**. No hay telemetría, ni red, ni secretos. Los archivos de guardado se guardan solo en la carpeta `.ai-rpg-engine/` cuando se solicita explícitamente. Consulte [SECURITY.md](SECURITY.md) para obtener más detalles.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licencia

[MIT](LICENSE)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
