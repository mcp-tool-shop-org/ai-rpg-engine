<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Un conjunto de herramientas TypeScript para crear simulaciones de RPG deterministas. Define las estadísticas, elige los módulos, conecta una pila de combate y crea contenido. El motor gestiona el estado, los eventos, el RNG, la resolución de acciones y la toma de decisiones de la IA. Cada ejecución es reproducible.

Este es un **motor de composición**, no un juego terminado. Los 12 mundos iniciales son ejemplos: patrones que se pueden descomponer, de los que se puede aprender y que se pueden reutilizar. Tu juego utiliza el subconjunto del motor que necesites.

---

## De qué se trata

- Una **biblioteca de módulos**: más de 30 módulos del motor que cubren el combate, la percepción, la cognición, las facciones, los rumores, el movimiento, los compañeros y más.
- Un **conjunto de herramientas de composición**: `buildCombatStack()` conecta el combate en aproximadamente 7 líneas; `new Engine({ modules })` inicia el juego.
- Un **entorno de ejecución de simulación**: ciclos deterministas, registros de acciones reproducibles, RNG con valores iniciales.
- Un **estudio de diseño de IA** (opcional): andamiaje, crítica, análisis de equilibrio, ajuste, experimentos a través de Ollama.
- Una **capa opcional en la cadena de bloques**: `@ai-rpg-engine/ledger-adapter` respalda la moneda de un juego y los objetos intercambiables con tokens reales de la **red de prueba** XRPL, que se liquidan en puntos de control, completamente fuera del núcleo determinista (opcional; una ejecución es idéntica en bytes sin ella).
- Un **host visual opcional**: `@ai-rpg-engine/sidecar` más el cliente Godot 4 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage). El motor sigue sin generar píxeles. El escenario dibuja un puerto dimétrico de 2:1 y reproduce el audio `felt`. La ocupación sigue siendo un ID de zona.

## De qué no se trata

- No es un juego terminado: incluye 12 mundos iniciales jugables que puedes `run` hoy como ejemplos, y el motor es el conjunto de herramientas con el que puedes componer tu *propio* juego.
- No es un motor visual: genera eventos estructurados, no píxeles. El dibujo es tarea del host (terminal o Godot).
- No es un generador de historias: simula mundos; la narrativa surge de la mecánica.

---

## Estado actual (v3.12.2)

**Lo que funciona y está probado:**
- El núcleo de simulación: ticks deterministas, RNG con semilla, repetición idéntica byte a byte, y guardar y reanudar
- Combate en grupo: objetivos aliados, efectos de estado, ataques de área que no dañan a los aliados, y enemigos que actúan según sus propios perfiles de intención de IA
- Un mundo que reacciona: facciones, rumores, una economía comercial, compañeros, PNJ con nombre y objetivos propios, y consecuencias por lo que haces
- Los 12 mundos iniciales, jugables hoy con `run`
- Paquetes de World Forge, cargados como contenido
- El host de Godot 4 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage), a través del sidecar, con señales de audio `felt`
- La capa de libro mayor en la testnet de XRPL, que solo se activa si la eliges (opt-in)

**Lo que está sin pulir o incompleto:**
- El estudio de diseño con IA (Ollama) es opcional y está menos probado que el núcleo de simulación
- No hay backend de audio en la terminal: solo el escenario de Godot reproduce sonido
- El multijugador (dos jugadores humanos en un mismo mundo) no está construido
- `replay --replay` restaura la partida guardada en lugar de volver a simular, por diseño
- Algunas páginas del manual van por detrás de las API más recientes

El historial completo de versiones está en [CHANGELOG.md](CHANGELOG.md).

---

## Cómo se ve

La interfaz de usuario terminal incluida compone cada turno en secciones etiquetadas: escena, estado, registro y acciones, con una interfaz HUD de fácil consulta. El resultado es texto sin formato por defecto y agrega color semántico en una TTY (daño en rojo, curación en verde, rechazos en amarillo), respetando `NO_COLOR` y las tuberías que no son TTY; cada señal se incluye también en el texto, nunca solo con color.

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

Juega una partida de inicio o crea tu propio juego desde la terminal:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

El bucle `run` es una sesión real por turnos: los enemigos actúan según sus propios perfiles de IA, las habilidades y la experiencia están en el menú, puedes guardar y reanudar, y una pelea termina en victoria o derrota. Cada juego es determinista y se puede volver a jugar.

Opcionalmente, el estudio de diseño de IA se instala como un comando independiente:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

