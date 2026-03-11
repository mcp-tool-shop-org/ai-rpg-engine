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

Un conjunto de herramientas en TypeScript para crear simulaciones de juegos de rol (RPG) deterministas. Usted define las estadísticas, selecciona módulos, conecta los elementos de combate y crea contenido. El motor se encarga del estado, los eventos, el generador de números aleatorios (RNG), la resolución de acciones y la toma de decisiones de la inteligencia artificial. Cada ejecución es reproducible.

Esto es un **motor de composición**, no un juego terminado. Los 10 mundos iniciales son ejemplos: patrones que puede aprender y adaptar. Su juego utiliza el subconjunto del motor que necesite.

---

## ¿Qué es esto?

- Una **biblioteca de módulos** — más de 27 módulos que cubren combate, percepción, cognición, facciones, rumores, movimiento, compañeros y más.
- Un **conjunto de herramientas de composición** — `buildCombatStack()` conecta el combate en aproximadamente 7 líneas; `new Engine({ modules })` inicia el juego.
- Un **entorno de ejecución de simulación** — ciclos deterministas, registros de acciones reproducibles, RNG con semilla.
- Un **estudio de diseño de IA** (opcional) — estructura, análisis crítico, análisis de equilibrio, ajuste y experimentos a través de Ollama.

## ¿Qué no es esto?

- No es un juego jugable de inmediato: usted lo compone a partir de módulos y contenido.
- No es un motor visual: genera eventos estructurados, no píxeles.
- No es un generador de historias: simula mundos; la narrativa emerge de las mecánicas.

---

## Estado actual (v2.3.0)

**Lo que funciona y está probado:**
- Entorno de ejecución principal: estado del mundo, eventos, acciones, ciclos, reproducción: estable desde la versión 1.0.
- Sistema de combate: 5 acciones, 4 estados de combate, 4 estados de enfrentamiento, intercepción de compañeros, flujo de derrota, tácticas de IA: 1099 pruebas.
- Habilidades: costos, enfriamientos, comprobaciones de estadísticas, efectos tipados, vocabulario de estados, selección consciente de la IA.
- Capa de toma de decisiones unificada: la puntuación de combate y las habilidades se combinan en una sola llamada (`selectBestAction`).
- 10 mundos iniciales con enemigos con estadísticas diferenciadas e integración completa del combate.
- `buildCombatStack()` elimina aproximadamente 40 líneas de configuración del combate por mundo.
- Taxonomía de etiquetas y utilidades de validación para la creación de contenido.
- Validación de fases de jefe con seguimiento de etiquetas entre fases.

**Lo que es rudimentario o incompleto:**
- Las herramientas de creación de mundos de IA (capa de Ollama) funcionan, pero están menos probadas en comparación con la simulación.
- La interfaz de línea de comandos (CLI) del estudio es funcional, pero no está pulida.
- Solo 1 de los 10 mundos iniciales utiliza `buildCombatStack` (Weird West); los demás utilizan una conexión manual y detallada.
- Aún no hay un sistema de perfiles: los mundos son independientes y no se pueden componer a partir de perfiles compartidos.
- La documentación es extensa (57 capítulos), pero no todos los capítulos reflejan las últimas API.

---

