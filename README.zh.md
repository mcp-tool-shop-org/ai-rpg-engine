<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI 角色扮演游戏引擎

一个 TypeScript 工具包，用于构建确定性的角色扮演游戏模拟。您可以定义属性、选择模块、配置战斗流程，并创建内容。该引擎处理状态、事件、随机数生成、行动解析和 AI 决策。每次运行都是可重复的。

这是一个**组合引擎**，而不是一个完整的游戏。12 个初始世界只是示例——您可以从中学习和重新组合的可分解模式。您的游戏可以使用您需要的引擎的任何子集。

---

## 这是什么

- 一个**模块库**——30 多个引擎模块，涵盖战斗、感知、认知、派系、谣言、移动、伙伴等
- 一个**组合工具包**——`buildCombatStack()` 用大约 7 行代码配置战斗；`new Engine({ modules })` 启动游戏
- 一个**模拟运行时**——确定性的时间步进、可重放的行动日志、基于种子的随机数生成
- 一个**AI 设计工作室**（可选）——提供框架、评估、平衡分析、调整，并通过 Ollama 进行实验
- 一个**可选的链上层**——`@ai-rpg-engine/ledger-adapter` 使用真实的 XRPL **测试网**令牌来支持游戏中的货币和可交易物品，并在检查点处结算，完全独立于确定性的核心（可选；如果没有它，每次运行的字节码将完全相同）

## 这不是什么

- 不是一个完整的游戏——它提供 12 个可玩初始世界，您可以今天就将其作为示例进行`run`，并且该引擎是您用于构建*自己的*游戏的工具包
- 不是一个视觉引擎——它输出结构化事件，而不是像素
- 不是一个故事生成器——它模拟世界；叙事是从机制中产生的

---

## 当前状态（v3.10.0）

