<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPGエンジン

決定的なRPGシミュレーションを構築するためのTypeScriptツールキット。ステータスを定義し、モジュールを選択し、戦闘スタックを構成し、コンテンツを作成します。エンジンは、状態、イベント、乱数生成、アクションの解決、AIによる意思決定を処理します。すべての実行は再現可能です。

これは、完成されたゲームではなく、**コンポジションエンジン**です。12個のスターターワールドは例であり、そこから学習して再構築できる、分解可能なパターンです。ゲームは、エンジンから必要なサブセットを使用します。

---

## これは何なのか

- **モジュールライブラリ** — 30以上のエンジンモジュールがあり、戦闘、知覚、認知、派閥、噂、移動、仲間などをカバー
- **コンポジションツールキット** — `buildCombatStack()` で戦闘を約7行で構成、`new Engine({ modules })` でゲームを起動
- **シミュレーションランタイム** — 決定的なティック、再生可能なアクションログ、シードされた乱数生成
- **AIデザインスタジオ**（オプション） — スキャフォールディング、批評、バランス分析、調整、Ollamaを介した実験
- **オプションのオンレジャーレイヤー** — `@ai-rpg-engine/ledger-adapter` は、ゲームのコインと取引可能なアイテムを実際のXRPL **テストネット**トークンで裏付け、チェックポイントで決済します。これは、決定的なコアとは完全に独立しています（オプション。これがない場合でも、実行はバイト単位で同一になります）。

## これは何ではないのか

- Not a single finished game — it ships 12 playable starter worlds you can `run` today as examples, and the engine is the toolkit you compose your *own* game from
- Not a visual engine — it outputs structured events, not pixels
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## 現在の状況（v3.9.0）

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

**不完全または未完成な点:**
- AIを活用したワールド構築スタジオ（Ollamaレイヤー）は、シミュレーションコアよりもテストが不十分であり、ローカルのOllamaデーモンが必要。これは完全にオプションであり、エンジンと`run`ループにはネットワークは不要。
- ナレーション/オーディオスタックは、決定的なオーディオコマンドを生成するが、**ターミナルオーディオバックエンドは存在しない**。つまり、音は何も再生されない。これらのコマンドは、GUI/Web埋め込みのための統合フックである。
- マルチプレイヤー（2人の人間プレイヤーが1つの世界を共有）は**実装されていない**。これはネットワークレイヤーであり、意図的にスコープ外である。現在のプロファイルは、単一のコントローラーを対象としている。
- `replay --replay`は、再シミュレーションの代わりに保存データを復元する。v2.9以降、これは**決定的な**方向性であり、一時的なものではない。`Engine.serialize()`はすでに実績のある完全な状態のスナップショットであり、再シミュレーションでは、アクションログの外にあるワールドティック/エンカウンターの状態を追跡する必要がある。v2.9では、実績のある復元パスで複数のチェックポイント保存スロットが提供される。真のイベントソースによる再シミュレーションは計画されていない。
- v3.1は、v3.0の3つの定義された制限を解除した。ジャンル固有の**初期リソース**、ジャンル固有の*修理*レシピ、および`deny`/`bury-scandal`メニューのインターフェースがすべて実装された。残る唯一の制限は、新しいジャンルの修理レシピに、作成者が定義した`statDelta`（小さなステータスボーナス）が含まれていることだが、`resolveRepair`はまだ適用されない。修理は*復元*、`modify`は*アップグレード*であるため、修理をアップグレードとして扱うことはコード内でマークされ、**v3.2/v3.3に延期**される。これは、意図的なメカニズムであり、静的で不活性なフィールドではない。また、`obligation-exists`には、作成者が定義したデモ（ブラザー・アルドリック）が1つ含まれている。この条件は、コンテンツ作成者がより多くのダイアログを制御できるように、ライブで設定されている。
- ドキュメントは豊富だが、すべてのハンドブックページが最新のAPIを反映しているわけではない。

---

## どのような見た目か

バンドルされたターミナルUIは、各ターンをラベル付きのセクション（シーン、ステータス、ログ、アクション）に構成し、一目でわかるHUDを提供する。デフォルトではプレーンテキストで出力され、TTY（ダメージは赤、回復は緑、拒否は黄）で意味のある色を追加し、`NO_COLOR`と非TTYパイプを尊重する。すべてのキューはテキストに含められ、色のみでは伝達されない。

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

