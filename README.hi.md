<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# एआई आरपीजी इंजन

नियतात्मक आरपीजी सिमुलेशन बनाने के लिए एक टाइपस्क्रिप्ट टूलकिट। आप आँकड़े परिभाषित करते हैं, मॉड्यूल चुनते हैं, युद्ध प्रणाली को जोड़ते हैं और सामग्री बनाते हैं। इंजन स्थिति, घटनाओं, यादृच्छिक संख्या जनरेटर (आरएनजी), क्रिया समाधान और एआई निर्णय लेने का प्रबंधन करता है। प्रत्येक रन दोहराया जा सकता है।

यह एक **कंपोज़िशन इंजन** है, न कि कोई तैयार गेम। 10 शुरुआती दुनिया उदाहरण हैं - विघटनीय पैटर्न जिनसे आप सीखते हैं और उन्हें फिर से जोड़ते हैं। आपके गेम में इंजन के जो भी उपसमुच्चय की आवश्यकता होती है, उसका उपयोग किया जाता है।

---

## यह क्या है

- A **module library** — 30+ engine modules covering combat, perception, cognition, factions, rumors, traversal, companions, and more
- A **composition toolkit** — `buildCombatStack()` wires combat in ~7 lines; `new Engine({ modules })` boots the game
- A **simulation runtime** — deterministic ticks, replayable action logs, seeded RNG
- An **AI design studio** (optional) — scaffolding, critique, balance analysis, tuning, experiments via Ollama
- An **optional on-ledger layer** — `@ai-rpg-engine/ledger-adapter` backs a game's coin and tradeable items with real XRPL **testnet** tokens, settled at checkpoints, entirely outside the deterministic core (opt-in; a run is byte-identical without it)

## यह क्या नहीं है

- Not a single finished game — it ships 10 playable starter worlds you can `run` today as examples, and the engine is the toolkit you compose your *own* game from
- Not a visual engine — it outputs structured events, not pixels
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## वर्तमान स्थिति (संस्करण 3.7.0)

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
- **The strategic layer, lit (v3.7):** the tier above moment-to-moment verbs — where opportunities spawn, companions passively matter, and districts have moods — was half-dark, and nothing could see it. A new catalog-wide probe boots all eleven packs and drives **forty full rounds** through the same driver the interactive CLI uses (NPC turns, companion turns, then the world tick), because `runWorldTick` is a per-round function rather than a verb and a probe built from `submitAction` alone sees half a round forever. It measured **one of eight opportunity kinds** ever firing on shipped content. All **eight fire now**, each with a played-session proof that the reward actually landed — and one that deliberately runs out the clock, so an expiry's authored fallout (reputation lost, a district gone hungrier) is proven on real content rather than assumed. What was in the way was never the rules: `contract` needed an NPC both allied AND greedy, which the breakpoint table makes mutually exclusive with `favorable`, and `relations['player-trust']` had been authored exactly ONCE in the entire catalog; district economies erased their own genre-and-tag character within ~15 rounds by drifting every category to a universal 50; `world.factions[].reputation` — the authored baseline the engine explicitly merges — was set by no pack, so every world began at a flat zero with everyone. **Pacing** is tuned against named findings rather than taste, each cited at the constant it governs (choice-overload, quest-variance, relax valleys, radiant repetition, appointment dynamics), and guarded by a deterministic regression. **Twelve of the thirteen** companion and district modifier fields now reach a resolution function through a parameter seam, each with a named contribution in the payload so a UI can say WHO helped — a computed-but-unrendered modifier is experientially identical to no modifier. `use` **stops silently destroying things**: 89 of 90 authored items across the catalog were consumed by a verb that found no effect and spliced them out of the bag anyway, reporting success. And the `statusTags` contract, declared by all eleven packs and enforced by none, is bound — declarations widened to shipped truth first, then gated
- **The instrument turned on the catalog (v3.6):** the pack built to USE the ledger is now run deliberately as an engine-polishing instrument. A catalog-wide **verb-reachability audit** boots all eleven packs and SUBMITS each verb through the real engine, asking whether any target in the booted world accepts it — a gate no existing check could pass or fail, because verb-honesty compares the help table against registered handlers and never looks at the content. Run before any fix, it caught `recruit` advertised in Salt Road Ledger with zero recruitable NPCs (the v2.9 defect, re-introduced) and `use` inert across the pack's entire catalog. `give` ships as the engine's **first entity-to-entity item transfer** — atomic, structured-rejecting, chronicle-stamped by event — closing a gap where a pack could make an item obtainable and have nothing able to hand it to anyone. And the two remaining adapter axes that were config flags with **zero behavioral reads** became behaviours: `diary` mode (witnessed, not custodied — one anchor per checkpoint, no trust lines, reconcile verifies the anchor chain) and `issuerMode: 'persistent'` (a market that outlives the run). Proven **15/15 on live XRPL testnet**
- **A game whose loop is debt (v3.5):** the eleventh starter, **Salt Road Ledger**, is the first authored backwards from a system rather than a genre — you play a factor trading on someone else's capital, and five commerce verbs (`appraise` / `haggle` / `consign` / `underwrite` / `audit`) carry the game while combat is priced as a penalty (the resource profile has an empty `gains` array — nothing rewards violence). `consign` is the only verb in the catalog whose offline semantics match a settlement primitive one-to-one, which makes it the reference pack for the ledger adapter while carrying **no dependency on it**. Ships with the `mercantile` genre and a merchant economy profile, and 7/7 on the pack rubric. The same cycle made two long-inert adapter axes real — the memo `VERB:` field (declared with members no call site could emit) and `config.settlement` (declared with zero reads anywhere) — and a played-session audit of the new pack found six mechanics that were wired, schema-valid, unit-green and dead
- `ai-rpg-engine create-starter <name>` — scaffold a new game (standalone, runs outside the monorepo); `validate` + `scaffold` content commands; load packs from JSON
- Published starter template on npm (`@ai-rpg-engine/starter-template`)
- Full test suite: **6180 tests** (deterministic across repeated runs; test files typechecked in CI; coverage ratchet-enforced)

