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

## Estado actual (versión 3.0.0)

**Qué funciona y ha sido probado:**

*   Entorno de ejecución principal: estado del mundo, eventos, acciones, ciclos, repetición — estable desde la versión 1.0; repetición determinista con bytes idénticos (contador de ID por instancia, RNG inicializado).
*   Sistema de combate: 5 acciones, 4 estados de combate, 4 estados de enfrentamiento, interceptación de compañeros, desarrollo del combate, tácticas de IA.
*   Habilidades: costos, tiempos de espera, comprobaciones de estadísticas, efectos tipificados, vocabulario de estado con 11 etiquetas, selección consciente de la IA.
*   **Combate en grupo (v2.4):** apuntar a aliados (curación/mejora/revivir), filtrado de área de efecto para amigos/enemigos, selectores de objetivos; un curandero puede curar a un compañero de equipo; el área de efecto del enemigo no afecta a los aliados.
*   **Efectos de estado (v2.4):** los modificadores pasivos de estadísticas afectan al combate, efectos DoT/HoT deterministas basados en el contador de ciclos, desencadenantes reactivos con profundidad limitada (espinas/reflejo).
*   **Perfiles de complemento: resolución de reglas por entidad (v2.5):** un luchador "poderoso" y un místico "voluntarioso" resuelven el combate en una pelea, cada uno leyendo las estadísticas a través de su propio mapeo. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` adjunta un perfil (mapeo de estadísticas, grupos de recursos, habilidades por entidad); `buildProfile()`, `validateProfileSet()` (se rechazan los ID duplicados), 10 plantillas derivadas iniciales y un comando CLI `profile`.
*   **Bucle de juego ejecutable (`run`) (v2.6):** el juego final es real, no una demostración; los enemigos actúan según sus propios perfiles de intención de IA (`agresivo`/`cauteloso`/`territorial`/`calculador`), una pelea termina en victoria o derrota, puedes guardar y reanudar, y las habilidades y la experiencia se encuentran en el menú de acciones. `run <path>` carga un juego que has creado. Interfaz de usuario final compuesta con un HUD fácil de consultar y colores accesibles (respeta `NO_COLOR` / no TTY).
*   **El estudio de diseño de IA se incluye como su propio comando `ai` (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat`: crea, critica y equilibra el contenido en comparación con un modelo Ollama local.
*   Capa de decisión unificada: combate + puntuación de habilidades combinadas en una sola llamada (`selectBestAction`).
*   Los 10 mundos iniciales utilizan `buildCombatStack()`: la base probada para la composición.
*   API de configuración de cognición (`cognition: CognitionCoreConfig | false`) para ajustar la IA por mundo inicial.
*   Taxonomía de etiquetas y utilidades de validación para la creación de contenido.
*   **El mundo reacciona (v2.7):** las muertes acumulan calor y erosionan la seguridad del distrito; un ciclo mundial por ronda genera presiones ocultas que surgen como rumores ("Los susurros te alcanzan..."), se intensifican y desaparecen con consecuencias; las ~30 composiciones de encuentros creadas se activan al entrar en la zona en los 10 mundos iniciales: determinista por semilla, los distritos más sangrientos generan más, las piezas clave del jefe están protegidas.
*   **Una razón para volver (v2.7):** un bucle de misiones mínimo en el esquema que se ha estado utilizando durante mucho tiempo; las misiones ofrecen desencadenantes, rastrean objetivos de muerte/alcance/progreso y otorgan experiencia y objetos exactamente una vez; cuatro misiones creadas, una pantalla de **Diario**, momentos de la misión en la narración del ciclo.
*   **El equipo afecta al combate (v2.7):** `equip`/`unequip` mueve números reales a través de la capa de estado que ya leen las fórmulas de combate; no se realizan cambios en el código de combate; el tridente y la red del gladiador están conectados de extremo a extremo con un delta de probabilidad de golpe probado.
*   **Ejecuciones basadas en semillas (v2.7):** cada sesión nueva imprime su semilla con el comando exacto para repetir; `--seed <n>` reproduce una sesión byte por byte; el combate, la resistencia, las habilidades y los roles consumen la semilla del mundo; y los finales leen la ejecución que realmente jugaste (calor en vivo, presiones, acumulaciones de facciones, nivel del jugador).
*   **`buildWorldStack()` (v2.7):** la base estratégica para la composición junto a `buildCombatStack()`: una sola llamada ensambla el entorno, las facciones, los rumores, los distritos, las consecuencias de la derrota, los encuentros y las misiones; además, la pantalla de estrategia **Director's Ledger**, un inspector de simulación con `AI_RPG_DEBUG=1`, `inspect-save` restringido por las mismas autoridades que Continuar y una unión de migración de módulos guardados en la ruta de restauración utilizada.
*   **Actuar sobre la economía viva (v2.8):** `createEconomyCore` inicializa una economía por distrito al cargar el paquete y la actualiza cada ronda; un nuevo verbo `sell` establece los precios del botín a través de `computeItemValue` (escasez / facción / procedencia / contrabando) y cambia el suministro local. Una sola línea de código activó cinco sistemas que se enviaron desactivados en la v2.7: la visión general del mercado + la puntuación de las facciones del Director, el arco del comerciante-príncipe del juego final y el desencadenante del colapso, y cuatro tipos de presión económica. **Solo venta este ciclo** (compra → v2.9).
*   **Compañeros (v2.8):** un verbo `recruit` crea un grupo: estado, etiquetas y facción, por lo que un compañero lucha *contigo*; el combate del compañero se basa en la mecánica de interceptación del núcleo de combate (desactivada hasta que se establece `isAlly`), los compañeros reaccionan con moral y pueden irse, y reclutar activa siete consumidores pendientes: la lista de verificación de COMPAÑEROS del final, el objetivo del grupo, las metas de agencia NPC, las misiones de favor y la sección de GRUPO del Director. **Interceptación pasiva este ciclo** (turnos independientes → v2.9).
*   **El Director lee todo el tablero (v2.8):** una nueva sección EQUIPAMIENTO en el Ledger del Director (basada en la dependencia de procedencia del equipo desde la CLI), un tráiler final del RESUMEN DEL DIRECTOR, las secciones VISIÓN GENERAL DEL MERCADO + GRUPO ahora se alimentan de productores en vivo y la estabilidad del distrito + el tono económico en la sección DISTRITOS del final.
*   **La otra mitad de la economía (v2.9):** un verbo `buy` completa el ciclo: el inventario del comerciante se ofrece por distrito a nivel de granularidad de categoría de suministro (el nivel de suministro *es* la señal de reabastecimiento), con precios establecidos mediante el mismo proceso `computeItemValue` que `sell`, más una diferencia de compra/venta para que no haya viajes sin riesgo. Y la artesanía cobra vida: `createCraftingCore` registra `salvage`/`craft`/`repair`/`modify` sobre las tablas de recetas creadas, iluminando las secciones MATERIALES + RECETAS del Director que se enviaron desactivadas.
*   **Los compañeros hacen sus propios turnos (v2.9):** el límite de interceptación pasiva de la v2.8 se convierte en el techo: los compañeros reclutados actúan independientemente cada ronda a través del asesor `selectBestAction` previamente no utilizado, con un sesgo de combate por rol para que un luchador y un erudito luchen de manera diferente, la interceptación entre compañeros y la salud del grupo en la línea de GRUPO del Director. Los paquetes sin compañeros siguen siendo idénticos (la puerta del grupo vacío conserva la repetición heredada con semilla 0).
*   **La capa social, conectada de extremo a extremo (v2.9):** cuatro verbos de influencia: `bribe`, `intimidate`, `petition`, `seed` (rumor) — escriben globales reales de reputación / alerta / calor que ya leen las puertas de precios y facciones, y `seed` ilumina todo el módulo de rumores del jugador + la sección RUMORES SOBRE TI del Director. La *economía* de influencia que los financia también está conectada: completar una oportunidad ahora otorga la influencia que siempre narró, por lo que los verbos se pueden obtener genuinamente en el juego.
*   **Oportunidades, el ciclo de vida completo (v2.9):** un generador por ronda ofrece contratos/recompensas/favores puntuados según el estado del mundo en vivo; `accept`, luego `complete` o `abandon`; ignorar uno hasta su fecha límite ahora tiene consecuencias (consecuencias de la caducidad) y completar un favor de compañero mueve la moral de ese compañero. Los arcos de poder creciente y comerciante-príncipe del juego final leen las oportunidades que realmente resolviste.
*   **Paridad de contenido en los diez mundos iniciales (v2.9):** el cableado del equipo, las misiones, los compañeros reclutables y un saldo de monedas inicial se implementaron en todos los mundos iniciales que carecían de ellos: los diez mundos ahora comparten una superficie de características uniforme y completamente iluminada (el equipo era solo para gladiadores; las misiones eran solo de fantasía/zombis; cinco mundos se enviaron con `recruit` sin nadie a quien reclutar). Además, un validador de contenido estructural que detecta un ID de artículo mal escrito en todas las superficies de referencia y ranuras de guardado con múltiples puntos de control con `--checkpoint`/`--list-checkpoints`.
*   **NPCs vivos, realmente vivos (v3.0):** el productor persistente de agencia NPC ilumina la sección **PERSONAS** del Director: los NPCs con nombre (un personaje de historia creado por mundo inicial, más todos los compañeros que reclutas) tienen metas, relaciones de confianza/miedo/avaricia/lealtad y una cadena de consecuencias. `runNpcAgencyTick` se ejecuta cada ronda, restringido para que un mundo sin NPCs con nombre siga siendo idéntico a la repetición heredada. Iluminar el productor también iluminó los puntos de interrupción de la partida del compañero debido al favor y dos reglas de generación de oportunidades inactivas (meta NPC + obligación), y los perfiles/obligaciones NPC del juego final: el cableado se probó como verde pero inerte en el contenido enviado hasta que una auditoría de la fase 9 lo detectó, por lo que la corrección envía un NPC con nombre creado en cada mundo inicial.
*   **Toda la superficie social (v3.0):** los cuatro verbos de influencia se convierten en veinticinco: los grupos de diplomacia y sabotaje se registran (21 subverbos más), iluminando las reacciones del compañero previamente oscuras `leverage-diplomacy` / `leverage-sabotage`; diecinueve aparecen en el menú numerado (afordancia + enfriamiento + restricción basada en la reputación). Las condiciones y los efectos del diálogo ahora leen y escriben el estado social (influencia / reputación / relación NPC). Y la influencia pasiva (`tickLeverage` / `computeLeverageGains`) gotea influencia de la reputación y otorga favor / chantaje / legitimidad a partir de la experiencia y los hitos, por lo que la capa social se gana *entre* oportunidades, no solo al completarlas.
*   **Economía con sabor genérico (v3.0):** el inventario del comerciante y las recetas de artesanía ahora resuelven las tablas de género por mundo inicial (siete de los diez mundos iniciales tienen contenido de género creado; tres recurren a un contenido universal, para ser honesto); en toda la mecánica de compra/artesanía, la pantalla del menú numerado y la sección RECETAS del Director, todo se basa en la misma clave de conjunto de reglas para que la visualización y la mecánica coincidan. `repair` y `modify` son ahora filas del menú numerado (emparejamiento artículo × receta), y las oportunidades de `escort` surgen en una puerta de viaje protectora en un distrito peligroso.
*   **El juego final lee la influencia que ganaste (v3.0):** los finales de campaña `victory`, `puppet-master` y `quiet-retirement`: antes restringidos a la influencia / chantaje / legitimidad que la capa del juego final leía como cero, ahora son alcanzables a través del almacén de influencia real que escribe toda la economía social. La partida del compañero también es alcanzable, a través de los puntos de interrupción de la agencia NPC y una reserva de moral.
*   **CLI de desarrollo `audit-content` (v3.0):** un comando de auditoría de contenido para desarrolladores (hermano de `validate`, distinto del Ledger del Director al que accede el jugador) que ejecuta los seis formateadores de encuentros / jefes / combate en un paquete.
*   `ai-rpg-engine create-starter <name>`: crea un nuevo juego (independiente, se ejecuta fuera del monorepositorio); comandos de contenido `validate` + `scaffold`; carga paquetes desde JSON.
*   Plantilla inicial publicada en npm (`@ai-rpg-engine/starter-template`).
*   Conjunto de pruebas completo: **5494 pruebas** (determinista en ejecuciones repetidas; los archivos de prueba se verifican por tipo en CI; el cumplimiento de la cobertura se aplica).

