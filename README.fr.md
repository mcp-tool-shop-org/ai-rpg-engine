<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Moteur de RPG basé sur l’IA

Une boîte à outils TypeScript pour créer des simulations de RPG déterministes. Vous définissez les statistiques, choisissez des modules, configurez une séquence de combats et créez du contenu. Le moteur gère l’état, les événements, le générateur de nombres aléatoires (RNG), la résolution des actions et la prise de décision par l’IA. Chaque exécution est reproductible.

Il s’agit d’un **moteur de composition**, et non d’un jeu fini. Les 10 mondes de départ sont des exemples : des modèles décomposables à partir desquels vous pouvez apprendre et créer de nouvelles choses. Votre jeu utilise la partie du moteur dont vous avez besoin.

---

## Ce que c’est

- A **module library** — 30+ engine modules covering combat, perception, cognition, factions, rumors, traversal, companions, and more
- A **composition toolkit** — `buildCombatStack()` wires combat in ~7 lines; `new Engine({ modules })` boots the game
- A **simulation runtime** — deterministic ticks, replayable action logs, seeded RNG
- An **AI design studio** (optional) — scaffolding, critique, balance analysis, tuning, experiments via Ollama
- An **optional on-ledger layer** — `@ai-rpg-engine/ledger-adapter` backs a game's coin and tradeable items with real XRPL **testnet** tokens, settled at checkpoints, entirely outside the deterministic core (opt-in; a run is byte-identical without it)

## Ce que ce n’est pas

- Not a single finished game — it ships 10 playable starter worlds you can `run` today as examples, and the engine is the toolkit you compose your *own* game from
- Not a visual engine — it outputs structured events, not pixels
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## État actuel (version 3.5.0)

