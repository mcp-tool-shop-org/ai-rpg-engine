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

Un set di strumenti TypeScript per creare simulazioni di giochi di ruolo deterministiche. Si definiscono le statistiche, si scelgono i moduli, si configura una sequenza di combattimento e si crea il contenuto. Il motore gestisce lo stato, gli eventi, il generatore di numeri casuali, la risoluzione delle azioni e il processo decisionale dell'IA. Ogni esecuzione è riproducibile.

Questo è un **motore di composizione**, non un gioco completo. I 12 mondi iniziali sono esempi: modelli scomponibili da cui si può imparare e da cui si possono ricavare nuove idee. Il gioco utilizza la parte del motore di cui si ha bisogno.

---

## Cos'è

- Una **libreria di moduli**: oltre 30 moduli del motore che coprono combattimento, percezione, cognizione, fazioni, voci, movimento, compagni e altro
- Un **set di strumenti di composizione**: `buildCombatStack()` configura il combattimento in circa 7 righe; `new Engine({ modules })` avvia il gioco
- Un **ambiente di simulazione**: cicli deterministici, registri di azioni riproducibili, generatore di numeri casuali con seme
- Un **ambiente di progettazione dell'IA** (opzionale): scheletro, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti tramite Ollama
- Un **livello opzionale sulla blockchain**: `@ai-rpg-engine/ledger-adapter` supporta la valuta e gli oggetti scambiabili di un gioco con token XRPL reali sulla **testnet**, regolati in punti di controllo, completamente al di fuori del nucleo deterministico (opzionale; un'esecuzione è identica a livello di byte senza di esso)

## Cos'è che non è

- Not a single finished game — it ships 12 playable starter worlds you can `run` today as examples, and the engine is the toolkit you compose your *own* game from
- Not a visual engine — it outputs structured events, not pixels
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## Stato attuale (v3.11.0)

**What works and is tested:**
- **Tuning and depth (v3.11):** `bounty` fires on authored content again (the v3.10 listener cleanup put black-flag's two navy kills 36 quiet rounds apart; heat grace is that measured gap, wake still two kills). A fight that ends because someone ran says so: `combat.encounter.cleared` carries `outcome: 'victory' | 'retreat'` — not a second event, not a victory sting, not a journaled win. Faction membership has three honest locations: `entity.faction` on the person, a kept registry that hydrates from it and still takes extras, and `CompanionState.originFaction` so the guild they came from still listens. Zone music rolls per `zoneId`; stings honor cooldowns; `/build` staged writes survive a crash; a new CLI session emits the starting-zone entered event so KEY MOMENTS see the first mood. 8356 tests.
- **The world reaches the player (v3.10):** two cycles of producers finally land on the player's senses. All eight narrator-voice hints render — NPC texture and faction bias frame the speaker, the manner hint rides the speaker line, party presence / world pressure / open opportunities close the dialogue frame as asides, and district mood and situation reports join the event log. The always-on HUD gains the party line. Combat honesty arrives as a real event: `combat.encounter.cleared` fires exactly once when the last hostile falls (a mutual kill reads as defeat, a companion's death no longer renders triumph, and the nine starter listeners that fanfared every kill are gone), mapped to the victory sting through the per-turn presenter. Zone entry resolves tone-aware music — a grim district actually sounds grim — and the spoken-output contract is real: `NarrationPlan.asides` carries dialogue fragments exactly once, `SpeakerCue.emotion` carries the manner hint verbatim, ready for a TTS embedder. Sidecar clients see pack-intake `dropped[]`/`advisories` on `initialize`, guided `/build` batches stage every step behind one batched consent (with a CREATE-aware undo and a decline that can't hollow the gate), scaffolded factions survive `emit-pack`, and faction identity resolves from the entity's own authored `faction` everywhere it used to need a registry no shipped pack populates — un-inverting district intruder tracking and reviving rumor propagation. A played-session e2e pins the whole surface frame-by-frame, NO_COLOR byte-identical.
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
- Full test suite: **8356 tests** (deterministic across repeated runs; test files typechecked in CI; coverage ratchet-enforced)

**Cosa è incompleto o grezzo:**
- Lo studio di creazione di mondi AI (livello Ollama) è testato in modo meno approfondito rispetto al nucleo di simulazione e richiede un daemon Ollama locale; è completamente opzionale: il motore e il ciclo `run` non necessitano di una rete.
- Lo stack di narrazione/audio crea comandi audio deterministici, ma non esiste un backend audio terminale: nessun suono viene riprodotto; i comandi sono un punto di integrazione per un'interfaccia utente grafica/un componente web.
- Il multiplayer (due giocatori umani che condividono un mondo) non è implementato: è un livello di rete, escluso intenzionalmente dall'ambito; i profili attuali sono destinati a un singolo controller.
- `replay --replay` ripristina il salvataggio invece di risimulare, e dopo la versione 2.9, questa è la direzione definitiva, non un rinvio: `Engine.serialize()` è già uno snapshot completo e collaudato dello stato, mentre la risimulazione dovrebbe tenere traccia dello stato del mondo/degli incontri che si trova al di fuori del registro delle azioni. La versione 2.9 include slot di salvataggio multi-checkpoint su questo percorso di ripristino collaudato; una vera risimulazione basata su eventi non è prevista.
- La versione 3.1 ha chiuso i tre limiti definiti della versione 3.0: fornitura iniziale del genere, ricette di riparazione specifiche per il genere e la superficie del menu `deny` / `bury-scandal` sono ora disponibili. Il limite effettivo che rimane è che queste nuove ricette di riparazione del genere includono un `statDelta` (un piccolo bonus alle statistiche) che `resolveRepair` non applica ancora: la riparazione *ripristina*, `modify` *migliora*, quindi la riparazione come miglioramento è contrassegnata nel codice ed è **rinviata alla versione 3.2/3.3** come meccanica intenzionale, non un campo inerte silenzioso. E `obligation-exists` viene fornito con una demo creata (Fratello Aldric); la condizione è attiva affinché gli autori dei contenuti possano aggiungere più dialoghi.
- La documentazione è estesa, ma non ogni pagina del manuale riflette le API più recenti.

---

## Come si presenta

L'interfaccia utente terminale inclusa compone ogni turno in sezioni etichettate: scena, stato, registro e azioni, con un'interfaccia utente di facile consultazione. L'output è testo semplice per impostazione predefinita e aggiunge colori semantici su un terminale (danni in rosso, guarigioni in verde, rifiuti in giallo), rispettando `NO_COLOR` e i canali non-terminale; ogni indicazione è inclusa anche nel testo, mai solo nel colore.

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

Avvia un gioco di esempio o crea il tuo gioco dal terminale:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

Il ciclo `run` è una vera sessione a turni: i nemici agiscono in base ai propri profili AI, le abilità e i punti esperienza sono nel menu, puoi salvare e riprendere e un combattimento termina con una vittoria o una sconfitta. Ogni gioco è deterministico e può essere rigiocato.

Facoltativamente, lo studio di progettazione AI si installa come comando separato:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

Lo studio comunica con un daemon Ollama locale: esegui `ollama serve` e `ollama pull qwen2.5-coder` per prima cosa. È completamente opzionale; il motore e il ciclo `run` non necessitano di una rete.

Un'immagine container viene pubblicata su GHCR come `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` per test CI e esecuzioni in ambiente sandbox.

---

## Avvio rapido

Preferisci creare il tuo gioco nel codice? Componi il motore da moduli:

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
| **Core Runtime** | Motore deterministico: stato del mondo, eventi, azioni, tick, RNG, replay |
| **Modules** | Oltre 30 sistemi componibili: combattimento, percezione, cognizione, fazioni, attraversamento, compagni, ecc. |
| **Content** | Entità, zone, dialoghi, oggetti, abilità, stati: creati dall'autore |
| **AI Studio** | Livello Ollama opzionale: creazione di prototipi, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti |

---

## L'adattatore del registro XRPL (opzionale)

`@ai-rpg-engine/ledger-adapter` è un pacchetto **opzionale** che associa il **livello negoziabile di proprietà del giocatore** di un gioco (il saldo `coin` e l'inventario di oggetti di consumo che i verbi `trade-core` `buy`/`sell` già gestiscono) alla **testnet XRPL**, in modo che tali risorse possano essere supportate da token reali sul registro e regolati ai checkpoint. Un adattatore assente è esattamente il motore offline che viene fornito oggi.

**L'invariante del determinismo (il punto cruciale).** L'adattatore è un *canale secondario*, mai parte della simulazione:

- Non viene mai invocato all'interno del tick deterministico, ma solo ai **checkpoint** (salvataggio, ingresso in città/mercato, fine del capitolo).
- Nulla in `@ai-rpg-engine/core` o `@ai-rpg-engine/modules` lo importa (la sua unica dipendenza dal motore è un `import type` in fase di compilazione).
- **Un'esecuzione è identica in termini di byte con o senza.** Un test del firewall esegue il ciclo del mercante `starter-pirate` `createGame()` reale su due motori, uno con l'adattatore abilitato e che si regola a un checkpoint, e verifica che i due mondi siano identici. Il replay con seme 0 non viene modificato.

**Livelli di integrazione: un gioco lo integra in profondità quanto desidera il suo design.** Il firewall è un confine del *determinismo*, non una regola anti-integrazione; l'invariante di cui sopra è valido a ogni livello:

| Livello | Cosa dipende dall'adattatore | Si adatta |
|-------|-----------------------------|------|
| **L0 — External observer** | Niente all'interno del gioco; l'adattatore si collega dall'esterno ai checkpoint e il gioco non ne è a conoscenza. | Riadattamento di un gioco esistente (la demo del pirata fornita). |
| **L1: checkpoint guidati dal gioco** | Il flusso di salvataggio/città/progressione meta del gioco chiama l'adattatore in momenti definiti. | Un gioco che desidera momenti intenzionali sul registro. |
| **L2 — Ledger-native design** | L'economia o l'identità del gioco sono progettate *attorno* alla proprietà on-chain (emittente persistente, mercati reali). | Un gioco di mercanti incentrato sul registro. |

La distinzione che mantiene il replay sicuro non è "quale pacchetto importa l'adattatore", ma "la chiamata è all'interno del tick". Un pacchetto di gioco può importare e gestire l'adattatore liberamente, a condizione che ogni chiamata avvenga a un checkpoint al di fuori del ciclo di replay guidato dal seme.

**Tre modalità di gioco.** `offline` (predefinito: nessuna catena, il motore così come viene fornito) · `ledger` (monete/oggetti supportati dai saldi della testnet, regolati ai checkpoint) · `diary` (gioca offline, quindi ancora lo stato dell'esecuzione sul registro per una ricevuta a prova di manomissione).

**Cosa è registrato nel libro mastro.** `coin` → una promessa di pagamento in valuta emessa tramite una linea di credito;
articoli di consumo → token fungibili; la variazione netta delle transazioni di un punto di controllo → un trasferimento convalidato tramite **XLS-85 token escrow**. Le attrezzature uniche vengono rilasciate come **XLS-20 NFT** (v3.3), e l’evoluzione degli artefatti modifica i metadati di un NFT modificabile in loco tramite **XLS-46 `NFTokenModify`** — un processo basato sull’effettivo utilizzo a partire dalla versione 3.4. L’economia astratta del distretto (`economy-core`) *non* viene modificata; rimane una simulazione pura.

**Misure di sicurezza.** Disponibile solo sulla testnet, con una protezione strutturale che rende impossibile la sua implementazione sulla mainnet tramite codice (e non tramite un semplice flag di configurazione); i seed dei portafogli sono memorizzati in un file separato, escluso dal controllo di versione tramite Git, e mai nel file di salvataggio; la procedura di liquidazione è idempotente e sicura, anche in caso di ripetuti tentativi; le prove verificano il **vero memo presente sulla blockchain** (e non una stringa generata dal motore); e se la blockchain non è raggiungibile, l’esecuzione prosegue semplicemente, contrassegnando l’operazione come *non ancorata*.

**Dimostrato in ambiente attivo.** Una vera e propria operazione di un commerciante `starter-pirate`: vende una sciabola, acquista un proiettile di cannone, e l’operazione viene registrata sulla testnet XRPL tramite un deposito di token, quindi `reconcile()` verifica i saldi e le note registrate nel libro mastro rispetto all’economia del motore (la conservazione è garantita per ogni token). Il libro mastro appartiene a una famiglia di sistemi diversa dal motore, quindi il motore non può falsificare i dati: la riconciliazione è una verifica esterna autentica. Solo per la testnet; gli asset sono ricevute relative al gioco, non titoli.

---

## Sistema di combattimento

Cinque azioni (attacco, difesa, disimpegno, preparazione, riposizionamento), quattro stati di combattimento (in posizione di difesa, sbilanciato, esposto, in fuga), quattro stati di interazione (in combattimento, protetto, in seconda linea, isolato). Tre dimensioni statistiche influenzano ogni formula, quindi un duellante agile si comporta in modo diverso rispetto a un combattente corpulento o a un difensore metodico.

Gli avversari controllati dall’intelligenza artificiale utilizzano un sistema di valutazione unificato delle decisioni: le azioni e le abilità di combattimento vengono valutate in un’unica fase, con soglie configurabili per evitare un uso eccessivo di abilità di scarso valore.

Gli autori dei pacchetti utilizzano `buildCombatStack()` per collegare gli elementi di combattimento a una mappa delle statistiche, a un profilo delle risorse e a tag di preferenza. Consultare la sezione [Panoramica del combattimento](site/src/content/docs/handbook/49a-combat-overview.md) e la [Guida per gli autori dei pacchetti](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Competenze

Sistema di abilità specifico per ogni genere di gioco, con costi, verifiche delle statistiche, tempi di ricarica ed effetti differenziati (danno, guarigione, applicazione di effetti di stato, rimozione di effetti). Gli effetti di stato utilizzano un vocabolario semantico di 11 tag, con profili di resistenza/vulnerabilità. Il sistema di selezione, basato sull’intelligenza artificiale, determina i percorsi migliori per colpire il bersaglio singolo, un’area specifica o tutti i bersagli contemporaneamente.

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
| [`@ai-rpg-engine/core`](packages/core) | Tempo di esecuzione della simulazione deterministica: stato del mondo, eventi, generatore di numeri casuali, incrementi temporali, risoluzione delle azioni. |
| [`@ai-rpg-engine/modules`](packages/modules) | Oltre 30 moduli componibili: combattimento, percezione, cognizione, fazioni, voci, esplorazione, compagni, autonomia degli NPC, mappa strategica, riconoscimento degli oggetti, opportunità emergenti, rilevamento degli archi narrativi, fattori scatenanti per la fase finale del gioco. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi e strumenti di validazione standard per i contenuti di siti web. |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Evoluzione del personaggio, infortuni, traguardi, reputazione. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selezione dell’archetipo, creazione della configurazione iniziale, equipaggiamento di partenza. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipi di equipaggiamento, origine degli oggetti e crescita degli artefatti, incluso `item-chronicle-core`, il modulo facoltativo che registra la cronologia dell’equipaggiamento durante le sessioni di gioco, in modo che gli oggetti acquisiscano attributi e livelli. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria tra sessioni, effetti delle relazioni, stato della campagna. |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo di vita delle voci, meccanismi di mutazione, monitoraggio della diffusione |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schema del piano di doppiaggio, contratti di rendering, profili vocali. |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Programmazione dei segnali, priorità, attenuazione automatica, logica di gestione del tempo di attesa. |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Pacchetti di suoni, elenco dei contenuti e registro basato sull’indirizzamento dei contenuti. |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registrazione dei pacchetti, valutazione tramite griglia di valutazione, scoperta dei pacchetti. |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Sistema di archiviazione basato sul contenuto per immagini di persone, icone e file multimediali. |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generazione di ritratti senza volto tramite provider modulari. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Funzionalità opzionale di scrittura assistita dall’IA: supporto alla stesura, revisione, flussi di lavoro guidati, ottimizzazione, sperimentazione. |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: esegui giochi, crea progetti di base, controlla i file di salvataggio. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motore di rendering per la visualizzazione e livello di input. |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Kit di avvio per applicazioni commerciali: pacchetto di riferimento per l’adattatore del registro, che non presenta alcuna dipendenza da quest’ultimo. |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Inizia l’inseguimento: percorri il circuito e scopri quale metà della città ti aprirà le porte. |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Facoltativo** — possibilità di aderire alla rete di test XRPL per la gestione delle transazioni relative allo strato di oggetti di gioco scambiabili (monete/inventario/scambi), tramite il sistema di deposito a garanzia di token XLS-85 in punti di controllo specifici, in modo completamente indipendente dal nucleo deterministico. |

### Esempi di piatti d’antipasto

I 12 mondi iniziali sono **esempi di composizione**: dimostrano come combinare i moduli del motore per creare giochi completi. Ognuno di essi presenta schemi diversi (mappe delle statistiche, profili delle risorse, configurazioni di interazione, set di abilità). Per ogni mondo iniziale, consultare il file README per visualizzare gli schemi dimostrativi e gli elementi che possono essere riutilizzati.

| Antipasto | Genere | Modelli principali |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasy oscura | Combattimenti ridotti al minimo, trama basata sui dialoghi. |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Risorse, ruoli di coinvolgimento |
| [`starter-detective`](packages/starter-detective) | Mistero in stile vittoriano | Priorità ai social media, forte impatto sulla percezione. |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Combattimenti navali e corpo a corpo, ambientati in diverse zone. |
| [`starter-zombie`](packages/starter-zombie) | Sopravvivenza agli zombie | Scarsità, fonte di infezione |
| [`starter-weird-west`](packages/starter-weird-west) | Far West insolito/bizzarro | Eliminare i pregiudizi, favorire il recupero in un ambiente sicuro. |
| [`starter-colony`](packages/starter-colony) | Colonia fantascientifica | Punti di strozzatura, zone di imboscata |
| [`starter-ronin`](packages/starter-ronin) | Il Giappone feudale | Passaggi segreti, molteplici ruoli di protezione. |
| [`starter-merchant`](packages/starter-merchant) | Commerciale | L’obbligo è il fulcro del sistema, e il costo del combattimento è considerato una penalità. |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Inseguimento | Dare la caccia alle persone per soldi; la violenza è palese, non proibita. |
| [`starter-vampire`](packages/starter-vampire) | Horror a tema vampirico | Risorse biologiche, manipolazione sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiatore storico | Combattimenti nell’arena, sostegno del pubblico. |

---

## Documentazione

| Risorsa | Descrizione |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Creazione di un nuovo gioco: tramite CLI o tramite l'utilizzo di un modello predefinito |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Costruisci il tuo gioco componendo i moduli del motore |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Risoluzione delle regole per entità: combattimento con stili di gioco misti, `applyProfile`, modelli di profilo, la CLI `profile` |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Integrazione opzionale nella blockchain: firewall di determinismo, livelli di integrazione L0/L1/L2, modalità di gioco, misure di sicurezza e demo di pirati testata in ambiente reale |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Sei pilastri del combattimento, cinque azioni, stati a colpo d'occhio |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Costruzione passo dopo passo di CombatStack, mappatura delle statistiche, profili delle risorse |
| [Handbook](site/src/content/docs/handbook/index.md) | Manuale completo: ogni sistema, più 4 appendici |
| [Composition Model](docs/composition-model.md) | I 6 livelli riutilizzabili e come si compongono |
| [Examples](docs/examples/) | Esempi eseguibili in TypeScript (con controllo dei tipi e test del comportamento in CI): gruppo misto per entità, profili condivisi, tra mondi, da zero |
| [Design Document](docs/DESIGN.md) | Analisi approfondita dell'architettura: pipeline delle azioni, verità rispetto alla presentazione |
| [Philosophy](PHILOSOPHY.md) | Mondi deterministici, progettazione basata sull'evidenza, IA come assistente |
| [Changelog](CHANGELOG.md) | Cronologia delle versioni |

---

## Roadmap

### Situazione attuale

Both composition spines are complete — **8356 tests across 386 files**, all 12 starters on `buildCombatStack` **and** `buildWorldStack`, deterministic byte-identical replay under printed seeds, full AI decision scoring, and a CLI that scaffolds, runs, validates, and inspects. The v3.x arc made the world live (named NPCs, the 25-verb social surface, genre economies — v3.0–v3.1), put player-owned assets on the XRPL testnet as an opt-in side channel (v3.2–v3.4), authored two system-first starters and turned them into engine-polishing instruments (v3.5–v3.6), lit and toughened the strategic layer until consequences leave real marks (v3.7–v3.8), gave hosts the Engine surface a Godot attach needs (v3.8.1), closed the authoring loop so a studio session or a bare JSON pack produces a playable world end-to-end (v3.9), put the whole strategic layer on the player's senses (v3.10), and **tuned the depth those senses now reach — bounty on-ramp, retreat-as-outcome, three-location faction membership, crash-surviving `/build` (v3.11)**.

**Ciclo di rilascio recente (v2.4.0–v3.0.0):**
- v2.4.0: combattimento di gruppo (targeting degli alleati / cura / potenziamento / rianimazione, sistema di effetti di stato (modificatori + DoT/HoT + trigger reattivi), fase 1 dei profili plug-in, contenuti CLI `validate`/`scaffold`
- v2.5.0: risoluzione delle regole per entità (combattimento con stili di gioco misti), il caricatore `applyProfile` + abilità per entità, modelli di profilo + CLI `profile` e un passaggio completo sulla salute
- v2.6.0: il comando `run` è diventato un vero gioco: i nemici agiscono in base ai propri profili di IA, vittoria/sconfitta, salvataggio/ripresa, abilità ed esperienza nel menu, il pacchetto dello studio `ai` e lo stack della narrazione
- v2.7.0: il mondo reagisce ed esiste una ragione per tornare: calore → pressioni → conseguenze narrate, incontri all'ingresso della zona, un ciclo di missioni + diario, equipaggiamento in combattimento, esecuzioni ripetibili con seed, input di fine gioco in tempo reale, `buildWorldStack`, il registro del direttore e un punto di transizione per il salvataggio
- v2.8.0: agisci sul mondo in cui vivi: un'economia commerciale attiva + verbo `sell`, compagni che puoi reclutare e con cui combattere e un registro del direttore che legge l'intera mappa di gioco: un collegamento di scrittura per sistema, circa 12 elementi che sono stati rilasciati in versione preliminare
- v2.9.0: chiudi i cicli: `buy` + scorte del mercante e creazione completano l'economia; i compagni fanno mosse indipendenti; quattro verbi sociali (corruzione / intimidazione / petizione / semina) vengono eseguiti su un'economia di leva finanziata da ricompense di opportunità; le opportunità si risolvono con scadenza + conseguenze di favore; e equipaggiamento, missioni, elementi reclutabili e monete iniziali vengono distribuiti uniformemente a tutti i dieci elementi iniziali
- **v3.0.0: rendi il mondo attivo: il produttore di agenzia NPC accende gli NPC con nome (obiettivi / relazioni / registri delle obbligazioni / catene di conseguenze) più un NPC narrativo in ogni elemento iniziale; la superficie sociale cresce fino a 25 verbi (diplomazia + sabotaggio) con reddito passivo e dialogo che legge lo stato sociale; scorte e ricette di genere per elemento iniziale; le conclusioni di leva (vittoria / burattinaio / pensionamento tranquillo) diventano raggiungibili; righe del menu di riparazione/modifica, opportunità di scorta e una CLI di sviluppo `audit-content`: rilasciato attraverso un audit di fase 9 che ha individuato due collegamenti interrotti che la suite di test verde aveva nascosto**

### Avanti

La versione 3.11 ha concluso la fase di ottimizzazione e perfezionamento. Rimane solo il lavoro da svolgere nelle fasi successive, non gli elementi rimasti di questa fase:

- Un ambiente sonoro che evoca un'atmosfera familiare e prospera (la tonalità di base e la modulazione per zona sono state implementate; CORE non ha ancora un elemento sonoro che evochi la prosperità)
- Modalità multigiocatore: due giocatori *umani* condividono un unico mondo (un livello di rete, volutamente posticipato; i profili condivisi controllati da un singolo utente sono disponibili oggi come [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Possibilità di sovrascrivere le formule in modo serializzabile: ottimizzazione delle formule per ciascun profilo (in attesa di un linguaggio di dominio specifico per le formule; i profili contengono oggi le mappature delle statistiche, non le chiusure)

### Destinazione: profili plug-in

L'obiettivo finale del motore è **profili definiti dall'utente**: pacchetti portatili che si inseriscono in qualsiasi gioco. Un profilo impacchetta una mappatura delle statistiche, il comportamento delle risorse, i tag di bias dell'IA e le abilità in un'unica unità importabile. A partire dalla v2.5, le entità in un mondo possono ciascuna avere il proprio profilo e risolvere il combattimento per entità: un combattente `might` e un mistico `will` condividono un gruppo, ognuno portando il proprio stile di gioco.

Lo schema, il caricatore `applyProfile`, la risoluzione delle capacità per entità e la convalida tra profili sono tutti stati implementati. Ciò che resta è la modalità multiplayer, che consente a due giocatori *umani* (e non solo a due entità) di condividere un mondo, e questo rappresenta un livello di rete. Per la progettazione, consultare [Profile Roadmap](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md).

---

## Filosofia

Il motore AI RPG è costruito attorno a tre idee:

1. **Mondi deterministici:** i risultati della simulazione devono essere riproducibili.
2. **Progettazione basata sull'evidenza:** le meccaniche del mondo devono essere testate tramite simulazione.
3. **L'IA come assistente, non come autorità:** gli strumenti di IA aiutano a generare e valutare i progetti, ma non sostituiscono i sistemi deterministici.

Per una spiegazione completa, consultare [PHILOSOPHY.md](PHILOSOPHY.md).

---

## Sicurezza

Il motore principale è una **libreria di simulazione esclusivamente locale**: nessun telemetria, nessuna rete, nessun dato sensibile. I file di salvataggio vengono salvati in `.ai-rpg-engine/` solo quando viene esplicitamente richiesto. Due **livelli opzionali** aggiungono un percorso di comunicazione in uscita, e solo quando vengono attivati:

- Il livello di IA (`@ai-rpg-engine/ollama`) comunica con un daemon Ollama **locale**; la sua attivazione opzionale `webfetch` (per RAG) è limitata da una protezione SSRF (che blocca loopback/link-local/CGNAT/metadati cloud e le equivalenti connessioni IPv6).
- Il livello del registro (`@ai-rpg-engine/ledger-adapter`) raggiunge la **XRPL testnet** e solo la testnet: una protezione strutturale **impossibile nel codice per la mainnet** (e non un semplice flag di configurazione) rifiuta qualsiasi host non appartenente alla testnet al momento della creazione. I seed del portafoglio sono memorizzati in un file secondario ignorato da Git, mai in un file di salvataggio, e il core deterministico non importa mai l'adattatore.

Per i dettagli, consultare [SECURITY.md](SECURITY.md).

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Licenza

[MIT](LICENSE)

---

Realizzato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
