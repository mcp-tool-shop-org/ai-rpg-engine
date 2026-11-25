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

# Motor de RPG con IA

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

**Qué funciona y ha sido probado:**
- **Ya no se rechazan los paquetes de World Forge (v3.12.2):** el sistema de carga indica que las 13 claves principales que contiene una exportación de World Forge (`connections`, `spawnPoints`, `playerTemplate` y diez más) se consideran conocidas, pero no se incluyen, por lo que un paquete válido que las contenga se carga y el informe de carga enumera cada una como si se hubiera eliminado. Una clave con errores ortográficos sigue siendo rechazada por su nombre. Los valores hash no se modifican.
- **Servidor de Godot (v3.12):** el componente secundario `capabilities.audio` envía una carga útil `felt` (identificadores de señales, elementos superpuestos, líneas de diálogo, efectos de la interfaz de usuario) que nunca se cifra; se negocia y se añade, y se omite por completo cuando la función está desactivada, de modo que un cliente que requiere una coincidencia exacta mantiene la estabilidad de los bytes. [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage) es el cliente de Godot 4: TileMapLayer dimétrico 2:1, personajes de Foundry con 8 direcciones, presentación mediante clics en las celdas, `move` sigue designando una zona vecina. Manual: [Clientes visuales](site/src/content/docs/handbook/66-visual-clients.md).
- **Ajuste y profundidad (v3.11):** `bounty` vuelve a activarse en el contenido creado (la limpieza del v3.10 hizo que las dos bajas navales de Black Flag se produjeran con 36 rondas de diferencia; la gracia del calor es ese intervalo medido, y aún quedan dos bajas). Una pelea que termina porque alguien se rindió lo indica: `combat.encounter.cleared` conlleva `outcome: 'victory' | 'retreat'`, no un segundo evento, no un golpe de victoria, no una victoria registrada. La pertenencia a una facción tiene tres ubicaciones honestas: `entity.faction` en la persona, un registro que se mantiene y del que se extrae información, y que aún guarda datos adicionales, y `CompanionState.originFaction`, de modo que la facción de la que provienen aún la escucha. La música de la zona se reproduce por `zoneId`; los efectos de sonido respetan los tiempos de espera; `/build`, las secuencias de escritura programadas sobreviven a un fallo; una nueva sesión de CLI emite el evento de entrada a la zona inicial, de modo que los MOMENTOS CLAVE muestran el primer estado de ánimo. 8356 pruebas.
- **El mundo llega al jugador (v3.10):** dos ciclos de productores finalmente impactan en los sentidos del jugador. Las ocho indicaciones de la voz del narrador se activan: la textura del NPC y el sesgo de la facción enmarcan al hablante, la indicación del estilo se aplica a la línea del hablante, la presencia del grupo/la presión del mundo/las oportunidades abiertas cierran el marco del diálogo como comentarios secundarios, y el estado de ánimo del distrito y los informes de la situación se añaden al registro de eventos. El HUD, que está siempre activo, muestra la línea del grupo. La honestidad en el combate se manifiesta como un evento real: `combat.encounter.cleared` se activa exactamente una vez cuando cae el último enemigo (una muerte mutua se interpreta como una derrota, la muerte de un compañero ya no indica un triunfo, y los nueve oyentes iniciales que anunciaban cada muerte desaparecen), y se relaciona con la melodía de la victoria a través del presentador por turno. La entrada a la zona activa la música adecuada al tono: un distrito sombrío realmente suena sombrío, y el contrato de salida de voz es real: `NarrationPlan.asides` transmite fragmentos de diálogo exactamente una vez, `SpeakerCue.emotion` transmite la indicación del estilo textualmente, listo para ser integrado en un sistema de síntesis de voz. Los clientes secundarios ven la información de entrada del paquete `dropped[]`/`advisories` en `initialize`, los lotes guiados `/build` ejecutan cada paso detrás de un consentimiento agrupado (con una función de deshacer que tiene en cuenta la creación y un rechazo que no puede invalidar la puerta), las facciones estructuradas sobreviven `emit-pack`, y la identidad de la facción se resuelve a partir de la propia `faction` del objeto en todos los lugares donde antes se necesitaba un registro que ningún paquete enviado proporciona, lo que invierte el seguimiento de intrusos del distrito y reactiva la propagación de rumores. Una sesión de juego e2e fija toda la superficie fotograma por fotograma, NO_COLOR byte a byte.
- **El paquete que creas es el juego que juegas (v3.9):** el estudio ahora crea todo lo que el motor ejecuta: `create-ruleset`, `create-rule-profile` y `create-item-placement` se unen a los verbos base, y tanto los planes `/build` como el final `ai scaffold-and-critique` terminan emitiendo `content/pack.json`. `applyContentPack` estampa `playerId`/`locationId` de un paquete para un solo jugador, establece los valores base de la reputación de la facción y los registros de perfiles de reglas (fusionados, sin borrar nunca los del anfitrión) y transmite el manifiesto y el conjunto de reglas del paquete a través de `extractSessionContent`; la receta JSON documentada para el inicio se corrige y se fija mediante una prueba integral. El diálogo adquiere una textura dinámica: un NPC menciona el contrato que realmente está sobre la mesa, llega con compañeros o entra en un distrito sombrío, y el asesor de movimientos dice una frase dirigida al jugador. Los diarios de memoria de la campaña guardan los datos de los compañeros y los objetos creados, las variantes de imagen conservan sus identificadores (con soporte LoRA), las posturas de los rumores se desvanecen y un efecto de victoria ya no elimina la música de fondo de la zona. 8042 pruebas.
- **La superficie de alojamiento está en el motor (v3.8.1):** `hash`, `present`, `preview`, `getAvailableActions`, `advanceRound`, complemento `listActions` + guardar/cargar, estudio `emit-pack`, catálogos de paquetes JSON y `ruleProfiles`. Un adjunto de Godot y un inicio con JSON `--content` ya no copian los componentes internos de la interfaz de línea de comandos para crear esas divisiones.
- Entorno de ejecución principal: estado del mundo, eventos, acciones, ciclos, reproducción — estable desde v1.0; reproducción determinista y bit a bit (contador de identificadores por instancia, generador de números aleatorios con semilla).
- Sistema de combate: 5 acciones, 4 estados de combate, 4 estados de enfrentamiento, intercepción del compañero, secuencia de derrota, tácticas de la IA.
- Habilidades: costes, tiempos de recarga, comprobaciones de estadísticas, efectos basados en tipos, vocabulario de estados con 11 etiquetas, selección consciente de la IA.
- **Combate grupal (v2.4):** selección de aliados (curación/mejora/resurrección), filtro de amigos/enemigos AoE, selección de objetivos: un curandero puede curar a un compañero de equipo; un enemigo AoE puede perdonar a los aliados.
- **Efectos de estado (v2.4):** las modificaciones pasivas de las estadísticas se aplican en combate, activación determinista de DoT/HoT basada en el contador de tiempo, activación reactiva con límite de profundidad (espinas/reflejo).
- **Perfiles de complementos: resolución de reglas por entidad (v2.5):** un `might` guerrero y un `will` místico resuelven un combate en una sola pelea, cada uno accediendo a sus estadísticas a través de su propio mapeo. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` adjunta un perfil (mapeo de estadísticas, grupos de recursos, habilidades por entidad); `buildProfile()`, `validateProfileSet()` (se rechazan los ID duplicados), 10 plantillas derivadas de las iniciales y un comando `profile` de la interfaz de línea de comandos.
- **Bucle de juego completo `run` (v2.6):** el juego final es real, no una demostración; los enemigos actúan según sus propios perfiles de inteligencia artificial (`aggressive`/`cautious`/`territorial`/`calculating`; ahora hay seis predefinidos, con `passive` y `follower`), una batalla termina en victoria o derrota, puedes guardar y continuar, y las habilidades y la experiencia se muestran en el menú de acción. `run <path>` carga un juego que hayas creado. Interfaz de usuario del juego completa, con un HUD de fácil consulta y colores accesibles (compatible con `NO_COLOR` / no TTY).
- **El estudio de diseño con IA se ofrece como un comando independiente `ai` (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — genera una estructura básica, realiza una evaluación y equilibra el contenido en relación con un modelo Ollama local.
- Capa de toma de decisiones unificada: la evaluación del combate y las habilidades se combinan en una sola llamada (`selectBestAction`).
- Los 12 mundos iniciales utilizan `buildCombatStack()`, la composición base que ha demostrado ser eficaz.
- API de configuración de la cognición (`cognition: CognitionCoreConfig | false`) para la optimización de la IA por cada iniciador.
- Herramientas de etiquetado, clasificación y validación para la creación de contenido.
- **La reacción del mundo (v2.7):** las muertes acumulan tensión y erosionan la seguridad del distrito; en cada ronda, el sistema genera presiones ocultas que se manifiestan como rumores ("Llegan rumores a tus oídos…"), se intensifican y desaparecen con consecuencias; las aproximadamente 30 composiciones de encuentros diseñadas se activan al entrar en la zona en los 10 puntos de inicio; de forma determinista por cada secuencia, los distritos más peligrosos generan más, y los elementos clave del jefe están protegidos.
- **Una razón para volver (v2.7):** un ciclo de misiones mínimo en el esquema que se ha estado utilizando durante mucho tiempo: las misiones se ofrecen al activarse determinados eventos, se realiza un seguimiento de los objetivos (número de enemigos derrotados, puntos alcanzados, progreso) y se otorga experiencia e ítems solo una vez; cuatro misiones diseñadas, una pantalla de **diario** y momentos clave de las misiones en la narración de la ronda.
- **El equipo entra en combate (v2.7):** `equip`/`unequip` mueve números reales a través de la capa de estado; las fórmulas de combate ya los leen; no se realizan cambios en el código de combate; el tridente y la red del gladiador están conectados de extremo a extremo con un delta de probabilidad de impacto sujeto a pruebas.
- **Ejecuciones con semilla (v2.7):** cada nueva sesión imprime su semilla junto con el comando exacto para reproducirla; `--seed <n>` reproduce una sesión byte por byte; los cálculos de combate, resistencia, habilidades y tácticas consumen la semilla del mundo, y los finales reflejan la sesión que realmente jugaste (intensidad en tiempo real, presiones, acumulación de facciones, nivel del jugador).
- **`buildWorldStack()` (v2.7):** el núcleo estratégico de la composición, junto a `buildCombatStack()`; una sola llamada reúne el entorno, las facciones, los rumores, los distritos, las consecuencias de la derrota, los encuentros y las misiones; además, incluye la pantalla de estrategia del **Registro del Director**, un inspector de simulación `AI_RPG_DEBUG=1`, `inspect-save`, que está sujeto a las mismas autoridades que Continue, y una función de guardado y migración de módulos en la ruta de restauración.
- **Actúa sobre la economía dinámica (v2.8):** `createEconomyCore` establece una economía por distrito al inicio y la actualiza en cada ronda; un nuevo verbo `sell` establece los precios del botín según `computeItemValue` (escasez / facción / origen / contrabando) y modifica la oferta local. Un único script activó cinco sistemas que operaban en secreto en v2.7: la visión general del mercado y el sistema de puntuación de facciones del Director, el arco narrativo del comerciante-príncipe y el desencadenante del colapso, y cuatro tipos de presión económica. **Solo se puede vender en este ciclo** (comprar → v2.9).
- **Compañeros (v2.8):** un `recruit` verbo crea un grupo — estado, etiquetas y facción, por lo que un compañero lucha *contigo*; el combate de los compañeros se basa en la mecánica de interceptación del núcleo de combate (oculta hasta que `isAlly` se establece), los compañeros reaccionan según su moral y pueden marcharse, y reclutar activa a siete posibles aliados, que son los COMPAÑEROS que aparecen en la escena final, los objetivos del grupo, los objetivos de los personajes no jugables, las misiones de favor y la sección PARTY del Director. **Interceptación pasiva en este ciclo** (turnos independientes → v2.9)
- **El director revisa todo el panel (v2.8):** una nueva sección del registro de EQUIPOS (detrás de la dependencia de procedencia de equipos), un tráiler final del RESUMEN DEL DIRECTOR, las secciones de VISTA GENERAL DEL MERCADO y EVENTO, que ahora se alimentan con datos de los productores en tiempo real, y la estabilidad del distrito y el tono económico en la sección de DISTRITOS del final.
- **La otra mitad de la economía (v2.9):** un `buy` verbo completa el ciclo: el inventario del comerciante se ofrece por distrito, con granularidad por categoría de suministro (el nivel de suministro *es* la señal de reabastecimiento), y se establece el precio a través de la misma `computeItemValue` cadena de suministro que `sell`, más un margen de compra/venta para que no haya riesgo de transacción sin beneficio. Y la creación cobra vida: `createCraftingCore` registra `salvage`/`craft`/`repair`/`modify` en las tablas de recetas creadas, activando las secciones de MATERIALES + RECETAS del Director, que antes estaban inactivas.
- **Los compañeros realizan sus acciones por turnos (v2.9):** el nivel de interceptación pasiva de v2.8 se convierte en el nivel superior; los compañeros reclutados actúan de forma independiente en cada ronda a través del asesor `selectBestAction`, que antes no se utilizaba, con un sesgo de combate específico para cada rol, de modo que un guerrero y un erudito luchan de forma diferente, se produce la interceptación entre compañeros y los puntos de vida del grupo se muestran en la línea PARTY del Director. Los grupos sin compañeros permanecen idénticos (la puerta del grupo vacío conserva la compatibilidad con la reproducción original con la semilla 0).
- **La capa social, conectada de extremo a extremo (v2.9):** cuatro verbos que potencian la interacción — `bribe`, `intimidate`, `petition`, `seed` (rumor) — generan información real sobre la reputación, alertas y tendencias globales que influyen en los precios y las relaciones entre facciones, y que ya han sido leídas, y `seed` activa todo el módulo de rumores entre jugadores, además de la sección «RUMORES SOBRE TI» del Director. La *economía* que financia esta interacción también está interconectada: completar una oportunidad ahora otorga la recompensa que siempre se había prometido, por lo que los verbos se pueden obtener de forma genuina durante el juego.
- **Oportunidades, el ciclo de vida completo (v2.9):** un generador por ronda ofrece contratos/recompensas/favores que se evalúan en función del estado actual del mundo; tú `accept`, luego `complete` o `abandon`; ignorar uno de ellos hasta su fecha límite ahora tiene consecuencias (efectos negativos por el vencimiento) y completar un favor para un compañero mejora la moral de ese compañero. Los arcos de poder creciente y de príncipe mercader del final del juego reflejan las oportunidades que realmente resolviste.
- **Equilibrio de contenido en los diez mundos iniciales (v2.9):** cableado del equipo, misiones, compañeros reclutables y un saldo inicial de monedas, todo implementado en cada mundo inicial que carecía de estos elementos; los diez mundos ahora comparten una superficie de juego uniforme y completamente iluminada (el equipo era exclusivo de los gladiadores; las misiones eran solo de fantasía o zombis; cinco mundos se lanzaron con `recruit` sin ningún personaje reclutable). Además, se incluye un validador de contenido estructural que detecta errores tipográficos en los ID de los objetos en todas las superficies de referencia, y se ofrecen múltiples ranuras de guardado con `--checkpoint`/`--list-checkpoints`.
- **NPC con vida, realmente vivos (v3.0):** el generador persistente de la agencia de los NPC activa la sección **PERSONAJES** del Director; los NPC con nombre (un personaje de la historia por partida inicial, más todos los compañeros que reclutas) tienen objetivos, relaciones de confianza/miedo/avaricia/lealtad, un registro de obligaciones y cadenas de consecuencias. `runNpcAgencyTick` se ejecuta en cada ronda, con restricciones para que un mundo sin NPC con nombre siga siendo idéntico a las partidas anteriores. La activación del generador también activa los puntos de inflexión de la partida de los compañeros, dos reglas inactivas para generar oportunidades (objetivo del NPC + obligación) y el npcProfiles/npcObligations del final del juego. El código se probó y funcionó correctamente, pero permaneció inactivo en el contenido publicado hasta que una auditoría de la Fase 9 lo detectó, por lo que la solución consiste en incluir un NPC con nombre en cada partida inicial.
- **La totalidad de la interacción social (v3.0):** los cuatro verbos clave se convierten en veinticinco; los grupos de diplomacia y sabotaje se registran (21 subverbos más), lo que activa las reacciones de los personajes secundarios que antes estaban inactivas `leverage-diplomacy` / `leverage-sabotage`; diecinueve opciones aparecen en el menú numerado (disponibilidad + tiempo de espera + reputación como requisitos). Las condiciones y los efectos del diálogo ahora leen y modifican el estado social (influencia / reputación / relación con los personajes no jugables). Además, la influencia pasiva (`tickLeverage` / `computeLeverageGains`) se obtiene gradualmente a partir de la reputación y otorga favores / poder de chantaje / legitimidad a partir de la experiencia y los logros, de modo que la capa social genera beneficios *entre* oportunidades, no solo al completarlas.
- **Economía con sabor de género (v3.0):** el inventario de los comerciantes y las recetas de elaboración ahora se resuelven según las tablas de género específicas de cada personaje inicial (siete de los diez personajes iniciales tienen contenido de género definido; los tres restantes recurren a contenido universal). Esto se aplica a las mecánicas de compra/elaboración, la visualización del menú numerado y la sección de RECETAS del Director, todo ello vinculado a la misma base de reglas para garantizar que la visualización y las mecánicas coincidan. `repair` y `modify` son ahora filas numeradas del menú (pares de objeto y receta), y `escort` oportunidades aparecen en una puerta que permite viajar de forma segura por un distrito peligroso.
- **La fase final del juego refleja la influencia que has conseguido (v3.0):** los finales de campaña `victory`, `puppet-master` y `quiet-retirement`, que antes dependían de la influencia, el chantaje o la legitimidad, y que la fase final del juego interpretaba como un valor fijo de cero, ahora son accesibles gracias a la verdadera influencia que se acumula en toda la economía social. También es posible lograr la partida del compañero, a través de puntos de inflexión de la agencia de los personajes no jugables y un mecanismo de respaldo para mantener la moral.
- **CLI de desarrollo `audit-content` (v3.0):** un comando para auditar el contenido destinado a los desarrolladores (similar a `validate`, pero distinto del Director's Ledger, que es la herramienta que utiliza el usuario) que ejecuta los seis formatos para los encuentros, jefes y combates en un paquete.
- **Un *conjunto inicial* con sabor temático — el punto de partida de v3.0, entregado (v3.1):** `economyGenre` entrelaza la clave del conjunto de reglas básicas de cada personaje a través de `buildWorldStack` → `createEconomyCore`, de modo que un distrito ahora establece el perfil `GENRE_SUPPLY_DEFAULTS` de su género (el cyberpunk se centra en componentes y contrabando, la fantasía en la escasez de medicamentos) en lugar de una base universal plana; este es el conjunto inicial que define el tono del mercado del Director y las entradas del juego final, que ya están establecidas. Siete de cada diez personajes tienen un perfil de género; los tres restantes vuelven a la base, para ser honestos. Un campo separado de `tradeGenre` / `craftingGenre` para que los tres puedan divergir más adelante.
- **La superficie social, completa (v3.1):** `deny` y `bury-scandal`; este par, que manipula rumores y se dirige a un rumor existente mediante su identificador en lugar de a una facción, accede al menú numerado a través de una dimensión de asociación rumor-objetivo, cerrando así la superficie de veintiún verbos (19 → 21 elementos en la superficie).
- **`obligation-exists` diálogo, conectado y accesible (v3.1):** la condición de diálogo lee el registro de obligaciones persistente de un NPC con nombre (`getPersistedNpcObligations`); por ejemplo, en el caso de Aldric, un personaje de fantasía, una vez que te debe un favor a través de la mecánica de juego estándar de los NPC, se desbloquea una `call-in-favor` opción: una puerta real donde v3.0 dejó un fragmento silencioso que siempre es válido (una auditoría de la fase 9 de una sesión de juego demostró que se podía acceder a él en una partida real, no solo en pruebas).
- **Reparación con elementos distintivos del género (v3.1):** cada autor que crea un personaje inicial con características de un género específico escribe una receta característica `repair` en la tabla de su género (fantasía `repair-rune-mend`, ciberpunk `repair-nanite-weld`, …), que se muestra a través de `getAvailableRecipes`; ahora la reparación tiene elementos distintivos, y no es simplemente universal.
- **Activación opcional del acuerdo de liquidación del libro de cuentas XRPL (v3.2):** un nuevo paquete `@ai-rpg-engine/ledger-adapter` opcional vincula la capa comercial propiedad del jugador. — `coin` → un pagaré, consumibles → tokens fungibles, la diferencia neta `buy`/`sell` de un punto de control → un acuerdo de depósito en garantía de tokens **XLS-85** establecido, que se aplica a la **red de pruebas XRPL**, y que está completamente fuera del núcleo determinista. Nada en `core`/`modules` lo importa y la ejecución es idéntica en términos de bytes, ya sea con o sin él (esto se ha comprobado en el bucle real del comerciante pirata `createGame()`). Solo para la red de pruebas, protegido por una restricción que lo haría imposible de implementar en la red principal mediante código, con un archivo secundario de secretos excluido del control de versiones (gitignored), reintentos seguros para evitar la pérdida de datos, verificación de memorandos en la cadena de bloques y una opción de respaldo no anclada; se ha demostrado su funcionamiento completo en la red de pruebas (liquidación mediante depósito en garantía de tokens → `reconcile` en comparación con los saldos y memorandos registrados en el libro mayor). Nuevos y exclusivos objetos NFT disponibles en v3.3 (abajo). Consulte [el adaptador del libro mayor de XRPL](#el-adaptador-del-libro-mayor-xrpl-opcional).
- **Equipamiento único como NFT (v3.3):** el `@ai-rpg-engine/ledger-adapter` vincula el equipamiento único del paquete `equipment` — el "fragmento" diferido de v3.2 — a los NFT de XRPL: cada artículo único se crea como un **XLS-20 NFToken** (`tfMutable`, que no se puede destruir, lo que garantiza la propiedad real del jugador) en un punto de control, y el crecimiento de la reliquia actualiza los metadatos de un NFT mutable en su lugar mediante **XLS-46 `NFTokenModify`**, y una familia de propietarios `reconcile()` verifica en el libro mayor `account_nfts`. Existe una ruta de lectura distinta para el conjunto de equipamiento, que se utiliza junto con la capa fungible, con el mismo cortafuegos de determinismo y que es idéntica en bytes, con o sin ella. Se ha probado en la sesión real de `starter-gladiator` y está disponible en la red de pruebas (crea el `trident-and-net` equipado como un NFT, tenlo en el libro mayor, reconcílialo y el mundo seguirá sin cambios).
- **Equipamiento que se hace famoso (v3.4):** el crecimiento de las reliquias ha existido desde v3.3, pero nunca se había activado durante el juego; nada se registraba en el historial de un objeto en una partida en curso, por lo que la versión de reliquia de cada objeto era permanentemente `0`. Ahora se incluye: un módulo **opcional `item-chronicle-core`** registra `acquired` / `used-in-kill` / `recognized` de partidas reales, y `starter-gladiator` lo conecta: gana tres combates en la arena y el tridente del retiarius se convierte en el **Tridente y Red Sangrientos** para el resto de la partida, mostrándose en el HUD y en el registro del Director. Esto también **cierra el ciclo NFT**: un punto de control establece ese crecimiento como un **XLS-46 `NFTokenModify`** real, avanzando la URI en el registro y preservando el NFTokenID. Se corrigió en el proceso: `boss-kill` y `recognized` eran inaccesibles en cada paquete lanzado (una simple comprobación de la etiqueta `boss` contra el contenido que etiqueta `role:boss`, y una protección de facción contra el contenido en el que ninguna entidad establece una) y, en el segundo caso, se estaba bloqueando silenciosamente *todo* el crecimiento de la armadura. Opcional por diseño: un paquete que no lo incluye es idéntico en bytes al motor que se lanzó antes de su existencia.
- **Consecuencias que dejan huellas reales (v3.8):** la capa estratégica se activó después de v3.7 — se generaron ofertas, se resolvieron, y el narrador pudo comunicar el resultado — y luego el mundo lo olvidó. `applyOpportunityFallout` declaró **catorce** tipos de efectos y persistieron **seis**: una obligación anunciada e ingresada en ningún registro, un rumor que no se propagó a nadie, un título que no otorgó ningún título. Los catorce persisten ahora, cada uno a través del escritor del sistema propietario, y dos de ellos **cierran los circuitos de retroalimentación** — una obligación escrita en el sistema se mueve hasta el punto de inflexión de la lealtad que decide qué te ofrece a continuación un NPC, y la confianza movida por el sistema abre la puerta a través de la cual se leen esas ofertas. Resultó que tres tipos de efectos desaparecieron un nivel ANTES que un sistema inactivo (`materials` y `spawn-opportunity` no fueron emitidos por nada en absoluto; cada `spawn-pressure` productor se basó en una resolución que ningún camino implementado podía alcanzar), por lo que el ciclo generó productores en lugar de construir defensas que nunca podrían activarse. La operación `betray` se implementa como la cuarta transición e ilumina **seis puntos de obligación, tres rumores y los tres productores originales de presión** que se habían generado en versiones anteriores y a los que no se podía acceder. Una **auditoría de registro** a nivel de sesión encontró entonces tres sistemas MÁS en la aplicación de presión que nadie había señalado, lo que es lo que ofrece la conciliación en ambas direcciones en comparación con un escaneo independiente. Y el duodécimo iniciador, **Hue and Cry**, se genera a la inversa de la capa de consecuencias: un ladrón en una ciudad sin fuerzas policiales, con una puntuación de 7/7 en la rúbrica del paquete.
- **La capa estratégica, iluminada (v3.7):** el nivel superior a los verbos que definen las acciones inmediatas, donde surgen las oportunidades, los compañeros influyen pasivamente y los distritos tienen estados de ánimo, estaba a medio iluminar, y nada podía verlo. Una nueva sonda a nivel de catálogo activa los once paquetes y ejecuta **cuarenta rondas completas** a través del mismo controlador que utiliza la CLI interactiva (turnos de los personajes no jugables, turnos de los compañeros y, a continuación, el ciclo del mundo), porque `runWorldTick` es una función por ronda en lugar de un verbo, y una sonda construida únicamente a partir de `submitAction` solo ve la mitad de una ronda para siempre. Midió **uno de los ocho tipos de oportunidades** que se activaban en el contenido publicado. Los **ocho se activan ahora**, cada uno con una prueba de la sesión de juego que demuestra que la recompensa realmente se obtuvo, y uno que deliberadamente agota el tiempo, de modo que las consecuencias de una fecha de caducidad (pérdida de reputación, un distrito con más necesidades) se demuestren en contenido real en lugar de suponerse. Lo que estorbaba nunca fueron las reglas: `contract` necesitaba un personaje no jugable que fuera tanto aliado como codicioso, lo que la tabla de puntos de control hace mutuamente excluyente con `favorable`, y `relations['player-trust']` se había creado exactamente UNA VEZ en todo el catálogo; las economías de los distritos eliminaron su propio carácter de género y etiqueta en aproximadamente 15 rondas al desplazar cada categoría a un valor universal de 50; `world.factions[].reputation`, la base creada que el motor fusiona explícitamente, no fue establecida por ningún paquete, por lo que cada mundo comenzó en un cero absoluto con todos. El **ritmo** se ajusta en función de los resultados identificados en lugar del gusto, cada uno de ellos se cita en la constante que lo rige (sobrecarga de opciones, variación de misiones, momentos de relajación, repetición radiante, dinámica de citas) y se protege mediante una regresión determinista. **Doce de los trece** campos de modificación de compañeros y distritos ahora alcanzan una función de resolución a través de una conexión de parámetros, cada uno con una contribución específica en la carga útil, de modo que la interfaz de usuario pueda indicar QUIÉN ayudó; un modificador calculado pero no renderizado es experiencialmente idéntico a la ausencia de modificador. `use` **deja de destruir cosas en silencio**: 89/90, los elementos creados en todo el catálogo, eran consumidos por un verbo que no tenía ningún efecto y los eliminaba de todos modos, informando del éxito. Y el contrato `statusTags`, declarado por los once paquetes y no aplicado por ninguno, está vinculado: las declaraciones se ampliaron primero a la verdad publicada y, a continuación, se limitaron.
- **El instrumento activó el catálogo (v3.6):** el paquete diseñado para UTILIZAR el libro mayor ahora se ejecuta deliberadamente como un instrumento para optimizar el motor. Una auditoría de **alcance verbal** a nivel de todo el catálogo activa los once paquetes y SOMETE cada verbo al motor real, preguntando si algún objetivo en el mundo activado lo acepta; se trata de una prueba que ningún sistema de verificación existente podría superar o fallar, porque la verificación de la integridad verbal compara la tabla de ayuda con los controladores registrados y nunca examina el contenido. Ejecutado antes de cualquier corrección, detectó `recruit`, que se anunciaba en Salt Road Ledger, con cero NPC reclutables (el defecto v2.9, reintroducido) y `use` inactivo en todo el catálogo del paquete. `give` se incluye como la **primera transferencia de elementos de entidad a entidad** del motor: atómica, con rechazo estructurado y sellada con la marca de tiempo del evento, lo que cierra una brecha en la que un paquete podía hacer que un elemento fuera accesible y no tener nada que pudiera entregárselo a nadie. Y los dos ejes de adaptador restantes que eran indicadores de configuración con **cero lecturas de comportamiento** se convirtieron en comportamientos: `diary` modo (observado, no custodiado: un ancla por punto de control, sin líneas de confianza, la conciliación verifica la cadena de anclas) y `issuerMode: 'persistent'` (un mercado que perdura más allá de la ejecución). Se ha demostrado que funciona correctamente en **15 de 15 pruebas en la red de pruebas en vivo de XRPL**.
- **Un juego cuyo ciclo se basa en la deuda (v3.5):** el undécimo juego de la serie, **Salt Road Ledger**, es el primero que se diseñó a partir de un sistema en lugar de un género; juegas como un factor que realiza operaciones con el capital de otra persona, y cinco verbos de comercio (`appraise` / `haggle` / `consign` / `underwrite` / `audit`) impulsan el juego, mientras que el combate se considera una penalización (el perfil de recursos tiene una matriz `gains` vacía; nada recompensa la violencia). `consign` es el único verbo en el catálogo cuya semántica fuera de línea coincide directamente con una primitiva de asentamiento, lo que lo convierte en el paquete de referencia para el adaptador del libro mayor, sin depender de él. Se incluye con el género `mercantile` y un perfil de economía mercantil, y obtiene una puntuación de 7/7 en la rúbrica del paquete. El mismo ciclo hizo que dos ejes de adaptador que habían estado inactivos durante mucho tiempo se volvieran reales: el campo de nota `VERB:` (declarado con miembros que ningún sitio de llamada podría emitir) y `config.settlement` (declarado con cero lecturas en cualquier lugar), y una auditoría de la sesión de juego del nuevo paquete reveló seis mecánicas que estaban implementadas, eran válidas según el esquema, estaban en verde a nivel de unidad y estaban inactivas.
- `ai-rpg-engine create-starter <name>`: crea la estructura básica de un nuevo juego (independiente, se ejecuta fuera del monorepositorio); `validate` + `scaffold`: comandos para gestionar el contenido; carga paquetes desde archivos JSON.
- Se ha publicado una plantilla inicial en npm (`@ai-rpg-engine/starter-template`).
- Conjunto completo de pruebas: **8368 pruebas** (resultados consistentes en ejecuciones repetidas; los archivos de prueba se someten a verificación de tipos en el entorno de integración continua; se aplica un mecanismo para garantizar una cobertura mínima).

**Qué es lo que está incompleto o es rudimentario:**
- El estudio de creación de mundos con IA (capa de Ollama) está menos probado que el núcleo de simulación y necesita un demonio de Ollama local; es completamente opcional; el motor y el bucle `run` no necesitan conexión de red.
- La pila de narración/audio genera comandos de audio deterministas, pero no hay **ningún backend de audio terminal**: nada reproduce sonido en `run`. El escenario de Godot es el primer entorno que realmente reproduce los identificadores de audio `felt` (mezclador + TTS opcional). Las superposiciones de sonido no deben reemplazar el sonido ambiental de la zona.
- El modo multijugador (dos jugadores humanos que comparten un mundo) **no** está implementado; es una capa de red, deliberadamente fuera del alcance; los perfiles actuales están diseñados para un solo controlador.
- `replay --replay` restaura la partida guardada en lugar de volver a simularla, y después de v2.9, esa es la **dirección** definitiva, no una postergación: `Engine.serialize()` ya es una instantánea completa y probada del estado, mientras que la re-simulación tendría que rastrear el estado del mundo/encuentro que existe fuera del registro de acciones. v2.9 incluye ranuras de guardado con múltiples puntos de control en esa ruta de restauración probada; la re-simulación basada en eventos reales no está prevista.
- v3.1 cerró las tres zonas con nombres específicos de v3.0: el **stock inicial** del género, las recetas de *reparación* específicas del género y la superficie del menú `deny` / `bury-scandal` se incluyen ahora. El único límite que queda es que esas nuevas recetas de reparación del género incluyen un `statDelta` (un pequeño bono de estadísticas) que `resolveRepair` aún no aplica; la reparación *restaura*, `modify` *mejora*, por lo que la reparación como mejora está marcada en el código y se **pospone a v3.2/v3.3** como una mecánica deliberada, no como un campo inerte silencioso. Y `obligation-exists` se incluye con una demostración creada (el hermano Aldric); la condición está activa para que los creadores de contenido puedan agregar más diálogos.
- La documentación es extensa, pero no todas las páginas del manual reflejan las API más recientes.

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
| **Core Runtime** | Motor determinista: estado del mundo, eventos, acciones, ciclos, RNG, repetición |
| **Modules** | Más de 30 sistemas componibles: combate, percepción, cognición, facciones, desplazamiento, compañeros, etc. |
| **Content** | Entidades, zonas, diálogos, objetos, habilidades, estados: creados por el autor |
| **AI Studio** | Capa de Ollama opcional: creación de prototipos, crítica, análisis de equilibrio, ajuste, experimentos |

---

## El adaptador del libro mayor XRPL (opcional)

`@ai-rpg-engine/ledger-adapter` es un paquete **opcional** que vincula la
**capa de objetos intercambiables propiedad del jugador** de un juego —el saldo de `coin` y el inventario de objetos consumibles que ya gestionan los verbos `trade-core`, `buy` y `sell`— a la **red de pruebas XRPL**, de modo que
estos activos puedan estar respaldados por tokens reales registrados y liquidarse en puntos de control.
La ausencia de un adaptador es exactamente el motor sin conexión que se ofrece actualmente.

**La invariante del determinismo (el objetivo principal).** El adaptador es un *canal secundario*, que nunca forma parte de la simulación:

- Nunca se invoca dentro del ciclo determinista, solo en los **puntos de control** (guardado, entrada a la ciudad/mercado, final del capítulo).
- Nada en `@ai-rpg-engine/core` o `@ai-rpg-engine/modules` lo importa (su única dependencia del motor es una `import type` en tiempo de compilación).
- **Una ejecución es idéntica en bytes con o sin él.** Una prueba de firewall ejecuta el bucle de comerciante `starter-pirate` `createGame()` real en dos motores, uno con el adaptador habilitado y liquidando en un punto de control, y afirma que los dos mundos son profundamente iguales. La repetición de la semilla 0 no se ve afectada.

**Niveles de integración: un juego lo integra tan profundamente como su diseño lo requiera.** El firewall es un límite de *determinismo*, no una regla anti-integración; la invariante anterior se mantiene en todos los niveles:

| Nivel | Qué depende del adaptador | Se ajusta |
|-------|-----------------------------|------|
| **L0 — External observer** | Nada dentro del juego; el adaptador se adjunta desde el exterior en los puntos de control y el juego no es consciente de ello. | Adaptación de un juego existente (la demostración de piratas incluida). |
| **L1: puntos de control impulsados por el juego** | El flujo de guardado/ciudad/progresión meta del juego llama al adaptador en momentos definidos. | Un juego que desea momentos deliberados en el libro mayor. |
| **L2 — Ledger-native design** | La economía o la identidad del juego están diseñadas *en torno a* la propiedad en la cadena (emisor persistente, mercados reales). | Un juego de comerciantes primero en el libro mayor. |

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
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Comerciante inicial: la persecución como bucle, y qué mitad de la ciudad te abrirá una puerta |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Opcional:** liquidación opcional en la red de prueba de XRPL para la capa comercial de propiedad del jugador, a través de un depósito de tokens XLS-85 en los puntos de control, completamente fuera del núcleo determinista |

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
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crear un nuevo juego: ruta CLI o plantilla manual |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Crea tu propio juego componiendo módulos del motor. |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Resolución de reglas por entidad: combate de estilo de juego mixto, `applyProfile`, plantillas de perfil, la CLI `profile`. |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Liquidación opcional en el libro mayor: el cortafuegos del determinismo, niveles de integración L0/L1/L2, modos de juego, medidas de seguridad y la demostración de pirata probada en vivo. |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Seis pilares de combate, cinco acciones, estados de un vistazo. |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | buildCombatStack paso a paso, mapeo de estadísticas, perfiles de recursos. |
| [Visual Clients](site/src/content/docs/handbook/66-visual-clients.md) | Hosts de sidecar, carga simulada, puerto dimétrico de Godot: la presentación puede ser engañosa, la ocupación sigue siendo un ID de zona. |
| [Handbook](site/src/content/docs/handbook/index.md) | Manual completo: todos los sistemas, más 4 apéndices. |
| [Composition Model](docs/composition-model.md) | Las 6 capas reutilizables y cómo se componen. |
| [Examples](docs/examples/) | Ejemplos ejecutables de TypeScript (verificados por tipo y probados en cuanto a comportamiento en CI): fiesta mixta por entidad, perfiles compartidos, entre mundos, desde cero. |
| [Design Document](docs/DESIGN.md) | Análisis profundo de la arquitectura: canalización de acciones, verdad frente a presentación. |
| [Philosophy](PHILOSOPHY.md) | Mundos deterministas, diseño basado en la evidencia, IA como asistente. |
| [Changelog](CHANGELOG.md) | Historial de lanzamientos. |

---

## Hoja de ruta

### Dónde estamos ahora

Ambas líneas de composición están completas: **8368 pruebas en 388 archivos**, los 12 iniciadores en `buildCombatStack` **y** `buildWorldStack`, reproducción determinista e idéntica byte a byte bajo semillas impresas, puntuación completa de la toma de decisiones de la IA y una CLI que crea, ejecuta, valida e inspecciona. El arco v3.x hizo que el mundo estuviera activo (NPC con nombre, la superficie social de 25 verbos, economías de género: v3.0–v3.1), colocó activos de propiedad del jugador en la testnet de XRPL como un canal secundario opcional (v3.2–v3.4), creó dos iniciadores centrados en el sistema y los convirtió en instrumentos de mejora del motor (v3.5–v3.6), iluminó y reforzó la capa estratégica hasta que las consecuencias dejan marcas reales (v3.7–v3.8), proporcionó a los hosts la superficie del motor que necesita Godot (v3.8.1), cerró el ciclo de creación para que una sesión de estudio o un paquete JSON básico produzca un mundo jugable de principio a fin (v3.9), colocó toda la capa estratégica en los sentidos del jugador (v3.10), afinó la profundidad que ahora alcanzan esos sentidos (v3.11) y **proporcionó a un host de dibujo la sensación de un ciclo: el primer cliente de píxeles, un puerto dimétrico de Godot 4, se ejecuta en ese contrato (v3.12)**.

**Arco de lanzamiento reciente (v2.4.0–v3.0.0):**
- v2.4.0: combate de fiesta (ataque a aliados / curación / mejora / reanimación, amigo-enemigo AoE), sistema de efectos de estado (modificadores + DoT/HoT + desencadenantes reactivos), fase 1 de perfiles complementarios, contenido `validate`/`scaffold` CLI.
- v2.5.0: resolución de reglas por entidad (combate de estilo de juego mixto), el cargador `applyProfile` + habilidades por entidad, plantillas de perfil + `profile` CLI y un pase de salud completo.
- v2.6.0: el comando `run` se convirtió en un juego real: los enemigos actúan según sus propios perfiles de IA, victoria/derrota, guardar/reanudar, habilidades y XP en el menú, el contenedor de estudio `ai` y la pila de narración.
- v2.7.0: el mundo reacciona y hay una razón para regresar: calor → presiones → consecuencias narradas, encuentros de entrada de zona, un ciclo de búsqueda + diario, equipo en combate, ejecuciones reproducibles con semillas, entradas de juego final en vivo, `buildWorldStack`, el Libro del Director y una costura de migración de guardado.
- v2.8.0: actúa sobre el mundo en el que vives: una economía comercial en vivo + `sell` verbo, compañeros que reclutas y con los que luchas, y un Libro del Director que lee todo el tablero: un cable de escritura por sistema encendido ~12 consumidores que se enviaron en modo oscuro.
- v2.9.0: cierra los ciclos: `buy` + el inventario del comerciante y la creación completan la economía; los compañeros realizan turnos independientes; cuatro verbos sociales (soborno / intimidación / petición / siembra) se ejecutan en una economía de apalancamiento financiada por recompensas de oportunidad; las oportunidades se resuelven con caducidad + consecuencias de pérdida de favor; y el equipo, las misiones, los reclutables y la moneda inicial se distribuyen uniformemente a los diez iniciadores.
- **v3.0.0: haz que el mundo esté vivo: el productor de agencia de NPC enciende los NPC con nombre (objetivos / relaciones / libros de contabilidad de obligaciones / cadenas de consecuencias) más un NPC de historia en cada iniciador; la superficie social crece hasta los 25 verbos (diplomacia + sabotaje) con ingresos pasivos de apalancamiento y un diálogo que lee el estado social; inventario y recetas de género por iniciador; los finales de apalancamiento (victoria / titiritero / jubilación tranquila) se vuelven alcanzables; filas de menú de reparación/modificación, oportunidades de escolta y una CLI de desarrollo `audit-content`: se enviaron a través de una auditoría de la fase 9 que detectó dos cables rotos que ocultó la suite de pruebas verdes.**

### Siguiente

v3.12 cerró el contrato simulado y el primer host de dibujo. Lo que queda es un trabajo de ciclo posterior, no los restos de este:

- Un ambiente de cama de familia próspera (el puente de tono y el envío de rol por zona; CORE todavía no tiene un tronco próspero).
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

- La capa de IA (`@ai-rpg-engine/ollama`) se comunica con un daemon de Ollama **local**; su opción de participación `webfetch` (para RAG) está limitada por una protección contra SSRF (bloquea loopback/link-local/CGNAT/metadatos de la nube y IPv6-tunnelled equivalentes).
- La capa de libro mayor (`@ai-rpg-engine/ledger-adapter`) se conecta a la **red de pruebas XRPL** —y solo a la red de pruebas: una protección estructural **imposible en el código para la red principal** (no una opción de configuración) rechaza cualquier host que no sea de la red de pruebas durante la construcción. Las semillas de la billetera se almacenan en un archivo secundario de secretos ignorado por Git, nunca en un archivo guardado, y el núcleo determinista nunca importa el adaptador.

Consulte [SECURITY.md](SECURITY.md) para obtener más detalles.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licencia

[MIT](LICENSE)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
