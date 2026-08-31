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

निर्धारित आरपीजी सिमुलेशन बनाने के लिए एक टाइपस्क्रिप्ट टूलकिट। आप आँकड़े परिभाषित करते हैं, मॉड्यूल चुनते हैं, एक युद्ध प्रणाली स्थापित करते हैं, और सामग्री बनाते हैं। इंजन स्थिति, घटनाओं, आरएनजी, क्रिया समाधान और एआई निर्णय लेने का प्रबंधन करता है। प्रत्येक रन को दोहराया जा सकता है।

यह एक **कंपोज़िशन इंजन** है, न कि एक तैयार गेम। 12 शुरुआती दुनिया उदाहरण हैं - ऐसे पैटर्न जिन्हें आप सीख सकते हैं और जिनसे आप बदलाव कर सकते हैं। आपका गेम इंजन के उस हिस्से का उपयोग करता है जिसकी आपको आवश्यकता होती है।

---

## यह क्या है

- एक **मॉड्यूल लाइब्रेरी** - 30 से अधिक इंजन मॉड्यूल जो युद्ध, धारणा, अनुभूति, गुट, अफवाहें, यात्रा, साथी और अन्य चीजों को कवर करते हैं
- एक **कंपोज़िशन टूलकिट** - `buildCombatStack()` लगभग 7 पंक्तियों में युद्ध प्रणाली स्थापित करता है; `new Engine({ modules })` गेम शुरू करता है
- एक **सिमुलेशन रनटाइम** - निर्धारित टिक, दोहराए जा सकने वाले क्रिया लॉग, सीडेड आरएनजी
- एक **एआई डिज़ाइन स्टूडियो** (वैकल्पिक) - ढांचा, आलोचना, संतुलन विश्लेषण, ट्यूनिंग, ओलामा के माध्यम से प्रयोग
- एक **वैकल्पिक ऑन-लेजर लेयर** - `@ai-rpg-engine/ledger-adapter` एक गेम के सिक्के और व्यापार योग्य वस्तुओं का समर्थन वास्तविक एक्सआरपीएल **टेस्टनेट** टोकन के साथ करता है, जो चेकपॉइंट पर तय किए जाते हैं, पूरी तरह से निर्धारित कोर के बाहर (वैकल्पिक; इसके बिना एक रन बाइट-समान होता है)

## यह क्या नहीं है

- Not a single finished game — it ships 12 playable starter worlds you can `run` today as examples, and the engine is the toolkit you compose your *own* game from
- Not a visual engine — it outputs structured events, not pixels
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## वर्तमान स्थिति (v3.8.1)

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

**क्या कच्चा या अधूरा है:**
- एआई दुनिया-निर्माण स्टूडियो (ओलामा परत) सिमुलेशन कोर की तुलना में कम परीक्षण किया गया है, और इसे एक स्थानीय ओलामा डेमॉन की आवश्यकता होती है; यह पूरी तरह से वैकल्पिक है - इंजन और `run` लूप को किसी नेटवर्क की आवश्यकता नहीं है।
- कथन/ऑडियो स्टैक नियतात्मक ऑडियो कमांड बनाता है, लेकिन इसमें **कोई टर्मिनल ऑडियो बैकएंड नहीं** है - कोई भी ध्वनि नहीं बजाता; कमांड एक GUI/वेब एम्बेडर के लिए एकीकरण हुक हैं।
- मल्टीप्लेयर (एक ही दुनिया साझा करने वाले दो मानव खिलाड़ी) **नहीं** बनाया गया है - यह एक नेटवर्किंग परत है, जानबूझकर दायरे से बाहर; आज के प्रोफाइल एक एकल नियंत्रक को लक्षित करते हैं।
- `replay --replay` पुन: अनुकरण करने के बजाय सहेजे गए डेटा को पुनर्स्थापित करता है - और v2.9 के बाद यह **निश्चित** दिशा है, कोई विलंब नहीं: `Engine.serialize()` पहले से ही एक सिद्ध पूर्ण-अवस्था स्नैपशॉट है, जबकि पुन: अनुकरण को दुनिया-टिक/मुठभेड़ अवस्था का पीछा करना होगा जो कार्रवाई लॉग के बाहर मौजूद है। v2.9 उस सिद्ध पुनर्स्थापना पथ पर बहु-चेकपॉइंट सहेजने के स्लॉट भेजता है; वास्तविक घटना-आधारित पुन: अनुकरण की योजना नहीं है।
- v3.1 ने v3.0 के तीन नामित सीमाओं को बंद कर दिया - शैली **शुरुआती आपूर्ति**, शैली-विशिष्ट *मरम्मत* व्यंजन, और `deny` / `bury-scandal` मेनू सतह अब सभी भेजते हैं। एकमात्र ईमानदार सीमा जो बनी हुई है: उन नए शैली मरम्मत व्यंजनों में एक निर्मित `statDelta` (एक छोटा सा आँकड़ा बोनस) होता है जो `resolveRepair` अभी तक लागू नहीं करता है - मरम्मत *पुनर्स्थापित करती है*, `modify` *अपग्रेड करती है* - इसलिए मरम्मत-को-अपग्रेड के रूप में कोड में चिह्नित किया गया है और इसे जानबूझकर **v3.2/v3.3 तक स्थगित** कर दिया गया है, न कि एक मौन निष्क्रिय क्षेत्र के रूप में। और `obligation-exists` एक निर्मित डेमो (भाई एल्ड्रिक) के साथ भेजता है; शर्त सामग्री लेखकों के लिए अधिक संवाद को गेट करने के लिए लाइव है।
- प्रलेखन व्यापक है लेकिन हर हैंडबुक पृष्ठ नवीनतम एपीआई को प्रतिबिंबित नहीं करता है।

