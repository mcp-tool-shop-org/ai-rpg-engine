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

A TypeScript toolkit for building deterministic RPG simulations. You define stats, pick modules, wire a combat stack, and create content. The engine handles state, events, RNG, action resolution, and AI decision-making. Every run is reproducible.

This is a **composition engine**, not a finished game. The 12 starter worlds are examples — decomposable patterns you learn from and remix. Your game uses whatever subset of the engine you need.

---

## What This Is

- A **module library** — 30+ engine modules covering combat, perception, cognition, factions, rumors, traversal, companions, and more
- A **composition toolkit** — `buildCombatStack()` wires combat in ~7 lines; `new Engine({ modules })` boots the game
- A **simulation runtime** — deterministic ticks, replayable action logs, seeded RNG
- An **AI design studio** (optional) — scaffolding, critique, balance analysis, tuning, experiments via Ollama
- An **optional on-ledger layer** — `@ai-rpg-engine/ledger-adapter` backs a game's coin and tradeable items with real XRPL **testnet** tokens, settled at checkpoints, entirely outside the deterministic core (opt-in; a run is byte-identical without it)

## What This Is Not

- Not a single finished game — it ships 12 playable starter worlds you can `run` today as examples, and the engine is the toolkit you compose your *own* game from
- Not a visual engine — it outputs structured events, not pixels
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## Current Status (v3.11.0)

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

**What is rough or incomplete:**
- The AI worldbuilding studio (Ollama layer) is more lightly tested than the simulation core, and needs a local Ollama daemon; it is entirely optional — the engine and the `run` loop need no network
- The narration/audio stack builds deterministic audio commands but there is **no terminal audio backend** — nothing plays a sound; the commands are an integration hook for a GUI/web embedder
- Multiplayer (two human players sharing one world) is **not** built — it is a networking layer, deliberately out of scope; profiles today target a single controller
- `replay --replay` restores the save instead of re-simulating — and after v2.9 that is the **decided** direction, not a deferral: `Engine.serialize()` is already a proven full-state snapshot, whereas re-simulation would have to chase world-tick/encounter state that lives outside the action log. v2.9 ships multi-checkpoint save slots on that proven restore path; true event-sourced resim is not planned
- v3.1 closed v3.0's three named ceilings — genre **starting supply**, genre-specific *repair* recipes, and the `deny` / `bury-scandal` menu surface all ship now. The honest ceiling that remains: those new genre repair recipes carry an authored `statDelta` (a small stat bonus) that `resolveRepair` does not apply yet — repair *restores*, `modify` *upgrades* — so repair-as-upgrade is marked in-code and **deferred to v3.2/v3.3** as a deliberate mechanic call, not a silent inert field. And `obligation-exists` ships with one authored demo (Brother Aldric); the condition is live for content authors to gate more dialogue on
- Documentation is extensive but not every handbook page reflects the very latest APIs

---

## What It Looks Like

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

## Install & Play

Play a starter, or scaffold your own game, from the terminal:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

The `run` loop is a real turn-based session: enemies act on their own AI
profiles, abilities and XP are on the menu, you can save and resume, and a
fight ends in victory or defeat. Every game is deterministic and replayable.

Optionally, the AI design studio installs as its own command:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