## インストールとプレイ

ターミナルから、スターターゲームをプレイするか、独自のゲームを構築する。

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

`run`ループは、実際のターンベースのセッションである。敵は独自のAIプロファイルに基づいて行動し、アビリティと経験値はメニューに表示され、保存と再開が可能であり、戦闘は勝利または敗北で終了する。すべてのゲームは決定論的であり、何度でもプレイできる。

オプションとして、AIデザインスタジオを独自のコマンドとしてインストールできる。

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

スタジオは、ローカルの[Ollama](https://ollama.com)デーモンと通信する。最初に`ollama serve`と`ollama pull qwen2.5-coder`を実行する。これは完全にオプションであり、エンジンと`run`ループにはネットワークは不要。

コンテナイメージは、CIおよびサンドボックス化された実行のために、GHCRに`ghcr.io/mcp-tool-shop-org/ai-rpg-engine`として公開される。

---

## クイックスタート

コードで独自のゲームを構築したい場合は、エンジンをモジュールから構成する。

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

完全なワークフローについては、[構成ガイド](site/src/content/docs/handbook/57-composition-guide.md)を参照するか、新しいスターターを構築する。

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## アーキテクチャ

| レイヤー | 役割 |
|-------|------|
| **Core Runtime** | 決定論的なエンジン — ワールドの状態、イベント、アクション、ティック、RNG、リプレイ |
| **Modules** | 30以上の組み合わせ可能なシステム — 戦闘、知覚、認知、派閥、移動、仲間など |
| **Content** | エンティティ、ゾーン、ダイアログ、アイテム、アビリティ、ステータス — 作成者が作成 |
| **AI Studio** | オプションのOllamaレイヤー — スキャフォールディング、批判、バランス分析、調整、実験 |

---

## XRPL台帳アダプター（オプション）

`@ai-rpg-engine/ledger-adapter`は、ゲームの**プレイヤーが所有する取引可能なレイヤー**（`coin`の残高と消費可能なインベントリで、`trade-core`の`buy`/`sell`の動詞によってすでに移動される）を**XRPLテストネット**にバインドする**オプションの**パッケージである。これにより、これらのアセットは実際のオンチェーンのトークンによって裏付けられ、チェックポイントで決済される。アダプターが存在しない場合、それは今日出荷されているオフラインエンジンそのものである。

**決定論の不変性（最も重要な点）。** アダプターは*サイドチャネル*であり、シミュレーションの一部ではない。

- **決定論的なティック内では決して呼び出されない**。**チェックポイント**（保存、町/市場への入り口、チャプターの区切り）でのみ呼び出される。
- `@ai-rpg-engine/core`または`@ai-rpg-engine/modules`のいずれにも、アダプターをインポートするコードはない（唯一のエンジン依存関係は、コンパイル時の`import type`である）。
- **アダプターの有無にかかわらず、実行はバイト単位で同一である。** ファイアウォールテストでは、実際の`starter-pirate` `createGame()`の商人ループを、アダプターが有効でチェックポイントで決済するエンジンとアダプターが無効の2つのエンジンで実行し、2つのワールドが完全に等しいことを確認する。シード0のリプレイは変更されない。

**統合レベル — ゲームは、その設計に応じて、アダプターを必要なだけ深く統合する。** ファイアウォールは*決定論*の境界であり、統合を禁止するルールではない。上記の不変性は、すべてのレベルで維持される。

| レベル | アダプターに依存するもの | 適合 |
|-------|-----------------------------|------|
| **L0 — External observer** | ゲーム内には何も依存しない。アダプターは、チェックポイントで外部からアタッチされ、ゲームはそれを認識しない。 | 既存のゲーム（出荷される海賊デモ）への後付け。 |
| **L1 — ゲーム駆動型のチェックポイント** | ゲーム自体の保存/町/メタプログレッションフローが、定義された時点でアダプターを呼び出す。 | ゲームが、意図的な台帳の瞬間を必要とする場合。 |
| **L2 — Ledger-native design** | ゲームの経済またはアイデンティティは、オンチェーンの所有権（永続的な発行者、実際の市場）を中心に設計されている。 | 台帳を重視した商人ゲーム。 |

リプレイを安全に保つための区別は、「どのパッケージがアダプターをインポートするか」ではなく、「呼び出しがティック内にあるかどうか」である。ゲームパッケージは、アダプターを自由にインポートして駆動できるが、すべての呼び出しが、シード駆動のリプレイループ外のチェックポイントで実行される必要がある。

**3つのプレイモード。** `offline`（デフォルト — チェーンなし、出荷されるエンジン）· `ledger`（テストネットの残高によって裏付けられ、チェックポイントで決済されるコイン/アイテム）· `diary`（オフラインでプレイし、次に実行の状態ハッシュを台帳に固定して、改ざん防止のレシートを作成する）。

**台帳に記録されるもの。** `coin` → トラストライン上の発行通貨の借用証；
消耗品 → 交換可能なトークン；チェックポイントにおける純取引額の変化 → **XLS-85トークンエスクロー**による決済済み転送。ユニークな装備は**XLS-20 NFT**（v3.3）として出荷され、遺物の成長により、可変NFTのメタデータをその場で更新（**XLS-46 `NFTokenModify`**）。v3.4以降、実際のゲームプレイによって制御される。抽象的な地区経済（`economy-core`）は*変更されない* — 純粋なシミュレーションのまま。

**安全対策。** テストネットのみ。コード内に**メインネットでは不可能な**構造的なガード（設定フラグではない）を実装。ウォレットのシードは、Gitで無視される秘密のサイドカーに保存され、決してセーブファイルには保存されない。決済はべき等であり、再試行パス上では安全にリソースを保護する。証拠は**実際のオンチェーンメモ**（エンジン独自の文字列ではない）を検証する。チェーンにアクセスできない場合、実行は単に継続され、*アンカーされていない*とマークされる。

**Proven live.** A real `starter-pirate` merchant run — sell a cutlass, buy a
cannon-shell — settles on XRPL testnet via token escrow, then `reconcile()`
confirms on-ledger balances and memos against the engine's economy (conservation
holds for every token). The ledger is a different system family than the engine,
so the engine cannot fake it — reconciliation is a genuine external verifier.
Testnet only; assets are game-scoped receipts, not securities.

