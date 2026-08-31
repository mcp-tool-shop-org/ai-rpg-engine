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

# Moteur de jeu de rôle basé sur l’IA

Une boîte à outils TypeScript pour créer des simulations de jeu de rôle déterministes. Vous définissez les statistiques, choisissez des modules, configurez une pile de combat et créez du contenu. Le moteur gère l’état, les événements, le générateur de nombres aléatoires, la résolution des actions et la prise de décision par l’IA. Chaque exécution est reproductible.

Il s’agit d’un **moteur de composition**, et non d’un jeu fini. Les 12 mondes de départ sont des exemples : des modèles décomposables à partir desquels vous pouvez apprendre et créer de nouvelles choses. Votre jeu utilise la partie du moteur dont vous avez besoin.

---

## Ce que c’est

- Une **bibliothèque de modules** : plus de 30 modules pour le moteur, couvrant le combat, la perception, la cognition, les factions, les rumeurs, le déplacement, les compagnons, etc.
- Une **boîte à outils de composition** : `buildCombatStack()` configure le combat en environ 7 lignes ; `new Engine({ modules })` lance le jeu
- Un **environnement d’exécution de simulation** : cycles déterministes, journaux d’actions rejouables, générateur de nombres aléatoires avec amorçage
- Un **studio de conception d’IA** (facultatif) : échafaudage, évaluation, analyse de l’équilibre, réglage, expériences via Ollama
- Une **couche facultative sur la chaîne de blocs** : `@ai-rpg-engine/ledger-adapter` permet de garantir la valeur d’une monnaie et d’objets échangeables dans un jeu à l’aide de jetons XRPL **testnet** réels, réglés à des points de contrôle, entièrement en dehors du noyau déterministe (facultatif ; une exécution est identique au niveau des octets sans cela)

## Ce que ce n’est pas

- Ce n’est pas un jeu fini : il propose 12 mondes de départ jouables que vous pouvez `run` dès aujourd’hui à titre d’exemple, et le moteur est la boîte à outils à partir de laquelle vous créez *votre propre* jeu.
- Ce n’est pas un moteur graphique : il génère des événements structurés, et non des pixels.
- Ce n’est pas un générateur d’histoires : il simule des mondes ; la narration émerge des mécanismes.

---

## État actuel (v3.8.1)

**What works and is tested:**
- **The host surface is on the Engine (v3.8.1):** `hash`, `present`, `preview`, `getAvailableActions`, `advanceRound`, sidecar `listActions` + save/load, studio `emit-pack`, JSON pack catalogs and `ruleProfiles`. A Godot attach and a JSON `--content` boot no longer copy CLI internals to invent those seams. 7893 tests.
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
- Full test suite: **7893 tests** (deterministic across repeated runs; test files typechecked in CI; coverage ratchet-enforced)

**Ce qui est imparfait ou incomplet :**
- L’atelier de création de mondes par IA (couche Ollama) est moins testé que le noyau de simulation et nécessite un démon Ollama local ; il est entièrement facultatif — le moteur et la boucle `run` n’ont besoin d’aucun réseau.
- La pile de narration/audio génère des commandes audio déterministes, mais il n’y a **pas de backend audio terminal** — aucun son n’est produit ; les commandes servent d’interface d’intégration pour un GUI/un module d’intégration web.
- Le mode multijoueur (deux joueurs humains partageant un même monde) n’est **pas** intégré — il s’agit d’une couche réseau, exclue intentionnellement du champ d’application ; les profils actuels sont conçus pour un seul contrôleur.
- `replay --replay` restaure la sauvegarde au lieu de simuler à nouveau — et après la version 2.9, c’est la **direction** choisie, et non un report : `Engine.serialize()` est déjà un instantané complet et validé de l’état, tandis qu’une resimulation devrait suivre l’état du monde/les événements qui se déroulent en dehors du journal des actions. La version 2.9 propose des emplacements de sauvegarde multi-points de contrôle sur ce chemin de restauration validé ; une resimulation basée sur les événements n’est pas prévue.
- La version 3.1 a supprimé les trois limites définies de la version 3.0 — le **niveau de départ** du genre, les recettes de *réparation* spécifiques au genre et la surface du menu `deny` / `bury-scandal` sont désormais toutes intégrées. La seule limite qui reste est que ces nouvelles recettes de réparation de genre incluent un `statDelta` (un petit bonus de statistiques) que `resolveRepair` n’applique pas encore — la réparation *restaure*, `modify` *améliore* — la réparation en tant qu’amélioration est donc marquée dans le code et **reportée à la version 3.2/3.3** en tant que mécanique délibérée, et non comme un champ inerte silencieux. Et `obligation-exists` est livré avec une démonstration (Frère Aldric) ; la condition est active pour que les créateurs de contenu puissent proposer davantage de dialogues.
- La documentation est complète, mais toutes les pages du manuel ne reflètent pas les dernières API.