The studio talks to a local [Ollama](https://ollama.com) daemon — run
`ollama serve` and `ollama pull qwen2.5-coder` first. It is entirely optional;
the engine and the `run` loop need no network.

A container image is published to GHCR as
`ghcr.io/mcp-tool-shop-org/ai-rpg-engine` for CI and sandboxed runs.

---

## Quick Start

Prefer to build your own game in code? Compose the engine from modules:

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

See the [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) for the full workflow, or scaffold a new starter:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architecture

| Layer | Role |
|-------|------|
| **Core Runtime** | Deterministic engine — world state, events, actions, ticks, RNG, replay |
| **Modules** | 30+ composable systems — combat, perception, cognition, factions, traversal, companions, etc. |
| **Content** | Entities, zones, dialogue, items, abilities, statuses — author-created |
| **AI Studio** | Optional Ollama layer — scaffolding, critique, balance analysis, tuning, experiments |

---

## The XRPL ledger adapter (opt-in)

`@ai-rpg-engine/ledger-adapter` is an **optional** package that binds a game's
**player-owned tradeable layer** — the `coin` balance and consumable inventory
that `trade-core`'s `buy`/`sell` verbs already move — to the **XRPL testnet**, so
those assets can be backed by real on-ledger tokens and settled at checkpoints.
An absent adapter is exactly the offline engine that ships today.

**The determinism invariant (the whole point).** The adapter is a *side channel*,
never part of the simulation:

- It is **never invoked inside the deterministic tick** — only at **checkpoints**
  (save, town/market entry, chapter break).
- Nothing in `@ai-rpg-engine/core` or `@ai-rpg-engine/modules` imports it (its
  only engine dependency is a compile-time `import type`).
- **A run is byte-identical with or without it.** A firewall test runs the real
  `starter-pirate` `createGame()` merchant loop on two engines — one with the
  adapter enabled and settling at a checkpoint — and asserts the two worlds are
  deep-equal. Seed-0 replay is untouched.

**Integration levels — a game folds it in as deeply as its design wants.** The
firewall is a *determinism* boundary, not an anti-integration rule; the invariant
above holds at every level:

| Level | What depends on the adapter | Fits |
|-------|-----------------------------|------|
| **L0 — External observer** | Nothing inside the game; the adapter attaches from outside at checkpoints and the game is unaware. | Retrofitting an existing game (the shipped pirate demo). |
| **L1 — Game-driven checkpoints** | The game's own save / town / meta-progression flow calls the adapter at defined moments. | A game that wants deliberate ledger moments. |
| **L2 — Ledger-native design** | The game's economy or identity is designed *around* on-chain ownership (persistent issuer, real markets). | A ledger-first merchant game. |

The distinction that keeps replay safe is **not** "which package imports the
adapter" but "is the call inside the tick." A game package may import and drive
the adapter freely, as long as every call lands at a checkpoint outside the
seed-driven replay loop.

**Three play modes.** `offline` (default — no chain, the engine as it ships) ·
`ledger` (coin/items backed by testnet balances, settled at checkpoints) ·
`diary` (play offline, then anchor the run's state hash on-ledger for a
tamper-evident receipt).

**What's on the ledger.** `coin` → an issued-currency IOU over a trust line;
consumable items → fungible tokens; a checkpoint's net trade delta → a settled
transfer via **XLS-85 token escrow**. Unique equipment ships as **XLS-20 NFTs**
(v3.3), with relic growth advancing a mutable NFT's metadata in place via
**XLS-46 `NFTokenModify`** — driven by real play as of v3.4. The abstract district
economy (`economy-core`) is *not* touched — it stays a pure simulation.

**Safety rails.** Testnet only, with a **mainnet-impossible-in-code** structural
guard (not a config flag); wallet seeds live in a gitignored secrets sidecar,
never in the save file; settlement is idempotent and conservation-safe on the
retry path; proofs verify the **real on-chain memo** (not the engine's own
string); and if the chain is unreachable the run simply continues, marked
*unanchored*.

**Proven live.** A real `starter-pirate` merchant run — sell a cutlass, buy a
cannon-shell — settles on XRPL testnet via token escrow, then `reconcile()`
confirms on-ledger balances and memos against the engine's economy (conservation
holds for every token). The ledger is a different system family than the engine,
so the engine cannot fake it — reconciliation is a genuine external verifier.
Testnet only; assets are game-scoped receipts, not securities.

---

## Combat System

Five actions (attack, guard, disengage, brace, reposition), four combat states (guarded, off-balance, exposed, fleeing), four engagement states (engaged, protected, backline, isolated). Three stat dimensions drive every formula so a quick duelist plays differently from a heavy bruiser or a composed sentinel.

AI opponents use unified decision scoring — combat actions and abilities compete in a single evaluation, with configurable thresholds to prevent marginal ability spam.

