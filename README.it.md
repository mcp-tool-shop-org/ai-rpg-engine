<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Motore per RPG basato sull'IA

Un set di strumenti TypeScript per creare simulazioni di giochi di ruolo deterministiche. Si definiscono le statistiche, si selezionano i moduli, si configura una sequenza di combattimento e si crea il contenuto. Il motore gestisce lo stato, gli eventi, il generatore di numeri casuali, la risoluzione delle azioni e il processo decisionale dell'IA. Ogni esecuzione è riproducibile.

Questo è un **motore di composizione**, non un gioco completo. I 12 mondi iniziali sono esempi: modelli scomponibili da cui si può imparare e da cui si possono ricavare nuove idee. Il gioco utilizza la parte del motore di cui si ha bisogno.

---

## Cos'è questo

- Una **libreria di moduli**: oltre 30 moduli del motore che coprono combattimento, percezione, cognizione, fazioni, voci, movimento, compagni e altro
- Un **set di strumenti di composizione**: `buildCombatStack()` configura il combattimento in circa 7 righe; `new Engine({ modules })` avvia il gioco
- Un **ambiente di simulazione**: cicli deterministici, registri di azioni riproducibili, generatore di numeri casuali con seme
- Uno **studio di progettazione dell'IA** (opzionale): scheletro, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti tramite Ollama
- Un **livello opzionale sulla blockchain**: `@ai-rpg-engine/ledger-adapter` supporta la valuta e gli oggetti scambiabili di un gioco con token XRPL reali sulla **testnet**, regolati in punti di controllo, completamente al di fuori del nucleo deterministico (opzionale; un'esecuzione è identica a livello di byte senza di esso)

## Cos'è questo non

- Not a single finished game — it ships 12 playable starter worlds you can `run` today as examples, and the engine is the toolkit you compose your *own* game from
- Not a visual engine — it outputs structured events, not pixels
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## Stato attuale (v3.8.1)

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

**Cosa è incompleto o approssimativo:**
- Lo studio di creazione di mondi basato sull'IA (livello Ollama) è testato in modo meno approfondito rispetto al motore di simulazione e richiede un daemon Ollama locale; è completamente opzionale: il motore e il ciclo `run` non necessitano di una connessione di rete.
- Lo stack di narrazione/audio genera comandi audio deterministici, ma non è presente un backend audio terminale: nessun suono viene riprodotto; i comandi sono un punto di integrazione per un'interfaccia utente grafica/un componente web.
- Il multiplayer (due giocatori umani che condividono un mondo) non è implementato: si tratta di un livello di rete, escluso intenzionalmente dall'ambito; i profili attuali sono progettati per un singolo controller.
- `replay --replay` ripristina il salvataggio invece di rieseguire la simulazione e, dopo la versione 2.9, questa è la direzione definitiva, non un rinvio: `Engine.serialize()` è già uno snapshot completo e collaudato dello stato, mentre la riesecuzione della simulazione dovrebbe tenere traccia dello stato del mondo/degli incontri che si trova al di fuori del registro delle azioni. La versione 2.9 include slot di salvataggio multi-checkpoint lungo questo percorso di ripristino collaudato; una vera e propria riesecuzione basata sugli eventi non è prevista.
- La versione 3.1 ha eliminato i tre limiti definiti della versione 3.0: l'offerta iniziale del genere, le ricette di riparazione specifiche del genere e l'interfaccia `deny` / `bury-scandal` sono ora disponibili. L'unico limite rimasto è che queste nuove ricette di riparazione del genere includono un bonus statistico `statDelta` (un piccolo bonus alle statistiche) che `resolveRepair` non applica ancora: la riparazione *ripristina*, `modify` *migliora*, quindi la riparazione come miglioramento è contrassegnata nel codice ed è *rinviata alla versione 3.2/3.3* come meccanica intenzionale, non un campo inerte silenzioso. Inoltre, `obligation-exists` include una demo con un personaggio (Fratello Aldric); la condizione è attiva per consentire agli autori di contenuti di aggiungere più dialoghi.
- La documentazione è estesa, ma non tutte le pagine del manuale riflettono le API più recenti.

---

## Come si presenta

L'interfaccia utente terminale inclusa compone ogni turno in sezioni etichettate: scena, stato, registro e azioni, con un'interfaccia utente di facile consultazione. L'output è testo semplice per impostazione predefinita e aggiunge colori semantici su un terminale (danni in rosso, guarigioni in verde, rifiuti in giallo), rispettando `NO_COLOR` e i canali non-terminale; ogni indicazione è inclusa nel testo, mai solo nel colore.

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

## Installazione e avvio

Avvia un gioco di esempio o crea il tuo gioco personalizzato dal terminale:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

Il ciclo `run` è una vera e propria sessione a turni: i nemici agiscono in base ai propri profili di intelligenza artificiale, le abilità e i punti esperienza sono disponibili nel menu, è possibile salvare e riprendere e un combattimento termina con una vittoria o una sconfitta. Ogni partita è deterministica e può essere rigiocata.

Facoltativamente, lo studio di progettazione dell'IA può essere installato come comando separato:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

Lo studio comunica con un daemon Ollama locale: esegui prima `ollama serve` e `ollama pull qwen2.5-coder`. È completamente opzionale; il motore e il ciclo `run` non necessitano di una connessione di rete.

Un'immagine container viene pubblicata su GHCR come `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` per i test CI e le esecuzioni in ambiente isolato.

---

## Avvio rapido

Preferisci creare il tuo gioco personalizzato nel codice? Assembla il motore dai moduli:

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

Consulta la [Guida alla composizione](site/src/content/docs/handbook/57-composition-guide.md) per il flusso di lavoro completo, oppure crea un nuovo gioco di esempio:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architettura

| Livello | Ruolo |
|-------|------|
| **Core Runtime** | Motore deterministico: stato del mondo, eventi, azioni, tick, RNG, rigiocabilità |
| **Modules** | Oltre 30 sistemi componibili: combattimento, percezione, cognizione, fazioni, movimento, compagni, ecc. |
| **Content** | Entità, zone, dialoghi, oggetti, abilità, stati: creati dall'autore |
| **AI Studio** | Livello Ollama opzionale: creazione di prototipi, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti |

---

## L'adattatore del registro XRPL (opzionale)

`@ai-rpg-engine/ledger-adapter` è un pacchetto **opzionale** che associa il **livello di gioco di proprietà del giocatore e negoziabile** (il saldo `coin` e l'inventario di oggetti consumabili che i verbi `trade-core` `buy`/`sell` gestiscono già) al **testnet XRPL**, in modo che tali risorse possano essere supportate da token reali sul registro e regolate ai checkpoint. L'assenza dell'adattatore corrisponde esattamente al motore offline disponibile oggi.

**L'invariante del determinismo (il punto cruciale).** L'adattatore è un *canale secondario*, che non fa mai parte della simulazione:

- Non viene mai invocato all'interno del tick deterministico, ma solo ai **checkpoint** (salvataggio, ingresso in città/mercato, fine del capitolo).
- Nulla in `@ai-rpg-engine/core` o `@ai-rpg-engine/modules` lo importa (la sua unica dipendenza dal motore è un `import type` in fase di compilazione).
- **Un'esecuzione è identica con o senza.** Un test del firewall esegue il ciclo reale del mercante `starter-pirate` `createGame()` su due motori: uno con l'adattatore abilitato e che effettua la regolazione a un checkpoint, e verifica che i due mondi siano identici. La riproduzione con seme 0 non viene modificata.

**Livelli di integrazione: un gioco lo integra in modo approfondito quanto desidera.** Il firewall è un *confine del determinismo*, non una regola anti-integrazione; l'invariante di cui sopra è valido a tutti i livelli:

| Livello | Cosa dipende dall'adattatore | Si adatta |
|-------|-----------------------------|------|
| **L0 — External observer** | Nulla all'interno del gioco; l'adattatore si collega dall'esterno ai checkpoint e il gioco non ne è a conoscenza. | Riadattamento di un gioco esistente (la demo del pirata disponibile). |
| **L1: checkpoint guidati dal gioco** | Il flusso di salvataggio/città/progressione del gioco chiama l'adattatore in momenti definiti. | Un gioco che desidera momenti di registro deliberati. |
| **L2 — Ledger-native design** | L'economia o l'identità del gioco sono progettate *attorno* alla proprietà on-chain (emittente persistente, mercati reali). | Un gioco di mercanti incentrato sul registro. |

La distinzione che garantisce la sicurezza della riproduzione non è "quale pacchetto importa l'adattatore", ma "la chiamata è all'interno del tick". Un pacchetto di gioco può importare e gestire l'adattatore liberamente, a condizione che ogni chiamata avvenga a un checkpoint al di fuori del ciclo di riproduzione guidato dal seme.

**Tre modalità di gioco.** `offline` (predefinito: nessuna catena, il motore così come viene fornito) · `ledger` (monete/oggetti supportati dai saldi del testnet, regolati ai checkpoint) · `diary` (gioca offline, quindi ancora lo stato dell'esecuzione sul registro per una ricevuta a prova di manomissione).

**Cosa è presente nel registro.** `coin` → una promessa di valuta emessa su una linea di fiducia;
articoli di consumo → token fungibili; la variazione netta delle transazioni di un checkpoint → un trasferimento convalidato tramite **XLS-85 token escrow**. Equipaggiamento unico fornito come **XLS-20 NFT**
(v3.3), con l'evoluzione delle reliquie che aggiorna i metadati di un NFT modificabile tramite
**XLS-46 `NFTokenModify`** — basato sull'effettivo gameplay a partire dalla v3.4. L'economia distrettuale astratta (`economy-core`) *non* viene toccata — rimane una simulazione pura.

**Misure di sicurezza.** Solo per la testnet, con una protezione strutturale **impossibile nella mainnet tramite codice** (non un flag di configurazione); i seed del wallet sono memorizzati in un file secondario ignorato da Git, mai nel file di salvataggio; la convalida è idempotente e sicura per la conservazione nel percorso di ripetizione; le prove verificano il **reale memo sulla blockchain** (non la stringa del motore); e se la blockchain non è raggiungibile, l'esecuzione continua semplicemente, contrassegnata come *non ancorata*.

**Testato in ambiente reale.** Un vero ciclo di transazioni di un commerciante `starter-pirate` — vende una sciabola, acquista un proiettile di cannone — convalidato sulla testnet XRPL tramite token escrow, quindi `reconcile()` conferma i saldi e i memo nel registro rispetto all'economia del motore (la conservazione è garantita per ogni token). Il registro è un sistema diverso dal motore, quindi il motore non può falsificarlo — la riconciliazione è una verifica esterna autentica. Solo per la testnet; gli asset sono ricevute specifiche del gioco, non titoli.

---

## Sistema di combattimento

Cinque azioni (attacco, difesa, disimpegno, preparazione, riposizionamento), quattro stati di combattimento (difeso, sbilanciato, esposto, in fuga), quattro stati di coinvolgimento (coinvolto, protetto, in seconda linea, isolato). Tre dimensioni statistiche guidano ogni formula, quindi un duellante veloce gioca in modo diverso da un combattente pesante o da un sentinella composto.

Gli avversari controllati dall'IA utilizzano un sistema di valutazione delle decisioni unificato: le azioni e le abilità di combattimento competono in un'unica valutazione, con soglie configurabili per evitare l'uso eccessivo di abilità marginali.

Gli autori dei pacchetti utilizzano `buildCombatStack()` per collegare il combattimento a una mappa delle statistiche, un profilo delle risorse e tag di preferenza. Consultare la [Panoramica del combattimento](site/src/content/docs/handbook/49a-combat-overview.md) e la [Guida per gli autori dei pacchetti](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Abilità

Sistema di abilità nativo del genere, con costi, controlli delle statistiche, tempi di ricarica ed effetti tipizzati (danno, guarigione, applicazione di stato, rimozione di stato). Gli effetti di stato utilizzano un vocabolario semantico di 11 tag con profili di resistenza/vulnerabilità. I punteggi di selezione consapevoli dell'IA valutano i percorsi auto/AoE/bersaglio singolo.

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

## Pacchetti

| Pacchetto | Scopo |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Runtime di simulazione deterministico: stato del mondo, eventi, RNG, tick, risoluzione delle azioni |
| [`@ai-rpg-engine/modules`](packages/modules) | Oltre 30 moduli componibili: combattimento, percezione, cognizione, fazioni, voci, attraversamento, compagni, autonomia dei PNG, mappa strategica, riconoscimento degli oggetti, opportunità emergenti, rilevamento dell'arco narrativo, trigger di fine gioco |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi e validatori canonici per i contenuti del mondo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progressione del personaggio, ferite, traguardi, reputazione |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selezione dell'archetipo, generazione del personaggio, equipaggiamento iniziale |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipi di equipaggiamento, provenienza degli oggetti ed evoluzione delle reliquie, incluso `item-chronicle-core`, il modulo opzionale che registra la cronologia dell'equipaggiamento dal gameplay reale in modo che gli oggetti ottengano epiteti e livelli |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria tra sessioni, effetti relazionali, stato della campagna |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo di vita delle voci, meccaniche di mutazione, tracciamento della diffusione |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schema del piano narrativo, contratti di rendering, profili vocali |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Pianificazione delle cue, priorità, attenuazione, logica del tempo di ricarica |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifesti del pacchetto audio, registro indirizzabile in base al contenuto |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registrazione del pacchetto, valutazione della rubrica, scoperta del pacchetto |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Archiviazione indirizzata in base al contenuto per ritratti, icone, media |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generazione di ritratti senza interfaccia utente con provider collegabili |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creazione di contenuti AI opzionale: scaffolding, critica, flussi di lavoro guidati, ottimizzazione, esperimenti |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: esegui giochi, crea progetti iniziali, ispeziona i salvataggi |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderer terminale e livello di input |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Progetto mercantile: il pacchetto di riferimento per l'adattatore del registro, che non dipende da esso |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Progetto "Thief-taker": l'inseguimento come ciclo principale e quale metà della città aprirà una porta per te |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Opzionale:** convalida opzionale sulla testnet XRPL per il livello negoziabile di proprietà del giocatore (monete/inventario/scambi), tramite token escrow XLS-85 ai checkpoint, completamente al di fuori del core deterministico |

### Esempi di progetti iniziali

I 12 mondi iniziali sono **esempi di composizione**: dimostrano come combinare i moduli del motore in giochi completi. Ognuno mostra schemi diversi (mappe delle statistiche, profili delle risorse, configurazioni di coinvolgimento, set di abilità). Consultare il file README di ogni progetto iniziale per "Schemi dimostrati" e "Cosa prendere in prestito".

| Progetto iniziale | Genere | Schemi chiave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Dark fantasy | Combattimento minimo, guidato dal dialogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Risorse, ruoli di coinvolgimento |
| [`starter-detective`](packages/starter-detective) | Mistero vittoriano | Prima di tutto l'aspetto sociale, con grande importanza alla percezione |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Navale + combattimento corpo a corpo, multi-zona |
| [`starter-zombie`](packages/starter-zombie) | Sopravvivenza agli zombie | Scarsità, risorsa dell'infezione |
| [`starter-weird-west`](packages/starter-weird-west) | Weird west | Bias dei pacchetti, recupero in zona sicura |
| [`starter-colony`](packages/starter-colony) | Colonia fantascientifica | Colli di bottiglia, zone di imboscata |
| [`starter-ronin`](packages/starter-ronin) | Giappone feudale | Passaggi nascosti, molteplici ruoli di protettore |
| [`starter-merchant`](packages/starter-merchant) | Mercantile | L'obbligo come ciclo principale, il combattimento ha un costo elevato |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Inseguimento | Caccia alle persone per soldi; la violenza è rumorosa, non proibita |
| [`starter-vampire`](packages/starter-vampire) | Horror vampiresco | Risorsa del sangue, manipolazione sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiatore storico | Combattimento nell'arena, favore della folla |

---

## Documentazione

| Risorsa | Descrizione |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Creazione di un nuovo gioco: tramite CLI o tramite l'utilizzo di un modello predefinito |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Costruzione del proprio gioco componendo moduli del motore |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Risoluzione delle regole per entità: combattimento con stili di gioco misti, `applyProfile`, modelli di profilo, la CLI `profile` |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Integrazione opzionale con il registro: firewall di determinismo, livelli di integrazione L0/L1/L2, modalità di gioco, misure di sicurezza e demo pirata testata in diretta |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Sei pilastri del combattimento, cinque azioni, stati a colpo d'occhio |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Creazione passo dopo passo di `buildCombatStack`, mappatura delle statistiche, profili delle risorse |
| [Handbook](site/src/content/docs/handbook/index.md) | Manuale completo: ogni sistema, più 4 appendici |
| [Composition Model](docs/composition-model.md) | I 6 livelli riutilizzabili e come si compongono |
| [Examples](docs/examples/) | Esempi eseguibili in TypeScript (con controllo dei tipi e test del comportamento in CI): per entità, gruppo misto, profili condivisi, tra mondi, da zero |
| [Design Document](docs/DESIGN.md) | Analisi approfondita dell'architettura: pipeline delle azioni, verità rispetto alla presentazione |
| [Philosophy](PHILOSOPHY.md) | Mondi deterministici, progettazione basata sull'evidenza, IA come assistente |
| [Changelog](CHANGELOG.md) | Cronologia delle versioni |

---

## Roadmap

### Situazione attuale

Entrambe le strutture di composizione sono complete: 6412 test su 326 file, tutti i 12 esempi iniziali su `buildCombatStack` **e** `buildWorldStack`, riproduzione deterministica e identica byte per byte con seed stampati, punteggio completo delle decisioni dell'IA e una CLI che crea, esegue, convalida e ispeziona. **La v3.0 rende il mondo interattivo: i PNG con nome prendono vita con obiettivi, relazioni di fiducia/paura/avidità/lealtà, registri degli obblighi e catene di conseguenze; il livello sociale guadagna passivamente e spende attraverso ventuno nuove azioni di diplomazia/sabotaggio; l'economia è personalizzata per ogni esempio iniziale; e i vantaggi che si ottengono alla fine influenzano le conclusioni della campagna. Un audit di Fase 9 ha rilevato un errore nel contenuto rilasciato: la correzione include un PNG con nome in ogni esempio iniziale.**

**Ciclo di rilascio recente (v2.4.0–v3.0.0):**
- v2.4.0: combattimento di gruppo (targeting degli alleati / cura / potenziamento / rianimazione, sistema di effetti di stato (modificatori + DoT/HoT + trigger reattivi), Fase 1 dei profili plug-in, contenuto CLI `validate`/`scaffold`
- v2.5.0: risoluzione delle regole per entità (combattimento con stili di gioco misti), il caricatore `applyProfile` + abilità per entità, modelli di profilo + CLI `profile` e un controllo completo dello stato di salute
- v2.6.0: il comando `run` è diventato un vero gioco: i nemici agiscono in base ai propri profili di IA, vittoria/sconfitta, salvataggio/ripresa, abilità ed esperienza nel menu, il binario dello studio `ai` e lo stack della narrazione
- v2.7.0: il mondo reagisce ed esiste una ragione per tornare: calore → pressioni → conseguenze narrate, incontri all'ingresso della zona, un ciclo di missioni + diario, equipaggiamento in combattimento, esecuzioni ripetibili con seed, input di fine gioco in diretta, `buildWorldStack`, il registro del direttore e un punto di migrazione del salvataggio
- v2.8.0: agire sul mondo in cui si vive: un'economia commerciale in diretta + verbo `sell`, compagni che si reclutano e con cui si combatte e un registro del direttore che analizza l'intera situazione: un collegamento per sistema che attiva circa 12 elementi rilasciati in precedenza
- v2.9.0: chiudere i cicli: `buy` + scorte del mercante e creazione completano l'economia; i compagni compiono azioni indipendenti; quattro verbi sociali (corruzione / intimidazione / petizione / semina) vengono eseguiti su un'economia di influenza finanziata da ricompense per le opportunità; le opportunità si risolvono con scadenza + conseguenze di favore; e equipaggiamento, missioni, personaggi reclutabili e monete iniziali vengono distribuiti uniformemente a tutti i dieci esempi iniziali
- **v3.0.0: rendere il mondo interattivo: il generatore di agenzia dei PNG attiva i PNG con nome (obiettivi / relazioni / registri degli obblighi / catene di conseguenze) più un PNG narrativo in ogni esempio iniziale; la superficie sociale cresce fino a 25 verbi (diplomazia + sabotaggio) con reddito passivo e dialoghi che leggono lo stato sociale; scorte e ricette personalizzate per ogni esempio iniziale; le conclusioni di influenza (vittoria / burattinaio / pensionamento tranquillo) diventano raggiungibili; righe del menu di riparazione/modifica, opportunità di scorta e una CLI di sviluppo `audit-content`: rilasciato tramite un audit di Fase 9 che ha rilevato due collegamenti interrotti che la suite di test verde aveva nascosto**

### Successivo (la struttura della v3.0)

- **PNG interattivi:** il generatore di agenzia dei PNG persistente che attiva la sezione PERSONE del direttore: PNG con nome con obiettivi, punti di interruzione delle relazioni, registri degli obblighi e catene di conseguenze, più il favore/calo del morale dei compagni e il percorso di rischio di partenza che il sistema di reazione già gestisce
- Scorte e ricette di artigianato personalizzate per genere (per ogni esempio iniziale, con un'alternativa universale che viene rilasciata oggi) e la superficie del menu `repair`/`modify`
- Il livello successivo dell'economia di influenza: reddito passivo oltre alle ricompense per le opportunità e verbi sociali oltre ai quattro rilasciati (gruppi di diplomazia/sabotaggio) più il vocabolario di condizione/effetto del dialogo che legge il nuovo stato sociale
- Multiplayer: due giocatori *umani* che condividono un mondo (un livello di rete, volutamente differito; i profili condivisi con un solo controller vengono rilasciati oggi come [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Override di formule serializzabili: messa a punto delle formule per profilo (in attesa di un DSL per le formule; i profili contengono oggi mappature delle statistiche, non chiusure)
- Sincronizzazione della documentazione API: assicurarsi che ogni pagina del manuale rifletta le API più recenti

### Destinazione: profili plug-in

L'obiettivo finale del motore è **profili definiti dall'utente**: pacchetti portatili che si inseriscono in qualsiasi gioco. Un profilo include una mappatura delle statistiche, il comportamento delle risorse, i tag di bias dell'IA e le abilità in un'unica unità importabile. A partire dalla v2.5, le entità in un mondo possono avere ciascuna il proprio profilo e risolvere il combattimento per entità: un guerriero `might` e un mistico `will` condividono un gruppo, ognuno portando il proprio stile di gioco.

Lo schema, il caricatore `applyProfile`, la risoluzione delle abilità per entità e la convalida tra profili sono tutti stati rilasciati. Ciò che resta è il multiplayer: consentire a due giocatori *umani* (non solo a due entità) di condividere un mondo, che è un livello di rete. Consultare [Roadmap del profilo](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md) per la progettazione.

---

## Filosofia

Il motore AI per giochi di ruolo è basato su tre concetti:

1. **Mondi deterministici:** i risultati delle simulazioni devono essere riproducibili.
2. **Progettazione basata sull'evidenza:** le meccaniche del mondo devono essere testate tramite simulazione.
3. **L'IA come assistente, non come autorità:** gli strumenti di IA aiutano a generare e valutare i progetti, ma non sostituiscono i sistemi deterministici.

Per una spiegazione completa, consultare [PHILOSOPHY.md](PHILOSOPHY.md).

---

## Sicurezza

Il motore principale è una **libreria di simulazione esclusivamente locale**: nessun telemetria, nessuna connessione di rete, nessun dato sensibile. I file di salvataggio vengono salvati in `.ai-rpg-engine/` solo quando richiesto esplicitamente. Due **livelli opzionali** aggiungono un percorso di comunicazione in uscita, e solo quando vengono attivati:

- Il livello di IA (`@ai-rpg-engine/ollama`) comunica con un daemon Ollama **locale**; la sua attivazione facoltativa `webfetch` (per RAG) è protetta da una barriera SSRF (che blocca loopback/link-local/CGNAT/metadati cloud e le equivalenti connessioni IPv6).
- Il livello del registro (`@ai-rpg-engine/ledger-adapter`) si connette alla **testnet XRPL** – e solo alla testnet: una barriera strutturale **impossibile da aggirare nel codice sulla mainnet** (non un flag di configurazione) rifiuta qualsiasi host non appartenente alla testnet al momento della creazione. I seed del portafoglio sono memorizzati in un file secondario ignorato da Git, mai in un file di salvataggio, e il nucleo deterministico non importa mai l'adattatore.

Per i dettagli, consultare [SECURITY.md](SECURITY.md).

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Licenza

[MIT](LICENSE)

---

Realizzato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