---

## 戦闘システム

5つのアクション（攻撃、防御、離脱、態勢、位置変更）、4つの戦闘状態（防御、体勢を崩す、無防備、逃走）、4つの交戦状態（交戦、防御、後方、孤立）。3つのステータス次元がすべての計算を駆動するため、素早い剣士は、重装の戦士や冷静な歩哨とは異なる動きをする。

AI対戦相手は、統一された意思決定スコアリングを使用する — 戦闘アクションと能力が単一の評価で競合し、設定可能な閾値により、些細な能力の過剰な使用を防ぐ。

パックの作成者は、`buildCombatStack()`を使用して、ステータスマッピング、リソースプロファイル、およびバイアスタグから戦闘を構成する。 [戦闘の概要](site/src/content/docs/handbook/49a-combat-overview.md)および[パック作成者ガイド](site/src/content/docs/handbook/55-combat-pack-guide.md)を参照。

---

## 能力

ジャンルに特化した能力システム。コスト、ステータスチェック、クールダウン、および型付きの効果（ダメージ、回復、ステータス付与、浄化）を持つ。ステータス効果は、抵抗/脆弱性のプロファイルを持つ11タグのセマンティック語彙を使用する。AIは、自己/範囲/単一ターゲットのパスを認識して選択スコアを計算する。

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

## パッケージ

