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

Un conjunto de herramientas TypeScript para crear simulaciones de RPG deterministas. Defines las estadísticas, seleccionas los módulos, configuras una secuencia de combate y creas contenido. El motor gestiona el estado, los eventos, la generación de números aleatorios (RNG), la resolución de acciones y la toma de decisiones por parte de la IA. Cada ejecución es reproducible.

Este es un **motor de composición**, no un juego completo. Los 10 mundos iniciales son ejemplos: patrones que se pueden descomponer, aprender y reutilizar. Tu juego utiliza el subconjunto del motor que necesites.

---

## De qué se trata

- Una **biblioteca de módulos**: más de 30 módulos para el motor que cubren combate, percepción, cognición, facciones, rumores, desplazamiento, compañeros y más.
- Un **conjunto de herramientas de composición**: `buildCombatStack()` configura el combate en aproximadamente 7 líneas; `new Engine({ modules })` inicia el juego.
- Un **entorno de simulación**: ciclos deterministas, registros de acciones reproducibles, RNG con semilla.
- Un **estudio de diseño de IA** (opcional): estructura básica, evaluación crítica, análisis de equilibrio, ajuste y experimentos a través de Ollama.

## De qué no se trata

- No es un juego completo: incluye 10 mundos iniciales jugables que puedes `ejecutar` hoy como ejemplos, y el motor es el conjunto de herramientas con el que creas *tu propio* juego.
- No es un motor visual: genera eventos estructurados, no píxeles.
- No es un generador de historias: simula mundos; la narrativa surge de las mecánicas.

---

## Estado actual (v2.7.0)