---

## यह कैसा दिखता है

बंडल किए गए टर्मिनल UI प्रत्येक मोड़ को लेबल वाले अनुभागों में जोड़ते हैं - दृश्य, स्थिति, लॉग और क्रियाएं - एक नज़र में देखने योग्य HUD के साथ। डिफ़ॉल्ट रूप से आउटपुट सादा पाठ होता है और एक TTY पर सिमेंटिक रंग जोड़ता है (क्षति लाल, उपचार हरा, अस्वीकृति पीला), `NO_COLOR` और गैर-TTY पाइप का सम्मान करता है; प्रत्येक संकेत पाठ में भी होता है, कभी भी केवल रंग में नहीं।

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

एक शुरुआती गेम खेलें, या टर्मिनल से अपना गेम बनाएं:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

`run` लूप एक वास्तविक टर्न-आधारित सत्र है: दुश्मन अपनी स्वयं की एआई प्रोफाइल पर कार्य करते हैं, क्षमताएं और XP मेनू पर हैं, आप सहेज सकते हैं और फिर से शुरू कर सकते हैं, और एक लड़ाई जीत या हार में समाप्त होती है। प्रत्येक गेम नियतात्मक और पुन: चलाने योग्य है।

वैकल्पिक रूप से, एआई डिज़ाइन स्टूडियो को अपने स्वयं के कमांड के रूप में स्थापित किया जाता है:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