| パッケージ | 目的 |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | 決定論的なシミュレーションランタイム — ワールドの状態、イベント、乱数生成、ティック、アクションの解決 |
| [`@ai-rpg-engine/modules`](packages/modules) | 30以上の組み合わせ可能なモジュール — 戦闘、知覚、認知、派閥、噂、移動、仲間、NPCの行動、戦略マップ、アイテム認識、偶発的な機会、アーク検出、ゲーム終了トリガー |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | ワールドコンテンツの標準的なスキーマとバリデーター |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | キャラクターの成長、負傷、マイルストーン、評判 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | アーキタイプの選択、ビルドの生成、初期装備 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装備の種類、アイテムの起源、および遺物の成長 — これには、実際のゲームプレイから装備の履歴を記録し、アイテムが称号とレベルを獲得できるようにする、オプションのモジュール`item-chronicle-core`が含まれる |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | クロスセッションメモリ、関係の効果、キャンペーンの状態 |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | 噂のライフサイクル、変異メカニズム、拡散の追跡 |
| [`@ai-rpg-engine/presentation`](packages/presentation) | ナレーションプランのスキーマ、レンダリング契約、音声プロファイル |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | キューのスケジュール、優先順位、ミュート、クールダウンロジック |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | サウンドパックのマニフェスト、コンテンツアドレス指定可能なレジストリ |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | パックの登録、評価基準、パックの検出 |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | ポートレート、アイコン、メディアのコンテンツアドレス指定ストレージ |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | プラグ可能なプロバイダーを備えたヘッドレスポートレート生成 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | オプションのAIによる作成 — スキャフォールディング、批評、ガイド付きワークフロー、調整、実験 |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI：ゲームの実行、スターターの作成、セーブの検査 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | ターミナルレンダラーと入力レイヤー |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | 商業スターター — 台帳アダプターの参照パックであり、それ自体には依存関係がない |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | 泥棒狩りスターター — ループとしての追跡、そして都市のどちら側があなたのためにドアを開けるか |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **オプション** — プレイヤーが所有する取引可能なレイヤー（コイン/インベントリ/取引）のための、チェックポイントでのXLS-85トークンエスクローを介した、オプションのXRPLテストネット決済。これは、決定論的なコアとは完全に独立している。 |

### スターターの例

12個のスターターワールドは**構成の例**である — これらは、エンジンモジュールを組み合わせて完全なゲームを作成する方法を示す。それぞれ異なるパターン（ステータスマッピング、リソースプロファイル、交戦設定、能力セット）を示す。各スターターのREADMEを参照して、「示されたパターン」と「借用する内容」を確認する。

| スターター | ジャンル | 主なパターン |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | ダークファンタジー | 最小限の戦闘、対話主導 |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | サイバーパンク | リソース、交戦ロール |
| [`starter-detective`](packages/starter-detective) | ビクトリア朝のミステリー | ソーシャル優先、知覚重視 |
| [`starter-pirate`](packages/starter-pirate) | 海賊 | 海戦+近接戦闘、マルチゾーン |
| [`starter-zombie`](packages/starter-zombie) | ゾンビサバイバル | 希少性、感染リソース |
| [`starter-weird-west`](packages/starter-weird-west) | 奇妙な西部劇 | パックのバイアス、安全地帯からの回復 |
| [`starter-colony`](packages/starter-colony) | SFコロニー | 隘路、待ち伏せゾーン |
| [`starter-ronin`](packages/starter-ronin) | 封建時代の日本 | 隠された通路、複数の保護者ロール |
| [`starter-merchant`](packages/starter-merchant) | 商業 | 義務をループとして、戦闘をペナルティとして価格設定 |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | 追跡 | お金のために人々を狩る。暴力は騒がしいが、禁止されているわけではない。 |
| [`starter-vampire`](packages/starter-vampire) | ヴァンパイアホラー | 血のリソース、社会的操作 |
| [`starter-gladiator`](packages/starter-gladiator) | 歴史的なグラディエーター | アリーナでの戦闘、群衆の支持 |

---

## ドキュメント

| リソース | 説明 |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | 新しいゲームの雛形を作成 — CLIまたは手動のテンプレート |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | エンジンモジュールを組み合わせて、独自のゲームを作成 |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | エンティティごとのルール解決 — 混合プレイスタイルの戦闘、`applyProfile`、プロファイルテンプレート、`profile` CLI |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | オプトインによるオンチェーン決済 — 決定性ファイアウォール、L0/L1/L2統合レベル、プレイモード、安全対策、および実証済みの海賊デモ |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | 6つの戦闘の柱、5つのアクション、一目でわかるステータス |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | 段階的なbuildCombatStack、ステータスマッピング、リソースプロファイル |
| [Handbook](site/src/content/docs/handbook/index.md) | 包括的なハンドブック — すべてのシステム、および4つの付録 |
| [Composition Model](docs/composition-model.md) | 6つの再利用可能なレイヤーとその組み合わせ方 |
| [Examples](docs/examples/) | 実行可能なTypeScriptの例（型チェック済み + CIでの動作テスト済み） — エンティティごとの混合パーティー、共有プロファイル、クロスワールド、ゼロから |
| [Design Document](docs/DESIGN.md) | アーキテクチャの詳細 — アクションパイプライン、真実と表現 |
| [Philosophy](PHILOSOPHY.md) | 決定性のある世界、エビデンスに基づいた設計、アシスタントとしてのAI |
| [Changelog](CHANGELOG.md) | リリース履歴 |

