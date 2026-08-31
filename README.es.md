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

Un conjunto de herramientas de TypeScript para crear simulaciones de RPG deterministas. Define las estadísticas, elige los módulos, configura una pila de combate y crea contenido. El motor gestiona el estado, los eventos, el RNG, la resolución de acciones y la toma de decisiones de la IA. Cada ejecución es reproducible.

Este es un **motor de composición**, no un juego completo. Los 12 mundos iniciales son ejemplos: patrones que se pueden descomponer, de los que se puede aprender y que se pueden reutilizar. Tu juego utiliza el subconjunto del motor que necesites.

---

## De qué se trata

- Una **biblioteca de módulos**: más de 30 módulos del motor que cubren el combate, la percepción, la cognición, las facciones, los rumores, el movimiento, los compañeros y más.
- Un **conjunto de herramientas de composición**: `buildCombatStack()` configura el combate en aproximadamente 7 líneas; `new Engine({ modules })` inicia el juego.
- Un **entorno de ejecución de simulación**: ciclos deterministas, registros de acciones reproducibles, RNG con semillas.
- Un **estudio de diseño de IA** (opcional): andamiaje, crítica, análisis de equilibrio, ajuste, experimentos a través de Ollama.
- Una **capa opcional en la cadena de bloques**: `@ai-rpg-engine/ledger-adapter` respalda la moneda y los elementos intercambiables de un juego con tokens reales de la **red de prueba** XRPL, que se liquidan en puntos de control, completamente fuera del núcleo determinista (opcional; una ejecución es idéntica en bytes sin ella).

## De qué no se trata

- No es un juego completo: incluye 12 mundos iniciales jugables que puedes `run` hoy como ejemplos, y el motor es el conjunto de herramientas con el que puedes crear *tu propio* juego.
- No es un motor visual: genera eventos estructurados, no píxeles.
- No es un generador de historias: simula mundos; la narrativa surge de la mecánica.

---

## Estado actual (v3.9.0)

