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

Un conjunto de herramientas TypeScript para crear simulaciones de RPG deterministas. Defines las estadísticas, eliges los módulos, configuras una secuencia de combate y creas el contenido. El motor gestiona el estado, los eventos, la generación de números aleatorios (RNG), la resolución de acciones y la toma de decisiones por parte de la IA. Cada ejecución es reproducible.

Este es un **motor de composición**, no un juego completo. Los 10 mundos iniciales son ejemplos: patrones que se pueden descomponer, aprender y reutilizar. Tu juego utiliza el subconjunto del motor que necesites.

---

## De qué se trata

- Una **biblioteca de módulos**: más de 30 módulos para el motor que cubren combate, percepción, cognición, facciones, rumores, movimiento, compañeros y más.
- Un **conjunto de herramientas de composición**: `buildCombatStack()` configura el combate en aproximadamente 7 líneas; `new Engine({ modules })` inicia el juego.
- Un **entorno de simulación**: ciclos deterministas, registros de acciones reproducibles, RNG con semilla.
- Un **estudio de diseño de IA** (opcional): andamiaje, evaluación crítica, análisis de equilibrio, ajuste y experimentos a través de Ollama.

## De qué no se trata

- No es un juego jugable listo para usar: lo compones a partir de módulos y contenido.
- No es un motor visual: genera eventos estructurados, no píxeles.
- No es un generador de historias: simula mundos; la narrativa surge de las mecánicas.

---

## Estado actual (v2.5.0)