स्टूडियो एक स्थानीय [ओलामा](https://ollama.com) डेमॉन से बात करता है - पहले `ollama serve` और `ollama pull qwen2.5-coder` चलाएं। यह पूरी तरह से वैकल्पिक है; इंजन और `run` लूप को किसी नेटवर्क की आवश्यकता नहीं है।

एक कंटेनर छवि को GHCR पर CI और सैंडबॉक्स्ड रन के लिए `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` के रूप में प्रकाशित किया गया है।

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

पूर्ण वर्कफ़्लो के लिए [रचना गाइड](site/src/content/docs/handbook/57-composition-guide.md) देखें, या एक नया शुरुआती गेम बनाएं:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## आर्किटेक्चर

| परत | भूमिका |
|-------|------|
| **Core Runtime** | नियततात्मक इंजन - दुनिया की स्थिति, घटनाएं, क्रियाएं, टिक, आरएनजी, पुन: खेलना |
| **Modules** | 30+ कंपोजेबल सिस्टम - मुकाबला, धारणा, अनुभूति, गुट, यात्रा, साथी, आदि। |
| **Content** | इकाइयाँ, क्षेत्र, संवाद, आइटम, क्षमताएं, स्थितियाँ - लेखक द्वारा बनाई गई |
| **AI Studio** | वैकल्पिक ओलामा परत - स्केफोल्डिंग, आलोचना, संतुलन विश्लेषण, ट्यूनिंग, प्रयोग |

---

## XRPL लेज़र एडाप्टर (ऑप्ट-इन)

`@ai-rpg-engine/ledger-adapter` एक **वैकल्पिक** पैकेज है जो गेम के **खिलाड़ी-स्वामित्व वाले व्यापार योग्य परत** को बांधता है - `coin` संतुलन और उपभोग योग्य इन्वेंट्री जो `trade-core` के `buy`/`sell` क्रियाएं पहले से ही स्थानांतरित करते हैं - **XRPL टेस्टनेट** पर, ताकि उन संपत्तियों का समर्थन वास्तविक ऑन-लेज़र टोकन द्वारा किया जा सके और चेकपॉइंट पर निपटाया जा सके। अनुपस्थित एडाप्टर ठीक वही ऑफ़लाइन इंजन है जो आज भेजा गया है।

**नियतता अपरिवर्तनीय (पूरा बिंदु)।** एडाप्टर एक *साइड चैनल* है, कभी भी सिमुलेशन का हिस्सा नहीं:

- इसे **कभी भी नियतात्मक टिक के अंदर नहीं बुलाया जाता है** - केवल **चेकपॉइंट पर** (सहेजें, शहर/बाजार में प्रवेश, अध्याय विराम)।
- `@ai-rpg-engine/core` या `@ai-rpg-engine/modules` में कुछ भी इसे आयात नहीं करता है (इसकी एकमात्र इंजन निर्भरता संकलन-समय `import type` है)।
- **एक रन इसके साथ या इसके बिना बाइट-समान है।** एक फ़ायरवॉल परीक्षण वास्तविक `starter-pirate` `createGame()` व्यापारी लूप को दो इंजनों पर चलाता है - एक एडाप्टर सक्षम के साथ और एक चेकपॉइंट पर निपटान - और दावा करता है कि दोनों दुनिया गहरी-समान हैं। सीड-0 पुन: खेलना अपरिवर्तित है।

**एकीकरण स्तर - एक गेम इसे जितना चाहे उतना गहराई से एकीकृत करता है।** फ़ायरवॉल एक *नियतता* सीमा है, न कि एक एंटी-एकीकरण नियम; उपरोक्त अपरिवर्तनीय प्रत्येक स्तर पर लागू होता है:

| स्तर | एडाप्टर पर क्या निर्भर करता है | फिट बैठता है |
|-------|-----------------------------|------|
| **L0 — External observer** | गेम के अंदर कुछ भी नहीं; एडाप्टर चेकपॉइंट पर बाहर से जुड़ता है और गेम अनजान है। | एक मौजूदा गेम को फिर से तैयार करना (भेजा गया समुद्री डाकू डेमो)। |
| **L1 - गेम-संचालित चेकपॉइंट** | गेम का अपना सहेजें / शहर / मेटा-प्रगति प्रवाह परिभाषित क्षणों पर एडाप्टर को कॉल करता है। | एक ऐसा गेम जो जानबूझकर लेज़र क्षण चाहता है। |
| **L2 — Ledger-native design** | गेम की अर्थव्यवस्था या पहचान को ऑन-चेन स्वामित्व (स्थायी जारीकर्ता, वास्तविक बाजार) के आसपास डिज़ाइन किया गया है। | एक लेज़र-प्रथम व्यापारी गेम। |

वह अंतर जो पुन: खेलना सुरक्षित रखता है, वह यह **नहीं** है कि "कौन सा पैकेज एडाप्टर आयात करता है" बल्कि "क्या कॉल टिक के अंदर है।" एक गेम पैकेज एडाप्टर को स्वतंत्र रूप से आयात और चला सकता है, जब तक कि प्रत्येक कॉल एक चेकपॉइंट पर उतरता है जो बीज-संचालित पुन: प्ले लूप के बाहर होता है।

**तीन प्ले मोड।** `offline` (डिफ़ॉल्ट - कोई श्रृंखला नहीं, इंजन जैसा कि यह भेजा गया है) · `ledger` (टेस्टनेट बैलेंस द्वारा समर्थित सिक्के/आइटम, चेकपॉइंट पर निपटाए गए) · `diary` (ऑफ़लाइन खेलें, फिर रन की स्थिति हैश को छेड़छाड़-सबूत रसीद के लिए ऑन-लेज़र पर एंकर करें)।

**लेज़र में क्या है।** `coin` → एक ट्रस्ट लाइन पर जारी मुद्रा का वचन;
उपभोग योग्य वस्तुएं → परिवर्तनीय टोकन; एक चेकपॉइंट का शुद्ध व्यापार अंतर → **XLS-85 टोकन एस्क्रो** के माध्यम से एक निश्चित
लेन-देन; अद्वितीय उपकरण **XLS-20 NFT** के रूप में भेजे जाते हैं
(v3.3), जिसमें अवशेष वृद्धि एक परिवर्तनीय NFT के मेटाडेटा को **XLS-46 `NFTokenModify`** के माध्यम से बदलती है — जो v3.4 से वास्तविक गेमप्ले द्वारा संचालित है। अमूर्त जिला
अर्थव्यवस्था (`economy-core`) को *प्रभावित नहीं* किया जाता है — यह एक शुद्ध सिमुलेशन बनी रहती है।

**सुरक्षा उपाय।** केवल टेस्टनेट, एक **मुख्यनेट-असंभव-कोड में** संरचनात्मक
सुरक्षा (कोई कॉन्फ़िगरेशन फ़्लैग नहीं); वॉलेट बीज एक गिट-अनदेखे गुप्त साइडकार में रहते हैं,
कभी भी सेव फ़ाइल में नहीं; निपटान idempotent है और पुनः प्रयास पथ पर संरक्षण-सुरक्षित है; प्रमाण **वास्तविक ऑन-चेन मेमो** को सत्यापित करते हैं (इंजन का अपना
स्ट्रिंग नहीं); और यदि श्रृंखला दुर्गम है, तो रन बस जारी रहता है, जिसे *अनचर्ड* के रूप में चिह्नित किया गया है।

**सिद्ध रूप से लाइव।** एक वास्तविक `starter-pirate` व्यापारी रन — एक कटलैस बेचें, एक
तोप का गोला खरीदें — टोकन एस्क्रो के माध्यम से XRPL टेस्टनेट पर निपटान होता है, फिर `reconcile()`
लेज़र पर शेष राशि और मेमो की पुष्टि इंजन की अर्थव्यवस्था के विरुद्ध करता है (प्रत्येक टोकन के लिए संरक्षण)। लेज़र इंजन की तुलना में एक अलग सिस्टम परिवार है,
इसलिए इंजन इसे नकली नहीं बना सकता — सामंजस्य एक वास्तविक बाहरी सत्यापनकर्ता है।
केवल टेस्टनेट; संपत्ति गेम-स्कोप किए गए रसीदें हैं, प्रतिभूतियां नहीं।

---

## लड़ाई प्रणाली

पांच क्रियाएं (हमला, रक्षा, अलग होना, सहारा, पुन: स्थिति), चार लड़ाई की अवस्थाएं (संरक्षित, असंतुलित, उजागर, भागना), चार जुड़ाव की अवस्थाएं (जुड़ा हुआ, संरक्षित, बैकलाइन, अलग)। तीन सांख्यिकीय आयाम प्रत्येक सूत्र को चलाते हैं ताकि एक तेज द्वंद्ववादी एक भारी लड़ाकू या एक संयमित प्रहरी से अलग तरीके से खेले।

एआई विरोधी एकीकृत निर्णय स्कोरिंग का उपयोग करते हैं — लड़ाई की क्रियाएं और क्षमताएं एक ही मूल्यांकन में प्रतिस्पर्धा करती हैं, जिसमें मामूली क्षमता स्पैम को रोकने के लिए कॉन्फ़िगर करने योग्य सीमाएं होती हैं।

पैक लेखक लड़ाई को एक सांख्यिकीय मानचित्रण, संसाधन प्रोफ़ाइल और पूर्वाग्रह टैग से जोड़ने के लिए `buildCombatStack()` का उपयोग करते हैं। [लड़ाई अवलोकन](site/src/content/docs/handbook/49a-combat-overview.md) और [पैक लेखक गाइड](site/src/content/docs/handbook/55-combat-pack-guide.md) देखें।

---

## क्षमताएं

शैली-देशी क्षमता प्रणाली जिसमें लागत, सांख्यिकीय जांच, कूलडाउन और टाइप किए गए प्रभाव (नुकसान, उपचार, स्थिति लागू करें, शुद्ध करें) शामिल हैं। स्थिति प्रभाव प्रतिरोध/संवेदनशीलता प्रोफाइल के साथ 11-टैग सिमेंटिक शब्दावली का उपयोग करते हैं। एआई-जागरूक चयन स्कोर स्व/एओई/एकल-लक्ष्य पथ।

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
| [`@ai-rpg-engine/core`](packages/core) | निर्धारित सिमुलेशन रनटाइम — विश्व स्थिति, घटनाएं, आरएनजी, टिक, क्रिया समाधान |
| [`@ai-rpg-engine/modules`](packages/modules) | 30+ संयोजनीय मॉड्यूल — लड़ाई, धारणा, अनुभूति, गुट, अफवाहें, यात्रा, साथी, एनपीसी एजेंसी, रणनीतिक मानचित्र, आइटम पहचान, उभरते अवसर, चाप का पता लगाना, अंतिम खेल ट्रिगर |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | विश्व सामग्री के लिए विहित स्कीमा और सत्यापनकर्ता |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | चरित्र प्रगति, चोटें, मील के पत्थर, प्रतिष्ठा |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | आर्केटाइप चयन, निर्माण पीढ़ी, स्टार्टर गियर |
| [`@ai-rpg-engine/equipment`](packages/equipment) | उपकरण प्रकार, आइटम उत्पत्ति और अवशेष वृद्धि — जिसमें `item-chronicle-core` शामिल है, जो एक वैकल्पिक मॉड्यूल है जो वास्तविक गेमप्ले से गियर इतिहास रिकॉर्ड करता है ताकि आइटम उपनाम और स्तर अर्जित करें |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | क्रॉस-सत्र स्मृति, संबंध प्रभाव, अभियान स्थिति |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | अफवाह जीवनचक्र, उत्परिवर्तन यांत्रिकी, प्रसार ट्रैकिंग |
| [`@ai-rpg-engine/presentation`](packages/presentation) | कथा योजना स्कीमा, रेंडर अनुबंध, आवाज प्रोफाइल |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | संकेत शेड्यूलिंग, प्राथमिकता, डकिंग, कूलडाउन तर्क |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | साउंड पैक मेनिफेस्ट, सामग्री-पता योग्य रजिस्ट्री |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | पैक पंजीकरण, रूब्रिक स्कोरिंग, पैक खोज |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | पोर्ट्रेट, आइकन, मीडिया के लिए सामग्री-पता भंडारण |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | प्लग करने योग्य प्रदाताओं के साथ हेडलेस पोर्ट्रेट पीढ़ी |
| [`@ai-rpg-engine/ollama`](packages/ollama) | वैकल्पिक एआई लेखक — स्केफोल्डिंग, आलोचना, निर्देशित वर्कफ़्लो, ट्यूनिंग, प्रयोग |
| [`@ai-rpg-engine/cli`](packages/cli) | सीएलआई: गेम चलाएं, स्टार्टर बनाएं, सेव का निरीक्षण करें |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | टर्मिनल रेंडरर और इनपुट परत |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | व्यापारी स्टार्टर — लेज़र एडाप्टर के लिए संदर्भ पैक, जिसमें इस पर कोई निर्भरता नहीं है |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | चोर-शिकारी स्टार्टर — लूप के रूप में पीछा, और शहर का कौन सा आधा आपके लिए एक दरवाजा खोलेगा |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **वैकल्पिक** — खिलाड़ी के स्वामित्व वाले व्यापार योग्य परत (सिक्का / इन्वेंट्री / व्यापार) के लिए वैकल्पिक XRPL टेस्टनेट निपटान, चेकपॉइंट पर XLS-85 टोकन एस्क्रो के माध्यम से, पूरी तरह से निर्धारित कोर के बाहर |

### स्टार्टर उदाहरण

12 स्टार्टर दुनिया **रचना उदाहरण** हैं — वे इंजन मॉड्यूल को पूर्ण गेम में संयोजित करने का तरीका प्रदर्शित करते हैं। प्रत्येक एक अलग पैटर्न दिखाता है (सांख्यिकीय मानचित्रण, संसाधन प्रोफाइल, जुड़ाव कॉन्फ़िगरेशन, क्षमता सेट)। "दिखाए गए पैटर्न" और "क्या उधार लेना है" के लिए प्रत्येक स्टार्टर के README देखें।

| स्टार्टर | शैली | प्रमुख पैटर्न |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | डार्क फंतासी | न्यूनतम लड़ाई, संवाद-संचालित |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | साइबरपंक | संसाधन, जुड़ाव भूमिकाएँ |
| [`starter-detective`](packages/starter-detective) | विक्टोरियन रहस्य | सामाजिक-प्रथम, धारणा-भारी |
| [`starter-pirate`](packages/starter-pirate) | समुद्री डाकू | नौसैनिक + हाथापाई, बहु-क्षेत्रीय |
| [`starter-zombie`](packages/starter-zombie) | ज़ोंबी उत्तरजीविता | कमी, संक्रमण संसाधन |
| [`starter-weird-west`](packages/starter-weird-west) | अजीब पश्चिम | पैक पूर्वाग्रह, सुरक्षित-क्षेत्र पुनर्प्राप्ति |
| [`starter-colony`](packages/starter-colony) | विज्ञान-फाई कॉलोनी | चोकपॉइंट, घात क्षेत्र |
| [`starter-ronin`](packages/starter-ronin) | सामंती जापान | छिपे हुए मार्ग, एकाधिक संरक्षक भूमिकाएँ |
| [`starter-merchant`](packages/starter-merchant) | व्यापारी | लूप के रूप में दायित्व, लड़ाई को दंड के रूप में मूल्यवान |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | पीछा | पैसे के लिए लोगों का शिकार; हिंसा जोर से है, निषिद्ध नहीं |
| [`starter-vampire`](packages/starter-vampire) | पिशाच हॉरर | रक्त संसाधन, सामाजिक हेरफेर |
| [`starter-gladiator`](packages/starter-gladiator) | ऐतिहासिक ग्लेडिएटर | अखाड़ा लड़ाई, भीड़ का पक्ष |

---

## प्रलेखन

| संसाधन | विवरण |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | एक नया गेम बनाएं - CLI या मैन्युअल टेम्पलेट रूट |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | इंजन मॉड्यूल को मिलाकर अपना गेम बनाएं |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | प्रति-इकाई नियम समाधान - मिश्रित-शैली युद्ध, `applyProfile`, प्रोफ़ाइल टेम्पलेट, `profile` CLI |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | ऑप्ट-इन ऑन-लेजर सेटलमेंट - नियतिवादी फ़ायरवॉल, L0/L1/L2 एकीकरण स्तर, प्ले मोड, सुरक्षा रेल, और लाइव-सिद्ध समुद्री डाकू डेमो |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | छह युद्ध स्तंभ, पाँच क्रियाएं, एक नज़र में स्थितियाँ |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | चरण-दर-चरण buildCombatStack, आँकड़ा मैपिंग, संसाधन प्रोफ़ाइल |
| [Handbook](site/src/content/docs/handbook/index.md) | व्यापक हैंडबुक - प्रत्येक प्रणाली, साथ में 4 परिशिष्ट |
| [Composition Model](docs/composition-model.md) | 6 पुन: प्रयोज्य परतें और वे कैसे मिलकर काम करती हैं |
| [Examples](docs/examples/) | चलाने योग्य टाइपस्क्रिप्ट उदाहरण (टाइप-चेक + CI में व्यवहार-परीक्षण) - प्रति-इकाई मिश्रित पार्टी, साझा प्रोफ़ाइल, क्रॉस-वर्ल्ड, स्क्रैच से |
| [Design Document](docs/DESIGN.md) | आर्किटेक्चर का गहन अध्ययन - एक्शन पाइपलाइन, सत्य बनाम प्रस्तुति |
| [Philosophy](PHILOSOPHY.md) | नियतिवादी दुनिया, साक्ष्य-आधारित डिज़ाइन, सहायक के रूप में AI |
| [Changelog](CHANGELOG.md) | रिलीज़ इतिहास |

---

## रोडमैप

### हम अभी कहाँ हैं

दोनों रचना रीढ़ की हड्डी पूरी हो गई है - 326 फ़ाइलों में 6412 परीक्षण, `buildCombatStack` और `buildWorldStack` पर सभी 12 स्टार्टर, मुद्रित बीज के तहत नियतिवादी बाइट-समान रीप्ले, पूर्ण AI निर्णय स्कोरिंग, और एक CLI जो बनाता है, चलाता है, मान्य करता है और निरीक्षण करता है। **v3.0 दुनिया को जीवंत बनाता है: नामित NPC लक्ष्य, विश्वास/भय/लालच/वफ़ादारी संबंध, दायित्व लेज़र और परिणाम श्रृंखला के साथ जीवंत हो जाते हैं; सामाजिक परत निष्क्रिय रूप से कमाती है और इक्कीस नए कूटनीति/विध्वंस क्रियाओं में खर्च करती है; अर्थव्यवस्था प्रति स्टार्टर शैली-आधारित होती है; और आपके द्वारा अर्जित लाभ अंततः उस अभियान के अंत तक पहुँचता है जिसे यह नियंत्रित करता है। चरण-9 ऑडिट में शिप किए गए सामग्री में एक प्रमुख त्रुटि पाई गई - सुधार एक नामित NPC को प्रत्येक स्टार्टर में भेजता है।**

**Recent release arc (v2.4.0–v3.0.0):**
- v2.4.0 — Party combat (ally-targeting / heal / buff / revive, friend-foe AoE), status-effect system (modifiers + DoT/HoT + reactive triggers), plug-in Profiles Phase 1, content `validate`/`scaffold` CLI
- v2.5.0 — Per-entity rule resolution (mixed-playstyle combat), the `applyProfile` loader + per-entity abilities, profile templates + `profile` CLI, and a full health pass
- v2.6.0 — The `run` command became a real game: enemies act on their own AI profiles, victory/defeat, save/resume, abilities and XP on the menu, the `ai` studio bin, and the narration stack
- v2.7.0 — The world reacts and there's a reason to return: heat → pressures → narrated consequences, zone-entry encounters, a quest loop + Journal, equipment in combat, seeded replayable runs, live endgame inputs, `buildWorldStack`, the Director's Ledger, and a save-migration seam
- v2.8.0 — Act on the world you live in: a live trade economy + `sell` verb, companions you recruit and fight beside, and a Director's Ledger reading the whole board — one write-wire per system lit ~12 consumers that shipped dark
- v2.9.0 — Close the loops: `buy` + merchant stock and crafting complete the economy; companions take independent turns; four social verbs (bribe / intimidate / petition / seed) run on a leverage economy funded by opportunity rewards; opportunities resolve with expiry + favor-fallout consequence; and equipment, quests, recruitables, and starting coin roll out uniformly to all ten starters
- **v3.0.0 — Make the world live: the npc-agency producer lights named NPCs (goals / relationships / obligation ledgers / consequence chains) plus a story NPC in every starter; the social surface grows to 25 verbs (diplomacy + sabotage) with passive leverage income and dialogue that reads social state; per-starter genre-flavored stock + recipes; the leverage endings (victory / puppet-master / quiet-retirement) become reachable; repair/modify menu rows, escort opportunities, and an `audit-content` dev CLI — shipped through a Phase-9 audit that caught two dead-wires the green test suite hid**

### अगला (v3.0 रीढ़ की हड्डी)

- **जीवंत NPC** - लगातार npc-एजेंसी निर्माता जो निर्देशक के PEOPLE अनुभाग को रोशन करता है: नामित NPC लक्ष्य, संबंध ब्रेकपॉइंट, दायित्व लेज़र और परिणाम श्रृंखला के साथ, साथ ही साथी-मनोबल पक्षपात-पतन और प्रस्थान-जोखिम पथ जो प्रतिक्रिया प्रणाली में पहले से मौजूद है
- शैली-आधारित व्यापारी स्टॉक और क्राफ्टिंग रेसिपी (प्रति-स्टार्टर शैली थ्रेडिंग आज भेजे गए सार्वभौमिक फ़ॉलबैक पर), और `repair`/`modify` मेनू सतह
- लाभ अर्थव्यवस्था की अगली परत - अवसर पुरस्कारों से परे निष्क्रिय आय, और चार भेजे गए सामाजिक क्रियाओं से परे सामाजिक क्रियाएं (कूटनीति / विध्वंस समूह) - साथ ही संवाद स्थिति/प्रभाव शब्दावली जो नई सामाजिक स्थिति को पढ़ती है
- मल्टीप्लेयर - एक ही दुनिया को साझा करने वाले दो *मानव* खिलाड़ी (एक नेटवर्किंग परत, जानबूझकर स्थगित; एकल-नियंत्रक साझा प्रोफ़ाइल आज भेजे गए हैं [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- क्रमबद्ध सूत्र ओवरराइड - प्रति-प्रोफ़ाइल सूत्र ट्यूनिंग (एक सूत्र DSL पर अवरुद्ध; प्रोफ़ाइल में आज आँकड़ा मैपिंग है, क्लोजर नहीं)
- API प्रलेखन सिंक्रनाइज़ेशन - सुनिश्चित करें कि प्रत्येक हैंडबुक पृष्ठ नवीनतम API को दर्शाता है

### गंतव्य: प्लग-इन प्रोफ़ाइल

इंजन का अंतिम लक्ष्य **उपयोगकर्ता-परिभाषित प्रोफ़ाइल** है - पोर्टेबल बंडल जो किसी भी गेम में स्लॉट करते हैं। एक प्रोफ़ाइल एक आँकड़ा मैपिंग, संसाधन व्यवहार, AI पूर्वाग्रह टैग और क्षमताओं को एक एकल आयात योग्य इकाई में पैकेज करता है। v2.5 तक, एक दुनिया में इकाइयाँ प्रत्येक अपनी प्रोफ़ाइल ले जा सकती हैं और प्रति-इकाई युद्ध को हल कर सकती हैं - एक `might` सेनानी और एक `will` रहस्यवादी एक पार्टी साझा करते हैं, प्रत्येक अपनी खेल शैली लाते हैं।

स्कीमा, `applyProfile` लोडर, प्रति-इकाई क्षमता समाधान और क्रॉस-प्रोफ़ाइल सत्यापन सभी भेजे गए हैं। जो बचा है वह मल्टीप्लेयर है - दो *मानव* खिलाड़ियों (सिर्फ दो इकाइयों के नहीं) को एक दुनिया साझा करने की अनुमति देना - जो एक नेटवर्किंग परत है। डिज़ाइन के लिए [प्रोफ़ाइल रोडमैप](docs/profile-roadmap.md) और [feature-architecture.md](docs/feature-architecture.md) देखें।

---

## दर्शन

एआई आरपीजी इंजन तीन विचारों पर आधारित है:

1. **निश्चित दुनिया** — सिमुलेशन के परिणाम दोहराए जा सकने चाहिए।
2. **साक्ष्य-आधारित डिज़ाइन** — दुनिया के यांत्रिकी का परीक्षण सिमुलेशन के माध्यम से किया जाना चाहिए।
3. **एआई एक सहायक के रूप में, न कि अधिकार के रूप में** — एआई उपकरण डिज़ाइन उत्पन्न करने और उनकी आलोचना करने में मदद करते हैं, लेकिन वे निश्चित प्रणालियों को प्रतिस्थापित नहीं करते हैं।

पूर्ण विवरण के लिए [PHILOSOPHY.md](PHILOSOPHY.md) देखें।

---

## सुरक्षा

मुख्य इंजन एक **स्थानीय-केवल सिमुलेशन लाइब्रेरी** है: कोई टेलीमेट्री नहीं, कोई नेटवर्क नहीं, कोई गुप्त जानकारी नहीं। सहेजी गई फाइलें केवल स्पष्ट रूप से अनुरोध किए जाने पर `.ai-rpg-engine/` में सहेजी जाती हैं। दो **वैकल्पिक** परतें एक आउटबाउंड पथ जोड़ती हैं, और केवल तभी जब आप उन्हें सक्रिय करते हैं:

- एआई परत (`@ai-rpg-engine/ollama`) एक **स्थानीय** ओलामा डेमॉन से बात करती है; इसकी वैकल्पिक `webfetch` (आरएजी के लिए) एक एसएसआरएफ गार्ड द्वारा सीमित है (जो लूपबैक/लिंक-स्थानीय/सीजीएनएटी/क्लाउड-मेटाडेटा और IPv6-टनल्ड समकक्षों को अवरुद्ध करता है)।
- लेजर परत (`@ai-rpg-engine/ledger-adapter`) **एक्सआरपीएल टेस्टनेट** तक पहुंचती है — और केवल टेस्टनेट तक: एक **मुख्यनेट-असंभव-इन-कोड** संरचनात्मक गार्ड (कोई कॉन्फ़िगरेशन ध्वज नहीं) निर्माण के समय किसी भी गैर-टेस्टनेट होस्ट को अस्वीकार करता है। वॉलेट सीड्स एक गिट-अनदेखा गुप्त साइडकार में रहते हैं, कभी भी सहेजी गई फ़ाइल में नहीं, और निश्चित कोर कभी भी एडाप्टर को आयात नहीं करता है।

विवरण के लिए [SECURITY.md](SECURITY.md) देखें।

## आवश्यकताएं

- नोड.जेएस >= 20
- टाइपस्क्रिप्ट (ईएसएम मॉड्यूल)

## लाइसेंस

[एमआईटी](LICENSE)

---

<a href="https://mcp-tool-shop.github.io/">एमसीपी टूल शॉप</a> द्वारा निर्मित