Pack authors use `buildCombatStack()` to wire combat from a stat mapping, resource profile, and bias tags. See the [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) and [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Abilities

Genre-native ability system with costs, stat checks, cooldowns, and typed effects (damage, heal, status apply, cleanse). Status effects use an 11-tag semantic vocabulary with resistance/vulnerability profiles. AI-aware selection scores self/AoE/single-target paths.

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

## Packages

| Package | Purpose |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Deterministic simulation runtime — world state, events, RNG, ticks, action resolution |
| [`@ai-rpg-engine/modules`](packages/modules) | 30+ composable modules — combat, perception, cognition, factions, rumors, traversal, companions, NPC agency, strategic map, item recognition, emergent opportunities, arc detection, endgame triggers |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Canonical schemas and validators for world content |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Character progression, injuries, milestones, reputation |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Archetype selection, build generation, starter gear |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Equipment types, item provenance, and relic growth — including `item-chronicle-core`, the opt-in module that records gear history from real play so items earn epithets and tiers |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Cross-session memory, relationship effects, campaign state |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Rumor lifecycle, mutation mechanics, spread tracking |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Narration plan schema, render contracts, voice profiles |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Cue scheduling, priority, ducking, cooldown logic |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Sound pack manifests, content-addressable registry |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Pack registration, rubric scoring, pack discovery |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Content-addressed storage for portraits, icons, media |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Headless portrait generation with pluggable providers |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Optional AI authoring — scaffolding, critique, guided workflows, tuning, experiments |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: run games, scaffold starters, inspect saves |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Terminal renderer and input layer |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Mercantile starter — the reference pack for the ledger adapter, carrying no dependency on it |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Thief-taker starter — pursuit as the loop, and which half of a city will open a door to you |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Optional** — opt-in XRPL testnet settlement for the player-owned tradeable layer (coin / inventory / trade), via XLS-85 token escrow at checkpoints, entirely outside the deterministic core |

### Starter Examples

The 12 starter worlds are **composition examples** — they demonstrate how to combine engine modules into complete games. Each one shows different patterns (stat mappings, resource profiles, engagement configs, ability sets). See each starter's README for "Patterns Demonstrated" and "What to Borrow."

| Starter | Genre | Key Patterns |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Dark fantasy | Minimal combat, dialogue-driven |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Resources, engagement roles |
| [`starter-detective`](packages/starter-detective) | Victorian mystery | Social-first, perception-heavy |
| [`starter-pirate`](packages/starter-pirate) | Pirate | Naval + melee, multi-zone |
| [`starter-zombie`](packages/starter-zombie) | Zombie survival | Scarcity, infection resource |
| [`starter-weird-west`](packages/starter-weird-west) | Weird west | Pack biases, safe-zone recovery |
| [`starter-colony`](packages/starter-colony) | Sci-fi colony | Chokepoints, ambush zones |
| [`starter-ronin`](packages/starter-ronin) | Feudal Japan | Hidden passages, multiple protector roles |
| [`starter-merchant`](packages/starter-merchant) | Mercantile | Obligation as the loop, combat priced as a penalty |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Pursuit | Hunting people for money; violence is loud, not forbidden |
| [`starter-vampire`](packages/starter-vampire) | Vampire horror | Blood resource, social manipulation |
| [`starter-gladiator`](packages/starter-gladiator) | Historical gladiator | Arena combat, crowd favor |

---

## Documentation

| Resource | Description |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Scaffold a new game — CLI or manual template route |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Build your own game by composing engine modules |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Per-entity rule resolution — mixed-playstyle combat, `applyProfile`, profile templates, the `profile` CLI |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Opt-in on-ledger settlement — the determinism firewall, L0/L1/L2 integration levels, play modes, safety rails, and the live-proven pirate demo |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Six combat pillars, five actions, states at a glance |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Step-by-step buildCombatStack, stat mapping, resource profiles |
| [Handbook](site/src/content/docs/handbook/index.md) | Comprehensive handbook — every system, plus 4 appendices |
| [Composition Model](docs/composition-model.md) | The 6 reusable layers and how they compose |
| [Examples](docs/examples/) | Runnable TypeScript examples (type-checked + behavior-tested in CI) — per-entity mixed party, shared profiles, cross-world, from scratch |
| [Design Document](docs/DESIGN.md) | Architecture deep-dive — action pipeline, truth vs presentation |
| [Philosophy](PHILOSOPHY.md) | Deterministic worlds, evidence-driven design, AI as assistant |
| [Changelog](CHANGELOG.md) | Release history |

---

## Roadmap

### Where we are now

Both composition spines are complete — **8356 tests across 386 files**, all 12 starters on `buildCombatStack` **and** `buildWorldStack`, deterministic byte-identical replay under printed seeds, full AI decision scoring, and a CLI that scaffolds, runs, validates, and inspects. The v3.x arc made the world live (named NPCs, the 25-verb social surface, genre economies — v3.0–v3.1), put player-owned assets on the XRPL testnet as an opt-in side channel (v3.2–v3.4), authored two system-first starters and turned them into engine-polishing instruments (v3.5–v3.6), lit and toughened the strategic layer until consequences leave real marks (v3.7–v3.8), gave hosts the Engine surface a Godot attach needs (v3.8.1), closed the authoring loop so a studio session or a bare JSON pack produces a playable world end-to-end (v3.9), put the whole strategic layer on the player's senses (v3.10), and **tuned the depth those senses now reach — bounty on-ramp, retreat-as-outcome, three-location faction membership, crash-surviving `/build` (v3.11)**.

**Recent release arc (v2.4.0–v3.0.0):**
- v2.4.0 — Party combat (ally-targeting / heal / buff / revive, friend-foe AoE), status-effect system (modifiers + DoT/HoT + reactive triggers), plug-in Profiles Phase 1, content `validate`/`scaffold` CLI
- v2.5.0 — Per-entity rule resolution (mixed-playstyle combat), the `applyProfile` loader + per-entity abilities, profile templates + `profile` CLI, and a full health pass
- v2.6.0 — The `run` command became a real game: enemies act on their own AI profiles, victory/defeat, save/resume, abilities and XP on the menu, the `ai` studio bin, and the narration stack
- v2.7.0 — The world reacts and there's a reason to return: heat → pressures → narrated consequences, zone-entry encounters, a quest loop + Journal, equipment in combat, seeded replayable runs, live endgame inputs, `buildWorldStack`, the Director's Ledger, and a save-migration seam
- v2.8.0 — Act on the world you live in: a live trade economy + `sell` verb, companions you recruit and fight beside, and a Director's Ledger reading the whole board — one write-wire per system lit ~12 consumers that shipped dark
- v2.9.0 — Close the loops: `buy` + merchant stock and crafting complete the economy; companions take independent turns; four social verbs (bribe / intimidate / petition / seed) run on a leverage economy funded by opportunity rewards; opportunities resolve with expiry + favor-fallout consequence; and equipment, quests, recruitables, and starting coin roll out uniformly to all ten starters
- **v3.0.0 — Make the world live: the npc-agency producer lights named NPCs (goals / relationships / obligation ledgers / consequence chains) plus a story NPC in every starter; the social surface grows to 25 verbs (diplomacy + sabotage) with passive leverage income and dialogue that reads social state; per-starter genre-flavored stock + recipes; the leverage endings (victory / puppet-master / quiet-retirement) become reachable; repair/modify menu rows, escort opportunities, and an `audit-content` dev CLI — shipped through a Phase-9 audit that caught two dead-wires the green test suite hid**

### Next

v3.11 closed the tuning-and-depth slate. What remains is later-cycle work, not leftovers of this one:

- A prosperous-family ambient bed (the tone bridge and per-zone roll ship; CORE still has no prosperous stem)
- Multiplayer — two *human* players sharing one world (a networking layer, deliberately deferred; single-controller shared profiles ship today as [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Serializable formula overrides — per-profile formula tuning (blocked on a formula DSL; profiles carry stat mappings today, not closures)

### Destination: Plug-in Profiles

The engine's end goal is **user-defined profiles** — portable bundles that slot into any game. A profile packages a stat mapping, resource behavior, AI bias tags, and abilities into a single importable unit. As of v2.5, entities in one world can each carry their own profile and resolve combat per-entity — a `might` fighter and a `will` mystic share a party, each bringing their own playstyle.

The schema, the `applyProfile` loader, per-entity ability resolution, and cross-profile validation are all shipped. What remains is multiplayer — letting two *human* players (not just two entities) share a world — which is a networking layer. See [Profile Roadmap](docs/profile-roadmap.md) and [feature-architecture.md](docs/feature-architecture.md) for the design.

---

## Philosophy

AI RPG Engine is built around three ideas:

1. **Deterministic worlds** — simulation results must be reproducible.
2. **Evidence-driven design** — world mechanics should be tested through simulation.
3. **AI as assistant, not authority** — AI tools help generate and critique designs but do not replace deterministic systems.

See [PHILOSOPHY.md](PHILOSOPHY.md) for the full explanation.

---

## Security

The core engine is a **local-only simulation library**: no telemetry, no network, no secrets. Save files go to `.ai-rpg-engine/` only when explicitly requested. Two **optional** layers add an outbound path, and only when you invoke them:

- The AI layer (`@ai-rpg-engine/ollama`) talks to a **local** Ollama daemon; its opt-in `webfetch` (for RAG) is confined by an SSRF guard (blocks loopback/link-local/CGNAT/cloud-metadata and IPv6-tunnelled equivalents).
- The ledger layer (`@ai-rpg-engine/ledger-adapter`) reaches the **XRPL testnet** — and only the testnet: a **mainnet-impossible-in-code** structural guard (not a config flag) rejects any non-testnet host at construction. Wallet seeds live in a gitignored secrets sidecar, never in a save file, and the deterministic core never imports the adapter.

See [SECURITY.md](SECURITY.md) for details.

## Requirements

- Node.js >= 20
- TypeScript (ESM modules)

## License

[MIT](LICENSE)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