**Lo que funciona y se ha probado:**
- Motor principal: estado del mundo, eventos, acciones, ciclos, reproducción: estable desde la v1.0; reproducción determinista con bytes idénticos (contador de ID por instancia, RNG con semilla).
- Sistema de combate: 5 acciones, 4 estados de combate, 4 estados de enfrentamiento, intercepción de compañeros, flujo de derrota, tácticas de IA.
- Habilidades: costos, tiempos de espera, comprobaciones de estadísticas, efectos tipados, vocabulario de estado de 11 etiquetas, selección consciente de la IA.
- **Combate en grupo (v2.4):** orientación a aliados (curar/potenciar/revivir), filtrado AoE de amigos/enemigos, selectores de objetivos: un curandero puede curar a un compañero; el AoE enemigo evita dañar a los aliados.
- **Efectos de estado (v2.4):** los modificadores pasivos de estadísticas afectan al combate, DoT/HoT deterministas basados en el contador de ciclos, desencadenantes reactivos con profundidad limitada (espinas/reflejo).
- **Perfiles complementarios: resolución de reglas por entidad (v2.5):** un luchador "poderoso" y un místico "voluntad" resuelven el combate en una sola pelea, cada uno leyendo las estadísticas a través de su propio mapeo. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` adjunta un perfil (mapeo de estadísticas, grupos de recursos, habilidades por entidad); `buildProfile()`, `validateProfileSet()` (se rechazan los ID duplicados), 10 plantillas derivadas iniciales y un comando CLI `profile`.
- Capa de decisión unificada: la puntuación del combate + las habilidades se combinan en una sola llamada (`selectBestAction`).
- Los 10 mundos iniciales utilizan `buildCombatStack()`: la base probada para la composición.
- API de configuración de cognición (`cognition: CognitionCoreConfig | false`) para el ajuste de la IA por mundo inicial.
- Taxonomía de etiquetas y utilidades de validación para la creación de contenido.
- `ai-rpg-engine create-starter <name>`: crea un nuevo juego; comandos de contenido `validate` + `scaffold`; carga paquetes desde JSON.
- Plantilla inicial publicada en npm (`@ai-rpg-engine/starter-template`).
- Conjunto completo de pruebas: **3613 pruebas en 193 archivos** (determinista en ejecuciones repetidas; cumplimiento del nivel de cobertura reforzado en CI).

**Lo que está incompleto o es provisional:**
- Las herramientas de creación de mundos con IA (capa de Ollama) se prueban menos que el núcleo de la simulación, aunque la v2.5 agregó un manejo estructurado de errores, un bucle de reintento configurable/observable y una puerta de enlace opcional `--validate` en el contenido generado.
- El modo multijugador (dos jugadores humanos compartiendo un mundo) **no** está implementado: es una capa de red, deliberadamente fuera del alcance; los perfiles actuales se dirigen a un solo controlador.
- La documentación es extensa, pero no todas las páginas del manual reflejan las API más recientes.

---

## Inicio rápido

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

Consulta la [Guía de composición](docs/handbook/57-composition-guide.md) para obtener el flujo de trabajo completo o crea un nuevo mundo inicial:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Arquitectura

| Capa | Función |
|-------|------|
| **Core Runtime** | Motor determinista: estado del mundo, eventos, acciones, ciclos, RNG, reproducción. |
| **Modules** | Más de 30 sistemas componibles: combate, percepción, cognición, facciones, movimiento, compañeros, etc. |
| **Content** | Entidades, zonas, diálogos, objetos, habilidades, estados: creados por el autor. |
| **AI Studio** | Capa opcional de Ollama: andamiaje, evaluación crítica, análisis de equilibrio, ajuste y experimentos. |

---

## Sistema de combate

Cinco acciones (ataque, guardia, desenganche, preparación, reposicionamiento), cuatro estados de combate (protegido, desequilibrado, expuesto, en fuga) y cuatro estados de enfrentamiento (enfrentado, protegido, línea trasera, aislado). Tres dimensiones de estadísticas impulsan cada fórmula, por lo que un duelista rápido juega de manera diferente a un luchador pesado o un centinela compuesto.

Los oponentes con IA utilizan una puntuación de decisión unificada: las acciones de combate y las habilidades compiten en una sola evaluación, con umbrales configurables para evitar el uso excesivo de habilidades marginales.

Los autores de paquetes utilizan `buildCombatStack()` para configurar el combate a partir de un mapeo de estadísticas, un perfil de recursos y etiquetas de sesgo. Consulta la [Descripción general del combate](docs/handbook/49a-combat-overview.md) y la [Guía del autor de paquetes](docs/handbook/55-combat-pack-guide.md).

---

## Habilidades

Sistema de habilidades nativo del género con costos, comprobaciones de estadísticas, tiempos de espera y efectos tipados (daño, curación, aplicación de estado, limpieza). Los efectos de estado utilizan un vocabulario semántico de 11 etiquetas con perfiles de resistencia/vulnerabilidad. La selección consciente de la IA puntúa las rutas auto/AoE/de objetivo único.

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
| [`@ai-rpg-engine/core`](packages/core) | Entorno de simulación determinista: estado del mundo, eventos, RNG, ciclos, resolución de acciones. |
| [`@ai-rpg-engine/modules`](packages/modules) | Más de 30 módulos componibles: combate, percepción, cognición, facciones, rumores, movimiento, compañeros, agencia NPC, mapa estratégico, reconocimiento de objetos, oportunidades emergentes, detección de arcos, desencadenantes del juego final. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas y validadores canónicos para el contenido del mundo. |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Evolución del personaje, lesiones, hitos, reputación. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selección de arquetipos, generación de la configuración inicial y equipo básico para empezar. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipos, origen de los objetos, evolución de las reliquias. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria entre sesiones, efectos de la relación, estado de la campaña. |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo de vida de los rumores, mecanismos de propagación y mutación, seguimiento de la difusión. |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Esquema del plan de narración, contratos para la producción de imágenes, perfiles de voces. |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Programación de señales de audio, priorización, atenuación automática, lógica de tiempo de espera. |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Se manifiestan los paquetes de sonido; registro con direccionamiento basado en el contenido. |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Inscripción de los participantes, evaluación mediante rúbrica, exploración del entorno. |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Almacenamiento basado en el contenido para retratos, iconos y archivos multimedia. |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generación de retratos sin rostro mediante el uso de proveedores modulares. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Opcionalmente, se puede utilizar la IA para ayudar en la creación de contenido: proporcionar estructuras básicas, realizar evaluaciones críticas, guiar el flujo de trabajo, optimizar y llevar a cabo pruebas. |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: ejecuta juegos, genera proyectos iniciales, examina archivos de guardado. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motor de renderizado terminal y capa de entrada. |

### Ejemplos de platos para empezar la comida

Los 10 mundos iniciales son **ejemplos de composición**: demuestran cómo combinar los módulos del motor para crear juegos completos. Cada uno muestra diferentes patrones (asignaciones de estadísticas, perfiles de recursos, configuraciones de interacción y conjuntos de habilidades). Consulte el archivo Léame de cada mundo inicial para ver los «Patrones demostrados» y lo que se puede utilizar como modelo.

| Entrante/Aperitivo | Género | Patrones clave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasía oscura | Combates mínimos, énfasis en los diálogos. |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Ciberpunk | Recursos, funciones de participación |
| [`starter-detective`](packages/starter-detective) | Misterio de la época victoriana | Prioridad en las redes sociales, gran importancia de la percepción. |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Combate naval y cuerpo a cuerpo, con múltiples zonas de enfrentamiento. |
| [`starter-zombie`](packages/starter-zombie) | Supervivencia ante una horda de zombis. | Escasez, recurso para combatir infecciones. |
| [`starter-weird-west`](packages/starter-weird-west) | Faroeste extraño | Eliminar sesgos en el empaquetado, garantizar una recuperación segura de los datos. |
| [`starter-colony`](packages/starter-colony) | Colonia de ciencia ficción | Puntos de estrangulamiento, zonas de emboscada. |
| [`starter-ronin`](packages/starter-ronin) | Japón feudal | Pasajes ocultos, múltiples funciones de protección. |
| [`starter-vampire`](packages/starter-vampire) | Terror vampírico | Recursos sanguíneos, manipulación social |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiador de la época antigua. | Combate en la arena, apoyo del público. |

---

## Documentación

| Recurso | Descripción |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crea la estructura básica de un nuevo juego: utiliza una herramienta de línea de comandos o crea una plantilla manualmente. |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Crea tu propio juego combinando diferentes módulos del motor de juego. |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | Seis pilares de combate, cinco acciones, información general sobre el estado. |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | Instrucciones paso a paso para crear la pila de combate, asignar atributos y definir los perfiles de recursos. |
| [Handbook](docs/handbook/index.md) | Manual completo que abarca todos los sistemas, además de 4 apéndices. |
| [Composition Model](docs/composition-model.md) | Las seis capas reutilizables y cómo se combinan entre sí. |
| [Examples](docs/examples/) | Ejemplos prácticos de TypeScript (con verificación de tipos y pruebas de comportamiento en el entorno de integración continua): gestión de entidades mixtas, perfiles compartidos, interacción entre diferentes entornos, creación desde cero. |
| [Design Document](docs/DESIGN.md) | Análisis exhaustivo de la arquitectura: flujo de trabajo y diferencia entre la realidad técnica y la presentación. |
| [Philosophy](PHILOSOPHY.md) | Mundos deterministas, diseño basado en pruebas, la IA como asistente. |
| [Changelog](CHANGELOG.md) | Historial de lanzamientos. |

---

## Hoja de ruta

### Dónde estamos ahora

El tiempo de ejecución de la simulación, la estructura de composición del combate y el flujo inicial de creación están completos: se han realizado 3613 pruebas en 193 archivos, los 10 personajes iniciales en `buildCombatStack`, reproducción determinista con resultados idénticos a nivel de bytes, evaluación completa de las decisiones de la IA y un comando de estructura para la interfaz de línea de comandos. **La versión 2.5 ofrece la resolución de reglas por entidad: la característica estrella son los perfiles de complementos: un guerrero con gran `poder` y un místico con gran `voluntad` resuelven el combate en una sola pelea, cada uno accediendo a las estadísticas a través de su propio mapeo.**

**Versión más reciente (v2.3.3–v2.5.0):**
- v2.3.3–v2.3.7: prueba del artefacto para el usuario final, mejora de la seguridad del conjunto de combate, los 10 personajes iniciales en `buildCombatStack`, plantilla inicial publicada, herramienta de línea de comandos `create-starter`.
- v2.4.0: combate grupal (ataque a aliados/curación/mejora/revivir, área de efecto amigo/enemigo), sistema de efectos de estado (modificadores + daño/curación por turno + activaciones reactivas), fase 1 de los perfiles como complemento, herramientas de línea de comandos `validate`/`scaffold` para el contenido.
- **v2.5.0: resolución de reglas por entidad (combate con estilos de juego mixtos), la herramienta `applyProfile` y las habilidades por entidad, plantillas de perfil + herramienta de línea de comandos `profile`, y una revisión completa de la salud (corrección para garantizar la reproducción idéntica en bytes, mejora de la precisión, implementación de controles de calidad)**

### Siguiente

- Modo multijugador: dos jugadores *humanos* comparten un mismo mundo (la capa de red se implementará más adelante; hoy se lanzan los perfiles compartidos para un solo mando, como en [`shared-profiles.ts`](docs/examples/shared-profiles.ts)).
- Posibilidad de modificar fórmulas serializables: ajuste de fórmulas por perfil (pendiente de la implementación de un lenguaje específico de dominio para fórmulas; actualmente, los perfiles contienen asignaciones de estadísticas, no funciones anónimas).
- Sincronización de la documentación de la API: asegurarse de que cada página del manual refleje las API de la versión 2.5.

### Destino: Perfiles de complementos

El objetivo final del motor es ofrecer **perfiles definidos por el usuario**, que son paquetes portátiles que se pueden integrar en cualquier juego. Un perfil incluye una configuración de estadísticas, un comportamiento de los recursos, etiquetas de sesgo para la IA y habilidades, todo ello empaquetado en una única unidad importable. A partir de la versión 2.5, cada entidad en un mundo puede tener su propio perfil y resolver el combate individualmente; por ejemplo, un guerrero con alta puntuación en «fuerza» y un místico con alta puntuación en «voluntad» pueden formar parte del mismo grupo, cada uno aportando su propio estilo de juego.

El esquema, el cargador `applyProfile`, la resolución de capacidades por entidad y la validación entre perfiles ya están implementados. Lo que queda por hacer es la función multijugador, que permitirá a dos jugadores *humanos* (y no solo a dos entidades) compartir un mundo; esto implica una capa de red. Consulte [Hoja de ruta del perfil](docs/profile-roadmap.md) y [Arquitectura de funciones](docs/feature-architecture.md) para conocer el diseño.

---

## Filosofía

El motor de juegos de rol con inteligencia artificial se basa en tres conceptos fundamentales:

1. **Mundos deterministas**: los resultados de la simulación deben ser reproducibles.
2. **Diseño basado en pruebas**: la mecánica del mundo debe probarse mediante simulaciones.
3. **La IA como asistente, no como autoridad**: las herramientas de IA ayudan a generar y evaluar diseños, pero no reemplazan los sistemas deterministas.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para obtener la explicación completa.

---

## Seguridad

El motor principal es una **biblioteca de simulación puramente local**: no hay telemetría, ni red, ni secretos. Los archivos guardados se almacenan en `.ai-rpg-engine/` solo cuando se solicita explícitamente. La capa de IA **opcional** (`@ai-rpg-engine/ollama`) se comunica con un daemon de Ollama **local**: su función `webfetch` (para RAG), que se activa opcionalmente, es la única vía de comunicación con el exterior y está restringida por una protección contra SSRF (bloquea las direcciones de bucle invertido/enlace local/CGNAT/metadatos en la nube y sus equivalentes IPv6 túnel) — nunca se accede a ella a menos que se invoque. Consulte [SECURITY.md](SECURITY.md) para obtener más detalles.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licencia

[MIT](LICENSE)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