**Qué funciona y ha sido probado:**
- Motor principal: estado del mundo, eventos, acciones, ciclos de juego, repetición — estable desde la v1.0; repetición determinista con bytes idénticos (contador de ID por instancia, RNG con semilla)
- Sistema de combate: 5 acciones, 4 estados de combate, 4 estados de enfrentamiento, interceptación de compañeros, flujo de derrota, tácticas de IA
- Habilidades: costos, tiempos de espera, comprobaciones de estadísticas, efectos tipificados, vocabulario de estado de 11 etiquetas, selección consciente de la IA
- **Combate en grupo (v2.4):** apuntar a aliados (curación/mejora/revivir), filtrado AoE de amigos/enemigos, selectores de objetivos — un curandero puede curar a un compañero; el AoE enemigo no afecta a los aliados
- **Efectos de estado (v2.4):** los modificadores pasivos de estadísticas afectan al combate, DoT/HoT determinista basado en el contador de ciclos, desencadenantes reactivos con profundidad limitada (espinas/reflejo)
- **Perfiles de complemento — resolución de reglas por entidad (v2.5):** un luchador `poderoso` y un místico `voluntarioso` resuelven el combate en una sola pelea, cada uno leyendo las estadísticas a través de su propio mapeo. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` adjunta un perfil (mapeo de estadísticas, grupos de recursos, habilidades por entidad); `buildProfile()`, `validateProfileSet()` (se rechazan los ID duplicados), 10 plantillas derivadas iniciales y un comando CLI `profile`
- **Bucle de juego `run` (v2.6):** el juego final es real, no una demostración — los enemigos actúan según sus propios perfiles de intención de IA (`agresivo`/`cauteloso`/`territorial`/`calculador`), una pelea termina en victoria o derrota, puedes guardar y reanudar, y las habilidades y la experiencia están en el menú de acciones. `run <path>` carga un juego que has creado. Interfaz de usuario final compuesta con un HUD fácil de consultar y colores accesibles (respeta `NO_COLOR` / no TTY)
- **El estudio de diseño de IA se ofrece como su propio comando `ai` (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — crea, critica y equilibra el contenido con un modelo Ollama local
- Capa de decisión unificada: combate + puntuación de habilidades combinadas en una sola llamada (`selectBestAction`)
- Los 10 mundos iniciales utilizan `buildCombatStack()` — la estructura probada
- API de configuración de cognición (`cognition: CognitionCoreConfig | false`) para ajustar la IA por mundo inicial
- Taxonomía de etiquetas y utilidades de validación para la creación de contenido
- **El mundo reacciona (v2.7):** las muertes acumulan calor y erosionan la seguridad del distrito; un ciclo mundial por ronda genera presiones ocultas que surgen como rumores ("Los susurros te alcanzan..."), se intensifican y desaparecen con consecuencias; las ~30 composiciones de encuentros creadas se activan al entrar en la zona en los 10 mundos iniciales — determinista por semilla, los distritos más sangrientos generan más, las piezas clave del jefe están protegidas
- **Una razón para volver (v2.7):** un bucle de misión mínimo en el esquema que se ha estado utilizando durante mucho tiempo — las misiones ofrecen desencadenantes, rastrean objetivos de muerte/alcance/progreso y pagan experiencia y objetos exactamente una vez; cuatro misiones creadas, una pantalla de **Diario**, momentos de la misión en la narración del ciclo
- **El equipo afecta al combate (v2.7):** `equip`/`unequip` mueve números reales a través de la capa de estado que las fórmulas de combate ya leen — no hay cambios en el código de combate; el tridente y la red del gladiador están conectados de extremo a extremo con una diferencia de probabilidad de golpe probada
- **Ejecuciones con semilla (v2.7):** cada sesión nueva imprime su semilla con el comando exacto para repetir; `--seed <n>` reproduce una sesión byte por byte; el combate, la resistencia, las habilidades y los roles tácticos consumen todos la semilla del mundo — y los finales leen la ejecución que realmente jugaste (calor en vivo, presiones, acumulaciones de facciones, nivel del jugador)
- **`buildWorldStack()` (v2.7):** la estructura de composición estratégica junto a `buildCombatStack()` — una sola llamada ensambla el entorno, las facciones, los rumores, los distritos, las consecuencias de la derrota, los encuentros y las misiones; además, la pantalla de estrategia del **Director's Ledger**, un inspector de simulación con `AI_RPG_DEBUG=1`, `inspect-save` restringido por las mismas autoridades que Continuar y una unión de migración de módulos guardados en la ruta de restauración utilizada
- `ai-rpg-engine create-starter <name>` — crea un nuevo juego (independiente, se ejecuta fuera del monorepositorio); comandos `validate` + `scaffold` para el contenido; carga paquetes desde JSON
- Plantilla inicial publicada en npm (`@ai-rpg-engine/starter-template`)
- Suite de pruebas completa: **4797 pruebas** (determinista en ejecuciones repetidas; los archivos de prueba se verifican por tipo en CI; la cobertura se refuerza)

**Qué es rudimentario o incompleto:**
- El estudio de creación de mundos con IA (capa Ollama) está menos probado que el núcleo de simulación y necesita un demonio Ollama local; es completamente opcional — el motor y el bucle `run` no necesitan red
- La pila de narración/audio crea comandos de audio deterministas, pero **no hay ningún backend de audio para la terminal** — nada reproduce un sonido; los comandos son un punto de integración para un incrustador GUI/web
- El multijugador (dos jugadores humanos compartiendo un mundo) **no** está implementado — es una capa de red, deliberadamente fuera del alcance; los perfiles hoy en día se dirigen a un solo controlador
- `replay --replay` restaura la partida guardada en lugar de volver a simularla: la re-simulación no funciona correctamente con los módulos de estado del mundo (los ciclos del mundo y los encuentros evolucionan fuera del registro de acciones); la paridad es el trabajo de v2.8
- Las misiones se envían primero en los mundos de fantasía y zombis, y el bucle de equipamiento está conectado primero en el gladiador — la maquinaria es a nivel de motor; el despliegue de contenido es deliberado
- La documentación es extensa, pero no todas las páginas del manual reflejan las API más recientes

---

## Cómo se ve

La interfaz de usuario terminal incluida compone cada turno en secciones etiquetadas: escena, estado, registro y acciones, con una interfaz HUD fácil de consultar. El resultado es texto sin formato por defecto y agrega color semántico en un TTY (daño rojo, curaciones verdes, rechazos amarillos), respetando `NO_COLOR` y las tuberías no TTY; cada indicación se incluye también en el texto, nunca solo en el color.

```text
── The Crypt Gate ──────────────────────────────────────────
  [dark, unhallowed]

  ! Crypt Warden · HP 6/14 · Off Balance
  ! Bone Thrall · defeated
  + Mira · HP 11/16

  * rusted portcullis winch

  Exits: Ossuary, Churchyard