**What is rough or incomplete:**
- The AI worldbuilding studio (Ollama layer) is more lightly tested than the simulation core, and needs a local Ollama daemon; it is entirely optional — the engine and the `run` loop need no network
- The narration/audio stack builds deterministic audio commands but there is **no terminal audio backend** — nothing plays a sound; the commands are an integration hook for a GUI/web embedder
- Multiplayer (two human players sharing one world) is **not** built — it is a networking layer, deliberately out of scope; profiles today target a single controller
- `replay --replay` restores the save instead of re-simulating — and after v2.9 that is the **decided** direction, not a deferral: `Engine.serialize()` is already a proven full-state snapshot, whereas re-simulation would have to chase world-tick/encounter state that lives outside the action log. v2.9 ships multi-checkpoint save slots on that proven restore path; true event-sourced resim is not planned
- v3.1 closed v3.0's three named ceilings — genre **starting supply**, genre-specific *repair* recipes, and the `deny` / `bury-scandal` menu surface all ship now. The honest ceiling that remains: those new genre repair recipes carry an authored `statDelta` (a small stat bonus) that `resolveRepair` does not apply yet — repair *restores*, `modify` *upgrades* — so repair-as-upgrade is marked in-code and **deferred to v3.2/v3.3** as a deliberate mechanic call, not a silent inert field. And `obligation-exists` ships with one authored demo (Brother Aldric); the condition is live for content authors to gate more dialogue on
- Documentation is extensive but not every handbook page reflects the very latest APIs

---

## यह कैसा दिखता है

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

## स्थापित करें और खेलें

टर्मिनल से एक शुरुआती गेम खेलें या अपना खुद का गेम बनाएं:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

The `run` loop is a real turn-based session: enemies act on their own AI
profiles, abilities and XP are on the menu, you can save and resume, and a
fight ends in victory or defeat. Every game is deterministic and replayable.

वैकल्पिक रूप से, एआई डिज़ाइन स्टूडियो अपने स्वयं के कमांड के रूप में स्थापित होता है:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

