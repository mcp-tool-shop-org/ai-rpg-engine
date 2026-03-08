<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPG Engine

Conjunto de herramientas nativo para simulación que permite crear, analizar y equilibrar mundos de RPG.

AI RPG Engine combina un entorno de ejecución de simulación determinista con un estudio de diseño asistido por IA, permitiendo a los autores construir mundos, probarlos mediante simulación y mejorarlos con base en evidencia en lugar de conjeturas.

> Las herramientas tradicionales te ayudan a escribir historias.
> AI RPG Engine te ayuda a **probar mundos**.

---

## Qué hace

```
build → critique → simulate → analyze → tune → experiment
```

Puedes generar contenido para mundos, evaluar diseños, ejecutar simulaciones deterministas, analizar el comportamiento de las repeticiones, ajustar mecánicas, realizar experimentos con múltiples semillas y comparar resultados. Cada resultado es reproducible, verificable y explicable.

---

## Funcionalidades principales

### Simulación determinista

Un motor de simulación basado en ciclos para mundos de RPG. Estado del mundo, sistema de eventos, capas de percepción y cognición, propagación de creencias de facciones, sistemas de rumores, métricas de distritos con derivación de ánimo, agencia de NPC con puntos de quiebre de lealtad y cadenas de consecuencias, compañeros con moral y riesgo de deserción, influencia del jugador y acción política, análisis de mapa estratégico, asesor de movimientos, reconocimiento de objetos y procedencia de equipamiento, hitos de crecimiento de reliquias, oportunidades emergentes (contratos, recompensas, favores, misiones de suministros, investigaciones) generadas a partir de las condiciones del mundo, detección de arcos de campaña (10 tipos de arco derivados del estado acumulado), detección de desencadenantes de final (8 clases de resolución) y renderizado de final determinista con epílogos estructurados. Registros de acciones reproducibles y generador de números aleatorios determinista. Cada ejecución puede ser reproducida exactamente.

### Creación de mundos asistida por IA

Capa de IA opcional que genera salas, facciones, misiones y distritos a partir de un tema. Evalúa diseños, normaliza errores de esquema, propone mejoras y guía flujos de trabajo de creación de mundos en múltiples pasos. La IA nunca modifica directamente el estado de la simulación; solo genera contenido o sugerencias.

### Flujos de trabajo de diseño guiados

Flujos de trabajo conscientes de la sesión y basados en la planificación para la creación de mundos, ciclos de evaluación, iteración de diseño, construcción guiada y planes de ajuste estructurados. Combina herramientas deterministas con asistencia de IA.

### Análisis de simulaciones

Análisis de repeticiones que explica por qué ocurrieron ciertos eventos, dónde fallan las mecánicas, qué desencadenantes no se activan y qué sistemas crean inestabilidad. Los hallazgos estructurados se integran directamente en el ajuste.

### Ajuste guiado

Los hallazgos del equilibrado generan planes de ajuste estructurados con correcciones propuestas, impacto esperado, estimaciones de confianza y vista previa de los cambios. Se aplican paso a paso con total trazabilidad.

### Experimentos de escenarios

Ejecuta lotes de simulaciones con diferentes semillas para comprender el comportamiento típico. Extrae métricas de escenarios, detecta variaciones, barre parámetros y compara mundos ajustados con mundos de referencia. Convierte el diseño de mundos en un proceso comprobable.

### Estudio Shell

Estudio de diseño en línea de comandos con paneles de proyectos, navegación de problemas, inspección de experimentos, historial de sesiones, incorporación guiada y descubrimiento de comandos contextual. Un espacio de trabajo para construir y probar mundos.

---

## Inicio rápido