## Cómo empezar

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, createTraversalCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [...combat.modules, createTraversalCore(), createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

Consulte la [Guía de composición](docs/handbook/57-composition-guide.md) para obtener el flujo de trabajo completo.

---

## Arquitectura

| Capa | Función |
|-------|------|
| **Core Runtime** | Motor determinista: estado del mundo, eventos, acciones, ciclos, RNG, reproducción. |
| **Modules** | Más de 27 sistemas componibles: combate, percepción, cognición, facciones, movimiento, compañeros, etc. |
| **Content** | Entidades, zonas, diálogo, objetos, habilidades, estados: creados por el autor. |
| **AI Studio** | Capa opcional de Ollama: estructura, análisis crítico, análisis de equilibrio, ajuste y experimentos. |

---

## Sistema de combate

Cinco acciones (ataque, guardia, desengancharse, prepararse, reposicionarse), cuatro estados de combate (en guardia, desequilibrado, expuesto, huyendo), cuatro estados de enfrentamiento (enfrentado, protegido, retaguardia, aislado). Tres dimensiones de estadísticas impulsan cada fórmula, por lo que un duelista rápido juega de manera diferente a un luchador pesado o un centinela experimentado.

Los oponentes de IA utilizan una puntuación de toma de decisiones unificada: las acciones de combate y las habilidades compiten en una sola evaluación, con umbrales configurables para evitar el spam de habilidades marginales.

Los autores de paquetes utilizan `buildCombatStack()` para conectar el combate a partir de un mapeo de estadísticas, un perfil de recursos y etiquetas de sesgo. Consulte la [Descripción general del combate](docs/handbook/49a-combat-overview.md) y la [Guía para autores de paquetes](docs/handbook/55-combat-pack-guide.md).

---

## Habilidades

Sistema de habilidades específico para cada género, con costes, comprobaciones de atributos, tiempos de reutilización y efectos de diferentes tipos (daño, curación, aplicación de estados, eliminación de estados). Los efectos de estado utilizan un vocabulario semántico con 11 etiquetas y perfiles de resistencia/vulnerabilidad. El sistema de inteligencia artificial evalúa opciones de ataque (área, individual) y de movimiento.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## Paquetes

| Paquete | Propósito |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Entorno de simulación determinista: estado del mundo, eventos, generador de números aleatorios, ciclos, resolución de acciones |
| [`@ai-rpg-engine/modules`](packages/modules) | Más de 27 módulos componibles: combate, percepción, cognición, facciones, rumores, navegación, compañeros, comportamiento de los personajes no jugables, mapa estratégico, reconocimiento de objetos, oportunidades emergentes, detección de arcos narrativos, desencadenantes del final del juego. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas y validadores canónicos para el contenido del mundo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Estado de progresión del personaje, lesiones, hitos, reputación. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selección de arquetipos, generación de builds, equipo inicial. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipo, origen de los objetos, crecimiento de los artefactos. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria entre sesiones, efectos de relaciones, estado de la campaña. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creación de contenido con IA opcional: creación de estructuras, evaluación, flujos de trabajo guiados, ajuste, experimentos |
| [`@ai-rpg-engine/cli`](packages/cli) | Estudio de diseño basado en línea de comandos. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motor de renderizado de terminal y capa de entrada. |

### Ejemplos iniciales

Los 10 mundos iniciales son **ejemplos de composición**: demuestran cómo combinar módulos del motor para crear juegos completos. Cada uno muestra diferentes patrones (mapeo de atributos, perfiles de recursos, configuraciones de interacción, conjuntos de habilidades). Consulta el archivo README de cada ejemplo inicial para ver "Patrones demostrados" y "Qué se puede adaptar".

| Ejemplo inicial | Género | Patrones clave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasía oscura | Combate mínimo, impulsado por el diálogo. |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Recursos, roles de interacción. |
| [`starter-detective`](packages/starter-detective) | Misterio victoriano | Prioridad a la interacción social, énfasis en la percepción. |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Combate naval y cuerpo a cuerpo, múltiples zonas. |
| [`starter-zombie`](packages/starter-zombie) | Supervivencia zombi | Escasez, recurso de infección. |
| [`starter-weird-west`](packages/starter-weird-west) | Oeste extraño | Referencia `buildCombatStack`, sesgos de los paquetes. |
| [`starter-colony`](packages/starter-colony) | Colonia espacial | Puntos de estrangulamiento, zonas de emboscada. |
| [`starter-ronin`](packages/starter-ronin) | Japón feudal | Pasajes ocultos, múltiples roles de protección. |
| [`starter-vampire`](packages/starter-vampire) | Horror de vampiros | Recurso de sangre, manipulación social. |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiador histórico | Combate en la arena, favor del público. |

---

## Documentación

| Recursos. | Descripción. |
|----------|-------------|
| [Composition Guide](docs/handbook/57-composition-guide.md) | Crea tu propio juego combinando módulos del motor: empieza aquí. |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | Seis pilares del combate, cinco acciones, estados a primera vista. |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | Construcción paso a paso de `buildCombatStack`, mapeo de atributos, perfiles de recursos. |
| [Handbook](docs/handbook/index.md) | 26 capítulos + 4 apéndices que cubren todos los sistemas. |
| [Composition Model](docs/composition-model.md) | Las 6 capas reutilizables y cómo se combinan. |
| [Examples](docs/examples/) | Ejemplos de TypeScript que se pueden ejecutar: grupo mixto, entre mundos, desde cero. |
| [Design Document](docs/DESIGN.md) | Análisis profundo de la arquitectura: flujo de acciones, verdad vs. presentación. |
| [Philosophy](PHILOSOPHY.md) | ¿Por qué mundos deterministas, diseño basado en evidencia y la IA como asistente? |
| [Changelog](CHANGELOG.md) | Historial de versiones. |

---

## Hoja de ruta

### Estado actual

El motor de simulación y el sistema de combate son sólidos: 2661 pruebas, 10 ejemplos de géneros, reproducción determinista, evaluación completa de las decisiones de la IA. El motor funciona como un conjunto de herramientas de composición: elige módulos, define atributos, conecta y crea contenido. La documentación cubre todos los sistemas, pero necesita una sincronización con la API para las últimas adiciones.

### Próximas semanas

- Migrar los 9 ejemplos iniciales restantes a `buildCombatStack` (el Oeste extraño es la referencia).
- Sincronización de la documentación de la API: `submitActionAs`, `selectBestAction`, `resourceCaps`, taxonomía de etiquetas.
- Mejorar la documentación de los ejemplos iniciales: aclaración de "Qué se puede adaptar" y guías de reutilización.
- Enlazar la documentación: README, guía de composición, ejemplos y manual.

### Objetivo: Perfiles personalizables

El objetivo final del motor son los **perfiles definidos por el usuario**: paquetes portátiles que se integran en cualquier juego. Un perfil empaqueta un mapeo de atributos, un comportamiento de recursos, etiquetas de sesgo de la IA, habilidades y ganchos de encuentro en una única unidad importable. Dos jugadores con diferentes perfiles pueden compartir un mundo, cada uno aportando su propio estilo de juego.

Los perfiles se basan en la composición (ya en funcionamiento) y en la capa de decisión unificada (lanzada en la versión 2.3.0). El trabajo restante consiste en definir el esquema del perfil, crear el cargador y validar las interacciones entre perfiles. Consulta [Hoja de ruta de los perfiles](docs/profile-roadmap.md) para obtener el plan completo.

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