स्टूडियो एक स्थानीय [ओलामा](https://ollama.com) डेमॉन से संवाद करता है – पहले `ollama serve` और `ollama pull qwen2.5-coder` चलाएं। यह पूरी तरह से वैकल्पिक है; इंजन और `run` लूप को किसी नेटवर्क की आवश्यकता नहीं होती।

एक कंटेनर इमेज को जीएचसीआर पर `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` के रूप में प्रकाशित किया जाता है, जिसका उपयोग सीआई और सैंडबॉक्स्ड रन के लिए किया जाता है।

---

## त्वरित शुरुआत

क्या आप कोड में अपना गेम बनाना पसंद करते हैं? मॉड्यूल से इंजन बनाएं:

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

पूर्ण वर्कफ़्लो के लिए [कंपोज़िशन गाइड](docs/handbook/57-composition-guide.md) देखें, या एक नया शुरुआती बनाएं:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## आर्किटेक्चर

| परत | भूमिका |
|-------|------|
| **Core Runtime** | नियतात्मक इंजन - विश्व स्थिति, घटनाएं, क्रियाएं, टिक, आरएनजी, पुनरावृत्ति। |
| **Modules** | 30+ कंपोजेबल सिस्टम - युद्ध, धारणा, अनुभूति, गुट, यात्रा, साथी, आदि। |
| **Content** | इकाइयाँ, क्षेत्र, संवाद, आइटम, क्षमताएँ, स्थितियाँ - लेखक द्वारा बनाई गई। |
| **AI Studio** | वैकल्पिक ओलामा परत - ढांचा, आलोचना, संतुलन विश्लेषण, ट्यूनिंग, प्रयोग। |

---

## XRPL लेजर एडॉप्टर (ऑप्ट-इन)।

`@ai-rpg-engine/ledger-adapter` एक **वैकल्पिक** पैकेज है जो किसी गेम की **खिलाड़ी-स्वामित्व वाली व्यापार योग्य परत** – `coin` बैलेंस और उपभोग करने योग्य इन्वेंट्री को जोड़ता है, जिसे `trade-core` के `buy`/`sell` क्रियाएँ पहले से ही स्थानांतरित करती हैं – को **एक्सआरपीएल टेस्टनेट** से जोड़ता है, ताकि उन संपत्तियों का समर्थन वास्तविक ऑन-लेजर टोकन द्वारा किया जा सके और उन्हें चेकपॉइंट पर निपटाया जा सके। अनुपस्थित एडाप्टर ठीक वही ऑफ़लाइन इंजन है जो आज उपलब्ध है।

**नियतिवाद अपरिवर्तनीय (पूरा बिंदु)।** एडॉप्टर एक *साइड चैनल* है, सिमुलेशन का कभी हिस्सा नहीं:

- इसे **कभी भी नियतात्मक टिक के अंदर नहीं बुलाया जाता** – केवल **चेकपॉइंट** पर (सेव, शहर/बाजार में प्रवेश, अध्याय का अंत)।
- `@ai-rpg-engine/core` या `@ai-rpg-engine/modules` में कुछ भी इसे आयात नहीं करता है (इसकी एकमात्र इंजन निर्भरता संकलन-समय `import type` है)।
- **किसी रन में यह शामिल हो या न हो, दोनों ही स्थितियों में वह समान रहता है।** एक फ़ायरवॉल परीक्षण वास्तविक `starter-pirate` `createGame()` व्यापारी लूप को दो इंजनों पर चलाता है – एक जिसमें एडाप्टर सक्षम है और चेकपॉइंट पर निपटान होता है – और पुष्टि करता है कि दोनों दुनिया गहरे रूप से समान हैं। सीड-0 रीप्ले अपरिवर्तित रहता है।

**एकीकरण स्तर - एक गेम इसे जितना गहरा चाहता है, उतना ही एकीकृत करता है।** फ़ायरवॉल एक *नियतिवाद* सीमा है, न कि एक एंटी-एकीकरण नियम; उपरोक्त हर स्तर पर लागू होता है:

| स्तर | एडॉप्टर पर क्या निर्भर करता है | फिट बैठता है |
|-------|-----------------------------|------|
| **L0 — External observer** | गेम के अंदर कुछ भी नहीं; एडॉप्टर चेकपॉइंट पर बाहर से जुड़ता है और गेम अनजान रहता है। | एक मौजूदा गेम को फिर से तैयार करना (शिप किए गए पायरेट डेमो)। |
| **L1 - गेम-संचालित चेकपॉइंट** | गेम का अपना सहेजें / शहर / मेटा-प्रगति प्रवाह परिभाषित क्षणों पर एडॉप्टर को कॉल करता है। | एक ऐसा गेम जो जानबूझकर लेजर क्षण चाहता है। |
| **L2 — Ledger-native design** | गेम की अर्थव्यवस्था या पहचान को *ऑन-चेन स्वामित्व* (स्थायी जारीकर्ता, वास्तविक बाजार) के आसपास डिज़ाइन किया गया है। | एक लेजर-प्रथम व्यापारी गेम। |

वह अंतर जो रिप्ले को सुरक्षित रखता है वह **यह नहीं** है कि "कौन सा पैकेज एडॉप्टर आयात करता है" बल्कि "क्या कॉल टिक के अंदर है।" एक गेम पैकेज स्वतंत्र रूप से एडॉप्टर को आयात और चला सकता है, जब तक कि प्रत्येक कॉल बीज-संचालित रिप्ले लूप के बाहर चेकपॉइंट पर हो।

**Three play modes.** `offline` (default — no chain, the engine as it ships) ·
`ledger` (coin/items backed by testnet balances, settled at checkpoints) ·
`diary` (play offline, then anchor the run's state hash on-ledger for a
tamper-evident receipt).

**लेजर में क्या है।** `coin` → एक ट्रस्ट लाइन पर जारी मुद्रा आईओयू; उपभोग करने योग्य वस्तुएँ → परिवर्तनीय टोकन; किसी चेकपॉइंट का शुद्ध व्यापार अंतर → **एक्सएलएस-85 टोकन एस्क्रो** के माध्यम से निपटाया गया स्थानांतरण। अद्वितीय उपकरण **एक्सएलएस-20 एनएफटी** (v3.3) के रूप में आते हैं, जिसमें अवशेष वृद्धि वास्तविक प्ले द्वारा v3.4 से एक परिवर्तनीय एनएफटी की मेटाडेटा को अपडेट करती है – यह **एक्सएलएस-46 `NFTokenModify`** द्वारा संचालित होता है। अमूर्त जिला अर्थव्यवस्था (`economy-core`) अपरिवर्तित रहती है – यह एक शुद्ध सिमुलेशन बनी रहती है।

**सुरक्षा रेल।** केवल टेस्टनेट, एक **मेननेट-असंभव-इन-कोड** संरचनात्मक गार्ड के साथ (कोई कॉन्फ़िगरेशन ध्वज नहीं); वॉलेट बीज एक gitignored सीक्रेट साइडकार में रहते हैं, कभी भी सहेजें फ़ाइल में नहीं; निपटान पुन: प्रयास पथ पर निष्क्रिय और संरक्षण-सुरक्षित है; प्रमाण **वास्तविक ऑन-चेन मेमो** को सत्यापित करते हैं (इंजन का अपना स्ट्रिंग नहीं); और यदि श्रृंखला दुर्गम है तो रन बस जारी रहता है, *अनएन्कर्ड* के रूप में चिह्नित।

**Proven live.** A real `starter-pirate` merchant run — sell a cutlass, buy a
cannon-shell — settles on XRPL testnet via token escrow, then `reconcile()`
confirms on-ledger balances and memos against the engine's economy (conservation
holds for every token). The ledger is a different system family than the engine,
so the engine cannot fake it — reconciliation is a genuine external verifier.
Testnet only; assets are game-scoped receipts, not securities.