---

## ロードマップ

### 現在の状況

両方の構成要素は完成 — **381個のファイルにわたる8042回のテスト**、`buildCombatStack`と`buildWorldStack`の12個の初期設定、印刷されたシードに基づいて決定的なバイト単位の一致した再現、完全なAIによる意思決定スコアリング、および、スキャフォールディング、実行、検証、および検査を行うCLI。v3.xの段階で、世界が生き生きと動き出す（名前付きのNPC、25種類の動詞を使用したソーシャルシステム、ジャンル経済 — v3.0〜v3.1）、プレイヤーが所有するアセットをXRPLテストネットにオプトインサイドチャネルとして配置（v3.2〜v3.4）、2つのシステム優先の初期設定を作成し、それらをエンジンを改良するためのツールに変える（v3.5〜v3.6）、戦略レイヤーを強化し、その結果が現実的な影響を与えるまで（v3.7〜v3.8）、ホストにエンジンサーフェスにGodotをアタッチするための機能を提供する（v3.8.1）、そして、**作成ループを閉じて、スタジオセッションまたは単純なJSONパックから、最初から最後までプレイ可能な世界を生成できるようにする（v3.9）**。

**最近のリリース（v2.4.0〜v3.0.0）：**
- v2.4.0 — パーティー戦闘（味方ターゲティング/回復/バフ/蘇生、ステータス効果システム（修正子+DoT/HoT+リアクティブトリガー）、プラグインプロファイルフェーズ1、コンテンツ`validate`/`scaffold` CLI）
- v2.5.0 — エンティティごとのルール解決（混合プレイスタイルの戦闘）、`applyProfile`ローダー+エンティティごとの能力、プロファイルテンプレート+`profile` CLI、および完全なヘルスチェック
- v2.6.0 — `run`コマンドが実際のゲームになりました。敵は独自のAIプロファイルに基づいて行動し、勝利/敗北、保存/再開、メニューに能力と経験値、`ai`スタジオビン、およびナレーションスタックが含まれます。
- v2.7.0 — 世界が反応し、戻ってくる理由があります。熱→圧力→ナレーションによる結果、ゾーンエントリーエンカウンター、クエストループ+ジャーナル、戦闘中の装備、シードされた再生可能な実行、ライブエンドゲーム入力、`buildWorldStack`、ディレクターの台帳、および保存移行のシーム
- v2.8.0 — 自分が住む世界に影響を与える：ライブ取引経済+`sell`動詞、一緒に募集して戦う仲間、およびディレクターの台帳がボード全体を読み取る〜1つの書き込みワイヤーが12個のシステムに接続され、出荷された暗い状態
- v2.9.0 — ループを閉じる：`buy`+商人在庫とクラフトが経済を完成させます。仲間は独立したターンを実行します。4つのソーシャル動詞（賄賂/威嚇/嘆願/種）が、機会報酬によって資金提供される優位性経済で実行されます。機会は期限切れ+好意の低下の結果で解決し、装備、クエスト、募集可能なキャラクター、および開始時のコインがすべて10個のスターターに均等に配布されます。
- **v3.0.0 — 世界を活性化する：NPCエージェンシープロデューサーが、目標/関係/義務台帳/結果の連鎖を持つ名前付きのNPCを活性化し、すべてのスターターにストーリーNPCを追加します。ソーシャルレイヤーは25の動詞（外交+妨害）に拡張され、受動的な優位性収入とソーシャル状態を読み取るダイアログが含まれます。スターターごとのジャンルに合わせた在庫+レシピ。優位性の終盤（勝利/操り人形/静かな引退）に到達可能になります。修理/変更メニュー行、護衛の機会、および`audit-content`開発CLI — フェーズ9の監査で、グリーンテストスイートが隠していた2つのデッドワイヤーが発見され、修正版が出荷されました。**

### 次（消費者層のサイクル）

現在、2つのプロデューサーサイクルが消費者サイクルを上回っており、次のサイクルは、プレイヤーが実際にそれらを目にするというものです。