**What works and is tested:**
- **The pack you author is the game you play (v3.9):** the studio now authors everything the engine boots — `create-ruleset`, `create-rule-profile`, and `create-item-placement` join the scaffold verbs, and both `/build` plans and `ai scaffold-and-critique` end by emitting `content/pack.json`. `applyContentPack` stamps `playerId`/`locationId` from a one-player pack, lands faction reputation baselines and rule-profile registries (merged, never wiping the host's), and carries the pack's manifest and ruleset through `extractSessionContent` — the documented JSON boot recipe is corrected and pinned by an end-to-end test. Dialogue gains live texture: an NPC mentions the contract actually on the table, arriving with companions or into a grim district reads that way, and the move advisor speaks a player-facing line. Campaign memory journals companion saves and crafted items, image variants keep their identity locks (with LoRA support), rumor stances fade, and a victory sting no longer kills the zone theme. 8042 tests.
- **The host surface is on the Engine (v3.8.1):** `hash`, `present`, `preview`, `getAvailableActions`, `advanceRound`, sidecar `listActions` + save/load, studio `emit-pack`, JSON pack catalogs and `ruleProfiles`. A Godot attach and a JSON `--content` boot no longer copy CLI internals to invent those seams.
- Core runtime: world state, events, actions, ticks, replay — stable since v1.0; deterministic byte-identical replay (per-instance id counter, seeded RNG)
- Combat system: 5 actions, 4 combat states, 4 engagement states, companion interception, defeat flow, AI tactics
- Abilities: costs, cooldowns, stat checks, typed effects, 11-tag status vocabulary, AI-aware selection
- **Party combat (v2.4):** ally-targeting (heal / buff / revive), friend/foe AoE filtering, target selectors — a healer can heal a teammate; enemy AoE spares allies
- **Status effects (v2.4):** passive stat modifiers reach combat, deterministic DoT/HoT off the tick counter, depth-capped reactive triggers (thorns/reflect)
- **Plug-in Profiles — per-entity rule resolution (v2.5):** a `might` fighter and a `will` mystic resolve combat in one fight, each reading stats through its own mapping. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` attaches a profile (stat mapping, resource pools, per-entity abilities); `buildProfile()`, `validateProfileSet()` (duplicate ids rejected), 10 starter-derived templates, and a `profile` CLI command
- **Playable `run` loop (v2.6):** the terminal game is real, not a demo — enemies act on their own AI intent profiles (`aggressive`/`cautious`/`territorial`/`calculating`), a fight ends in victory or defeat, you can save and resume, and abilities and XP are on the action menu. `run <path>` loads a game you scaffolded. Composed terminal UI with a glance-able HUD and accessible color (honors `NO_COLOR` / non-TTY)
- **AI design studio ships as its own `ai` command (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — scaffold, critique, and balance content against a local Ollama model
- Unified decision layer: combat + ability scoring merged into one call (`selectBestAction`)
- All 12 starter worlds use `buildCombatStack()` — the proven composition spine
- Cognition config API (`cognition: CognitionCoreConfig | false`) for per-starter AI tuning
- Tag taxonomy and validation utilities for content authoring
- **The world reacts (v2.7):** kills accrue heat and erode district safety; a per-round world tick spawns hidden pressures that surface as rumors ("Whispers reach you…"), escalate, and expire with consequences; the ~30 authored encounter compositions fire on zone entry in all 10 starters — deterministic per-seed, bloodier districts spawn more, boss set-pieces protected
- **A reason to return (v2.7):** a minimal quest loop on the long-shipped schema — quests offer on triggers, track kill/reach/progress objectives, and pay XP and items exactly once; four authored quests, a **Journal** screen, quest beats in the round's narration
- **Equipment reaches combat (v2.7):** `equip`/`unequip` move real numbers through the status layer the combat formulas already read — zero combat-code changes; gladiator's trident-and-net is wired end-to-end with a test-pinned hit-chance delta
- **Seeded runs (v2.7):** every fresh session prints its seed with the exact replay command; `--seed <n>` reproduces a session byte-for-byte; combat, resist, ability, and tactics rolls all consume the world seed — and endings read the run you actually played (live heat, pressures, faction accruals, player level)
- **`buildWorldStack()` (v2.7):** the strategic composition spine beside `buildCombatStack()` — one call assembles environment, factions, rumors, districts, defeat fallout, encounters, and quests; plus the **Director's Ledger** strategy screen, an `AI_RPG_DEBUG=1` simulation inspector, `inspect-save` gated by the same authorities as Continue, and a module save-migration seam on the shipped restore path
- **Act on the living economy (v2.8):** `createEconomyCore` seeds a per-district economy at pack-load and ticks it each round; a new `sell` verb prices loot through `computeItemValue` (scarcity / faction / provenance / contraband) and shifts local supply. One write-wire lit five systems that shipped dark in v2.7 — the Director's MARKET OVERVIEW + FACTIONS scoring, the endgame merchant-prince arc and collapse trigger, and four economy pressure kinds. **Sell-only this cycle** (buying → v2.9)
- **Companions (v2.8):** a `recruit` verb builds a party — state, tags, and faction, so a companion fights *with* you; companion combat rides combat-core's interception mechanic (dark until `isAlly` got set), companions react with morale and can depart, and recruiting lights seven waiting consumers — the finale's COMPANIONS roll-call, party targeting, npc-agency goals, favor-quests, and the Director's PARTY section. **Passive interception this cycle** (independent turns → v2.9)
- **The Director reads the whole board (v2.8):** a new EQUIPMENT Ledger section (behind the cli→equipment provenance dependency), a DIRECTOR'S SUMMARY finale trailer, the MARKET OVERVIEW + PARTY sections now fed from live producers, and district stability + economic tone in the finale's DISTRICTS section
- **The economy's other half (v2.9):** a `buy` verb completes the loop — merchant stock offered per district at supply-category granularity (supply level *is* the restock signal), priced through the same `computeItemValue` pipeline as `sell` plus a buy/sell spread so there's no riskless round-trip. And crafting comes alive: `createCraftingCore` registers `salvage`/`craft`/`repair`/`modify` over the authored recipe tables, lighting the Director's MATERIALS + RECIPES sections that shipped dark
- **Companions take their own turns (v2.9):** the passive-interception floor from v2.8 becomes the ceiling — recruited companions act independently each round through the previously-unused `selectBestAction` advisor, with a per-role combat bias so a fighter and a scholar fight differently, companion-on-companion interception, and party HP on the Director's PARTY line. Companion-less packs stay byte-identical (the empty-party gate preserves seed-0 legacy replay)
- **The social layer, connected end to end (v2.9):** four leverage verbs — `bribe`, `intimidate`, `petition`, `seed` (rumor) — write real reputation / alert / heat globals that trade pricing and faction gates already read, and `seed` lights the whole player-rumor module + the Director's RUMORS ABOUT YOU section. The leverage *economy* that funds them is wired too: completing an opportunity now grants the leverage it always narrated, so the verbs are genuinely earnable in play
- **Opportunities, the full lifecycle (v2.9):** a per-round spawner offers contracts/bounties/favors scored against live world state; you `accept`, then `complete` or `abandon`; ignoring one to its deadline now has consequences (expiry fallout), and completing a companion favor moves that companion's morale. The endgame's rising-power and merchant-prince arcs read the opportunities you actually resolved
- **Content parity across all ten starters (v2.9):** equipment wiring, quests, recruitable companions, and a starting coin balance rolled out to every starter that lacked them — the ten worlds now share a uniform, fully-lit feature surface (equipment was gladiator-only; quests were fantasy/zombie-only; five worlds shipped `recruit` with no one to recruit). Plus a structural content validator that catches a typo'd item id across every reference surface, and multi-checkpoint save slots with `--checkpoint`/`--list-checkpoints`
- **Living NPCs, actually alive (v3.0):** the persisted npc-agency producer lights the Director's **PEOPLE** section — named NPCs (one authored story character per starter, plus every companion you recruit) carry goals, trust/fear/greed/loyalty relationships, an obligation ledger, and consequence chains. `runNpcAgencyTick` runs each round, gated so a world with no named NPCs stays byte-identical to legacy replay. Lighting the producer also lit companion favor-fallout departure breakpoints, two dormant opportunity spawn rules (npc-goal + obligation), and the endgame's npcProfiles/npcObligations — the wire was tested green but inert in shipped content until a Phase-9 audit caught it, so the fix ships an authored named NPC in every starter
- **The full social surface (v3.0):** the four leverage verbs become twenty-five — the diplomacy and sabotage groups register (21 more sub-verbs), lighting the previously-dark `leverage-diplomacy` / `leverage-sabotage` companion reactions; nineteen surface on the numbered menu (afford + cooldown + reputation gated). Dialogue conditions and effects now read and write social state (leverage / reputation / npc-relationship). And passive leverage income (`tickLeverage` / `computeLeverageGains`) drips influence from reputation and grants favor / blackmail / legitimacy from XP and milestones — so the social layer earns *between* opportunities, not only on completion
- **Genre-flavored economy (v3.0):** merchant stock and crafting recipes now resolve per-starter genre tables (seven of ten starters carry authored genre content; three fall back to universal, honestly) — across the buy/craft mechanics, the numbered-menu display, and the Director's RECIPES section, all threaded from the same ruleset key so display and mechanics agree. `repair` and `modify` are numbered menu rows now (item×recipe pairing), and `escort` opportunities spawn on a protective-travel-in-a-dangerous-district gate
- **The endgame reads the leverage you earned (v3.0):** the `victory`, `puppet-master`, and `quiet-retirement` campaign endings — long gated on influence / blackmail / legitimacy that the endgame layer read as hardcoded zero — are reachable now through the real leverage store the whole social economy writes. Companion departure is reachable too, via npc-agency breakpoints and a morale-floor fallback
- **`audit-content` dev CLI (v3.0):** a developer content-audit command (sibling of `validate`, distinct from the player-facing Director's Ledger) that runs the six encounter / boss / combat director formatters over a pack
- **Genre-flavored *starting supply* — v3.0's opener, delivered (v3.1):** `economyGenre` threads each starter's bare ruleset key through `buildWorldStack` → `createEconomyCore`, so a district now seeds its genre's `GENRE_SUPPLY_DEFAULTS` profile (cyberpunk runs high on components / contraband, fantasy runs medicine scarce) instead of a flat universal baseline — the starting supply the Director's MARKET tone and the endgame inputs already read. Seven of ten starters carry a genre profile; three fall back to baseline, honestly. A field separate from `tradeGenre` / `craftingGenre` so the three can diverge later
- **The social surface, complete (v3.1):** `deny` and `bury-scandal` — the rumor-manipulation pair that targets an existing rumor by id rather than a faction — reach the numbered menu through a rumor-target pairing dimension, closing the twenty-one-verb surface (19 → 21 surfaced)
- **`obligation-exists` dialogue, wired and reachable (v3.1):** the dialogue condition reads a named NPC's persisted obligation ledger (`getPersistedNpcObligations`) — fantasy's Brother Aldric, once he owes you a favor through ordinary npc-agency play, unlocks a `call-in-favor` choice — a real gate where v3.0 left a silent always-true stub (a Phase-9 played-session audit proved it reachable in a real run, not just unit-green)
- **Genre-flavored repair (v3.1):** every genre-carrying starter authors a signature `repair` recipe in its genre table (fantasy `repair-rune-mend`, cyberpunk `repair-nanite-weld`, …), surfaced through `getAvailableRecipes` — repair is flavored now, not only universal
- **Opt-in XRPL ledger settlement (v3.2):** a new optional `@ai-rpg-engine/ledger-adapter` package binds the player-owned tradeable layer — `coin` → an IOU, consumables → fungible tokens, a checkpoint's net `buy`/`sell` delta → a settled **XLS-85 token escrow** — to the **XRPL testnet**, entirely outside the deterministic core. Nothing in `core`/`modules` imports it and a run is byte-identical with or without it (proven on the real pirate `createGame()` merchant loop). Testnet-only behind a mainnet-impossible-in-code guard, with a gitignored secrets sidecar, conservation-safe retries, on-chain memo verification, and an unanchored fallback; proven live end-to-end on testnet (settle via token escrow → `reconcile` against on-ledger balances + memos). NFT unique gear lands in v3.3 (below). See [The XRPL ledger adapter](#the-xrpl-ledger-adapter-opt-in)
- **Unique gear as NFTs (v3.3):** the `@ai-rpg-engine/ledger-adapter` binds the `equipment` package's unique gear — the deferred "later slice" from v3.2 — to XRPL NFTs: each unique item minted as an **XLS-20 NFToken** (`tfMutable`, never burnable — true player ownership) at a checkpoint, relic growth advancing a mutable NFT's metadata in place via **XLS-46 `NFTokenModify`**, and a `reconcile()` ownership family verifying on-ledger `account_nfts`. A distinct read path over the equipment loadout, carried alongside the fungible layer — same determinism firewall, byte-identical with or without it. Proven on the real `starter-gladiator` played session, live on testnet (mint the equipped `trident-and-net` as an NFT, own it on-ledger, reconcile, world unperturbed)
- **Gear that earns a name (v3.4):** relic growth has existed since v3.3 but had never fired during play — nothing populated an item-chronicle in a running game, so every item's relic version was permanently `0`. The write side ships now: an **opt-in `item-chronicle-core`** module records `acquired` / `used-in-kill` / `recognized` from real play, and `starter-gladiator` wires it — win three arena fights and the retiarius trident is the **Bloodied Trident & Net** for the rest of the run, shown in the HUD and the Director's ledger. This also **closes the NFT loop**: a checkpoint settles that growth as a real **XLS-46 `NFTokenModify`**, advancing the on-ledger URI while preserving the NFTokenID. Fixed along the way: `boss-kill` and `recognized` were both unreachable on every shipped pack (a bare-`boss` tag check against content that tags `role:boss`, and a faction guard against content where no entity sets one) — and the latter had been silently blocking *all* armor growth. Opt-in by construction: a pack that does not wire it is byte-identical to the engine that shipped before it existed
- **Consequences that leave real marks (v3.8):** the strategic layer FIRED after v3.7 — offers spawned, resolved, and the narrator could speak the result — and then the world forgot it. `applyOpportunityFallout` declared **fourteen** effect types and persisted **six**: an obligation announced and entered in no ledger, a rumor that spread to nobody, a title that titled no one. All fourteen persist now, each through the owning system's own writer, and two of them **close feedback loops** — a sink-written obligation moves the loyalty breakpoint that decides what an NPC offers you next, and sink-moved trust opens the gate those offers are read through. Three effect types turned out to be dead one level EARLIER than a missing sink (`materials` and `spawn-opportunity` were emitted by nothing at all; every `spawn-pressure` producer sat on a resolution no shipped path could reach), so the cycle authored producers rather than building guards that could never fire. The `betray` op lands as the fourth transition and lights **six obligation sites, three rumors and all three original spawn-pressure producers** that had been authored across earlier releases and reached by nothing. A session-wide **ledger audit** then found three MORE sinks on the pressure applier nobody had indicted — which is what reconciling in both directions buys over an orphan scan. And the twelfth starter, **Hue and Cry**, is authored backwards from the consequence layer: a thief-taker in a city with no police force, 7/7 on the pack rubric
- **The strategic layer, lit (v3.7):** the tier above moment-to-moment verbs — where opportunities spawn, companions passively matter, and districts have moods — was half-dark, and nothing could see it. A new catalog-wide probe boots all eleven packs and drives **forty full rounds** through the same driver the interactive CLI uses (NPC turns, companion turns, then the world tick), because `runWorldTick` is a per-round function rather than a verb and a probe built from `submitAction` alone sees half a round forever. It measured **one of eight opportunity kinds** ever firing on shipped content. All **eight fire now**, each with a played-session proof that the reward actually landed — and one that deliberately runs out the clock, so an expiry's authored fallout (reputation lost, a district gone hungrier) is proven on real content rather than assumed. What was in the way was never the rules: `contract` needed an NPC both allied AND greedy, which the breakpoint table makes mutually exclusive with `favorable`, and `relations['player-trust']` had been authored exactly ONCE in the entire catalog; district economies erased their own genre-and-tag character within ~15 rounds by drifting every category to a universal 50; `world.factions[].reputation` — the authored baseline the engine explicitly merges — was set by no pack, so every world began at a flat zero with everyone. **Pacing** is tuned against named findings rather than taste, each cited at the constant it governs (choice-overload, quest-variance, relax valleys, radiant repetition, appointment dynamics), and guarded by a deterministic regression. **Twelve of the thirteen** companion and district modifier fields now reach a resolution function through a parameter seam, each with a named contribution in the payload so a UI can say WHO helped — a computed-but-unrendered modifier is experientially identical to no modifier. `use` **stops silently destroying things**: 89 of 90 authored items across the catalog were consumed by a verb that found no effect and spliced them out of the bag anyway, reporting success. And the `statusTags` contract, declared by all eleven packs and enforced by none, is bound — declarations widened to shipped truth first, then gated
- **The instrument turned on the catalog (v3.6):** the pack built to USE the ledger is now run deliberately as an engine-polishing instrument. A catalog-wide **verb-reachability audit** boots all eleven packs and SUBMITS each verb through the real engine, asking whether any target in the booted world accepts it — a gate no existing check could pass or fail, because verb-honesty compares the help table against registered handlers and never looks at the content. Run before any fix, it caught `recruit` advertised in Salt Road Ledger with zero recruitable NPCs (the v2.9 defect, re-introduced) and `use` inert across the pack's entire catalog. `give` ships as the engine's **first entity-to-entity item transfer** — atomic, structured-rejecting, chronicle-stamped by event — closing a gap where a pack could make an item obtainable and have nothing able to hand it to anyone. And the two remaining adapter axes that were config flags with **zero behavioral reads** became behaviours: `diary` mode (witnessed, not custodied — one anchor per checkpoint, no trust lines, reconcile verifies the anchor chain) and `issuerMode: 'persistent'` (a market that outlives the run). Proven **15/15 on live XRPL testnet**
- **A game whose loop is debt (v3.5):** the eleventh starter, **Salt Road Ledger**, is the first authored backwards from a system rather than a genre — you play a factor trading on someone else's capital, and five commerce verbs (`appraise` / `haggle` / `consign` / `underwrite` / `audit`) carry the game while combat is priced as a penalty (the resource profile has an empty `gains` array — nothing rewards violence). `consign` is the only verb in the catalog whose offline semantics match a settlement primitive one-to-one, which makes it the reference pack for the ledger adapter while carrying **no dependency on it**. Ships with the `mercantile` genre and a merchant economy profile, and 7/7 on the pack rubric. The same cycle made two long-inert adapter axes real — the memo `VERB:` field (declared with members no call site could emit) and `config.settlement` (declared with zero reads anywhere) — and a played-session audit of the new pack found six mechanics that were wired, schema-valid, unit-green and dead
- `ai-rpg-engine create-starter <name>` — scaffold a new game (standalone, runs outside the monorepo); `validate` + `scaffold` content commands; load packs from JSON
- Published starter template on npm (`@ai-rpg-engine/starter-template`)
- Full test suite: **8042 tests** (deterministic across repeated runs; test files typechecked in CI; coverage ratchet-enforced)

**Qué es lo que está incompleto o es rudimentario:**
- El estudio de creación de mundos con IA (capa de Ollama) está menos probado que el núcleo de simulación y necesita un demonio de Ollama local; es totalmente opcional: el motor y el bucle `run` no necesitan conexión de red.
- La pila de narración/audio genera comandos de audio deterministas, pero no hay **ningún backend de audio terminal**: no se reproduce ningún sonido; los comandos son un punto de integración para un incrustador de GUI/web.
- El modo multijugador (dos jugadores humanos que comparten un mundo) **no** está implementado; es una capa de red, deliberadamente fuera del alcance; los perfiles actuales están diseñados para un solo controlador.
- `replay --replay` restaura la partida guardada en lugar de volver a simularla, y después de la versión 2.9, esa es la **dirección** definitiva, no una postergación: `Engine.serialize()` ya es una instantánea completa y probada del estado, mientras que la re-simulación tendría que rastrear el estado del mundo/encuentro que existe fuera del registro de acciones. La versión 2.9 incluye ranuras de guardado con múltiples puntos de control en esa ruta de restauración probada; la re-simulación basada en eventos reales no está prevista.
- La versión 3.1 cerró las tres limitaciones principales de la versión 3.0: el **suministro inicial** del género, las recetas de *reparación* específicas del género y la superficie del menú `deny` / `bury-scandal`, todo esto se incluye ahora. La única limitación que queda es que esas nuevas recetas de reparación del género incluyen un `statDelta` (un pequeño bono de estadísticas) que `resolveRepair` aún no aplica: la reparación *restaura*, `modify` *mejora*, por lo que la reparación como mejora está marcada en el código y se **pospone a la versión 3.2/3.3** como una mecánica deliberada, no como un campo inerte silencioso. Y `obligation-exists` se incluye con una demostración creada (Hermano Aldric); la condición está activa para que los creadores de contenido puedan restringir más diálogos.
- La documentación es extensa, pero no todas las páginas del manual reflejan las API más recientes.

---

## Cómo se ve

La interfaz de usuario terminal incluida compone cada turno en secciones etiquetadas: escena, estado, registro y acciones, con una interfaz HUD de fácil consulta. El resultado es texto sin formato por defecto y añade color semántico en un TTY (daño en rojo, curación en verde, rechazos en amarillo), respetando `NO_COLOR` y las tuberías que no son TTY; cada indicación también se incluye en el texto, nunca solo con color.

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

El estudio se comunica con un demonio de [Ollama](https://ollama.com) local: ejecuta `ollama serve` y `ollama pull qwen2.5-coder` primero. Es totalmente opcional; el motor y el bucle `run` no necesitan conexión de red.

Se publica una imagen de contenedor en GHCR como `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` para CI y ejecuciones en entornos aislados.

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

Consulta la [Guía de composición](site/src/content/docs/handbook/57-composition-guide.md) para obtener el flujo de trabajo completo, o crea una nueva partida de inicio:

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

`@ai-rpg-engine/ledger-adapter` es un paquete **opcional** que vincula la **capa comercial de propiedad del jugador** de un juego (el saldo de `coin` y el inventario de objetos consumibles que los verbos `trade-core` `buy`/`sell` ya mueven) a la **testnet de XRPL**, de modo que esos activos puedan estar respaldados por tokens reales en el libro mayor y liquidarse en los puntos de control. Un adaptador ausente es exactamente el motor sin conexión que se incluye hoy.

**La invariante del determinismo (el objetivo principal).** El adaptador es un *canal secundario*, que nunca forma parte de la simulación:

- Nunca se invoca dentro del ciclo determinista, solo en los **puntos de control** (guardado, entrada a la ciudad/mercado, final del capítulo).
- Nada en `@ai-rpg-engine/core` o `@ai-rpg-engine/modules` lo importa (su única dependencia del motor es una `import type` en tiempo de compilación).
- **Una ejecución es idéntica con o sin él.** Una prueba de firewall ejecuta el bucle de comerciante `starter-pirate` `createGame()` real en dos motores, uno con el adaptador habilitado y liquidando en un punto de control, y afirma que los dos mundos son profundamente iguales. La repetición de la semilla 0 no se ve afectada.

**Niveles de integración: un juego lo integra tan profundamente como su diseño lo requiera.** El firewall es una *frontera de determinismo*, no una regla anti-integración; la invariante anterior se mantiene en todos los niveles:

| Nivel | Qué depende del adaptador | Se ajusta |
|-------|-----------------------------|------|
| **L0 — External observer** | Nada dentro del juego; el adaptador se adjunta desde el exterior en los puntos de control y el juego no es consciente de ello. | Reacondicionamiento de un juego existente (la demostración de piratas incluida). |
| **N1: puntos de control impulsados por el juego** | El flujo de guardado/ciudad/progresión meta propio del juego llama al adaptador en momentos definidos. | Un juego que desea momentos deliberados en el libro mayor. |
| **L2 — Ledger-native design** | La economía o la identidad del juego están diseñadas *en torno* a la propiedad en la cadena (emisor persistente, mercados reales). | Un juego de comerciantes centrado en el libro mayor. |

La distinción que mantiene la repetición segura no es "qué paquete importa el adaptador", sino "si la llamada se realiza dentro del ciclo". Un paquete de juego puede importar y controlar el adaptador libremente, siempre y cuando todas las llamadas se realicen en un punto de control fuera del bucle de repetición impulsado por la semilla.

**Tres modos de juego.** `offline` (por defecto: sin cadena, el motor tal como se incluye) · `ledger` (monedas/objetos respaldados por saldos de la testnet, liquidados en los puntos de control) · `diary` (juega sin conexión y luego ancla el hash del estado de la ejecución en el libro mayor para obtener un recibo a prueba de manipulaciones).

**Qué hay en el libro mayor.** `coin` → una promesa de pago en moneda emitida a través de una línea de confianza;
artículos consumibles → tokens fungibles; la diferencia neta de comercio de un punto de control → una transferencia liquidada a través del **almacén de tokens XLS-85**. El equipo único se envía como **NFTs XLS-20** (v3.3), con el crecimiento de las reliquias que actualiza los metadatos de un NFT mutable en su lugar a través de **XLS-46 `NFTokenModify`** — impulsado por el juego real a partir de la v3.4. La economía abstracta del distrito (`economy-core`) *no* se ve afectada; sigue siendo una simulación pura.

**Medidas de seguridad.** Solo para la red de prueba, con una protección estructural **imposible en el código en la red principal** (no una opción de configuración); las semillas de la billetera se almacenan en un archivo secundario de secretos ignorado por Git, nunca en el archivo de guardado; la liquidación es idempotente y segura en cuanto a la conservación en la ruta de reintento; las pruebas verifican el **memo real en la cadena** (no la cadena propia del motor); y si la cadena no es accesible, la ejecución simplemente continúa, marcada como *sin anclar*.

**Probado en vivo.** Una ejecución real de un comerciante `starter-pirate`: vende un sable, compra una bala de cañón; se liquida en la red de prueba de XRPL a través de un almacén de tokens, luego `reconcile()` confirma los saldos y los memos en el libro mayor frente a la economía del motor (la conservación se mantiene para cada token). El libro mayor es una familia de sistemas diferente al motor, por lo que el motor no puede falsificarlo; la conciliación es una verificación externa genuina. Solo para la red de prueba; los activos son recibos con alcance en el juego, no valores.

---

## Sistema de combate

Cinco acciones (ataque, guardia, desenganche, preparación, reposicionamiento), cuatro estados de combate (protegido, desequilibrado, expuesto, huyendo), cuatro estados de enfrentamiento (enfrentado, protegido, línea trasera, aislado). Tres dimensiones de estadísticas impulsan cada fórmula, por lo que un duelista rápido juega de manera diferente a un luchador pesado o un centinela compuesto.

Los oponentes de la IA utilizan una puntuación de decisión unificada: las acciones y habilidades de combate compiten en una única evaluación, con umbrales configurables para evitar el uso excesivo de habilidades marginales.

Los autores de los paquetes utilizan `buildCombatStack()` para conectar el combate a partir de un mapeo de estadísticas, un perfil de recursos y etiquetas de sesgo. Consulte la [Descripción general del combate](site/src/content/docs/handbook/49a-combat-overview.md) y la [Guía para autores de paquetes](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Habilidades

Sistema de habilidades nativo del género con costos, comprobaciones de estadísticas, tiempos de espera y efectos tipificados (daño, curación, aplicación de estado, limpieza). Los efectos de estado utilizan un vocabulario semántico de 11 etiquetas con perfiles de resistencia/vulnerabilidad. Las puntuaciones de selección con conocimiento de la IA seleccionan las rutas de auto/área de efecto/objetivo único.

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
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generación de retratos sin cabeza con proveedores conectables |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Autoría de IA opcional: andamiaje, crítica, flujos de trabajo guiados, ajuste, experimentos |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: ejecutar juegos, crear plantillas iniciales, inspeccionar guardados |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motor de renderizado de terminal y capa de entrada |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Iniciador mercantil: el paquete de referencia para el adaptador del libro mayor, que no tiene ninguna dependencia de este |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Iniciador de ladrón: la persecución como bucle, y qué mitad de la ciudad te abrirá una puerta |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Opcional:** liquidación opcional en la red de prueba de XRPL para la capa comercial de propiedad del jugador (moneda/inventario/comercio), a través del almacén de tokens XLS-85 en los puntos de control, completamente fuera del núcleo determinista |

### Ejemplos de iniciadores

Los 12 mundos de inicio son **ejemplos de composición**: demuestran cómo combinar los módulos del motor en juegos completos. Cada uno muestra diferentes patrones (mapeos de estadísticas, perfiles de recursos, configuraciones de interacción, conjuntos de habilidades). Consulte el archivo README de cada iniciador para ver "Patrones demostrados" y "Qué tomar prestado".

| Iniciador | Género | Patrones clave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasía oscura | Combate mínimo, impulsado por el diálogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Ciberpunk | Recursos, roles de interacción |
| [`starter-detective`](packages/starter-detective) | Misterio victoriano | Social primero, con gran énfasis en la percepción |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Naval + cuerpo a cuerpo, multizona |
| [`starter-zombie`](packages/starter-zombie) | Supervivencia zombi | Escasez, recurso de infección |
| [`starter-weird-west`](packages/starter-weird-west) | Oeste extraño | Sesgos del paquete, recuperación de zona segura |
| [`starter-colony`](packages/starter-colony) | Colonia de ciencia ficción | Cuellos de botella, zonas de emboscada |
| [`starter-ronin`](packages/starter-ronin) | Japón feudal | Pasajes ocultos, múltiples roles de protector |
| [`starter-merchant`](packages/starter-merchant) | Mercantil | La obligación como bucle, el combate con precio como penalización |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Persecución | Cazar personas por dinero; la violencia es ruidosa, no está prohibida |
| [`starter-vampire`](packages/starter-vampire) | Horror de vampiros | Recurso de sangre, manipulación social |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiador histórico | Combate en la arena, favor de la multitud |

---

## Documentación

| Recurso | Descripción |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crear un nuevo juego: CLI o plantilla manual |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Construye tu propio juego componiendo módulos del motor |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Resolución de reglas por entidad: combate de estilo de juego mixto, `applyProfile`, plantillas de perfil, la CLI `profile` |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Participación opcional en la liquidación en la cadena de bloques: el cortafuegos de determinismo, niveles de integración L0/L1/L2, modos de juego, medidas de seguridad y la demostración de piratas probada en vivo |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Seis pilares de combate, cinco acciones, estados de un vistazo |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Construcción paso a paso de CombatStack, mapeo de estadísticas, perfiles de recursos |
| [Handbook](site/src/content/docs/handbook/index.md) | Manual completo: todos los sistemas, más 4 apéndices |
| [Composition Model](docs/composition-model.md) | Las 6 capas reutilizables y cómo se componen |
| [Examples](docs/examples/) | Ejemplos ejecutables de TypeScript (verificados por tipo y probados en cuanto a comportamiento en CI): fiesta mixta por entidad, perfiles compartidos, entre mundos, desde cero |
| [Design Document](docs/DESIGN.md) | Análisis profundo de la arquitectura: canalización de acciones, verdad frente a presentación |
| [Philosophy](PHILOSOPHY.md) | Mundos deterministas, diseño basado en la evidencia, IA como asistente |
| [Changelog](CHANGELOG.md) | Historial de lanzamientos |

---

## Hoja de ruta

### Dónde estamos ahora

Ambas estructuras de composición están completas: **8042 pruebas en 381 archivos**, los 12 iniciadores en `buildCombatStack` **y** `buildWorldStack`, reproducción determinista e idéntica a nivel de bytes bajo semillas impresas, puntuación completa de la toma de decisiones de la IA y una CLI que crea, ejecuta, valida e inspecciona. El arco v3.x hizo que el mundo estuviera activo (NPC con nombre, la superficie social de 25 verbos, economías de género: v3.0–v3.1), puso los activos de propiedad del jugador en la testnet de XRPL como un canal secundario opcional (v3.2–v3.4), creó dos iniciadores centrados en el sistema y los convirtió en instrumentos de mejora del motor (v3.5–v3.6), iluminó y reforzó la capa estratégica hasta que las consecuencias dejan marcas reales (v3.7–v3.8), proporcionó a los hosts la superficie del motor con las necesidades de conexión de Godot (v3.8.1) y **cerró el ciclo de creación para que una sesión de estudio o un paquete JSON básico produzca un mundo jugable de principio a fin (v3.9)**.

**Ciclo de lanzamiento reciente (v2.4.0–v3.0.0):**
- v2.4.0: combate de fiesta (ataque a aliados/curación/mejora/revivir, sistema de efectos de estado (modificadores + DoT/HoT + desencadenantes reactivos), fase 1 de perfiles complementarios, contenido CLI `validate`/`scaffold`
- v2.5.0: resolución de reglas por entidad (combate de estilo de juego mixto), el cargador `applyProfile` + habilidades por entidad, plantillas de perfil + CLI `profile` y una revisión completa de la salud
- v2.6.0: el comando `run` se convirtió en un juego real: los enemigos actúan según sus propios perfiles de IA, victoria/derrota, guardar/reanudar, habilidades y XP en el menú, el contenedor de estudio `ai` y la pila de narración
- v2.7.0: el mundo reacciona y hay una razón para regresar: calor → presiones → consecuencias narradas, encuentros de entrada de zona, un ciclo de búsqueda + diario, equipo en combate, ejecuciones reproducibles basadas en semillas, entradas de juego final en vivo, `buildWorldStack`, el Libro del Director y una costura de migración de guardado
- v2.8.0: actúa sobre el mundo en el que vives: una economía comercial en vivo + verbo `sell`, compañeros que reclutas y con los que luchas, y un Libro del Director que lee todo el tablero: un cable de escritura por sistema, aproximadamente 12 consumidores que se lanzaron en modo oscuro
- v2.9.0: cierra los ciclos: `buy` + el inventario del comerciante y la creación completan la economía; los compañeros realizan turnos independientes; cuatro verbos sociales (soborno/intimidación/petición/siembra) se ejecutan en una economía de apalancamiento financiada por recompensas de oportunidad; las oportunidades se resuelven con una fecha de caducidad + consecuencias de pérdida de favor; y el equipo, las misiones, los reclutas y la moneda inicial se distribuyen uniformemente a los diez iniciadores
- **v3.0.0: haz que el mundo esté vivo: el productor de agencia de NPC enciende los NPC con nombre (objetivos/relaciones/cuadernos de obligaciones/cadenas de consecuencias) más un NPC de historia en cada iniciador; la superficie social crece hasta los 25 verbos (diplomacia + sabotaje) con ingresos pasivos de apalancamiento y un diálogo que lee el estado social; inventario y recetas de género por iniciador; los finales de apalancamiento (victoria/títere/retiro silencioso) se vuelven alcanzables; filas de menú de reparación/modificación, oportunidades de escolta y una CLI de desarrollo `audit-content`: se lanzó a través de una auditoría de la fase 9 que detectó dos cables desconectados que la suite de pruebas verdes ocultaba**

### Siguiente (el ciclo de la superficie del consumidor)

Dos ciclos de productores ahora superan a sus consumidores, y el siguiente ciclo consiste en que el jugador realmente los vea:

- **Las pistas llegan al jugador:** ocho campos de pistas de voz de narrador (sesgo/pista de diálogo, presión, textura, oportunidad, presencia de la fiesta, estado del distrito, situación) se basan en los eventos de hoy y no se representan en la interfaz de usuario del terminal; conectarlos a la narración (y a la ruta TTS de las mismas funciones) es el elemento principal
- **Los resultados del combate llegan a la banda sonora:** el solucionador de golpes y los recursos CORE de golpes se lanzaron en v3.9, pero aún no hay ningún evento de juego que los mapee (y `combat.victory` no existe como un evento: la capa de interacción ya calcula los hostiles eliminados)
- **Una línea de fiesta en el HUD siempre activo:** `formatPartyStatusLine` está terminado y sin leer
- **Avisos de puerta de enlace en el cable:** un cliente secundario `--listen` actualmente no tiene visibilidad de la pérdida de datos de entrada del paquete (solo stderr de la CLI)
- **El modelo de escritura `/build`:** las ejecuciones por lotes guiadas solo preparan la escritura final hoy (la preparación por pasos con un consentimiento por lotes es la solución diseñada)
- Multijugador: dos jugadores *humanos* que comparten un mundo (una capa de red, deliberadamente pospuesta; los perfiles compartidos de un solo controlador se lanzan hoy como [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Anulaciones de fórmulas serializables: ajuste de fórmulas por perfil (bloqueado en un DSL de fórmulas; los perfiles llevan mapeos de estadísticas hoy, no cierres)

### Destino: perfiles complementarios

El objetivo final del motor son los **perfiles definidos por el usuario**: paquetes portátiles que se insertan en cualquier juego. Un perfil empaqueta un mapeo de estadísticas, comportamiento de recursos, etiquetas de sesgo de IA y habilidades en una sola unidad importable. A partir de la v2.5, las entidades en un mundo pueden tener cada una su propio perfil y resolver el combate por entidad: un luchador `might` y un místico `will` comparten una fiesta, cada uno aportando su propio estilo de juego.

El esquema, el cargador `applyProfile`, la resolución de capacidades por entidad y la validación entre perfiles ya están implementados. Lo que queda por hacer es el modo multijugador, que permite que dos jugadores *humanos* (no solo dos entidades) compartan un mundo, y esto implica una capa de red. Consulte [Hoja de ruta del perfil](docs/profile-roadmap.md) y [feature-architecture.md](docs/feature-architecture.md) para conocer el diseño.

---

## Filosofía

El motor de RPG con IA se basa en tres ideas:

1. **Mundos deterministas:** los resultados de la simulación deben ser reproducibles.
2. **Diseño basado en la evidencia:** la mecánica del mundo debe probarse mediante la simulación.
3. **La IA como asistente, no como autoridad:** las herramientas de IA ayudan a generar y evaluar diseños, pero no reemplazan los sistemas deterministas.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para obtener la explicación completa.

---

## Seguridad

El motor principal es una **biblioteca de simulación solo local**: no hay telemetría, ni red, ni secretos. Los archivos guardados se guardan en `.ai-rpg-engine/` solo cuando se solicita explícitamente. Dos **capas opcionales** añaden una ruta de salida, y solo cuando las active:

- La capa de IA (`@ai-rpg-engine/ollama`) se comunica con un daemon de Ollama **local**; su opción de participación `webfetch` (para RAG) está limitada por una protección contra SSRF (bloquea el bucle de retorno, la red de enlace local, CGNAT, los metadatos de la nube y los equivalentes IPv6 con túnel).
- La capa de libro mayor (`@ai-rpg-engine/ledger-adapter`) se conecta a la **XRPL testnet** (y solo a la testnet): una protección estructural **imposible en el código en la red principal** (no una opción de configuración) rechaza cualquier host que no sea de la testnet en la construcción. Las semillas de la billetera se guardan en un archivo secundario de secretos ignorado por Git, nunca en un archivo guardado, y el núcleo determinista nunca importa el adaptador.

Consulte [SECURITY.md](SECURITY.md) para obtener más detalles.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licencia

[MIT](LICENSE)

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