---

## युद्ध प्रणाली

पांच क्रियाएं (हमला, रक्षा, अलग होना, सहारा देना, पुन: स्थिति), चार युद्ध अवस्थाएं (संरक्षित, असंतुलित, उजागर, भागना), चार संलग्नता अवस्थाएं (संलग्न, संरक्षित, बैकलाइन, पृथक)। तीन आँकड़े आयाम हर सूत्र को चलाते हैं इसलिए एक त्वरित द्वंद्ववादी एक भारी ब्रूज़र या एक रचनाबद्ध प्रहरी से अलग तरीके से खेलता है।

एआई विरोधी एकीकृत निर्णय स्कोरिंग का उपयोग करते हैं - युद्ध क्रियाएं और क्षमताएं एक ही मूल्यांकन में प्रतिस्पर्धा करती हैं, जिसमें मामूली क्षमता स्पैम को रोकने के लिए कॉन्फ़िगर करने योग्य सीमाएँ होती हैं।

पैक लेखक, युद्ध को एक सांख्यिकीय मानचित्रण, संसाधन प्रोफ़ाइल और पूर्वाग्रह टैग से जोड़ने के लिए `buildCombatStack()` का उपयोग करते हैं। [कॉम्बैट ओवरव्यू](site/src/content/docs/handbook/49a-combat-overview.md) और [पैक ऑथर गाइड](site/src/content/docs/handbook/55-combat-pack-guide.md) देखें।