El estudio se comunica con un demonio local de [Ollama](https://ollama.com); ejecute primero `ollama serve` y `ollama pull qwen2.5-coder`. Esto es totalmente opcional; el motor y el bucle `run` no necesitan conexión de red.

Se publica una imagen de contenedor en GHCR como `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` para pruebas de CI y ejecuciones en entornos aislados.

---

## Comienzo rápido

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

Consulta la [Guía de composición](site/src/content/docs/handbook/57-composition-guide.md) para obtener el flujo de trabajo completo o crea una nueva partida de inicio:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Arquitectura

| Capa | Función |
|-------|------|
| **Entorno de ejecución principal** | Motor determinista: estado del mundo, eventos, acciones, ciclos, RNG, repetición |
| **Módulos** | Más de 30 sistemas componibles: combate, percepción, cognición, facciones, desplazamiento, compañeros, etc. |
| **Contenido** | Entidades, zonas, diálogos, objetos, habilidades, estados: creados por el autor |
| **Estudio de IA** | Capa de Ollama opcional: creación de prototipos, crítica, análisis de equilibrio, ajuste, experimentos |

---

## El adaptador del libro mayor XRPL (opcional)

`@ai-rpg-engine/ledger-adapter` es un paquete **opcional** que vincula la
**capa de objetos intercambiables propiedad del jugador** de un juego —el saldo de `coin` y el inventario de objetos consumibles que los verbos `buy`/`sell` de `trade-core` ya mueven— a la **red de pruebas XRPL**, de modo que
estos activos puedan estar respaldados por tokens reales registrados y liquidarse en puntos de control.
La ausencia de un adaptador es exactamente el motor sin conexión que se ofrece actualmente.

**La invariante del determinismo (el objetivo principal).** El adaptador es un *canal secundario*, que nunca forma parte de la simulación:

- Nunca se invoca dentro del ciclo determinista, solo en los **puntos de control** (guardado, entrada a la ciudad/mercado, final del capítulo).
- Nada en `@ai-rpg-engine/core` o `@ai-rpg-engine/modules` lo importa (su única dependencia del motor es una `import type` en tiempo de compilación).
- **Una ejecución es idéntica en bytes con o sin él.** Una prueba de firewall ejecuta el bucle de comerciante `starter-pirate` `createGame()` real en dos motores, uno con el adaptador habilitado y liquidando en un punto de control, y afirma que los dos mundos son profundamente iguales. La repetición de la semilla 0 no se ve afectada.

**Niveles de integración: un juego lo integra tan profundamente como su diseño lo requiera.** El firewall es un límite de *determinismo*, no una regla anti-integración; la invariante anterior se mantiene en todos los niveles:

| Nivel | Qué depende del adaptador | Se ajusta |
|-------|-----------------------------|------|
| **L0 — Observador externo** | Nada dentro del juego; el adaptador se adjunta desde el exterior en los puntos de control y el juego no es consciente de ello. | Adaptación de un juego existente (la demostración de piratas incluida). |
| **L1: puntos de control impulsados por el juego** | El flujo de guardado/ciudad/progresión meta del juego llama al adaptador en momentos definidos. | Un juego que desea momentos deliberados en el libro mayor. |
| **L2 — Diseño nativo de libro mayor** | La economía o la identidad del juego están diseñadas *en torno a* la propiedad en la cadena (emisor persistente, mercados reales). | Un juego de comerciantes primero en el libro mayor. |

La distinción que mantiene la repetición segura no es "qué paquete importa el adaptador", sino "si la llamada se realiza dentro del ciclo". Un paquete de juego puede importar y controlar el adaptador libremente, siempre y cuando todas las llamadas se realicen en un punto de control fuera del bucle de repetición impulsado por la semilla.

**Tres modos de juego.** `offline` (por defecto: sin cadena, el motor tal como se incluye) · `ledger` (monedas/objetos respaldados por saldos de la testnet, liquidados en los puntos de control) · `diary` (jugar sin conexión y luego anclar el hash del estado de la ejecución en el libro mayor para obtener un recibo a prueba de manipulaciones).

**Qué hay en el libro mayor.** `coin` → una promesa de pago en moneda emitida a través de una línea de confianza;
artículos consumibles → tokens fungibles; la diferencia neta de comercio de un punto de control → una transferencia liquidada a través de un **depósito de tokens XLS-85**. El equipo único se envía como **NFT XLS-20** (v3.3), y el crecimiento de las reliquias mejora los metadatos de un NFT mutable en su lugar a través de **XLS-46 `NFTokenModify`**, impulsado por el juego real a partir de v3.4. La economía abstracta del distrito (`economy-core`) *no* se ve afectada; sigue siendo una simulación pura.

**Medidas de seguridad.** Solo para la red de prueba, con una protección estructural **imposible en la red principal en el código** (no una opción de configuración); las claves de la billetera se almacenan en un archivo secundario de secretos ignorado por Git, nunca en el archivo de guardado; la liquidación es idempotente y segura en cuanto a la conservación en la ruta de reintento; las pruebas verifican el **memo real en la cadena** (no la cadena propia del motor); y si la cadena no es accesible, la ejecución simplemente continúa, marcada como *no anclada*.

**Probado en vivo.** Una ejecución real de un comerciante `starter-pirate`: vende un sable, compra una bala de cañón; se liquida en la red de prueba de XRPL a través de un depósito de tokens, y luego `reconcile()` confirma los saldos y los memos en el libro mayor frente a la economía del motor (la conservación se mantiene para cada token). El libro mayor es una familia de sistemas diferente al motor, por lo que el motor no puede falsificarlo; la conciliación es una verificación externa genuina. Solo para la red de prueba; los activos son recibos de alcance del juego, no valores.

---

## Sistema de combate

Cinco acciones (ataque, guardia, desenganche, preparación, reposicionamiento), cuatro estados de combate (protegido, desequilibrado, expuesto, en fuga), cuatro estados de enfrentamiento (enfrentado, protegido, línea trasera, aislado). Tres dimensiones de estadísticas impulsan cada fórmula, por lo que un duelista rápido juega de manera diferente a un luchador pesado o un centinela compuesto.

Los oponentes de la IA utilizan una puntuación de decisión unificada: las acciones y habilidades de combate compiten en una única evaluación, con umbrales configurables para evitar el uso excesivo de habilidades marginales.

Los autores de los paquetes utilizan `buildCombatStack()` para conectar el combate a partir de un mapeo de estadísticas, un perfil de recursos y etiquetas de sesgo. Consulte la [Descripción general del combate](site/src/content/docs/handbook/49a-combat-overview.md) y la [Guía para autores de paquetes](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Habilidades

Sistema de habilidades nativo del género, con costos, comprobaciones de estadísticas, tiempos de espera y efectos tipificados (daño, curación, aplicación de estado, limpieza). Los efectos de estado utilizan un vocabulario semántico de 11 etiquetas con perfiles de resistencia/vulnerabilidad. Las puntuaciones de selección con conocimiento de la IA seleccionan las rutas de auto/AoE/ataque a un solo objetivo.

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
| [`@ai-rpg-engine/core`](packages/core) | Entorno de simulación determinista: estado del mundo, eventos, RNG, ciclos, resolución de acciones |
| [`@ai-rpg-engine/modules`](packages/modules) | Más de 30 módulos componibles: combate, percepción, cognición, facciones, rumores, recorrido, compañeros, agencia de NPC, mapa estratégico, reconocimiento de elementos, oportunidades emergentes, detección de arcos, desencadenantes del final del juego |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas y validadores canónicos para el contenido del mundo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progresión del personaje, lesiones, hitos, reputación |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selección de arquetipo, generación de construcción, equipo inicial |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipo, procedencia de los artículos y crecimiento de las reliquias, incluido `item-chronicle-core`, el módulo opcional que registra el historial del equipo del juego real para que los artículos obtengan epítetos y niveles |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria entre sesiones, efectos de relación, estado de la campaña |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo de vida de los rumores, mecánica de mutación, seguimiento de la propagación |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Esquema del plan de narración, contratos de renderizado, perfiles de voz |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Programación de señales, prioridad, atenuación, lógica de tiempo de espera |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifiestos de paquetes de sonido, registro direccionable por contenido |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registro de paquetes, puntuación de rúbrica, descubrimiento de paquetes |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Almacenamiento direccionado por contenido para retratos, iconos, medios |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generación de retratos sin interfaz con proveedores conectables |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Autoría de IA opcional: andamiaje, crítica, flujos de trabajo guiados, ajuste, experimentos |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: ejecutar juegos, crear plantillas iniciales, inspeccionar guardados |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motor de renderizado de terminal y capa de entrada |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Comerciante inicial: el paquete de referencia para el adaptador del libro mayor, que no tiene ninguna dependencia de este |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Mundo inicial de cazador de fugitivos: la persecución como bucle, y qué mitad de la ciudad te abrirá una puerta |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Opcional:** liquidación opcional en la red de prueba de XRPL para la capa intercambiable propiedad del jugador (monedas / inventario / comercio), a través de un depósito de tokens XLS-85 en los puntos de control, completamente fuera del núcleo determinista |

### Ejemplos de inicio

Los 12 mundos de inicio son **ejemplos de composición**: demuestran cómo combinar los módulos del motor en juegos completos. Cada uno muestra diferentes patrones (mapeos de estadísticas, perfiles de recursos, configuraciones de interacción, conjuntos de habilidades). Consulte el archivo README de cada inicio para obtener información sobre "Patrones demostrados" y "Qué tomar prestado".

| Inicio | Género | Patrones clave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasía oscura | Combate mínimo, impulsado por el diálogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Ciberpunk | Recursos, roles de interacción |
| [`starter-detective`](packages/starter-detective) | Misterio victoriano | Social primero, con gran énfasis en la percepción |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Naval + cuerpo a cuerpo, multizona |
| [`starter-zombie`](packages/starter-zombie) | Supervivencia zombi | Escasez, recurso de infección |
| [`starter-weird-west`](packages/starter-weird-west) | Oeste extraño | Sesgos del paquete, recuperación de zona segura |
| [`starter-colony`](packages/starter-colony) | Colonia de ciencia ficción | Cuellos de botella, zonas de emboscada |
| [`starter-ronin`](packages/starter-ronin) | Japón feudal | Pasajes ocultos, múltiples roles de protector |
| [`starter-merchant`](packages/starter-merchant) | Comercial | La obligación como bucle, el combate con precio como penalización |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Persecución | Cazar personas por dinero; la violencia es ruidosa, no está prohibida |
| [`starter-vampire`](packages/starter-vampire) | Horror de vampiros | Recurso de sangre, manipulación social |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiador histórico | Combate en la arena, favor del público |

---

## Documentación

| Recurso | Descripción |
|----------|-------------|
| [Crea tu propio mundo inicial](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crear un nuevo juego: ruta CLI o plantilla manual |
| [Guía de composición](site/src/content/docs/handbook/57-composition-guide.md) | Crea tu propio juego componiendo módulos del motor. |
| [Perfiles complementarios](site/src/content/docs/handbook/59-plugin-profiles.md) | Resolución de reglas por entidad: combate de estilo de juego mixto, `applyProfile`, plantillas de perfil, la CLI `profile`. |
| [Adaptador del libro mayor XRPL](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Liquidación opcional en el libro mayor: el cortafuegos del determinismo, niveles de integración L0/L1/L2, modos de juego, medidas de seguridad y la demostración de pirata probada en vivo. |
| [Descripción general del combate](site/src/content/docs/handbook/49a-combat-overview.md) | Seis pilares de combate, cinco acciones, estados de un vistazo. |
| [Guía para autores de paquetes](site/src/content/docs/handbook/55-combat-pack-guide.md) | buildCombatStack paso a paso, mapeo de estadísticas, perfiles de recursos. |
| [Clientes visuales](site/src/content/docs/handbook/66-visual-clients.md) | Hosts de sidecar, carga útil felt, puerto dimétrico de Godot: la presentación puede ser engañosa, la ocupación sigue siendo un ID de zona. |
| [Manual](site/src/content/docs/handbook/index.md) | Manual completo: todos los sistemas, más 4 apéndices. |
| [Modelo de composición](docs/composition-model.md) | Las 6 capas reutilizables y cómo se componen. |
| [Ejemplos](docs/examples/) | Ejemplos ejecutables de TypeScript (verificados por tipo y probados en cuanto a comportamiento en CI): grupo mixto por entidad, perfiles compartidos, entre mundos, desde cero. |
| [Documento de diseño](docs/DESIGN.md) | Análisis profundo de la arquitectura: canalización de acciones, verdad frente a presentación. |
| [Filosofía](PHILOSOPHY.md) | Mundos deterministas, diseño basado en la evidencia, IA como asistente. |
| [Registro de cambios](CHANGELOG.md) | Historial de lanzamientos. |

---

## Hoja de ruta

### Dónde estamos ahora

Ambas líneas de composición están completas: **8368 pruebas en 388 archivos**, los 12 iniciadores en `buildCombatStack` **y** `buildWorldStack`, reproducción determinista e idéntica byte a byte bajo semillas impresas, puntuación completa de la toma de decisiones de la IA y una CLI que crea, ejecuta, valida e inspecciona. El arco v3.x hizo que el mundo estuviera activo (NPC con nombre, la superficie social de 25 verbos, economías de género: v3.0–v3.1), colocó activos de propiedad del jugador en la testnet de XRPL como un canal secundario opcional (v3.2–v3.4), creó dos iniciadores centrados en el sistema y los convirtió en instrumentos de mejora del motor (v3.5–v3.6), iluminó y reforzó la capa estratégica hasta que las consecuencias dejan marcas reales (v3.7–v3.8), proporcionó a los hosts la superficie del motor que necesita Godot (v3.8.1), cerró el ciclo de creación para que una sesión de estudio o un paquete JSON básico produzca un mundo jugable de principio a fin (v3.9), colocó toda la capa estratégica en los sentidos del jugador (v3.10), afinó la profundidad que ahora alcanzan esos sentidos (v3.11) y **proporcionó a un host de dibujo la sensación de un ciclo: el primer cliente de píxeles, un puerto dimétrico de Godot 4, se ejecuta en ese contrato (v3.12)**.

El historial completo de versiones está en [CHANGELOG.md](CHANGELOG.md).

### Siguiente

v3.12 cerró el contrato felt y el primer host de dibujo. Lo que queda es un trabajo de ciclo posterior, no los restos de este:

- Un fondo ambiental de la familia de tono «próspero» (el puente de tono y la selección aleatoria por zona ya están incluidos; CORE aún no tiene una pista base próspera).
- Multijugador: dos jugadores *humanos* compartiendo un mundo (una capa de red, deliberadamente pospuesta; los perfiles compartidos de un solo controlador se envían hoy como [`shared-profiles.ts`](docs/examples/shared-profiles.ts)).
- Anulaciones de fórmulas serializables: ajuste de fórmulas por perfil (bloqueado en un DSL de fórmulas; los perfiles llevan mapeos de estadísticas hoy, no cierres).

### Destino: Perfiles complementarios

El objetivo final del motor son **perfiles definidos por el usuario**: paquetes portátiles que se insertan en cualquier juego. Un perfil empaqueta un mapeo de estadísticas, comportamiento de recursos, etiquetas de sesgo de IA y habilidades en una sola unidad importable. A partir de v2.5, las entidades en un mundo pueden tener cada una su propio perfil y resolver el combate por entidad: un luchador `might` y un místico `will` comparten una fiesta, cada uno aportando su propio estilo de juego.

El esquema, el cargador `applyProfile`, la resolución de habilidades por entidad y la validación entre perfiles se han enviado. Lo que queda es el multijugador: permitir que dos jugadores *humanos* (no solo dos entidades) compartan un mundo, que es una capa de red. Consulte [Hoja de ruta del perfil](docs/profile-roadmap.md) y [feature-architecture.md](docs/feature-architecture.md) para obtener el diseño.

---

## Filosofía

AI RPG Engine se basa en tres ideas:

1. **Mundos deterministas**: los resultados de la simulación deben ser reproducibles.
2. **Diseño basado en la evidencia**: la mecánica del mundo debe probarse mediante la simulación.
3. **IA como asistente, no como autoridad**: las herramientas de IA ayudan a generar y criticar diseños, pero no reemplazan los sistemas deterministas.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para obtener la explicación completa.

---

## Seguridad

El motor principal es una **biblioteca de simulación puramente local**: no hay telemetría, ni red, ni secretos. Los archivos guardados se almacenan en `.ai-rpg-engine/` solo cuando se solicita explícitamente. Dos **capas opcionales** añaden una ruta de salida, y solo cuando las active:

- La capa de IA (`@ai-rpg-engine/ollama`) se comunica con un daemon de Ollama **local**; su opción de participación `webfetch` (para RAG) está limitada por una protección contra SSRF (bloquea loopback/link-local/CGNAT/metadatos de la nube y equivalentes tunelizados por IPv6).
- La capa de libro mayor (`@ai-rpg-engine/ledger-adapter`) se conecta a la **red de pruebas XRPL** —y solo a la red de pruebas: una protección estructural **imposible en el código para la red principal** (no una opción de configuración) rechaza cualquier host que no sea de la red de pruebas durante la construcción. Las semillas de la billetera se almacenan en un archivo secundario de secretos ignorado por Git, nunca en un archivo guardado, y el núcleo determinista nunca importa el adaptador.

Consulte [SECURITY.md](SECURITY.md) para obtener más detalles.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licencia

[MIT](LICENSE)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