```bash
# Instalar la CLI
npm install -g @ai-rpg-engine/cli

# Iniciar el estudio interactivo
ai chat

# Ejecutar la incorporación
/onboard

# Crear tu primer contenido
create-room haunted chapel

# Ejecutar una simulación
simulate

# Analizar los resultados
analyze-balance

# Ajustar el diseño
tune paranoia

# Ejecutar un experimento
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

Crea un mundo y mejóralo mediante la evidencia obtenida de la simulación.

---

## Arquitectura

El sistema tiene cuatro capas.

| Capa | Función |
|------|---------|
| **Simulation** | Motor determinista: estado del mundo, eventos, acciones, percepción, cognición, facciones, propagación de rumores, métricas de distritos, repetición |
| **Authoring** | Generación de contenido: andamiaje, evaluación, normalización, bucles de corrección, generadores de paquetes |
| **AI Cognition** | Asistencia de IA opcional: shell de chat, enrutamiento contextual, recuperación, formación de memoria, orquestación de herramientas |
| **Studio UX** | Entorno de diseño en línea de comandos: paneles, seguimiento de problemas, navegación de experimentos, historial de sesiones, flujos de trabajo guiados |

---

## Paquetes

| Paquete | Propósito |
|---------|-----------|
| [`@ai-rpg-engine/core`](packages/core) | Entorno de ejecución de simulación determinista: estado del mundo, eventos, RNG, ciclos, resolución de acciones |
| [`@ai-rpg-engine/modules`](packages/modules) | 29 módulos integrados: combate, percepción, cognición, facciones, rumores, distritos, agencia de NPC, compañeros, influencia del jugador, mapa estratégico, asesor de movimientos, reconocimiento de objetos, oportunidades emergentes, detección de arcos, desencadenantes de final |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas y validadores canónicos para el contenido del mundo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Estado de progresión del personaje, heridas, hitos, reputación |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selección de arquetipos, generación de builds, equipamiento inicial |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipamiento, procedencia de objetos, crecimiento de reliquias, crónicas de objetos |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria entre sesiones, efectos de relaciones, estado de campaña |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creación de contenido con IA opcional: andamiaje, evaluación, flujos de trabajo guiados, ajuste, experimentos |
| [`@ai-rpg-engine/cli`](packages/cli) | Estudio de diseño en línea de comandos: shell de chat, flujos de trabajo, herramientas de experimentación |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderizador de terminal y capa de entrada |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold: mundo inicial de fantasía |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox: mundo inicial cyberpunk |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective: mundo inicial de misterio victoriano |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem: mundo inicial de piratas |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead: mundo inicial de supervivencia zombi |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain: mundo inicial del Oeste sobrenatural |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss: mundo inicial de colonia de ciencia ficción |

---

## Documentación

| Recurso | Descripción |
|---------|-------------|
| [Handbook](docs/handbook/index.md) | 43 capítulos + 4 apéndices que cubren todos los sistemas |
| [Design Document](docs/DESIGN.md) | Análisis profundo de la arquitectura: canal de acciones, verdad vs. presentación, capas de simulación |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | Flujos de trabajo para crear prototipos, diagnosticar, ajustar y experimentar |
| [Philosophy](PHILOSOPHY.md) | Por qué mundos deterministas, diseño basado en evidencia e IA como asistente |
| [Changelog](CHANGELOG.md) | Historial de versiones |

---

## Filosofía

AI RPG Engine se basa en tres ideas:

1. **Mundos deterministas**: los resultados de la simulación deben ser reproducibles.
2. **Diseño basado en evidencia**: las mecánicas del mundo deben probarse mediante simulación.
3. **IA como asistente, no como autoridad**: las herramientas de IA ayudan a generar y evaluar diseños, pero no reemplazan los sistemas deterministas.

Consulta [PHILOSOPHY.md](PHILOSOPHY.md) para la explicación completa.

---

## Seguridad

AI RPG Engine es una **biblioteca de simulación exclusivamente local**. Sin telemetría, sin red, sin secretos. Los archivos de guardado se almacenan en `.ai-rpg-engine/` solo cuando se solicita explícitamente. Consulta [SECURITY.md](SECURITY.md) para más detalles.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licencia

[MIT](LICENSE)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