---

## क्षमताएं

शैली-देशी क्षमता प्रणाली जिसमें लागत, आँकड़े की जांच, कूलडाउन और टाइप किए गए प्रभाव (नुकसान, उपचार, स्थिति लागू करें, शुद्ध करें) शामिल हैं। स्थिति प्रभावों में प्रतिरोध / भेद्यता प्रोफाइल के साथ 11-टैग सिमेंटिक शब्दावली का उपयोग किया जाता है। एआई-जागरूक चयन स्व / AoE / एकल-लक्ष्य पथों को स्कोर करता है।

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

## पैकेज

| पैकेज | उद्देश्य |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | नियतात्मक सिमुलेशन रनटाइम - विश्व स्थिति, घटनाएं, आरएनजी, टिक, क्रिया समाधान। |
| [`@ai-rpg-engine/modules`](packages/modules) | 30+ कंपोजेबल मॉड्यूल - युद्ध, धारणा, अनुभूति, गुट, अफवाहें, यात्रा, साथी, एनपीसी एजेंसी, रणनीतिक मानचित्र, आइटम पहचान, उभरते अवसर, चाप का पता लगाना, अंतिम खेल ट्रिगर। |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | विश्व सामग्री के लिए विहित स्कीमा और सत्यापनकर्ता। |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | चरित्र का विकास, चोटें, महत्वपूर्ण पड़ाव, प्रतिष्ठा। |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | आदर्श प्रकार का चयन, संरचना निर्माण, शुरुआती उपकरण। |
| [`@ai-rpg-engine/equipment`](packages/equipment) | उपकरण प्रकार, आइटम उत्पत्ति और अवशेष वृद्धि – जिसमें `item-chronicle-core` शामिल है, जो एक वैकल्पिक मॉड्यूल है जो वास्तविक प्ले से गियर इतिहास रिकॉर्ड करता है ताकि आइटम उपनाम और स्तर अर्जित करें। |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | विभिन्न सत्रों में स्मृति, संबंधपरक प्रभाव, अभियान की स्थिति। |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | अफवाह का जीवनचक्र, परिवर्तन की प्रक्रिया, प्रसार का पता लगाना। |
| [`@ai-rpg-engine/presentation`](packages/presentation) | कथा-वर्णन योजना का ढांचा, अनुबंधों का प्रारूपण, आवाज प्रोफाइल। |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | संकेत निर्धारण, प्राथमिकता, ध्वनि कम करना, शीतन अवधि तर्क। |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | ध्वनि पैकेज की सूची, सामग्री-आधारित रजिस्ट्री। |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | पैक पंजीकरण, मूल्यांकन मानदंड, पैक की खोज। |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | चित्रों, आइकनों और मीडिया के लिए सामग्री-आधारित संग्रहण। |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | प्लग-इन योग्य प्रदाताओं के साथ सिर रहित पोर्ट्रेट का निर्माण। |
| [`@ai-rpg-engine/ollama`](packages/ollama) | वैकल्पिक एआई-आधारित लेखन सुविधा – ढांचा तैयार करना, आलोचनात्मक मूल्यांकन, निर्देशित कार्यप्रवाह, अनुकूलन और प्रयोग। |
| [`@ai-rpg-engine/cli`](packages/cli) | सीएलआई: गेम चलाएं, शुरुआती टेम्पलेट बनाएं, सहेजे गए डेटा की जांच करें। |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | टर्मिनल रेंडरर और इनपुट लेयर। |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | व्यापारिक स्टार्टर – लेजर एडाप्टर के लिए संदर्भ पैक, जिस पर इसकी कोई निर्भरता नहीं है। |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **वैकल्पिक** - खिलाड़ी द्वारा स्वामित्व वाली व्यापार योग्य परत (सिक्का / इन्वेंट्री / व्यापार) के लिए ऑप्ट-इन XRPL टेस्टनेट निपटान, चेकपॉइंट पर XLS-85 टोकन एस्क्रो के माध्यम से, पूरी तरह से नियतात्मक कोर के बाहर। |

