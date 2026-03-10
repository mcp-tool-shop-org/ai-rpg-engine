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

Un motor de simulación basado en eventos para mundos de juegos de rol. Incluye el estado del mundo, un sistema de eventos, capas de percepción y cognición, propagación de creencias de facciones, sistemas de rumores, métricas de distritos con derivación del estado de ánimo, agencia de personajes no jugables (PNJ) con puntos de inflexión de lealtad y cadenas de consecuencias, compañeros con moral y riesgo de abandono, influencia del jugador y acciones políticas, análisis de mapas estratégicos, un asesor de movimiento, reconocimiento de objetos y trazabilidad de equipos, hitos de crecimiento de reliquias, oportunidades emergentes (contratos, recompensas, favores, misiones de suministro, investigaciones) generadas a partir de las condiciones del mundo, detección de arcos de campaña (10 tipos de arcos derivados del estado acumulado), detección de desencadenantes del final del juego (8 clases de resolución) y renderizado de un final determinista con epílogos estructurados. Registros de acciones reproducibles y un generador de números aleatorios determinista. Cada partida se puede reproducir exactamente.

### Creación de mundos asistida por IA

Una capa de IA opcional que genera salas, facciones, misiones y distritos a partir de un tema. Evalúa diseños, corrige errores de esquema, propone mejoras y guía los flujos de trabajo de creación de mundos. La IA nunca modifica directamente el estado de la simulación; solo genera contenido o sugerencias.

### Flujos de trabajo de diseño guiados

Flujos de trabajo conscientes de la sesión y basados en la planificación para la creación de mundos, ciclos de evaluación, iteración de diseño, construcción guiada y planes de ajuste estructurados. Combina herramientas deterministas con asistencia de IA.

### Habilidades y Poderes

Sistema de habilidades propio del género, con una cobertura de 10 tipos que abarcan diferentes géneros. Las habilidades tienen costos, pruebas de atributos, tiempos de reutilización y efectos de tipo (daño, curación, aplicación de estados, purificación). Los efectos de estado utilizan un vocabulario semántico de 11 etiquetas, con perfiles de resistencia/vulnerabilidad en las entidades. El sistema de selección de habilidades, que tiene en cuenta la inteligencia artificial, evalúa las opciones de ataque propio/área/objetivo único, teniendo en cuenta la resistencia y la valoración de la purificación. Las herramientas de auditoría de equilibrio y resumen de paquetes detectan valores atípicos durante la creación.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }, { resourceId: 'infection', amount: 5 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

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
| [`@ai-rpg-engine/modules`](packages/modules) | 29 módulos integrados: combate, percepción, cognición, facciones, rumores, distritos, agencia de PNJ, compañeros, influencia del jugador, mapa estratégico, asesor de movimiento, reconocimiento de objetos, oportunidades emergentes, detección de arcos, desencadenantes del final del juego. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas y validadores canónicos para el contenido del mundo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Estado de progresión del personaje, lesiones, hitos, reputación. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selección de arquetipos, generación de builds, equipo inicial. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipo, trazabilidad de objetos, crecimiento de reliquias, crónicas de objetos. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria entre sesiones, efectos de relaciones, estado de la campaña. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creación de contenido con IA opcional: creación de estructuras, evaluación, flujos de trabajo guiados, ajuste, experimentos |
| [`@ai-rpg-engine/cli`](packages/cli) | Estudio de diseño de línea de comandos: shell de chat, flujos de trabajo, herramientas de experimentación. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motor de renderizado de terminal y capa de entrada. |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | El Umbral de Chapel: mundo inicial de fantasía. |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox: mundo inicial de ciencia ficción cyberpunk. |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective: mundo inicial de misterio victoriano. |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem: mundo inicial de piratas. |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead: mundo inicial de supervivencia zombie. |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain: mundo inicial de oeste salvaje. |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss: mundo inicial de colonia de ciencia ficción. |

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