**Qué es lo que está incompleto o sin pulir:**
- El estudio de creación de mundos con IA (capa Ollama) está menos probado que el núcleo de simulación y necesita un demonio Ollama local; es totalmente opcional: el motor y el bucle `run` no necesitan conexión a la red.
- La pila de narración/audio genera comandos de audio deterministas, pero **no hay ningún sistema de audio final**; nada reproduce sonido; los comandos son un punto de integración para una interfaz gráfica o un componente web.
- El modo multijugador (dos jugadores humanos que comparten un mundo) **no** está implementado; es una capa de red, deliberadamente fuera del alcance; los perfiles actuales están diseñados para un solo controlador.
- `replay --replay` restaura la partida guardada en lugar de volver a simularla, y después de la versión 2.9, esa es la **dirección** definitiva, no una postergación: `Engine.serialize()` ya es una instantánea completa del estado que ha demostrado su eficacia, mientras que la re-simulación tendría que rastrear el estado del mundo en cada momento/encuentro, que se encuentra fuera del registro de acciones. La versión 2.9 incluye ranuras de guardado con múltiples puntos de control en esa ruta de restauración probada; no se planea una re-simulación basada completamente en eventos.
- Quedan algunos límites honestos para la versión 3.0: el **suministro inicial** del distrito sigue utilizando los valores predeterminados universales en lugar de `GENRE_SUPPLY_DEFAULTS` para cada género (el inventario y las recetas que se pueden comprar están organizados por género; el suministro es lo que se introduce en la versión 3.1, con las especificaciones a mano); ningún autor inicial crea una receta específica del género para *reparar* (la reparación funciona en todas partes, simplemente no tiene un estilo específico del género); y dos de los veintiún subverbos sociales (`deny`, `bury-scandal`) necesitan una dimensión de emparejamiento de objetivos antes de que aparezcan en el menú numerado.
- La documentación es extensa, pero no todas las páginas del manual reflejan las API más recientes.

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