### शुरुआती उदाहरण

ये दस शुरुआती दुनियाएँ **रचना के उदाहरण** हैं – ये दर्शाती हैं कि गेम इंजन मॉड्यूल को मिलाकर पूर्ण गेम कैसे बनाया जा सकता है। प्रत्येक दुनिया विभिन्न प्रकार के पैटर्न (सांख्यिकीय मानचित्रण, संसाधन प्रोफाइल, जुड़ाव कॉन्फ़िगरेशन, क्षमता सेट) दिखाती है। प्रत्येक शुरुआती दुनिया के ‘रीडमी’ में “दिखाए गए पैटर्न” और “क्या उपयोग किया जा सकता है” देखें।

| शुरुआती/प्रारंभिक | शैली | प्रमुख पैटर्न |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | अंधकारमय काल्पनिक कथा | न्यूनतम युद्ध, संवाद पर आधारित। |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | साइबरपंक | संसाधन, भागीदारी की भूमिकाएँ। |
| [`starter-detective`](packages/starter-detective) | विक्टोरियन रहस्य | सामाजिक दृष्टिकोण को प्राथमिकता, धारणा पर अधिक जोर। |
| [`starter-pirate`](packages/starter-pirate) | समुद्री डाकू | नौसैनिक + हाथापाई युद्ध, बहु-क्षेत्रीय |
| [`starter-zombie`](packages/starter-zombie) | ज़ॉम्बी से बचने की रणनीति/तरीका। | कमी, संक्रमण, संसाधन। |
| [`starter-weird-west`](packages/starter-weird-west) | अजीब पश्चिम | पूर्वाग्रहों को दूर करें, सुरक्षित वातावरण में सुधार करें। |
| [`starter-colony`](packages/starter-colony) | विज्ञान कथा पर आधारित कॉलोनी। | संकरी राहें, घात लगाने के स्थान। |
| [`starter-ronin`](packages/starter-ronin) | सामंती जापान | छिपे हुए मार्ग, कई सुरक्षात्मक भूमिकाएँ। |
| [`starter-merchant`](packages/starter-merchant) | व्यापारिक | लूप के रूप में दायित्व, दंड के रूप में मूल्यवान युद्ध |
| [`starter-vampire`](packages/starter-vampire) | पिशाच हॉरर। | रक्त संसाधन, सामाजिक हेरफेर। |
| [`starter-gladiator`](packages/starter-gladiator) | ऐतिहासिक ग्लैडिएटर | अखाड़े में मुकाबला, दर्शकों का समर्थन। |

---

## दस्तावेज़ीकरण