**What works and is tested:**
- **The world reaches the player (v3.10):** two cycles of producers finally land on the player's senses. All eight narrator-voice hints render — NPC texture and faction bias frame the speaker, the manner hint rides the speaker line, party presence / world pressure / open opportunities close the dialogue frame as asides, and district mood and situation reports join the event log. The always-on HUD gains the party line. Combat honesty arrives as a real event: `combat.encounter.cleared` fires exactly once when the last hostile falls (a mutual kill reads as defeat, a companion's death no longer renders triumph, and the nine starter listeners that fanfared every kill are gone), mapped to the victory sting through the per-turn presenter. Zone entry resolves tone-aware music — a grim district actually sounds grim — and the spoken-output contract is real: `NarrationPlan.asides` carries dialogue fragments exactly once, `SpeakerCue.emotion` carries the manner hint verbatim, ready for a TTS embedder. Sidecar clients see pack-intake `dropped[]`/`advisories` on `initialize`, guided `/build` batches stage every step behind one batched consent (with a CREATE-aware undo and a decline that can't hollow the gate), scaffolded factions survive `emit-pack`, and faction identity resolves from the entity's own authored `faction` everywhere it used to need a registry no shipped pack populates — un-inverting district intruder tracking and reviving rumor propagation. A played-session e2e pins the whole surface frame-by-frame, NO_COLOR byte-identical. Recorded honestly: `bounty` lost natural reachability to the listener cleanup (its synthetic control passes — the mechanism is healthy); retuning its on-ramp is the named P1.
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
- Full test suite: **8223 tests** (deterministic across repeated runs; test files typechecked in CI; coverage ratchet-enforced; 4 tests parked under the recorded `P1(bounty-on-ramp)` tag)

**哪些部分存在缺陷或不完整：**
- AI 世界构建工作室（Ollama 层）的测试不如模拟核心充分，需要本地 Ollama 守护进程；它是完全可选的——引擎和 `run` 循环不需要网络。
- 叙事/音频堆栈构建确定性的音频命令，但**没有终端音频后端**——没有任何声音播放；这些命令是 GUI/Web 嵌入器的集成钩子。
- 多人游戏（两个人类玩家共享一个世界）**没有**构建——它是一个网络层，有意不在设计范围内；当前的配置针对单个控制器。
- `replay --replay` 恢复保存状态，而不是重新模拟——并且在 v2.9 之后，这就是**既定的**方向，而不是推迟：`Engine.serialize()` 已经是一个经过验证的完整状态快照，而重新模拟必须跟踪存在于操作日志之外的世界时间/遭遇状态。v2.9 版本在经过验证的恢复路径上提供了多检查点保存槽；真正的基于事件的重新模拟尚未计划。
- v3.1 结束了 v3.0 的三个既定限制——游戏**起始资源**、特定类型的*修复*配方，以及 `deny` / `bury-scandal` 菜单界面，现在都已发布。剩下的唯一限制是：新的游戏修复配方包含作者编写的 `statDelta`（一个小的属性加成），而 `resolveRepair` 尚未应用——修复*恢复*，`modify` *升级*——因此，修复即升级的功能已在代码中标记，并**推迟到 v3.2/v3.3** 版本，作为一种有意的机制，而不是一个静默的、不活跃的字段。并且 `obligation-exists` 附带一个作者编写的演示示例（Brother Aldric）；该条件已激活，供内容作者用于控制更多对话。
- 文档内容丰富，但并非每个手册页面都反映了最新的 API。

---

## 它看起来是什么样

捆绑的终端 UI 将每个回合分解为带有标签的部分——场景、状态、日志和动作——并提供一目了然的 HUD。默认情况下，输出为纯文本，并在 TTY 上添加语义颜色（伤害为红色，治疗为绿色，拒绝为黄色），同时支持 `NO_COLOR` 和非 TTY 管道；每个提示都包含在文本中，而不是仅使用颜色。

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

## 安装和游玩

从终端开始一个游戏，或者构建你自己的游戏：

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

`run` 循环是一个真实的基于回合的游戏：敌人根据其自身的 AI 配置文件行动，能力和经验值显示在菜单中，你可以保存和恢复，并且战斗以胜利或失败结束。每个游戏都是确定性的，并且可以重复游玩。

可选地，AI 设计工作室可以作为其自身的命令进行安装：

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

该工作室与本地 [Ollama](https://ollama.com) 守护进程进行通信——首先运行 `ollama serve` 和 `ollama pull qwen2.5-coder`。它是完全可选的；引擎和 `run` 循环不需要网络。

容器镜像已发布到 GHCR，地址为 `ghcr.io/mcp-tool-shop-org/ai-rpg-engine`，用于 CI 和沙盒运行。

---

## 快速开始

你更喜欢在代码中构建自己的游戏吗？从模块中组合引擎：

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

有关完整工作流程，请参阅 [组合指南](site/src/content/docs/handbook/57-composition-guide.md)，或者构建一个新的起始游戏：

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## 架构

| 层 | 角色 |
|-------|------|
| **Core Runtime** | 确定性引擎——世界状态、事件、动作、时间、RNG、重播 |
| **Modules** | 30 多个可组合的系统——战斗、感知、认知、派系、移动、伙伴等。 |
| **Content** | 实体、区域、对话、物品、能力、状态——由作者创建。 |
| **AI Studio** | 可选的 Ollama 层——构建、评论、平衡分析、调整、实验。 |

---

## XRPL 分账本适配器（可选）

`@ai-rpg-engine/ledger-adapter` 是一个**可选**的包，它将游戏的**玩家拥有的可交易层**——即 `coin` 余额和消耗品库存，这些库存由 `trade-core` 的 `buy`/`sell` 动词控制——绑定到 **XRPL 测试网络**，以便这些资产可以由真实的链上令牌支持，并在检查点处结算。如果缺少适配器，则完全就是今天发布的离线引擎。

**确定性不变性（整个目的）。** 适配器是一个*侧通道*，而不是模拟的一部分：

- 它**绝不在确定性循环内被调用**——而仅在**检查点**（保存、城镇/市场入口、章节中断）时调用。
- `@ai-rpg-engine/core` 或 `@ai-rpg-engine/modules` 中的任何内容都不会导入它（它唯一的引擎依赖项是编译时的 `import type`）。
- **无论有或没有它，运行都是字节级的。** 防火墙测试在两个引擎上运行真实的 `starter-pirate` `createGame()` 商家循环——一个启用了适配器并在检查点处结算，另一个没有启用——并断言这两个世界是完全相同的。种子 0 重播不受影响。

**集成级别——游戏可以根据其设计尽可能深入地集成它。** 防火墙是一个*确定性*边界，而不是反集成规则；上述不变性在每个级别都成立：

| 级别 | 依赖适配器的内容 | 是否适用 |
|-------|-----------------------------|------|
| **L0 — External observer** | 游戏内部没有；适配器从外部在检查点处连接，游戏对此一无所知。 | 重构现有游戏（发布的盗版演示）。 |
| **L1——游戏驱动的检查点** | 游戏自己的保存/城镇/元进度流程在定义的时刻调用适配器。 | 游戏希望在特定的链上时刻进行设计。 |
| **L2 — Ledger-native design** | 游戏经济或身份围绕链上所有权（持久发行者、真实市场）进行设计。 | 一个以分账本为先的商家游戏。 |

保持重播安全的区别**不是**“哪个包导入了适配器”，而是“调用是否在循环内”。游戏包可以自由导入和驱动适配器，只要每个调用都在种子驱动的重播循环之外的检查点处进行。

**三种游戏模式。** `offline`（默认——无链，引擎按发布状态）· `ledger`（硬币/物品由测试网络余额支持，并在检查点处结算）· `diary`（离线游玩，然后将运行的状态哈希锚定在链上，以获得防篡改的收据）。

**账本上的内容。** `coin` → 一种基于信任关系的已发行货币借据；
消耗品 → 可替代的令牌；一个检查点的净交易差额 → 通过 **XLS-85 令牌托管** 进行结算的转账。独特的装备以 **XLS-20 NFT**（v3.3）的形式出现，通过 **XLS-46 `NFTokenModify`** 推进可变 NFT 的元数据（从 v3.4 开始，由实际游戏行为驱动）。抽象的区域经济（`economy-core`）*不会*受到影响——它仍然是一个纯粹的模拟。

**安全保障。** 仅限测试网络使用，具有一种**在代码中无法绕过的**结构性保护（而不是配置标志）；钱包种子存储在 git 忽略的单独文件中，绝不在存档文件中；结算是幂等的，并且在重试路径上是安全的；证明验证**真实的链上备忘录**（而不是引擎自身的字符串）；如果无法访问链，则运行将继续进行，并标记为*未锚定*。

**已验证的实际应用。** 一次真实的 `starter-pirate` 商家运行——出售一把弯刀，购买一枚炮弹——通过令牌托管在 XRPL 测试网上进行结算，然后 `reconcile()` 确认账本上的余额和备忘录与引擎的经济系统是否一致（每个令牌都符合保存规则）。账本是一个与引擎不同的系统，因此引擎无法伪造数据——对账是一个真正的外部验证器。仅限测试网络使用；资产是游戏范围内的收据，而不是证券。

---

## 战斗系统

五个动作（攻击、防御、脱离、准备、重新定位），四种战斗状态（防御、失去平衡、暴露、逃跑），四种交战状态（交战、保护、后排、孤立）。三个统计维度驱动每个公式，因此快速的决斗者与强壮的战士或沉着的老兵的玩法不同。

AI 对手使用统一的决策评分——战斗动作和能力在一个单一的评估中竞争，并具有可配置的阈值，以防止边缘能力过度使用。

包作者使用 `buildCombatStack()` 将战斗与统计映射、资源配置文件和偏差标签连接起来。请参阅 [战斗概述](site/src/content/docs/handbook/49a-combat-overview.md) 和 [包作者指南](site/src/content/docs/handbook/55-combat-pack-guide.md)。

---

## 能力

具有成本、统计检查、冷却时间和类型化效果（伤害、治疗、状态应用、清除）的特定于游戏类型的能力系统。状态效果使用具有抗性/脆弱性配置的 11 标签语义词汇。AI 感知的选择评分会评估自我/范围/单目标路径。

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

## 包

| 包 | 目的 |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | 确定性模拟运行时——世界状态、事件、RNG、刻度、动作解析 |
| [`@ai-rpg-engine/modules`](packages/modules) | 30 多个可组合的模块——战斗、感知、认知、派系、谣言、移动、伙伴、NPC 代理、战略地图、物品识别、新兴机会、弧线检测、游戏结束触发器 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 用于世界内容的规范模式和验证器 |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | 角色发展、受伤、里程碑、声望 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | 原型选择、构建生成、初始装备 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装备类型、物品来源和文物增长——包括 `item-chronicle-core`，这是一个可选模块，它记录来自实际游戏中的装备历史，以便物品获得称号和等级 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | 跨会话内存、关系效果、战役状态 |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | 谣言生命周期、变异机制、传播跟踪 |
| [`@ai-rpg-engine/presentation`](packages/presentation) | 叙事计划模式、渲染合同、语音配置文件 |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | 提示调度、优先级、静音、冷却逻辑 |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | 音效包清单、基于内容的注册表 |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | 包注册、评分标准、包发现 |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | 用于肖像、图标、媒体的基于内容的存储 |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | 具有可插拔提供程序的无头肖像生成 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | 可选的 AI 创作——脚手架、评论、引导工作流程、调整、实验 |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI：运行游戏、创建初始项目、检查存档 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | 终端渲染器和输入层 |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | 商业启动器——账本适配器的参考包，不依赖于它 |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | 盗贼启动器——以追逐为循环，并决定哪个城市的一半会为你打开一扇门 |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **可选**——用于玩家拥有的可交易层（货币/库存/交易）的 XRPL 测试网结算，通过检查点的 XLS-85 令牌托管进行，完全独立于确定性核心 |

### 启动示例

这 12 个启动世界是**组合示例**——它们演示了如何将引擎模块组合成完整的游戏。每个示例都展示了不同的模式（统计映射、资源配置文件、交战配置、能力集）。请参阅每个启动器的 README，了解“演示的模式”和“可以借鉴的内容”。

| 启动器 | 类型 | 关键模式 |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | 黑暗奇幻 | 最小化的战斗，对话驱动 |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | 赛博朋克 | 资源、交战角色 |
| [`starter-detective`](packages/starter-detective) | 维多利亚时代的神秘 | 首先关注社交，侧重于感知 |
| [`starter-pirate`](packages/starter-pirate) | 海盗 | 海军 + 近战，多区域 |
| [`starter-zombie`](packages/starter-zombie) | 僵尸生存 | 稀缺性，感染资源 |
| [`starter-weird-west`](packages/starter-weird-west) | 怪异西部 | 包偏差，安全区恢复 |
| [`starter-colony`](packages/starter-colony) | 科幻殖民地 | 瓶颈，伏击区 |
| [`starter-ronin`](packages/starter-ronin) | 封建日本 | 隐藏通道，多个保护者角色 |
| [`starter-merchant`](packages/starter-merchant) | 商业 | 义务作为循环，战斗价格定为惩罚 |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | 追逐 | 为了金钱而追捕人；暴力是公开的，而不是被禁止的 |
| [`starter-vampire`](packages/starter-vampire) | 吸血鬼恐怖 | 血液资源，社会操纵 |
| [`starter-gladiator`](packages/starter-gladiator) | 历史角斗士 | 竞技场战斗，人群的青睐 |

---

## 文档

| 资源 | 描述 |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | 构建一个新的游戏——CLI 或手动模板 |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | 通过组合引擎模块来构建你自己的游戏 |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | 每个实体的规则解析——混合战斗风格，`applyProfile`，配置模板，`profile` CLI |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | 选择加入链上结算——确定性防火墙，L0/L1/L2 集成级别，游戏模式，安全保障，以及经过实际验证的海盗演示 |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | 六个战斗支柱，五个动作，一目了然的状态 |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | 逐步构建战斗堆栈，属性映射，资源配置 |
| [Handbook](site/src/content/docs/handbook/index.md) | 全面的手册——每个系统，以及 4 个附录 |
| [Composition Model](docs/composition-model.md) | 6 个可重用的层以及它们的组合方式 |
| [Examples](docs/examples/) | 可运行的 TypeScript 示例（类型检查 + 在 CI 中进行行为测试）——每个实体的混合队伍，共享配置，跨世界，从零开始 |
| [Design Document](docs/DESIGN.md) | 架构深入分析——动作流水线，事实与呈现 |
| [Philosophy](PHILOSOPHY.md) | 确定性世界，基于证据的设计，AI 作为助手 |
| [Changelog](CHANGELOG.md) | 发布历史 |

---

## 路线图

### 我们目前的进展

两个主要组件均已完成——**385个文件中包含8223个测试**，`buildCombatStack`和`buildWorldStack`上的所有12个初始角色，基于打印的种子进行确定性字节级重复播放，完整的AI决策评分，以及一个可以构建、运行、验证和检查的命令行界面。v3.x版本使世界栩栩如生（命名NPC、25个动词的社交系统、类型经济——v3.0–v3.1），将玩家拥有的资产放在XRPL测试网上，作为一种可选的侧通道（v3.2–v3.4），创建了两个系统优先级的初始角色，并将它们转变为引擎优化工具（v3.5–v3.6），完善并强化了战略层，直到后果产生实际影响（v3.7–v3.8），为宿主提供了引擎界面，使其能够与Godot连接（v3.8.1），闭合了创作循环，因此一个工作室会话或一个简单的JSON包就可以生成一个可玩的世界（v3.9），并且**将整个战略层置于玩家的感官之上——提示、队伍、胜利、情绪驱动的音乐以及背景——通过一次实际游戏会话进行验证（v3.10）**。

**最近的发布周期（v2.4.0–v3.0.0）：**
- v2.4.0 — 队伍战斗（目标盟友/治疗/增益/复活，友方/敌方 AoE），状态效果系统（修改器 + DoT/HoT + 反应触发器），插件配置阶段 1，内容 `validate`/`scaffold` CLI
- v2.5.0 — 每个实体的规则解析（混合战斗风格），`applyProfile` 加载器 + 每个实体的能力，配置模板 + `profile` CLI，以及完整的健康状态检查
- v2.6.0 — `run` 命令成为一个真正的游戏：敌人根据自己的 AI 配置行动，胜利/失败，保存/恢复，能力和经验值显示在菜单中，`ai` 工作室资源包，以及叙事堆栈
- v2.7.0 — 世界会做出反应，并且有理由再次返回：热度 → 压力 → 叙述性的后果，区域入口遭遇，任务循环 + 日记，战斗中的装备，可重复播放的运行，实时游戏结束输入，`buildWorldStack`，导演日志，以及保存迁移接口
- v2.8.0 — 采取行动，影响你所生活的世界：一个实时的交易经济 + `sell` 动词，你可以招募并一起战斗的伙伴，以及一个导演日志，它会读取整个游戏板——每个系统都有一个写入线，大约有 12 个已发布但未公开的系统
- v2.9.0 — 完成循环：`buy` + 商店库存和制作完成了经济系统；伙伴可以独立行动；四个社交动词（贿赂/恐吓/请愿/引导）在一个由机会奖励资助的杠杆经济中运行；机会会随着过期 + 影响后果而解决；装备、任务、可招募角色和起始金币会均匀地分配给所有十个启动器
- **v3.0.0 — 让世界“活”起来：NPC 代理生成器点亮了命名 NPC（目标/关系/义务日志/后果链），并且每个启动器中都有一个故事 NPC；社交界面扩展到 25 个动词（外交 + 破坏），具有被动杠杆收入和读取社交状态的对话；每个启动器都有特定类型的库存 + 配方；杠杆结局（胜利/傀儡大师/安静的退休）变得可以实现；修复/修改菜单行，护送机会，以及一个 `audit-content` 开发 CLI——通过第 9 阶段的审核，该审核发现了绿色测试套件隐藏的两个死线**

### 接下来（调整和深化周期）

v3.10提供了用户界面；在此过程中记录的内容将决定下一个周期：

- **重新调整`bounty`的入口（命名的P1）**——初始角色-监听器清理改变了确定性事件流，并且“黑旗-安魂曲”的四个条件奖励窗口不再出现在正常的会话中；该机制以人为方式运行，并且`faction-summons`（其整个后果链）在其后面等待——一个专门的单杠平衡调整，以可访问性框架作为门槛。
- **为一场没有人赢得的战斗提供一个诚实的结局**——逃离一场战斗，然后清空该区域，不会触发任何事件（规则：撤退不是胜利）；一个带有自身影响和记忆语义的`outcome`承载的战斗结束设计（撤退/撤离）。
- **同伴记得他们来自哪里**——目前，招募会将一个同伴重写到队伍的共享派系中，因此“他们所属的公会会听从你的命令”是无法实现的；在`CompanionState`上保留一个原始派系，可以解锁设计中设想的派系路线杠杆奖励。
- **无需注册步骤即可进行派系认知**——谣言传播和观察者框架仍然严重依赖于明确的`createFactionCognition`注册，而当前发布的包中没有此功能；从已编写的`entity.faction`中推断出成员资格，并通过`affiliationOf`而不是原始派系不平等来路由观察者的敌意，完成了v3.10的身份回退所开始的工作。
- **区域音乐的多样性和包的可扩展性**——音调桥首先是确定性的（相同的区域，相同的音调）；每个区域的确定性滚动，以及一个可以由包作者编写的音调→情绪表面，是设计中的下一步，以及缺失的繁荣家庭环境音乐。
- **在崩溃中幸存的构建批次**——v3.10在退出时发出警告；将`BuildState`/`TuningState`（包括分阶段写入）序列化到会话文件中是完整的解决方案。
- 多人游戏——两个*人类*玩家共享一个世界（网络层，故意推迟；单控制器共享配置文件今天发布，即[`shared-profiles.ts`](docs/examples/shared-profiles.ts)）。
- 可序列化的公式覆盖——每个配置文件的公式调整（受公式DSL的限制；配置文件今天携带状态映射，而不是闭包）。

### 目标：插件配置

引擎的最终目标是**用户定义的配置**——可移植的包，可以插入到任何游戏中。一个配置打包了属性映射、资源行为、AI 偏差标签和能力，形成一个可导入的单元。从 v2.5 开始，一个世界中的实体可以各自携带自己的配置，并按每个实体解析战斗——一个 `might` 战士和一个 `will` 术士共享一个队伍，每个队员都带来自己的游戏风格。

架构、`applyProfile` 加载器、按实体能力解析以及跨配置文件的验证都已经完成。剩下的就是多人游戏——让两个*人类*玩家（而不仅仅是两个实体）共享一个世界——这需要一个网络层。请参阅 [Profile Roadmap](docs/profile-roadmap.md) 和 [feature-architecture.md](docs/feature-architecture.md) 以了解设计。

---

## 理念

AI RPG 引擎围绕以下三个理念构建：

1. **确定性世界**——模拟结果必须可重现。
2. **基于证据的设计**——世界机制应通过模拟进行测试。
3. **AI 作为助手，而非权威**——AI 工具帮助生成和评估设计，但不取代确定性系统。

请参阅 [PHILOSOPHY.md](PHILOSOPHY.md) 以获取完整说明。

---

## 安全性

核心引擎是一个**仅本地运行的模拟库**：没有遥测数据，没有网络，没有秘密。保存文件仅在明确请求时才会保存到 `.ai-rpg-engine/`。两个**可选**层添加了一个向外连接路径，并且只有在您调用它们时才会生效：

- AI 层（`@ai-rpg-engine/ollama`）与**本地** Ollama 守护进程通信；其可选的 `webfetch`（用于 RAG）受到 SSRF 保护的限制（阻止回环/链路本地/CGNAT/云元数据以及 IPv6 隧道等）。
- 分账本层（`@ai-rpg-engine/ledger-adapter`）连接到**XRPL 测试网络**——并且仅连接到测试网络：一个**在代码中不可能连接到主网络**的结构性保护（而不是配置标志），在构建时拒绝任何非测试网络的主机。钱包种子存储在 git 忽略的秘密文件中，绝不在保存文件中，并且确定性核心绝不会导入适配器。

请参阅 [SECURITY.md](SECURITY.md) 以获取详细信息。

## 要求

- Node.js >= 20
- TypeScript（ESM 模块）

## 许可证

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建