── Status ──────────────────────────────────────────────────
  HP 9/20 [#####-----]  Stamina 4/10
  Status: Guarded
  Items: healing-draught, grave-key

── Log ─────────────────────────────────────────────────────
  > Ash takes a guarded stance.
  > Hit!  4 damage dealt (HP: 6)
  > Bone Thrall defeated!
  > You can't do that: not enough stamina

── Actions ─────────────────────────────────────────────────
  [ 1] Move to Ossuary      [ 3] Attack Crypt Warden
  [ 2] Move to Churchyard   [ 4] Inspect Crypt Warden
────────────────────────────────────────────────────────────
```

---

## Instalación y juego

Juega un mundo inicial o estructura básica tu propio juego desde la terminal:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

El bucle `run` es una sesión de juego por turnos real: los enemigos actúan según sus propios perfiles de IA, las habilidades y la experiencia están en el menú, puedes guardar y reanudar, y una pelea termina en victoria o derrota. Cada juego es determinista y se puede reproducir.

Opcionalmente, el estudio de diseño de IA se instala como su propio comando:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

El estudio se comunica con un daemon [Ollama](https://ollama.com) local: primero ejecuta `ollama serve` y `ollama pull qwen2.5-coder`. Es totalmente opcional; el motor y el bucle `run` no necesitan conexión a la red.

Se publica una imagen de contenedor en GHCR como `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` para CI y ejecuciones aisladas.

---

## Inicio rápido

¿Prefieres crear tu propio juego en código? Compón el motor a partir de módulos:

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

Consulte la [Guía de composición](site/src/content/docs/handbook/57-composition-guide.md) para conocer el flujo de trabajo completo, o cree un nuevo proyecto base:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Arquitectura

| Capa | Rol |
|-------|------|
| **Core Runtime** | Motor determinista: estado del mundo, eventos, acciones, ciclos, RNG, repetición |
| **Modules** | Más de 30 sistemas componibles: combate, percepción, cognición, facciones, desplazamiento, compañeros, etc. |
| **Content** | Entidades, zonas, diálogos, objetos, habilidades, estados: creados por el autor |
| **AI Studio** | Capa opcional de Ollama: creación de proyectos base, evaluación crítica, análisis de equilibrio, ajuste, experimentos |

---

## Sistema de combate

Cinco acciones (ataque, guardia, desenganche, preparación, reposicionamiento), cuatro estados de combate (protegido, desequilibrado, expuesto, en fuga), cuatro estados de enfrentamiento (enfrentado, protegido, línea trasera, aislado). Tres dimensiones estadísticas impulsan cada fórmula, por lo que un duelista rápido juega de manera diferente a un luchador pesado o un centinela sereno.

Los oponentes con IA utilizan una puntuación de decisión unificada: las acciones y habilidades de combate compiten en una única evaluación, con umbrales configurables para evitar el uso excesivo de habilidades marginales.

Los creadores de paquetes utilizan `buildCombatStack()` para configurar el combate a partir de un mapeo de estadísticas, un perfil de recursos y etiquetas de sesgo. Consulte la [Descripción general del combate](site/src/content/docs/handbook/49a-combat-overview.md) y la [Guía para creadores de paquetes](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Habilidades

Sistema de habilidades nativo del género, con costos, comprobaciones de estadísticas, tiempos de espera y efectos tipificados (daño, curación, aplicación de estado, limpieza). Los efectos de estado utilizan un vocabulario semántico de 11 etiquetas con perfiles de resistencia/vulnerabilidad. Las puntuaciones de selección conscientes de la IA eligen rutas para sí mismo/área de efecto/objetivo único.

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
| [`@ai-rpg-engine/core`](packages/core) | Entorno de ejecución de simulación determinista: estado del mundo, eventos, RNG, ciclos, resolución de acciones |
| [`@ai-rpg-engine/modules`](packages/modules) | Más de 30 módulos componibles: combate, percepción, cognición, facciones, rumores, desplazamiento, compañeros, agencia PNJ, mapa estratégico, reconocimiento de objetos, oportunidades emergentes, detección de arcos narrativos, desencadenantes del final del juego |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas y validadores canónicos para el contenido del mundo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progresión del personaje, lesiones, hitos, reputación |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selección de arquetipo, generación de construcción, equipo inicial |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipo, procedencia de los objetos, crecimiento de las reliquias |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria entre sesiones, efectos de relación, estado de la campaña |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo de vida del rumor, mecánica de mutación, seguimiento de la propagación |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Esquema del plan narrativo, contratos de renderizado, perfiles de voz |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Programación de señales, prioridad, atenuación, lógica de tiempo de espera |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifiestos de paquetes de sonido, registro direccionable por contenido |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registro de paquetes, puntuación rubrica, descubrimiento de paquetes |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Almacenamiento direccionado por contenido para retratos, iconos, medios |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generación de retratos sin interfaz con proveedores conectables |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Autoría opcional con IA: creación de proyectos base, evaluación crítica, flujos de trabajo guiados, ajuste, experimentos |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: ejecutar juegos, crear proyectos base, inspeccionar guardados |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motor de renderizado terminal y capa de entrada |

### Ejemplos iniciales

Los 10 mundos iniciales son **ejemplos de composición**: demuestran cómo combinar los módulos del motor en juegos completos. Cada uno muestra diferentes patrones (mapeos de estadísticas, perfiles de recursos, configuraciones de enfrentamiento, conjuntos de habilidades). Consulte el archivo README de cada proyecto base para ver "Patrones demostrados" y "Qué tomar prestado".

| Proyecto base | Género | Patrones clave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasía oscura | Combate mínimo, impulsado por el diálogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Ciberpunk | Recursos, roles de enfrentamiento |
| [`starter-detective`](packages/starter-detective) | Misterio victoriano | Prioriza la interacción social, con gran énfasis en la percepción |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Naval + cuerpo a cuerpo, multizona |
| [`starter-zombie`](packages/starter-zombie) | Supervivencia zombi | Escasez, recurso de infección |
| [`starter-weird-west`](packages/starter-weird-west) | Oeste extraño | Sesgos del paquete, recuperación de zona segura |
| [`starter-colony`](packages/starter-colony) | Colonia de ciencia ficción | Cuellos de botella, zonas de emboscada |
| [`starter-ronin`](packages/starter-ronin) | Japón feudal | Pasajes ocultos, múltiples roles de protector |
| [`starter-vampire`](packages/starter-vampire) | Horror vampírico | Recurso de sangre, manipulación social |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiador histórico | Combate en la arena, favor del público |

---

## Documentación

| Recurso | Descripción |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crear un nuevo juego: ruta CLI o plantilla manual |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Cree su propio juego componiendo los módulos del motor |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Resolución de reglas por entidad: combate de estilo mixto, `applyProfile`, plantillas de perfil, la herramienta CLI `profile` |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Seis pilares del combate, cinco acciones, estados de un vistazo |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Construcción paso a paso de `buildCombatStack`, mapeo de estadísticas, perfiles de recursos |
| [Handbook](site/src/content/docs/handbook/index.md) | Manual completo: todos los sistemas, más 4 apéndices |
| [Composition Model](docs/composition-model.md) | Las 6 capas reutilizables y cómo se componen |
| [Examples](docs/examples/) | Ejemplos ejecutables en TypeScript (con verificación de tipos y pruebas de comportamiento en CI): grupo mixto por entidad, perfiles compartidos, entre mundos, desde cero |
| [Design Document](docs/DESIGN.md) | Análisis profundo de la arquitectura: canalización de acciones, verdad frente a presentación |
| [Philosophy](PHILOSOPHY.md) | Mundos deterministas, diseño basado en evidencia, IA como asistente |
| [Changelog](CHANGELOG.md) | Historial de lanzamientos |

---

## Hoja de ruta

### Dónde estamos ahora

Ambas estructuras de composición están completas — 4797 pruebas en 259 archivos, los 10 mundos iniciales en `buildCombatStack` **y** `buildWorldStack`, repetición determinista con bytes idénticos bajo semillas impresas, puntuación completa de la decisión de la IA y una CLI que crea, ejecuta, valida e inspecciona. **v2.7 activa el nivel estratégico: el mundo reacciona a cómo juegas (calor, presiones, encuentros), las misiones le dan un hilo conductor a la ejecución, el equipo cambia números reales y cada sesión se puede repetir desde la semilla que imprime.**

**Versión más reciente (v2.4.0–v2.7.0):**
*   v2.4.0: combate en grupo (ataque a aliados/curación/mejora/revivir, área de efecto amigo-enemigo), sistema de efectos de estado (modificadores + daño/curación por turno + desencadenantes reactivos), fase 1 de los perfiles de complementos y comandos CLI `validate`/`scaffold`.
*   v2.5.0: resolución de reglas por entidad (combate con estilos de juego mixtos), el cargador `applyProfile` + habilidades por entidad, plantillas de perfil + comando CLI `profile` y una revisión completa de la salud.
*   v2.6.0: el comando `run` se convirtió en un juego real: los enemigos actúan según sus propios perfiles de IA, victoria/derrota, guardar/continuar, habilidades y experiencia en el menú, el archivo `ai` del estudio y la pila de narración.
*   **v2.7.0: el mundo reacciona y hay una razón para volver: calor → presiones → consecuencias narradas, encuentros al entrar en la zona, un ciclo de misiones + diario, equipo en combate, ejecuciones repetibles programadas, entradas dinámicas del juego final, `buildWorldStack`, el libro del director y una transición de guardado.**

### Próxima versión (la base v2.8)

*   Nivel económico: economías de distritos en vivo, una superficie comercial con precios determinados por `computeItemValue`, ciclos de creación/reciclaje (los módulos se envían hoy; la configuración es lo siguiente).
*   Compañeros y verbos sociales: mecánica de reclutamiento/grupo y la capa de estilo de juego de soborno/intimidación/difusión de rumores sobre el sistema de influencia.
*   `--replay`: paridad de re-simulación con los módulos del estado del mundo, y las superficies restantes del formateador del director.
*   Multijugador: dos jugadores *humanos* que comparten un mundo (una capa de red, deliberadamente pospuesta; los perfiles compartidos de un solo controlador se envían hoy como [`shared-profiles.ts`](docs/examples/shared-profiles.ts)).
*   Anulaciones de fórmulas serializables: ajuste de fórmulas por perfil (bloqueado en un DSL de fórmulas; los perfiles contienen asignaciones de estadísticas hoy, no funciones anónimas).
*   Sincronización de la documentación de la API: asegurarse de que cada página del manual refleje las API de v2.7.

### Destino: Perfiles de complementos

El objetivo final del motor es **perfiles definidos por el usuario**: paquetes portátiles que se integran en cualquier juego. Un perfil incluye un mapeo de estadísticas, comportamiento de los recursos, etiquetas de sesgo de la IA y habilidades en una sola unidad importable. A partir de la v2.5, las entidades en un mundo pueden tener su propio perfil y resolver el combate por entidad: un luchador "poderoso" y un místico "voluntarioso" comparten un grupo, cada uno aportando su propio estilo de juego.

El esquema, el cargador `applyProfile`, la resolución de habilidades por entidad y la validación entre perfiles se han implementado. Lo que queda es el multijugador: permitir que dos jugadores *humanos* (no solo dos entidades) compartan un mundo, lo cual es una capa de red. Consulte [Hoja de ruta del perfil](docs/profile-roadmap.md) y [feature-architecture.md](docs/feature-architecture.md) para conocer el diseño.

---

## Filosofía

El motor AI RPG se basa en tres ideas:

1. **Mundos deterministas**: los resultados de la simulación deben ser reproducibles.
2. **Diseño basado en pruebas**: las mecánicas del mundo deben probarse mediante la simulación.
3. **La IA como asistente, no como autoridad**: las herramientas de IA ayudan a generar y criticar diseños, pero no reemplazan los sistemas deterministas.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para obtener la explicación completa.

---

## Seguridad

El núcleo del motor es una **biblioteca de simulación solo local**: sin telemetría, sin red, sin secretos. Los archivos guardados se almacenan en `.ai-rpg-engine/` solo cuando se solicita explícitamente. La capa de IA **opcional** (`@ai-rpg-engine/ollama`) se comunica con un daemon Ollama **local**: su función `webfetch` (para RAG) es la única ruta de red saliente y está limitada por una protección contra SSRF (bloquea el bucle invertido/la conexión local/CGNAT/los metadatos de la nube y los equivalentes tunelizados a través de IPv6); nunca se accede a ella a menos que la invoque. Consulte [SECURITY.md](SECURITY.md) para obtener más detalles.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licencia

[MIT](LICENSE)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