| संसाधन | विवरण |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | एक नया गेम बनाएं – कमांड लाइन इंटरफेस (सीएलआई) या मैन्युअल टेम्पलेट विधि का उपयोग करें। |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | इंजन मॉड्यूल को जोड़कर अपना खुद का गेम बनाएं। |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | प्रति-इकाई नियम समाधान – मिश्रित-शैली का युद्ध, `applyProfile`, प्रोफ़ाइल टेम्पलेट, `profile` सीएलआई। |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | ऑप्ट-इन ऑन-लेजर निपटान - नियतिवाद फ़ायरवॉल, L0/L1/L2 एकीकरण स्तर, प्ले मोड, सुरक्षा रेल और लाइव-सिद्ध पायरेट डेमो। |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | छह प्रमुख युद्ध रणनीतियाँ, पाँच क्रियाएँ, और राज्यों की त्वरित जानकारी। |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | क्रमबद्ध तरीके से कॉम्बैट स्टैक बनाएं, आँकड़ों का मानचित्रण करें और संसाधनों की जानकारी तैयार करें। |
| [Handbook](site/src/content/docs/handbook/index.md) | विस्तृत निर्देशिका – सभी प्रणालियों का विवरण, साथ ही चार परिशिष्ट। |
| [Composition Model](docs/composition-model.md) | छह पुन: प्रयोज्य परतें और वे कैसे मिलकर एक संरचना बनाती हैं। |
| [Examples](docs/examples/) | चलाने योग्य टाइपस्क्रिप्ट उदाहरण (टाइप-जांच और सीआई में व्यवहार परीक्षण के साथ)—प्रत्येक इकाई के लिए मिश्रित पार्टी, साझा प्रोफाइल, विभिन्न दुनियाओं में उपयोग, शुरुआत से। |
| [Design Document](docs/DESIGN.md) | आर्किटेक्चर का गहन अध्ययन – क्रियान्वयन प्रक्रिया, वास्तविकता बनाम प्रस्तुति। |
| [Philosophy](PHILOSOPHY.md) | निश्चित नियमों पर आधारित दुनिया, प्रमाणों द्वारा संचालित डिज़ाइन, कृत्रिम बुद्धिमत्ता सहायक के रूप में। |
| [Changelog](CHANGELOG.md) | रिलीज़ इतिहास |

---

## कार्य योजना

### हम अभी कहाँ हैं।

Both composition spines are complete — 6180 tests across 318 files, all 11 starters on `buildCombatStack` **and** `buildWorldStack`, deterministic byte-identical replay under printed seeds, full AI decision scoring, and a CLI that scaffolds, runs, validates, and inspects. **v3.0 makes the world live: named NPCs come alive with goals, trust/fear/greed/loyalty relationships, obligation ledgers, and consequence chains; the social layer earns passively and spends across twenty-one new diplomacy/sabotage verbs; the economy is genre-flavored per starter; and the leverage you earn finally reaches the campaign endings it gates. A Phase-9 audit caught the headline wired-but-inert in shipped content — the fix ships a named NPC in every starter.**

**Recent release arc (v2.4.0–v3.0.0):**
- v2.4.0 — Party combat (ally-targeting / heal / buff / revive, friend-foe AoE), status-effect system (modifiers + DoT/HoT + reactive triggers), plug-in Profiles Phase 1, content `validate`/`scaffold` CLI
- v2.5.0 — Per-entity rule resolution (mixed-playstyle combat), the `applyProfile` loader + per-entity abilities, profile templates + `profile` CLI, and a full health pass
- v2.6.0 — The `run` command became a real game: enemies act on their own AI profiles, victory/defeat, save/resume, abilities and XP on the menu, the `ai` studio bin, and the narration stack
- v2.7.0 — The world reacts and there's a reason to return: heat → pressures → narrated consequences, zone-entry encounters, a quest loop + Journal, equipment in combat, seeded replayable runs, live endgame inputs, `buildWorldStack`, the Director's Ledger, and a save-migration seam
- v2.8.0 — Act on the world you live in: a live trade economy + `sell` verb, companions you recruit and fight beside, and a Director's Ledger reading the whole board — one write-wire per system lit ~12 consumers that shipped dark
- v2.9.0 — Close the loops: `buy` + merchant stock and crafting complete the economy; companions take independent turns; four social verbs (bribe / intimidate / petition / seed) run on a leverage economy funded by opportunity rewards; opportunities resolve with expiry + favor-fallout consequence; and equipment, quests, recruitables, and starting coin roll out uniformly to all ten starters
- **v3.0.0 — Make the world live: the npc-agency producer lights named NPCs (goals / relationships / obligation ledgers / consequence chains) plus a story NPC in every starter; the social surface grows to 25 verbs (diplomacy + sabotage) with passive leverage income and dialogue that reads social state; per-starter genre-flavored stock + recipes; the leverage endings (victory / puppet-master / quiet-retirement) become reachable; repair/modify menu rows, escort opportunities, and an `audit-content` dev CLI — shipped through a Phase-9 audit that caught two dead-wires the green test suite hid**