**What works and is tested:**
- Core runtime: world state, events, actions, ticks, replay — stable since v1.0; deterministic byte-identical replay (per-instance id counter, seeded RNG)
- Combat system: 5 actions, 4 combat states, 4 engagement states, companion interception, defeat flow, AI tactics
- Abilities: costs, cooldowns, stat checks, typed effects, 11-tag status vocabulary, AI-aware selection
- **Party combat (v2.4):** ally-targeting (heal / buff / revive), friend/foe AoE filtering, target selectors — a healer can heal a teammate; enemy AoE spares allies
- **Status effects (v2.4):** passive stat modifiers reach combat, deterministic DoT/HoT off the tick counter, depth-capped reactive triggers (thorns/reflect)
- **Plug-in Profiles — per-entity rule resolution (v2.5):** a `might` fighter and a `will` mystic resolve combat in one fight, each reading stats through its own mapping. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` attaches a profile (stat mapping, resource pools, per-entity abilities); `buildProfile()`, `validateProfileSet()` (duplicate ids rejected), 10 starter-derived templates, and a `profile` CLI command
- **Playable `run` loop (v2.6):** the terminal game is real, not a demo — enemies act on their own AI intent profiles (`aggressive`/`cautious`/`territorial`/`calculating`), a fight ends in victory or defeat, you can save and resume, and abilities and XP are on the action menu. `run <path>` loads a game you scaffolded. Composed terminal UI with a glance-able HUD and accessible color (honors `NO_COLOR` / non-TTY)
- **AI design studio ships as its own `ai` command (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — scaffold, critique, and balance content against a local Ollama model
- Unified decision layer: combat + ability scoring merged into one call (`selectBestAction`)
- All 11 starter worlds use `buildCombatStack()` — the proven composition spine
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
- **A game whose loop is debt (v3.5):** the eleventh starter, **Salt Road Ledger**, is the first authored backwards from a system rather than a genre — you play a factor trading on someone else's capital, and five commerce verbs (`appraise` / `haggle` / `consign` / `underwrite` / `audit`) carry the game while combat is priced as a penalty (the resource profile has an empty `gains` array — nothing rewards violence). `consign` is the only verb in the catalog whose offline semantics match a settlement primitive one-to-one, which makes it the reference pack for the ledger adapter while carrying **no dependency on it**. Ships with the `mercantile` genre and a merchant economy profile, and 7/7 on the pack rubric. The same cycle made two long-inert adapter axes real — the memo `VERB:` field (declared with members no call site could emit) and `config.settlement` (declared with zero reads anywhere) — and a played-session audit of the new pack found six mechanics that were wired, schema-valid, unit-green and dead
- `ai-rpg-engine create-starter <name>` — scaffold a new game (standalone, runs outside the monorepo); `validate` + `scaffold` content commands; load packs from JSON
- Published starter template on npm (`@ai-rpg-engine/starter-template`)
- Full test suite: **5911 tests** (deterministic across repeated runs; test files typechecked in CI; coverage ratchet-enforced)

**What is rough or incomplete:**
- The AI worldbuilding studio (Ollama layer) is more lightly tested than the simulation core, and needs a local Ollama daemon; it is entirely optional — the engine and the `run` loop need no network
- The narration/audio stack builds deterministic audio commands but there is **no terminal audio backend** — nothing plays a sound; the commands are an integration hook for a GUI/web embedder
- Multiplayer (two human players sharing one world) is **not** built — it is a networking layer, deliberately out of scope; profiles today target a single controller
- `replay --replay` restores the save instead of re-simulating — and after v2.9 that is the **decided** direction, not a deferral: `Engine.serialize()` is already a proven full-state snapshot, whereas re-simulation would have to chase world-tick/encounter state that lives outside the action log. v2.9 ships multi-checkpoint save slots on that proven restore path; true event-sourced resim is not planned
- v3.1 closed v3.0's three named ceilings — genre **starting supply**, genre-specific *repair* recipes, and the `deny` / `bury-scandal` menu surface all ship now. The honest ceiling that remains: those new genre repair recipes carry an authored `statDelta` (a small stat bonus) that `resolveRepair` does not apply yet — repair *restores*, `modify` *upgrades* — so repair-as-upgrade is marked in-code and **deferred to v3.2/v3.3** as a deliberate mechanic call, not a silent inert field. And `obligation-exists` ships with one authored demo (Brother Aldric); the condition is live for content authors to gate more dialogue on
- Documentation is extensive but not every handbook page reflects the very latest APIs

---

## À quoi cela ressemble

The bundled terminal UI composes each turn into labeled sections — scene, status, log, and actions — with a glance-able HUD. Output is plain text by default and adds semantic color on a TTY (damage red, heals green, rejections yellow), honoring `NO_COLOR` and non-TTY pipes; every cue is carried in the text too, never color alone.

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

## Installation et lancement

Lancez un jeu de démonstration ou créez votre propre jeu à partir du terminal :

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

The `run` loop is a real turn-based session: enemies act on their own AI
profiles, abilities and XP are on the menu, you can save and resume, and a
fight ends in victory or defeat. Every game is deterministic and replayable.

Facultativement, l’atelier de conception d’IA s’installe en tant que commande distincte :

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

Le studio communique avec un démon [Ollama](https://ollama.com) local ; exécutez d’abord les commandes `ollama serve` et `ollama pull qwen2.5-coder`. C’est tout à fait facultatif ; le moteur et la boucle `run` n’ont besoin d’aucune connexion réseau.

Une image de conteneur est publiée sur GHCR en tant que `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` pour les tests CI et les exécutions en environnement isolé.

---

## Démarrage rapide

Préférez-vous créer votre propre jeu en utilisant du code ? Assemblez le moteur à partir de modules :

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

Consultez le [Guide de composition](docs/handbook/57-composition-guide.md) pour connaître l’ensemble du processus, ou créez un nouveau monde de départ :

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architecture

| Couche | Rôle |
|-------|------|
| **Core Runtime** | Moteur déterministe — état du monde, événements, actions, cycles, RNG, relecture |
| **Modules** | Plus de 30 systèmes composables — combat, perception, cognition, factions, déplacement, compagnons, etc. |
| **Content** | Entités, zones, dialogues, objets, capacités, statuts — créés par l’auteur |
| **AI Studio** | Couche Ollama facultative — échafaudage, critique, analyse de l’équilibre, réglages, expériences |

---

## L’adaptateur de registre XRPL (optionnel)

`@ai-rpg-engine/ledger-adapter` est un paquet **facultatif** qui lie la **couche échangeable appartenant au joueur** d’un jeu — le solde `coin` et l’inventaire consommable que les verbes `buy`/`sell` de `trade-core` gèrent déjà — au **testnet XRPL**, afin que ces actifs puissent être adossés à des jetons réels enregistrés dans la chaîne et réglés aux points de contrôle. L’absence d’un adaptateur correspond exactement au moteur hors ligne qui est fourni aujourd’hui.

**L’invariant du déterminisme (le but ultime).** L’adaptateur est un *canal secondaire*, qui ne fait jamais partie de la simulation :

- Il n’est **jamais invoqué à l’intérieur du cycle déterministe**, mais uniquement aux **points de contrôle** (sauvegarde, entrée dans la ville/le marché, fin de chapitre).
- Rien dans `@ai-rpg-engine/core` ou `@ai-rpg-engine/modules` ne l’importe (sa seule dépendance au niveau du moteur est une bibliothèque `import type` utilisée lors de la compilation).
- **Une exécution est identique avec ou sans.** Un test de pare-feu exécute le cycle réel du marchand `starter-pirate` `createGame()` sur deux moteurs — un avec l’adaptateur activé et effectuant un règlement à un point de contrôle — et vérifie que les deux mondes sont profondément identiques. La relecture avec la graine 0 n’est pas modifiée.

**Niveaux d’intégration : un jeu l’intègre aussi profondément que son design le souhaite.** Le pare-feu est une *frontière du déterminisme*, et non une règle anti-intégration ; l’invariant ci-dessus s’applique à tous les niveaux :

| Niveau | Ce qui dépend de l’adaptateur | S’adapte |
|-------|-----------------------------|------|
| **L0 — External observer** | Rien dans le jeu ; l’adaptateur se connecte depuis l’extérieur aux points de contrôle et le jeu n’en a pas conscience. | Intégration à un jeu existant (la démo du pirate disponible). |
| **Niveau 1 : Points de contrôle pilotés par le jeu.** | Le flux de sauvegarde/ville/progression méta propre au jeu appelle l’adaptateur à des moments définis. | Un jeu qui souhaite des moments d’enregistrement délibérés. |
| **L2 — Ledger-native design** | L’économie ou l’identité du jeu est conçue *autour* de la propriété enregistrée en chaîne (émetteur persistant, marchés réels). | Un jeu de marchand axé sur le registre. |

La distinction qui garantit la sécurité de la sauvegarde n’est **pas** « quel package importe l’adaptateur », mais « l’appel se fait-il à l’intérieur du cycle ». Un package de jeu peut importer et piloter librement l’adaptateur, tant que chaque appel a lieu à un point de contrôle en dehors de la boucle de relecture pilotée par les graines.

**Three play modes.** `offline` (default — no chain, the engine as it ships) ·
`ledger` (coin/items backed by testnet balances, settled at checkpoints) ·
`diary` (play offline, then anchor the run's state hash on-ledger for a
tamper-evident receipt).

**Ce qui se trouve dans la chaîne.** `coin` → une promesse d’émission de devise sur une ligne de confiance ; éléments consommables → jetons fongibles ; le delta net des échanges à un point de contrôle → un transfert réglé via **XLS-85, un protocole de dépôt fiduciaire de jetons**. L’équipement unique est fourni sous forme de **NFT XLS-20** (v3.3), et l’évolution des reliques fait progresser les métadonnées d’un NFT mutable en place via **XLS-46 `NFTokenModify`** — ce qui est basé sur le jeu réel à partir de la version 3.4. L’économie abstraite du district (`economy-core`) n’est *pas* modifiée ; elle reste une simulation pure.

**Mesures de sécurité.** Uniquement le testnet, avec une protection structurelle **impossible en code sur le réseau principal** (et non un simple indicateur de configuration) ; les graines du portefeuille se trouvent dans un fichier secondaire ignoré par Git, et non dans le fichier de sauvegarde ; le règlement est idempotent et sûr en cas de nouvelle tentative ; les preuves vérifient le **mémo réel sur la chaîne** (et non la propre chaîne de caractères du moteur) ; et si la chaîne est inaccessible, l’exécution se poursuit simplement, marquée comme *non ancrée*.

**Proven live.** A real `starter-pirate` merchant run — sell a cutlass, buy a
cannon-shell — settles on XRPL testnet via token escrow, then `reconcile()`
confirms on-ledger balances and memos against the engine's economy (conservation
holds for every token). The ledger is a different system family than the engine,
so the engine cannot fake it — reconciliation is a genuine external verifier.
Testnet only; assets are game-scoped receipts, not securities.

---

## Système de combat

Cinq actions (attaque, garde, désengagement, préparation, repositionnement), quatre états de combat (gardé, déséquilibré, exposé, en fuite), quatre états d’engagement (engagé, protégé, ligne arrière, isolé). Trois dimensions statistiques déterminent chaque formule, ce qui fait qu’un duelliste rapide joue différemment d’un combattant lourd ou d’un sentinelle calme.

Les adversaires IA utilisent une évaluation de décision unifiée : les actions de combat et les capacités sont en concurrence dans une seule évaluation, avec des seuils configurables pour éviter le spam d’actions marginales.

Les auteurs des packs utilisent `buildCombatStack()` pour lier les combats à un mappage des statistiques, un profil de ressources et des balises de biais. Voir la [vue d’ensemble des combats](site/src/content/docs/handbook/49a-combat-overview.md) et le [guide de l’auteur de packs](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Capacités

Système de capacités natif du genre, avec coûts, vérifications de statistiques, délais de récupération et effets typés (dégâts, soin, application/suppression de statut). Les effets de statut utilisent un vocabulaire sémantique à 11 balises, avec des profils de résistance/vulnérabilité. La sélection consciente de l’IA évalue les chemins auto/AoE/cible unique.

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

## Packs

| Pack | Objectif |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Environnement d’exécution de simulation déterministe — état du monde, événements, RNG, cycles, résolution des actions |
| [`@ai-rpg-engine/modules`](packages/modules) | Plus de 30 modules composables — combat, perception, cognition, factions, rumeurs, déplacement, compagnons, autonomie des PNJ, carte stratégique, reconnaissance d’objets, opportunités émergentes, détection d’arc narratif, déclencheurs de fin de partie |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schémas et validateurs canoniques pour le contenu du monde |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Évolution du personnage, blessures, étapes importantes, réputation. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Sélection de l’archétype, création du personnage, équipement de départ. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Types d’équipement, provenance des objets et évolution des reliques — y compris `item-chronicle-core`, le module facultatif qui enregistre l’historique de l’équipement à partir du jeu réel afin que les objets obtiennent des épithètes et des niveaux. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Mémoire intersessions, effets relationnels, état de la campagne |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Cycle de vie des rumeurs, mécanismes de propagation et de transformation, suivi de la diffusion. |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schéma du plan narratif, contrats de prestation, profils vocaux. |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Planification des déclencheurs, gestion des priorités, fonction d’atténuation du son, logique de temporisation. |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Liste des fichiers audio, registre indexé par contenu. |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Inscription aux activités, évaluation par grille de notation, découverte des activités |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Système de stockage basé sur le contenu pour les photos de profil, les icônes et les fichiers multimédias. |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Génération de portraits sans tête grâce à des modules d’extension interchangeables. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Fonctionnalités d’IA optionnelles pour la création de contenu : assistance à la rédaction, évaluation, processus guidés, optimisation, expérimentation. |
| [`@ai-rpg-engine/cli`](packages/cli) | Interface en ligne de commande : lancez des jeux, utilisez des modèles de démarrage, examinez les fichiers d’enregistrement. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Module de rendu terminal et couche d’entrée. |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Démarrage commercial — le pack de référence pour l’adaptateur de chaîne, qui ne dépend pas de celui-ci. |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Facultatif** — intégration facultative du règlement sur le testnet XRPL pour la couche échangeable appartenant au joueur (pièces/inventaire/échanges), via l’escrow de jetons XLS-85 aux points de contrôle, entièrement en dehors du noyau déterministe. |

### Exemples de plats d’entrée

Les 10 mondes de départ sont des **exemples de composition** : ils illustrent comment combiner les différents modules du moteur pour créer des jeux complets. Chacun d’eux présente différentes configurations (correspondances statistiques, profils de ressources, paramètres d’interaction, ensembles de compétences). Consultez le fichier README de chaque monde de départ pour connaître les « configurations présentées » et ce que vous pouvez en reprendre.

| Entrée | Genre | Principales tendances. |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasy sombre | Peu de combats, l’accent mis sur les dialogues. |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Ressources, fonctions liées à la participation et à l’implication |
| [`starter-detective`](packages/starter-detective) | Mystère à la manière victorienne. | Priorité aux réseaux sociaux, importance de l’image et de la perception. |
| [`starter-pirate`](packages/starter-pirate) | Piraté / Pirate | Combats navals et au corps à corps, sur plusieurs zones. |
| [`starter-zombie`](packages/starter-zombie) | Survie face aux zombies | Pénurie, source d’infection. |
| [`starter-weird-west`](packages/starter-weird-west) | Far West étrange / Western insolite | Corriger les biais de l’emballage, rétablir la protection optimale. |
| [`starter-colony`](packages/starter-colony) | Colonie de science-fiction | Points de passage étroits, zones d’embuscade. |
| [`starter-ronin`](packages/starter-ronin) | Le Japon féodal | Passages secrets, différents rôles de protection. |
| [`starter-merchant`](packages/starter-merchant) | Commercial | Obligation en tant que boucle, combats dont le prix est fixé comme une pénalité |
| [`starter-vampire`](packages/starter-vampire) | Film d’horreur sur les vampires | Ressources sanguines, manipulation sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiateur historique | Combats dans l’arène, soutien du public. |

---

## Documentation

| Ressource | Description |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Créez la structure de base d’un nouveau jeu : utilisez l’interface en ligne de commande ou un modèle manuel. |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Créez votre propre jeu en assemblant différents modules du moteur de jeu. |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Résolution des règles par entité — combat avec styles de jeu mixtes, `applyProfile`, modèles de profil, l’interface CLI `profile`. |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Intégration facultative sur le registre — le pare-feu du déterminisme, les niveaux d’intégration L0/L1/L2, les modes de jeu, les mesures de sécurité et la démo du pirate déjà prouvée en direct. |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Six axes stratégiques, cinq mesures concrètes, une vue d’ensemble de la situation. |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Instructions détaillées pour créer un ensemble de combats, définition des statistiques et profils des ressources. |
| [Handbook](site/src/content/docs/handbook/index.md) | Manuel complet – il couvre tous les systèmes et comprend quatre annexes. |
| [Composition Model](docs/composition-model.md) | Les six couches réutilisables et leur composition. |
| [Examples](docs/examples/) | Exemples de code TypeScript fonctionnels (vérifiés par le système de types et testés en matière de comportement dans un environnement d’intégration continue) : gestion mixte des entités, profils partagés, interactions entre différents mondes, création à partir de zéro. |
| [Design Document](docs/DESIGN.md) | Analyse approfondie de l’architecture : processus opérationnel, réalité par rapport à la présentation. |
| [Philosophy](PHILOSOPHY.md) | Mondes déterministes, conception fondée sur des données probantes, IA en tant qu’assistant. |
| [Changelog](CHANGELOG.md) | Historique des versions. |

---

## Feuille de route

### Où nous en sommes maintenant

Both composition spines are complete — 5911 tests across 307 files, all 11 starters on `buildCombatStack` **and** `buildWorldStack`, deterministic byte-identical replay under printed seeds, full AI decision scoring, and a CLI that scaffolds, runs, validates, and inspects. **v3.0 makes the world live: named NPCs come alive with goals, trust/fear/greed/loyalty relationships, obligation ledgers, and consequence chains; the social layer earns passively and spends across twenty-one new diplomacy/sabotage verbs; the economy is genre-flavored per starter; and the leverage you earn finally reaches the campaign endings it gates. A Phase-9 audit caught the headline wired-but-inert in shipped content — the fix ships a named NPC in every starter.**

**Recent release arc (v2.4.0–v3.0.0):**
- v2.4.0 — Party combat (ally-targeting / heal / buff / revive, friend-foe AoE), status-effect system (modifiers + DoT/HoT + reactive triggers), plug-in Profiles Phase 1, content `validate`/`scaffold` CLI
- v2.5.0 — Per-entity rule resolution (mixed-playstyle combat), the `applyProfile` loader + per-entity abilities, profile templates + `profile` CLI, and a full health pass
- v2.6.0 — The `run` command became a real game: enemies act on their own AI profiles, victory/defeat, save/resume, abilities and XP on the menu, the `ai` studio bin, and the narration stack
- v2.7.0 — The world reacts and there's a reason to return: heat → pressures → narrated consequences, zone-entry encounters, a quest loop + Journal, equipment in combat, seeded replayable runs, live endgame inputs, `buildWorldStack`, the Director's Ledger, and a save-migration seam
- v2.8.0 — Act on the world you live in: a live trade economy + `sell` verb, companions you recruit and fight beside, and a Director's Ledger reading the whole board — one write-wire per system lit ~12 consumers that shipped dark
- v2.9.0 — Close the loops: `buy` + merchant stock and crafting complete the economy; companions take independent turns; four social verbs (bribe / intimidate / petition / seed) run on a leverage economy funded by opportunity rewards; opportunities resolve with expiry + favor-fallout consequence; and equipment, quests, recruitables, and starting coin roll out uniformly to all ten starters
- **v3.0.0 — Make the world live: the npc-agency producer lights named NPCs (goals / relationships / obligation ledgers / consequence chains) plus a story NPC in every starter; the social surface grows to 25 verbs (diplomacy + sabotage) with passive leverage income and dialogue that reads social state; per-starter genre-flavored stock + recipes; the leverage endings (victory / puppet-master / quiet-retirement) become reachable; repair/modify menu rows, escort opportunities, and an `audit-content` dev CLI — shipped through a Phase-9 audit that caught two dead-wires the green test suite hid**

### Prochain (la structure v2.8)

- **Living NPCs** — the persisted npc-agency producer that lights the Director's PEOPLE section: named NPCs with goals, relationship breakpoints, obligation ledgers, and consequence chains, plus companion-morale favor-fallout and the departure-risk path the reaction system already carries
- Genre-flavored merchant stock and crafting recipes (per-starter genre threading over the universal fallback that ships today), and the `repair`/`modify` menu surface
- The leverage economy's next layer — passive income beyond opportunity rewards, and social verbs beyond the shipped four (diplomacy / sabotage groups) — plus the dialogue condition/effect vocabulary that reads the new social state
- Multiplayer — two *human* players sharing one world (a networking layer, deliberately deferred; single-controller shared profiles ship today as [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Serializable formula overrides — per-profile formula tuning (blocked on a formula DSL; profiles carry stat mappings today, not closures)
- API documentation sync — ensure every handbook page reflects the latest APIs

### Destination : Profils des appareils connectés

The engine's end goal is **user-defined profiles** — portable bundles that slot into any game. A profile packages a stat mapping, resource behavior, AI bias tags, and abilities into a single importable unit. As of v2.5, entities in one world can each carry their own profile and resolve combat per-entity — a `might` fighter and a `will` mystic share a party, each bringing their own playstyle.

The schema, the `applyProfile` loader, per-entity ability resolution, and cross-profile validation are all shipped. What remains is multiplayer — letting two *human* players (not just two entities) share a world — which is a networking layer. See [Profile Roadmap](docs/profile-roadmap.md) and [feature-architecture.md](docs/feature-architecture.md) for the design.

---

## Philosophie

Le moteur de jeu de rôle basé sur l’IA repose sur trois idées principales :

1. **Mondes déterministes** : les résultats de la simulation doivent être reproductibles.
2. **Conception basée sur des preuves** : les mécanismes du monde doivent être testés par le biais de simulations.
3. **L’IA en tant qu’assistant, et non autorité** : les outils d’IA aident à générer et à évaluer les conceptions, mais ne remplacent pas les systèmes déterministes.

Pour une explication complète, consultez le fichier [PHILOSOPHY.md](PHILOSOPHY.md).

---

## Sécurité

The core engine is a **local-only simulation library**: no telemetry, no network, no secrets. Save files go to `.ai-rpg-engine/` only when explicitly requested. Two **optional** layers add an outbound path, and only when you invoke them:

- The AI layer (`@ai-rpg-engine/ollama`) talks to a **local** Ollama daemon; its opt-in `webfetch` (for RAG) is confined by an SSRF guard (blocks loopback/link-local/CGNAT/cloud-metadata and IPv6-tunnelled equivalents).
- The ledger layer (`@ai-rpg-engine/ledger-adapter`) reaches the **XRPL testnet** — and only the testnet: a **mainnet-impossible-in-code** structural guard (not a config flag) rejects any non-testnet host at construction. Wallet seeds live in a gitignored secrets sidecar, never in a save file, and the deterministic core never imports the adapter.

Pour plus de détails, consultez le fichier [SECURITY.md](SECURITY.md).

## Prérequis

- Node.js >= 20
- TypeScript (modules ESM)

## Licence

[MIT](LICENSE)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