---

## À quoi cela ressemble

L’interface utilisateur terminal intégrée compose chaque tour en sections étiquetées — scène, statut, journal et actions — avec un HUD facile à consulter. Par défaut, la sortie est du texte brut et ajoute une couleur sémantique sur un TTY (rouge pour les dégâts, vert pour les soins, jaune pour les rejets), en respectant `NO_COLOR` et les canaux non-TTY ; chaque indication est également incluse dans le texte, et non uniquement dans la couleur.

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

Lancez un jeu de démarrage ou créez le vôtre à partir du terminal :

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

La boucle `run` est une véritable session au tour par tour : les ennemis agissent en fonction de leurs propres profils d’IA, les capacités et l’expérience sont disponibles dans le menu, vous pouvez sauvegarder et reprendre, et un combat se termine par une victoire ou une défaite. Chaque partie est déterministe et rejouable.

Facultativement, l’atelier de conception d’IA s’installe en tant que commande distincte :

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

L’atelier communique avec un démon [Ollama](https://ollama.com) local — exécutez d’abord `ollama serve` et `ollama pull qwen2.5-coder`. C’est entièrement facultatif ; le moteur et la boucle `run` n’ont besoin d’aucun réseau.

Une image de conteneur est publiée sur GHCR en tant que `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` pour les exécutions CI et en environnement isolé.

---

## Démarrage rapide

Préférez-vous créer votre propre jeu en utilisant du code ? Composez le moteur à partir de modules :

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

Consultez le [Guide de composition](site/src/content/docs/handbook/57-composition-guide.md) pour connaître le flux de travail complet, ou créez un nouveau jeu de démarrage :

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architecture

| Couche | Rôle |
|-------|------|
| **Core Runtime** | Moteur déterministe — état du monde, événements, actions, cycles, RNG, relecture |
| **Modules** | Plus de 30 systèmes composables — combat, perception, cognition, factions, déplacement, compagnons, etc. |
| **Content** | Entités, zones, dialogues, objets, capacités, statuts — créés par l’auteur |
| **AI Studio** | Couche Ollama facultative — création de prototypes, critique, analyse de l’équilibre, réglage, expériences |

---

## L’adaptateur du registre XRPL (facultatif)

`@ai-rpg-engine/ledger-adapter` est un **paquet facultatif** qui lie la **couche échangeable appartenant au joueur** d’un jeu — le solde `coin` et l’inventaire d’objets consommables que les verbes `trade-core` `buy`/`sell` modifient déjà — au **testnet XRPL**, de sorte que ces actifs peuvent être adossés à de véritables jetons du registre et réglés aux points de contrôle. L’absence d’un adaptateur correspond exactement au moteur hors ligne qui est livré aujourd’hui.

**L’invariant du déterminisme (le but ultime).** L’adaptateur est un *canal secondaire*, et non une partie de la simulation :

- Il n’est **jamais invoqué à l’intérieur du cycle déterministe** — uniquement aux **points de contrôle** (sauvegarde, entrée dans une ville/un marché, fin de chapitre).
- Rien dans `@ai-rpg-engine/core` ou `@ai-rpg-engine/modules` ne l’importe (sa seule dépendance au moteur est un `import type` au moment de la compilation).
- **Une exécution est identique, avec ou sans lui.** Un test de pare-feu exécute la boucle du marchand `starter-pirate` `createGame()` réelle sur deux moteurs — l’un avec l’adaptateur activé et réglant aux points de contrôle — et vérifie que les deux mondes sont profondément égaux. La relecture avec la graine 0 n’est pas affectée.

**Niveaux d’intégration — un jeu l’intègre aussi profondément que son design le souhaite.** Le pare-feu est une *frontière de déterminisme*, et non une règle anti-intégration ; l’invariant ci-dessus est valable à tous les niveaux :

| Niveau | Ce qui dépend de l’adaptateur | Correspondance |
|-------|-----------------------------|------|
| **L0 — External observer** | Rien à l’intérieur du jeu ; l’adaptateur se connecte de l’extérieur aux points de contrôle et le jeu n’en a pas conscience. | Adaptation d’un jeu existant (la démo du pirate fournie). |
| **Niveau 1 — Points de contrôle pilotés par le jeu** | Le flux de sauvegarde/ville/progression méta propre au jeu appelle l’adaptateur à des moments définis. | Un jeu qui souhaite des moments délibérés dans le registre. |
| **L2 — Ledger-native design** | L’économie ou l’identité du jeu est conçue *autour* de la propriété sur la chaîne (émetteur persistant, marchés réels). | Un jeu de marchand axé sur le registre. |

La distinction qui garantit la sécurité de la relecture n’est **pas** « quel paquet importe l’adaptateur », mais « l’appel se fait-il à l’intérieur du cycle ». Un paquet de jeu peut importer et piloter l’adaptateur librement, à condition que chaque appel se produise à un point de contrôle en dehors de la boucle de relecture pilotée par la graine.

**Trois modes de jeu.** `offline` (par défaut — pas de chaîne, le moteur tel qu’il est livré) · `ledger` (pièces/objets adossés aux soldes du testnet, réglés aux points de contrôle) · `diary` (jouer hors ligne, puis ancrer le hachage de l’état de l’exécution sur le registre pour obtenir un reçu inviolable).

**Ce qui figure dans le grand livre.** `coin` → une promesse de paiement en devise émise sur une ligne de confiance ;
articles consommables → jetons fongibles ; le delta net des échanges d’un point de contrôle → un transfert validé via le **système de dépôt fiduciaire de jetons XLS-85**. Les équipements uniques sont fournis sous forme de **NFT XLS-20** (v3.3), et l’évolution des reliques fait progresser les métadonnées d’un NFT mutable en place via **XLS-46 `NFTokenModify`** — ce processus est basé sur le jeu réel à partir de la version 3.4. L’économie du district abstrait (`economy-core`) n’est *pas* modifiée ; elle reste une simulation pure.

**Mesures de sécurité.** Uniquement pour le testnet, avec une protection structurelle **impossible sur le mainnet** (et non un simple indicateur de configuration) ; les clés de portefeuille sont stockées dans un fichier secondaire de secrets ignoré par Git, et non dans le fichier d’enregistrement ; la validation est idempotente et sécurisée en cas de nouvelle tentative ; les preuves vérifient le **mémo réel sur la chaîne** (et non la chaîne de caractères propre au moteur) ; et si la chaîne est inaccessible, l’exécution se poursuit simplement, en étant marquée comme *non ancrée*.

**Résultats concrets.** Une simulation réelle d’un marchand `starter-pirate` — vente d’un coutelas, achat d’un obus — validée sur le testnet XRPL via un système de dépôt fiduciaire de jetons, puis `reconcile()` confirme les soldes et les mémos du grand livre par rapport à l’économie du moteur (les règles de conservation s’appliquent à chaque jeton). Le grand livre est un système différent du moteur, de sorte que le moteur ne peut pas le falsifier ; la réconciliation est une vérification externe authentique. Uniquement pour le testnet ; les actifs sont des reçus spécifiques au jeu, et non des titres.

---

## Système de combat

Cinq actions (attaque, garde, désengagement, préparation, repositionnement), quatre états de combat (protégé, déséquilibré, exposé, en fuite), quatre états d’engagement (engagé, protégé, en ligne arrière, isolé). Trois dimensions statistiques déterminent chaque formule, de sorte qu’un duelliste rapide joue différemment d’un combattant lourd ou d’un sentinelle calme.

Les adversaires dotés d’IA utilisent un système de notation unifié pour la prise de décision ; les actions et les capacités de combat sont évaluées dans une seule évaluation, avec des seuils configurables pour éviter l’utilisation excessive de capacités marginales.

Les créateurs de packs utilisent `buildCombatStack()` pour définir le combat à partir d’une cartographie des statistiques, d’un profil de ressources et d’étiquettes de biais. Voir la section [Aperçu du combat](site/src/content/docs/handbook/49a-combat-overview.md) et le [Guide du créateur de packs](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Capacités

Système de capacités natif du genre, avec des coûts, des vérifications de statistiques, des temps de recharge et des effets typés (dégâts, soins, application d’état, suppression). Les effets d’état utilisent un vocabulaire sémantique de 11 étiquettes, avec des profils de résistance/vulnérabilité. Les scores de sélection tenant compte de l’IA déterminent les trajectoires auto/AoE/cible unique.

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
| [`@ai-rpg-engine/core`](packages/core) | Environnement de simulation déterministe — état du monde, événements, RNG, cycles, résolution des actions |
| [`@ai-rpg-engine/modules`](packages/modules) | Plus de 30 modules composables — combat, perception, cognition, factions, rumeurs, déplacement, compagnons, autonomie des PNJ, carte stratégique, reconnaissance des objets, opportunités émergentes, détection d’arcs narratifs, déclencheurs de fin de partie |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schémas et validateurs canoniques pour le contenu du monde |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progression du personnage, blessures, étapes importantes, réputation |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Sélection d’archétypes, génération de builds, équipement de départ |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Types d’équipement, provenance des objets et évolution des reliques — y compris `item-chronicle-core`, le module optionnel qui enregistre l’historique de l’équipement à partir du jeu réel, de sorte que les objets obtiennent des épithètes et des niveaux |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Mémoire intersessions, effets relationnels, état de la campagne |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Cycle de vie des rumeurs, mécanismes de mutation, suivi de la propagation |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schéma du plan narratif, contrats de rendu, profils vocaux |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Planification des signaux, priorité, atténuation, logique de temps de recharge |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifestes des packs de sons, registre adressable par contenu |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Enregistrement des packs, notation rubriques, découverte des packs |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Stockage adressé par contenu pour les portraits, les icônes, les médias |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Génération de portraits sans interface, avec des fournisseurs modulables |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Création d’IA optionnelle — échafaudage, critique, flux de travail guidés, réglage, expériences |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI : exécution des jeux, création de modèles de départ, inspection des enregistrements |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Moteur de rendu terminal et couche d’entrée |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Départ commercial — le pack de référence pour l’adaptateur du grand livre, qui n’en dépend pas |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Départ voleur — la poursuite comme boucle, et quelle moitié de la ville vous ouvrira une porte |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Optionnel** — validation optionnelle sur le testnet XRPL pour la couche échangeable appartenant au joueur (pièce/inventaire/échange), via le système de dépôt fiduciaire de jetons XLS-85 aux points de contrôle, entièrement en dehors du noyau déterministe |

### Exemples de départ

Les 12 mondes de départ sont des **exemples de composition** — ils montrent comment combiner les modules du moteur pour créer des jeux complets. Chacun d’eux présente différents modèles (cartographies des statistiques, profils de ressources, configurations d’engagement, ensembles de capacités). Voir la section README de chaque départ pour connaître les « Modèles démontrés » et « Ce qu’il faut emprunter ».

| Départ | Genre | Principaux modèles |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasy sombre | Combat minimal, axé sur le dialogue |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Ressources, rôles d’engagement |
| [`starter-detective`](packages/starter-detective) | Mystère victorien | Axé sur le social, lourd en termes de perception |
| [`starter-pirate`](packages/starter-pirate) | Pirate | Naval + mêlée, multi-zones |
| [`starter-zombie`](packages/starter-zombie) | Survie aux zombies | Pénurie, ressource d’infection |
| [`starter-weird-west`](packages/starter-weird-west) | Western étrange | Biais des packs, récupération dans une zone sûre |
| [`starter-colony`](packages/starter-colony) | Colonie de science-fiction | Points d’étranglement, zones d’embuscade |
| [`starter-ronin`](packages/starter-ronin) | Japon féodal | Passages cachés, plusieurs rôles de protecteur |
| [`starter-merchant`](packages/starter-merchant) | Commercial | L’obligation comme boucle, le combat est un coût |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Poursuite | Chasse aux gens pour gagner de l’argent ; la violence est bruyante, mais pas interdite |
| [`starter-vampire`](packages/starter-vampire) | Horreur vampirique | Ressource sanguine, manipulation sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiateur historique | Combat d’arène, faveur de la foule |

---

## Documentation

| Ressource | Description |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Création d'un nouveau jeu — via l'interface en ligne de commande ou en utilisant un modèle manuel |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Créez votre propre jeu en assemblant des modules du moteur |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Résolution des règles par entité — combats avec styles de jeu mixtes, `applyProfile`, modèles de profil, l'interface en ligne de commande `profile` |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Intégration optionnelle sur le registre — pare-feu de déterminisme, niveaux d'intégration L0/L1/L2, modes de jeu, mesures de sécurité et démonstration de pirate testée en direct |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Six piliers de combat, cinq actions, états en un coup d'œil |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Création étape par étape de `buildCombatStack`, mappage des statistiques, profils de ressources |
| [Handbook](site/src/content/docs/handbook/index.md) | Manuel complet — tous les systèmes, plus 4 annexes |
| [Composition Model](docs/composition-model.md) | Les 6 couches réutilisables et leur composition |
| [Examples](docs/examples/) | Exemples exécutables en TypeScript (vérifiés par type et testés en termes de comportement dans l'environnement CI) — groupe mixte par entité, profils partagés, inter-mondes, à partir de zéro |
| [Design Document](docs/DESIGN.md) | Analyse approfondie de l'architecture — pipeline d'actions, vérité par rapport à la présentation |
| [Philosophy](PHILOSOPHY.md) | Mondes déterministes, conception basée sur des preuves, IA en tant qu'assistant |
| [Changelog](CHANGELOG.md) | Historique des versions |

---

## Feuille de route

### Où nous en sommes

Les deux axes de composition sont terminés — 6412 tests sur 326 fichiers, tous les 12 modèles de départ sur `buildCombatStack` **et** `buildWorldStack`, relecture byte-identical déterministe sous des séquences imprimées, notation complète des décisions de l'IA et une interface en ligne de commande qui crée, exécute, valide et inspecte. **La v3.0 donne vie au monde : les PNJ nommés prennent vie avec des objectifs, des relations de confiance/peur/avidité/loyauté, des registres d'obligations et des chaînes de conséquences ; la couche sociale gagne passivement et dépense sur vingt-et-un nouveaux verbes de diplomatie/sabotage ; l'économie est adaptée au genre pour chaque modèle de départ ; et l'influence que vous gagnez atteint enfin les fins de campagne qu'elle ouvre. Un audit de la phase 9 a détecté un élément principal fonctionnel mais inerte dans le contenu livré — la correction inclut un PNJ nommé dans chaque modèle de départ.**

**Dernière série de versions (v2.4.0–v3.0.0) :**
- v2.4.0 — Combat de groupe (ciblage des alliés / soin / amélioration / réanimation, système d'effets de statut (modificateurs + DoT/HoT + déclencheurs réactifs), phase 1 des profils plug-in, contenu CLI `validate`/`scaffold`
- v2.5.0 — Résolution des règles par entité (combat avec styles de jeu mixtes), le chargeur `applyProfile` + capacités par entité, modèles de profil + CLI `profile` et une révision complète de la santé
- v2.6.0 — La commande `run` est devenue un véritable jeu : les ennemis agissent en fonction de leurs propres profils d'IA, victoire/défaite, sauvegarde/reprise, capacités et XP dans le menu, le dossier `ai` du studio et la pile de narration
- v2.7.0 — Le monde réagit et il y a une raison de revenir : chaleur → pressions → conséquences narrées, rencontres à l'entrée de la zone, une boucle de quête + Journal, équipement au combat, exécutions rejouables avec des séquences, entrées de fin de partie en direct, `buildWorldStack`, le registre du directeur et une jonction de migration de sauvegarde
- v2.8.0 — Agissez sur le monde dans lequel vous vivez : une économie commerciale en direct + le verbe `sell`, des compagnons que vous recrutez et avec lesquels vous combattez, et un registre du directeur qui analyse l'ensemble du tableau — un fil de connexion par système allumé ~12 consommateurs qui ont été livrés en mode sombre
- v2.9.0 — Fermez les boucles : `buy` + les stocks des marchands et l'artisanat complètent l'économie ; les compagnons effectuent des tours indépendants ; quatre verbes sociaux (corruption / intimidation / requête / amorce) fonctionnent sur une économie d'influence financée par des récompenses d'opportunité ; les opportunités se résolvent avec une date d'expiration + des conséquences de faveur ; et l'équipement, les quêtes, les recrues et la monnaie de départ sont distribués uniformément à tous les dix modèles de départ
- **v3.0.0 — Donnez vie au monde : le producteur d'agence des PNJ allume les PNJ nommés (objectifs / relations / registres d'obligations / chaînes de conséquences) plus un PNJ narratif dans chaque modèle de départ ; la surface sociale s'étend à 25 verbes (diplomatie + sabotage) avec un revenu d'influence passif et un dialogue qui lit l'état social ; stocks et recettes adaptés au genre par modèle de départ ; les fins d'influence (victoire / maître marionnettiste / retraite tranquille) deviennent accessibles ; lignes de menu de réparation/modification, opportunités d'escorte et une CLI de développement `audit-content` — livrés grâce à un audit de la phase 9 qui a détecté deux fils morts que la suite de tests verts a masqués**

### Prochain (l'axe de la v3.0)

- **PNJ vivants** — le producteur d'agence des PNJ persistant qui allume la section PEOPLE du directeur : PNJ nommés avec des objectifs, des points de rupture des relations, des registres d'obligations et des chaînes de conséquences, plus la faveur/les conséquences de moral des compagnons et le chemin de risque de départ que le système de réaction porte déjà
- Stocks et recettes d'artisanat adaptés au genre (par modèle de départ, en filigrane sur la valeur par défaut universelle qui est livrée aujourd'hui), et la surface du menu `repair`/`modify`
- La prochaine couche de l'économie d'influence — un revenu passif au-delà des récompenses d'opportunité et des verbes sociaux au-delà des quatre verbes livrés (groupes de diplomatie / sabotage) — plus le vocabulaire de condition/effet du dialogue qui lit le nouveau statut social
- Multijoueur — deux joueurs *humains* partageant un monde (une couche de mise en réseau, délibérément différée ; les profils partagés à contrôleur unique sont livrés aujourd'hui sous la forme de [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Substitutions de formules sérialisables — réglage des formules par profil (bloqué sur un DSL de formule ; les profils contiennent aujourd'hui des mappages de statistiques, et non des fermetures)
- Synchronisation de la documentation de l'API — assurez-vous que chaque page du manuel reflète les dernières API

### Destination : Profils plug-in

L'objectif final du moteur est les **profils définis par l'utilisateur** — des ensembles portables qui s'insèrent dans n'importe quel jeu. Un profil regroupe un mappage de statistiques, un comportement de ressource, des balises de biais d'IA et des capacités dans une seule unité importable. Depuis la v2.5, les entités d'un monde peuvent chacune avoir leur propre profil et résoudre le combat par entité — un combattant `might` et un mystique `will` partagent un groupe, chacun apportant son propre style de jeu.

Le schéma, le chargeur `applyProfile`, la résolution des capacités par entité et la validation inter-profils sont tous livrés. Ce qui reste, c'est le multijoueur — qui permet à deux joueurs *humains* (et pas seulement à deux entités) de partager un monde — ce qui est une couche de mise en réseau. Consultez [Feuille de route du profil](docs/profile-roadmap.md) et [feature-architecture.md](docs/feature-architecture.md) pour la conception.

---

## Philosophie

Le moteur de jeu de rôle basé sur l’IA est conçu autour de trois idées :

1. **Mondes déterministes** : les résultats de la simulation doivent être reproductibles.
2. **Conception basée sur les données** : les mécanismes du monde doivent être testés par le biais de simulations.
3. **L’IA en tant qu’assistant, et non autorité** : les outils d’IA aident à générer et à évaluer les conceptions, mais ne remplacent pas les systèmes déterministes.

Pour une explication complète, consultez le fichier [PHILOSOPHY.md](PHILOSOPHY.md).

---

## Sécurité

Le moteur principal est une **bibliothèque de simulation locale uniquement** : pas de télémétrie, pas de réseau, pas de données sensibles. Les fichiers de sauvegarde sont enregistrés uniquement dans `.ai-rpg-engine/` lorsque cela est explicitement demandé. Deux **couches facultatives** ajoutent une voie de communication sortante, et ce uniquement lorsque vous les activez :

- La couche d’IA (`@ai-rpg-engine/ollama`) communique avec un démon Ollama **local** ; son option d’activation `webfetch` (pour RAG) est limitée par une protection contre les attaques SSRF (qui bloque les adresses de loopback/link-local/CGNAT/cloud-metadata et leurs équivalents IPv6).
- La couche de registre (`@ai-rpg-engine/ledger-adapter`) accède au **testnet XRPL** — et uniquement au testnet : une protection structurelle **impossible en code sur le mainnet** (et non un simple indicateur de configuration) rejette tout hôte autre que le testnet lors de sa création. Les clés de portefeuille sont stockées dans un fichier de secrets ignoré par Git, jamais dans un fichier de sauvegarde, et le noyau déterministe n’importe jamais l’adaptateur.

Pour plus de détails, consultez le fichier [SECURITY.md](SECURITY.md).

## Prérequis

- Node.js >= 20
- TypeScript (modules ESM)

## Licence

[MIT](LICENSE)

---

Développé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