### अगला (v2.8 ढांचा)

- **Living NPCs** — the persisted npc-agency producer that lights the Director's PEOPLE section: named NPCs with goals, relationship breakpoints, obligation ledgers, and consequence chains, plus companion-morale favor-fallout and the departure-risk path the reaction system already carries
- Genre-flavored merchant stock and crafting recipes (per-starter genre threading over the universal fallback that ships today), and the `repair`/`modify` menu surface
- The leverage economy's next layer — passive income beyond opportunity rewards, and social verbs beyond the shipped four (diplomacy / sabotage groups) — plus the dialogue condition/effect vocabulary that reads the new social state
- Multiplayer — two *human* players sharing one world (a networking layer, deliberately deferred; single-controller shared profiles ship today as [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Serializable formula overrides — per-profile formula tuning (blocked on a formula DSL; profiles carry stat mappings today, not closures)
- API documentation sync — ensure every handbook page reflects the latest APIs

### गंतव्य: प्लग-इन प्रोफाइल।

The engine's end goal is **user-defined profiles** — portable bundles that slot into any game. A profile packages a stat mapping, resource behavior, AI bias tags, and abilities into a single importable unit. As of v2.5, entities in one world can each carry their own profile and resolve combat per-entity — a `might` fighter and a `will` mystic share a party, each bringing their own playstyle.

The schema, the `applyProfile` loader, per-entity ability resolution, and cross-profile validation are all shipped. What remains is multiplayer — letting two *human* players (not just two entities) share a world — which is a networking layer. See [Profile Roadmap](docs/profile-roadmap.md) and [feature-architecture.md](docs/feature-architecture.md) for the design.

---

## दर्शनशास्त्र

एआई आरपीजी इंजन तीन मुख्य विचारों पर आधारित है:

1. **निश्चित दुनिया** — सिमुलेशन के परिणाम दोहराए जा सकने चाहिए।
2. **साक्ष्य-आधारित डिज़ाइन** — दुनिया की यांत्रिकी का परीक्षण सिमुलेशन के माध्यम से किया जाना चाहिए।
3. **सहायक के रूप में एआई, अधिकार नहीं** — एआई उपकरण डिज़ाइनों को उत्पन्न करने और उनकी आलोचना करने में मदद करते हैं, लेकिन वे निश्चित प्रणालियों को प्रतिस्थापित नहीं करते हैं।

पूर्ण विवरण के लिए [PHILOSOPHY.md](PHILOSOPHY.md) देखें।

---

## सुरक्षा

The core engine is a **local-only simulation library**: no telemetry, no network, no secrets. Save files go to `.ai-rpg-engine/` only when explicitly requested. Two **optional** layers add an outbound path, and only when you invoke them:

- The AI layer (`@ai-rpg-engine/ollama`) talks to a **local** Ollama daemon; its opt-in `webfetch` (for RAG) is confined by an SSRF guard (blocks loopback/link-local/CGNAT/cloud-metadata and IPv6-tunnelled equivalents).
- The ledger layer (`@ai-rpg-engine/ledger-adapter`) reaches the **XRPL testnet** — and only the testnet: a **mainnet-impossible-in-code** structural guard (not a config flag) rejects any non-testnet host at construction. Wallet seeds live in a gitignored secrets sidecar, never in a save file, and the deterministic core never imports the adapter.

अधिक जानकारी के लिए [SECURITY.md](SECURITY.md) देखें।

## आवश्यकताएँ

- Node.js >= 20
- TypeScript (ईएसएम मॉड्यूल)

## लाइसेंस

[MIT](LICENSE)

---

<a href="https://mcp-tool-shop.github.io/">एमसीपी टूल शॉप</a> द्वारा निर्मित