Ambas estructuras principales están completas: 5494 pruebas en 280 archivos, los 10 perfiles iniciales en `buildCombatStack` **y** `buildWorldStack`, reproducción determinista e idéntica byte a byte con las semillas impresas, puntuación completa de las decisiones de la IA y una CLI que crea el esqueleto, ejecuta, valida e inspecciona. **La versión 3.0 da vida al mundo: los NPC con nombre cobran vida con objetivos, relaciones de confianza/miedo/avaricia/lealtad, registros de obligaciones y cadenas de consecuencias; la capa social genera ingresos pasivos y gasta en veintiún nuevos verbos de diplomacia/sabotaje; la economía tiene un estilo específico del género para cada perfil inicial; y el poder que obtienes finalmente llega a los finales de la campaña que desbloquea. Una auditoría de la Fase 9 detectó una anomalía importante en el contenido enviado: la solución incluye un NPC con nombre en cada perfil inicial.**

**Ciclo de lanzamiento reciente (v2.4.0–v3.0.0):**
- v2.4.0: combate grupal (ataque/curación/mejora/revivir dirigidos a aliados, sistema de efectos de estado [modificadores + DoT/HoT + desencadenantes reactivos], Fase 1 de los perfiles complementarios, CLI para `validar`/`crear el esqueleto` del contenido.
- v2.5.0: resolución de reglas por entidad (combate con estilos de juego mixtos), el cargador `applyProfile` + habilidades por entidad, plantillas de perfil + CLI `profile` y una revisión completa de la salud.
- v2.6.0: el comando `run` se convirtió en un juego real: los enemigos actúan según sus propios perfiles de IA, victoria/derrota, guardar/reanudar, habilidades y XP en el menú, el directorio `ai` y la pila de narración.
- v2.7.0: el mundo reacciona y hay una razón para volver: calor → presiones → consecuencias narradas, encuentros al entrar en la zona, un bucle de misiones + diario, equipo en combate, ejecuciones reproducibles con semillas, entradas finales del juego en vivo, `buildWorldStack`, el Libro del Director y una transición de guardado.
- v2.8.0: actúa sobre el mundo en el que vives: una economía comercial activa + verbo `sell`, compañeros a los que reclutas y con los que luchas, y un Libro del Director que analiza todo el panorama; se activó un único cable de escritura por sistema, lo que afectó a unos 12 elementos enviados que no funcionaban.
- v2.9.0: cierra los bucles: `buy` + inventario del comerciante y la creación completan la economía; los compañeros realizan turnos independientes; cuatro verbos sociales (soborno/intimidación/petición/siembra) se ejecutan en una economía de influencia financiada por recompensas de oportunidad; las oportunidades se resuelven con una fecha de caducidad + consecuencias de favorabilidad; y el equipo, las misiones, los personajes reclutables y la moneda inicial se distribuyen uniformemente a los diez perfiles iniciales.
- **v3.0.0: da vida al mundo: el generador persistente de agencia NPC enciende la sección PEOPLE del Director: NPC con nombre con objetivos, puntos de interrupción de las relaciones, registros de obligaciones y cadenas de consecuencias, además de la moral de los compañeros, la caída de la favorabilidad y la ruta de riesgo de partida que ya lleva el sistema de reacción.**

### A continuación (la estructura principal de la v3.0)

- **NPC con vida:** el generador persistente de agencia NPC que enciende la sección PEOPLE del Director: NPC con nombre con objetivos, puntos de interrupción de las relaciones, registros de obligaciones y cadenas de consecuencias, además de la moral de los compañeros, la caída de la favorabilidad y la ruta de riesgo de partida que ya lleva el sistema de reacción.
- Inventario comercial y recetas de creación con estilo específico del género (organización por género para cada perfil inicial en lugar de los valores predeterminados universales que se envían hoy), y la superficie del menú `repair`/`modify`.
- La siguiente capa de la economía de influencia: ingresos pasivos más allá de las recompensas de oportunidad, y verbos sociales más allá de los cuatro enviados (grupos de diplomacia/sabotaje), además del vocabulario de condición/efecto del diálogo que lee el nuevo estado social.
- Multijugador: dos jugadores *humanos* compartiendo un mundo (una capa de red, deliberadamente pospuesta; los perfiles compartidos para un solo controlador se envían hoy como [`shared-profiles.ts`](docs/examples/shared-profiles.ts)).
- Anulaciones de fórmulas serializables: ajuste de fórmulas por perfil (bloqueado en un DSL de fórmulas; los perfiles llevan mapeos de estadísticas hoy, no cierres).
- Sincronización de la documentación de la API: asegurarse de que todas las páginas del manual reflejen las API más recientes.

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