- **ヒントがプレイヤーに伝わる** — 8つのナレーターの声によるヒントフィールド（対話の偏り/ヒント、プレッシャー、質感、機会、パーティーの存在、地区の雰囲気、状況）が今日のイベントに影響を与え、ターミナルUIには何も表示されません。これらをナレーション（および同じ関数のTTSパス）に組み込むことが、最も重要な課題です。
- **戦闘の結果がサウンドトラックに反映される** — v3.9で出荷された、衝撃を表現するリゾルバーとCORE衝撃リソースですが、まだどのゲームプレイイベントも、これらに勝利/敗北をマッピングしていません（また、`combat.victory`はイベントとして存在しません — エンゲージメントレイヤーはすでに敵を排除したかどうかを計算しています）。
- **常に表示されるHUDにパーティーの状況が表示される** — `formatPartyStatusLine`は完了し、未読です。
- **ネットワーク上のパックゲートに関する通知** — `--listen`のサイドカークライアントは、現在、パックの取り込みデータの損失に関する情報を取得できません（CLIの標準エラー出力のみ）。
- **`/build`の書き込みモデル** — ガイド付きのバッチ実行により、今日の最終的な書き込みのみが行われます（ステップごとのステージングと、1つのバッチ処理された同意は、設計された修正です）。
- マルチプレイヤー — 1つの世界を共有する2人の*人間*プレイヤー（ネットワークレイヤーは意図的に延期されています。単一コントローラーで共有されるプロファイルは、[`shared-profiles.ts`](docs/examples/shared-profiles.ts)として本日出荷されます）。
- シリアライズ可能な数式の上書き — プロファイルごとの数式の調整（数式DSLに依存しています。プロファイルは、クロージャではなく、統計マッピングを保持します）。

### 目的：プラグインプロファイル

エンジンの最終的な目標は、**ユーザー定義のプロファイル**です。これは、任意のゲームにスロットインできる、ポータブルなバンドルです。プロファイルは、ステータスマッピング、リソースの動作、AIのバイアスタグ、および能力を、1つのインポート可能なユニットにパッケージ化します。v2.5では、1つの世界のエンティティはそれぞれ独自のプロファイルを保持し、エンティティごとに戦闘を解決できます。たとえば、`might`のファイターと`will`のミスティックがパーティーを共有し、それぞれが独自のプレイスタイルを持ちます。

スキーマ、`applyProfile`ローダー、エンティティごとの能力解決、およびクロスプロファイル検証はすべて出荷されています。残っているのは、2人の*人間*プレイヤー（単なる2つのエンティティではなく）が1つの世界を共有できるようにするマルチプレイヤーです。これはネットワークレイヤーです。[プロファイルロードマップ](docs/profile-roadmap.md)および[feature-architecture.md](docs/feature-architecture.md)を参照してください。

---

## 哲学

AI RPGエンジンは、以下の3つのアイデアを中心に構築されています。

1. **決定論的な世界** — シミュレーションの結果は再現可能でなければなりません。
2. **証拠に基づいた設計** — 世界のメカニズムは、シミュレーションを通じてテストされるべきです。
3. **AIはアシスタントであり、権威ではない** — AIツールは、設計の生成と評価を支援しますが、決定論的なシステムを置き換えるものではありません。

詳細については、[PHILOSOPHY.md](PHILOSOPHY.md) を参照してください。

---

## セキュリティ

コアエンジンは、**ローカルでのみ動作するシミュレーションライブラリ**です。テレメトリ、ネットワーク、秘密情報は一切使用しません。セーブファイルは、明示的に要求された場合にのみ、`.ai-rpg-engine/` に保存されます。2つの**オプション**のレイヤーが、アウトバウンドパスを追加します。これは、ユーザーがそれらを起動した場合にのみ有効になります。

- The AI layer (`@ai-rpg-engine/ollama`) talks to a **local** Ollama daemon; its opt-in `webfetch` (for RAG) is confined by an SSRF guard (blocks loopback/link-local/CGNAT/cloud-metadata and IPv6-tunnelled equivalents).
- The ledger layer (`@ai-rpg-engine/ledger-adapter`) reaches the **XRPL testnet** — and only the testnet: a **mainnet-impossible-in-code** structural guard (not a config flag) rejects any non-testnet host at construction. Wallet seeds live in a gitignored secrets sidecar, never in a save file, and the deterministic core never imports the adapter.

詳細については、[SECURITY.md](SECURITY.md) を参照してください。

## 要件

- Node.js >= 20
- TypeScript（ESMモジュール）

## ライセンス

[MIT](LICENSE)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>によって作成されました。
