# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [3.3.0] - 2026-07-23

Bind the **unique gear** too. The opt-in `@ai-rpg-engine/ledger-adapter` now
carries an **NFT unique-gear layer** alongside its fungible coin/consumable
layer: the `equipment` package's one-of-a-kind items (the deliberately-deferred
"later slice" from v3.2) are bound to **XLS-20 NFTs** (`NFTokenMint`), and relic
growth advances a mutable NFT's metadata via **XLS-46 `NFTokenModify`** — same
determinism firewall, minted/modified only at checkpoints, entirely outside the
seed-0 replayable core. Proven live on XRPL testnet four ways (mint, transfer,
modify, on-chain reconcile) plus a real `starter-gladiator` played session
whose world is byte-identical with or without the NFT flow. The
`@ai-rpg-engine/ledger-adapter` suite grows **121 → 189**.

### Added

- **NFT unique-gear layer (opt-in, testnet).** A distinct seam *alongside* the
  fungible `TradeableSnapshot` — never conflated: `EquipmentSnapshot` (a new
  firewall-pure read path over the `equipment-core` loadout), `NFTTransport`
  (`nftMint`/`nftBurn`/`nftModify`/`nftCreateSellOffer`/`nftAcceptSellOffer`/
  `accountNfts`) on both the dry-run and testnet transports, `settleEquipmentNFTs`
  (mint one NFT per unique item at a checkpoint; relic growth → `NFTokenModify`;
  idempotent per `gameItemId`, no double-mint on retry), and an `NFTCheck`
  ownership family in `reconcile()` that verifies on-ledger `account_nfts` against
  the engine's equipment state.
- **`buildItemNFTUri`** — the deterministic on-ledger metadata URI (the NFT
  analogue of `buildSettlementMemo`); `NFTokenModify` advancing it, on a stable
  NFTokenID, is the on-ledger proof a relic grew.
- **`gladiator-nft-played-session.test.ts` + `gladiator-nft-live-replay.mjs`** —
  the load-bearing acceptance on the real shipped `starter-gladiator` game (the
  player's `trident-and-net` minted as an NFT, owned on-ledger, reconciled),
  with the firewall proven byte-identical on real content, live on testnet.

### Notes

- Unique-gear NFTs are minted `tfTransferable | tfMutable` (never `tfBurnable`) —
  true player ownership; the issuer can evolve an item's metadata but cannot
  destroy a player-owned NFT.
- Relic *growth* only fires on real content once the engine's item-chronicle is
  populated (a dormant system today); mint manifests on real content now, and the
  growth → `NFTokenModify` path is proven live and in tests.

## [3.2.1] - 2026-07-23

Patch — polish. The `@ai-rpg-engine/ledger-adapter` and
`@ai-rpg-engine/starter-template` npm README pages now carry the brand logo
header the other package READMEs already use. No code changes.

### Changed

- **Brand logo on the ledger-adapter + starter-template READMEs.** Both package
  READMEs now open with the shared AI RPG Engine logo (ledger-adapter also gets
  the CI / License / Landing badges), matching the other package READMEs — so
  every package's npm page renders the logo consistently.

## [3.2.0] - 2026-07-23

Build for the future — an **opt-in XRPL ledger adapter**. A new optional
`@ai-rpg-engine/ledger-adapter` package binds a game's player-owned tradeable
layer (`coin`, consumable inventory, `trade-core`'s `buy`/`sell`) to the XRPL
testnet, settling at checkpoints via XLS-85 token escrow — entirely outside the
deterministic replayable core, which never imports it and stays seed-0
byte-exact. Adapted from the studio's shipped escape-the-valley "ledger backpack"
pattern; proven live on testnet against the real `starter-pirate` merchant loop.
Test suite: 5512 → **5633**.

### Added

- **`@ai-rpg-engine/ledger-adapter` (opt-in, testnet).** Backs `coin` with an
  issued-currency IOU, consumable items with fungible tokens, and a checkpoint's
  net trade delta with a settled XLS-85 token escrow. Two transports behind one
  interface (an offline dry-run transport for tests; a real `xrpl.js` testnet
  transport); `enable` / `settle` / `reconcile`; three play modes (`offline`
  default, `ledger`, `diary`); both a per-run throwaway issuer and a persistent
  per-game issuer. `xrpl` is an optional peer dependency — dry-run mode needs
  neither it nor a network.
- **The determinism firewall.** Nothing in `@ai-rpg-engine/core` or
  `@ai-rpg-engine/modules` imports the adapter (its only engine dependency is a
  compile-time `import type`); the adapter is invoked only at checkpoints, never
  in the tick. A firewall test runs the real `starter-pirate` `createGame()`
  merchant loop on two engines — one with the adapter enabled and settling — and
  asserts the two worlds are byte-identical.
- **Integration levels (L0 / L1 / L2).** The firewall is a *determinism*
  boundary, not an anti-integration rule: a game may fold the adapter into its
  own non-tick layers (save flow, town/market scene, a ledger-native economy) as
  deeply as its design calls for. The invariant — byte-identical replay — holds
  at every level. Documented in the README and handbook.
- **Reconciliation as an external verifier.** `reconcile()` checks on-ledger
  balances and the real on-chain memo against the engine's settled economy;
  conservation (`minted + Σdeltas == settled`) must hold per token. The ledger is
  a different system family than the engine, so it cannot be faked.
- **Live-testnet acceptance.** A live-replay script drives the full adapter on
  real XRPL testnet from a real `starter-pirate` merchant run; the settlement
  claim is proven on-chain, not by dry-run fixtures alone.
- **Safety rails.** Testnet only, enforced by a mainnet-impossible-in-code guard;
  wallet seeds in a gitignored secrets sidecar; idempotent, conservation-safe
  settlement on the retry path; on-chain memo verification; unanchored fallback
  when the chain is unreachable.

### Fixed

- **Incremental trust lines for tokens acquired mid-run.** A token first bought
  after `enable` (a consumable the player didn't start with) had no trust line,
  so its issuer→player mint failed `tecPATH_DRY` on live testnet — surfaced by
  the live pirate replay, invisible to the all-dry-run suite. `settle()` now
  opens the trust line for any new token before it is first minted or escrowed.

## [3.1.0] - 2026-07-23

Finish the loose ends. v3.0.0 made the world live; v3.1.0 closes the four honest
ceilings v3.0 shipped with — genre-flavored *starting supply*, the last two
social sub-verbs, the `obligation-exists` dialogue gate, and genre-specific
repair recipes. Produced by a dogfood swarm: one feature wave (four domains in
isolated worktrees, composed 6-gate + a family-different jury corroborating
12/12 criteria with zero fail votes), a two-auditor **Phase-9 re-audit**
confirming every fix manifests on the real shipped-content path — the
played-session auditor caught the obligation gate wired-but-content-dark —
then a remediation wave that made it reachable in a real playthrough.
Deterministic test floor as law. Test suite: 5494 → **5512**.

### Added

- **Genre-flavored starting supply.** `economyGenre` threads each starter's bare
  ruleset key through `buildWorldStack` → `createEconomyCore`, so a district
  seeds its genre's `GENRE_SUPPLY_DEFAULTS` profile (cyberpunk runs high on
  components/contraband; fantasy runs medicine scarce) instead of a flat
  universal baseline — the starting supply the Director's MARKET tone and the
  endgame inputs already read. Seven of ten starters carry a genre profile;
  three fall back to baseline, honestly. A field separate from
  `tradeGenre`/`craftingGenre` (three modules, three keys) so they can diverge.
- **The full social surface, completed.** `deny` and `bury-scandal` — the
  rumor-manipulation pair that targets an existing rumor by id rather than a
  faction — now surface on the numbered menu via a rumor-target pairing
  dimension (19 → 21 verbs surfaced), each row gated on its own cost/cooldown.
- **`obligation-exists` dialogue gate.** The dialogue condition reads a named
  NPC's persisted obligation ledger (`getPersistedNpcObligations`), honoring
  optional `npcId`/`direction` filters. Fantasy's Brother Aldric — once he owes
  the player a favor through ordinary npc-agency play — unlocks a `call-in-favor`
  choice, a real gate in place of the prior silent always-true stub.
- **Genre-specific repair recipes.** Every genre-carrying starter authors a
  signature `repair` recipe in its genre table (fantasy `repair-rune-mend`,
  cyberpunk `repair-nanite-weld`, weird-west `repair-frontier-forge`, …),
  surfaced through `getAvailableRecipes` — repair is genre-flavored now, not
  only universal.

### Fixed

- **The `obligation-exists` deferral comment was stale.** dialogue-core's
  condition fell through to a silent `return true` behind a comment claiming npc
  obligations are never persisted — false since v3.0, which persists them every
  round a named NPC exists. Now a real read of the persisted ledger.
- **`deny`/`bury-scandal` were registered verbs but unreachable.** The handlers
  existed; the numbered menu deliberately excluded them for lack of a
  rumor-target dimension. That dimension is added.

### Deferred

- **Repair-as-upgrade.** The new genre repair recipes carry an authored
  `statDelta` that `resolveRepair` does not apply today (only `resolveModify`
  reads it) — repair restores, it does not upgrade. Marked in-code and deferred
  to v3.2/v3.3 as a deliberate mechanic decision, not a silent inert field.

## [3.0.0] - 2026-07-22

Make the world live. v2.9.0 closed the economy and social *loops*; v3.0.0 makes
the world *inhabited* — named NPCs with goals, relationships, obligation
ledgers, and consequence chains; a social surface that earns passively and
spends across twenty-one new verbs; a genre-flavored economy; and the campaign
endings the leverage economy was always meant to gate. Produced by a dogfood
swarm — two user-gated feature waves (systems, then economy/social surface),
then a two-auditor composed **Phase-9 re-audit that caught the headline feature
wired-but-inert in shipped content and the endgame reading hardcoded-zero
leverage** (both dead-wires the green test suite hid) — followed by a
remediation wave, verified by an independent re-audit. Deterministic test floor
as law, family-different jury advising at every wave. Test suite: 5322 → **5494**.

### Added

- **Living NPCs.** The persisted npc-agency producer runs each round
  (`runNpcAgencyTick`), lighting the Director's **PEOPLE** section — named NPCs
  (one authored story character per starter, plus every companion you recruit)
  carry goals, trust/fear/greed/loyalty relationships, an obligation ledger, and
  consequence chains. Lighting the producer also lit companion favor-fallout
  departure breakpoints, two dormant opportunity spawn rules (npc-goal +
  obligation), and the endgame's npcProfiles/npcObligations. Gated so a world
  with no named NPCs stays byte-identical to legacy replay.
- **The full social surface.** The four leverage verbs become twenty-five — the
  diplomacy and sabotage groups register (21 more sub-verbs), lighting the
  previously-dark `leverage-diplomacy` / `leverage-sabotage` companion reactions;
  nineteen surface on the numbered menu. Dialogue conditions and effects now read
  and write social state (leverage / reputation / npc-relationship). Passive
  leverage income (`tickLeverage` / `computeLeverageGains`) drips influence from
  reputation and grants favor / blackmail / legitimacy from XP and milestones.
- **Genre-flavored economy.** Merchant stock and crafting recipes resolve
  per-starter genre tables (seven of ten starters; three fall back to universal)
  across the buy/craft mechanics, the numbered menu, and the Director's RECIPES
  section. `repair` and `modify` are numbered menu rows now (item×recipe
  pairing); `escort` opportunities spawn on a protective-travel-in-a-dangerous-
  district gate.
- **`audit-content` dev CLI** — a developer content-audit command (sibling of
  `validate`) running the six encounter/boss/combat director formatters over a
  pack.

### Fixed

- **Living NPCs manifest in shipped content (Phase-9).** `isNamedNpc` required an
  `ai` block, which only enemies carry, so no shipped starter ever triggered
  npc-agency — the headline was wired and unit-tested green but inert in every
  real game. Now recognizes the `'companion'` (recruited) and `'named'`
  (authored story NPC) tags without requiring `ai`, and every starter authors a
  named story NPC.
- **The leverage endings are reachable (Phase-9).** `buildEndgameInputs` read
  hardcoded-zero leverage, permanently blocking the `victory`, `puppet-master`,
  and `quiet-retirement` endings despite the social economy writing real
  currency. Now reads the real leverage store.
- **Seed-0 menu identity.** A zero-cost `cash-milestone` verb rendered on turn 1
  for a zero-engagement player in six starters; now gated behind a legitimacy
  floor at the menu, resolve, and advisor surfaces.
- **Companion departure reachable** via npc-agency breakpoints and a morale-floor
  fallback; the Director's PARTY section renders real companion profiles;
  `recruit` is now on the numbered menu and in `help`.

## [2.9.0] - 2026-07-22

Close the loops. v2.8.0 opened three half-loops — a sell-only economy,
passive-interception companions, and a social layer with verbs but no economy
behind them. v2.9.0 closes all three and rolls the results out to every world.
The through-line is the same "wire the write side" pattern, taken one level
deeper: several systems were built *and tested in isolation* yet dead in the
composed engine because the producer that should feed them was never connected.
Produced by a dogfood swarm — a light regression re-audit, two user-gated
feature waves (systems, then content parity), a two-auditor composed dead-wire
re-audit, and a Phase-9 remediation — with the deterministic test floor as law
and a family-different jury advising at every wave. Test suite: 4975 → **5322**.

### Added

- **The economy's other half — buying and crafting.** A `buy` verb completes
  the trade loop: merchant stock is offered per district at supply-category
  granularity (supply level *is* the restock signal, no separate timer),
  priced through the same `computeItemValue` pipeline as `sell` plus a buy/sell
  spread so a same-district round-trip always loses coin. `createCraftingCore`
  registers `salvage` / `craft` / `repair` / `modify` over the authored recipe
  tables — lighting the Director's MATERIALS and new RECIPES ledger sections
  that shipped dark — and a single-district `/trade` economy drill-down.
- **Companions take their own turns.** Recruited companions now act
  independently each round through `selectBestAction`, the entity-agnostic
  combat advisor that shipped unused — with a per-role combat bias (a fighter
  and a scholar fight differently), companion-on-companion interception, and
  companion HP on the Director's PARTY line. The new turn step gates on a
  non-empty party, so companion-less packs stay byte-identical and seed-0
  legacy replay is preserved.
- **The social layer, connected end to end.** Four leverage verbs — `bribe`,
  `intimidate`, `petition`, `seed` (rumor) — write real `reputation_*` /
  `faction_alert_*` / `heat` globals that trade pricing and faction gates
  already read; `seed` lights the whole player-rumor module and the Director's
  RUMORS ABOUT YOU section. Crucially, the leverage *economy* that funds the
  verbs is wired: completing an opportunity now grants the leverage it always
  narrated, so the four verbs are genuinely earnable and reachable in play.
- **Opportunities, the full lifecycle.** A per-round spawner scores
  contracts / bounties / favors against live pressure, economy, faction,
  companion, and district state; you `accept`, then `complete` or `abandon`
  from the menu. Letting an opportunity reach its deadline now applies real
  expiry fallout (it was cosmetic), completing a companion favor moves that
  companion's morale, and the endgame's rising-power and merchant-prince arcs
  read the opportunities you actually resolved.
- **Content parity across all ten starters.** Equipment wiring, quests,
  recruitable companions, and a starting coin balance rolled out to every
  starter that lacked them — the ten worlds now share a uniform, fully-lit
  feature surface (equipment had been gladiator-only, quests fantasy/zombie-only,
  and five worlds shipped `recruit` with no one to recruit). A structural
  content validator now catches a typo'd item id across every reference surface
  (inventory, equipment, chargen kits, item-use effects, quest rewards).
- **Multi-checkpoint saves + a recorded replay decision.** Saving now rotates
  a bounded set of `checkpoint-NNN.json` slots; `replay --checkpoint <n>` /
  `--list-checkpoints` restore any of them. The snapshot-over-resim direction
  is recorded at the seam: `Engine.serialize()` is a proven full-state
  snapshot, so restore-then-continue is the durable contract and event-sourced
  re-simulation is not planned.

### Fixed

- **The leverage economy was disconnected in composition** (caught by the
  Phase-9 composed re-audit). The four social verbs gate on affordable leverage
  currency, but nothing in production ever wrote it — `applyOpportunityFallout`
  narrated "+5 favor" while writing nothing, leaving the verbs permanently
  unaffordable, the RUMORS ABOUT YOU section dead, and three endings
  unreachable. Opportunity completion now honors its leverage rewards, closing
  the earning loop end to end.
- **Opportunity natural-expiry fallout** was computed but silently discarded,
  making deadlines cosmetic; the per-round tick now applies it, mirroring the
  pressure lifecycle. **Endgame arc scoring** read hardcoded-empty opportunity
  arrays despite the now-live producer; it now reads the persisted state.

### Honest ceilings (deferred, documented)

- Genre-flavored merchant stock and crafting recipes fall back to the universal
  tables today (they render live; per-starter genre threading is a follow-up),
  and `repair`/`modify` are reachable by verb but not yet on the numbered menu.
- The named-NPC **PEOPLE** director section stays dark pending a persisted
  npc-agency producer — the coherent anchor for a v3.0 "living NPCs" release,
  alongside passive leverage income and the leverage sub-verbs beyond the four.

## [2.8.0] - 2026-07-22

Act on the world you live in. v2.7.0 made the world react to how you play;
v2.8.0 lets you act back on it — a living trade economy, companions who fight
at your side, and a Director's Ledger that reads the whole board. The
through-line: the consumer/read side was already built across the engine, so
this cycle wired the *write* side and lit ~12 dormant systems. Produced by a
dogfood swarm — a regression re-audit + focused amend, three user-gated feature
waves, a composed-system re-audit, and a Phase-9 amend — with the deterministic
test floor as law at every wave. Test suite: 4797 → **4975**.

### Added

- **A living trade economy.** `createEconomyCore` seeds a per-district economy
  at pack-load and ticks it every round; a new `sell` verb prices loot through
  `computeItemValue` (scarcity / faction / provenance / contraband) and shifts
  local supply as you trade. One write-wire lit five systems that already
  shipped dark: the Director's MARKET OVERVIEW + FACTIONS scoring, the endgame
  merchant-prince arc and collapse trigger, and four economy pressure kinds
  (supply-crisis, trade-war, black-market-boom, crafting-shortage).
- **Companions.** A `recruit` verb builds a party — persisting party state,
  tagging the recruit, and setting its faction so it fights *with* you, not
  against you. Companion combat rides the interception mechanic combat-core
  already had (dark until now because nothing set `isAlly`); companions react
  to the round with morale and can depart. Recruiting lights seven waiting
  consumers: the finale's COMPANIONS roll-call, party targeting and coloring,
  npc-agency goals, favor-quests, and the Director's PARTY section.
- **The Director's Ledger reads the whole board.** A new EQUIPMENT section
  (behind the cli→equipment provenance dependency v2.7 declined) and a
  DIRECTOR'S SUMMARY finale trailer; the MARKET OVERVIEW and PARTY sections —
  built in v2.7 but never fed — now render from live producers, and the finale
  reads district stability and economic tone into its DISTRICTS section.

### Honest ceilings (shipped, documented, deliberate)

- Trade is **sell-only** this cycle — buying and merchant stock need currency
  and stock content that doesn't exist yet (→ v2.9).
- Companion combat is **passive interception**, not independent turns (→ v2.9).
- The EQUIPMENT Ledger section renders for **starter-gladiator** only (the one
  pack wiring `createEquipmentCore` today); it gates off cleanly elsewhere.
- Crafting / salvage deferred; the npc-agency and opportunity-core producers
  that would feed the PEOPLE section and companion-morale favor-fallout are
  v2.9-scoped.

### Fixed

- A regression re-audit of the v2.7 tier (no regressions found) cleared 19
  latent findings plus a folded dialogue-core fix: the dialogue-trap
  fall-through could route a mistyped number into a real ability use or
  XP-spend; equipment now commits its loadout *after* the fallible status ops;
  a dead `faction-kills` growth trigger implemented; content-schema validators
  now run against all ten starters' shipped content (catching missing
  item-catalog entries); plus renderer enemy/hostile tag parity, guarded-degrade
  coverage, and two NUL bytes hardened out of an endgame Map-key separator.

## [2.7.0] - 2026-07-22

The world reacts, runs differ, and there's a reason to return. v2.6.0 made the
`run` command a real game; v2.7.0 makes it one you come back to. Produced by a
feature-focused dogfood swarm — two absorbed follow-ups, a regression re-audit,
five feature waves (user-gated scope), a composed-system re-audit, and a
Phase-8 amend — every wave adjudicated by a family-different, non-Claude jury
with the deterministic test floor as law. Test suite: 4292 → **4797**.

### Added

- **The strategic tier is live.** Kills accrue heat and erode district safety;
  a per-round world tick turns that into pressures that spawn hidden, surface
  as rumors ("Whispers reach you…"), escalate, and expire with consequences —
  narrated in play, driven entirely by the modules that already shipped dark.
- **Zone-entry encounters.** The ~30 authored encounter compositions fire in
  all ten starters: deterministic per-seed rolls, bloodier districts spawn
  more, one live encounter per zone, boss compositions refused by design.
- **A minimal quest loop** on the schema that always existed: quests offer on
  triggers, track kill/reach/progress objectives, and pay XP and items exactly
  once. Four authored quests ship (fantasy + zombie), a **Journal** lists
  active and completed undertakings, and quest beats narrate in the round.
- **Equipment reaches combat.** `equip` / `unequip` verbs move real numbers:
  an equipped item's stat modifiers ride a status the combat formulas already
  read — zero combat-code changes. Gladiator's trident-and-net is wired
  end-to-end (menu, HUD status line, hit-chance delta pinned by test).
- **Seeded runs.** Every fresh session mints and prints a seed with the exact
  replay command; `--seed <n>` reproduces a run byte-for-byte; combat, resist,
  ability, and tactics rolls all consume the world seed (seed 0 remains
  byte-exact legacy identity for old saves and tests).
- **Endings read the run you actually played.** The endgame evaluator receives
  live heat, pressures, faction alert/reputation accruals, and player level —
  the same death resolves differently in a lived-in world.
- **`buildWorldStack`** — the strategic counterpart to `buildCombatStack`: one
  call assembles environment, factions, rumors, districts, presentation,
  defeat fallout, encounters, and quests; all ten starters migrated with
  byte-identical worlds.
- **The Director's Ledger** — the strategy screen the handbook always promised:
  pressures, fallout, leverage, factions, districts, markets, opportunities,
  rumors, people, arcs, endgame trajectory, party, and materials, each section
  rendered only when its system carries real state. Plus an `AI_RPG_DEBUG=1`
  inspector report over the simulation registries.
- **`inspect-save` validates like Continue.** The same load authorities gate
  both; a save Continue would reject fails inspection with the identical
  structured error. Bounded globals, event-log tail, player and world summary.
- **A module save-migration seam** — `meta.moduleVersions` stamps, an optional
  `migrateState` hook per module, and restored-store namespace initialization —
  wired into the SHIPPED restore path, proven against doctored legacy saves.
- **Session UX floor.** Finale stats ("THE RUN IN NUMBERS"), recent-run history
  at the adventure select, action menus suppressed during dialogue and on the
  death frame, narration joins punctuated, extras rendered inside the frame,
  and misinputs (out-of-range numbers, rejected menu picks) cost no turn.
- **Content truth.** Created characters carry their pack's ability tags in
  every starter (abilities were invisible to created characters in 5+ packs),
  all ten progression trees are completable (9 of 10 were mathematically
  impossible), players have real HP bars, and verb help is honest in both
  directions (20 dead flavor verbs pulled; brace/reposition documented).
- **Test files are typechecked in CI** (`tsconfig.tests.json` + a one-leg
  gate); 203 accumulated test-type errors burned to zero.

### Fixed

- **WorldStore detaches entities and zones at ingestion** — the root cause of
  the cross-instance state-bleed class; 67 call-site clones removed, the
  test-harness workarounds dropped, and six immunity assertions that had gone
  vacuous under the new contract revived with a proven red path.
- **`replay --replay` no longer diverges silently.** Re-simulation is not
  sound with world-state modules, so the flag now restores the save (same as
  Continue) with an honest structured notice; re-simulation parity is v2.8.
- Free-text `equip <item>` no longer routes to `use` and consumes the item;
  `move <zone>` is no longer hijacked by a similarly-named corpse.
- Pressure state is read from where it actually lives (endgame, Ledger, and
  inspect-save were reading a namespace nothing writes); encounter-spawned
  clones now attribute kills to their faction (reputation, alert, and rumor
  valence); legacy saves no longer trigger historical spawn bursts on Continue.
- Successful unlocks narrate ("Unlocked Toughened") instead of "All is quiet.";
  a `.gitattributes` normalizes line endings and the packaging shebang test is
  checkout-tolerant; the stale v2.6.0 lockfile, template mojibake, and missing
  template engines floor are corrected.

### Changed

- `defeat-fallout`'s default boss tag is `role:boss` — matching every shipped
  starter, so boss kills accrue at their authored significance.
- The pack-authoring template teaches the detach-at-ingestion contract instead
  of call-site cloning.

## [2.6.0] - 2026-07-18

The `run` command is a real game now. Produced by a full dogfood swarm — a
four-stage health pass (bug/security, proactive hardening, behavioral
humanization, visual polish) followed by a feature pass — with every wave gated
by a family-different verification jury and the deterministic test floor. Test
suite: 3613 → **4292**.

### Added

- **A playable `run` loop.** Enemies now act: after each player action, hostiles
  in the zone select and submit their own actions through the engine's AI
  (`selectActionForEntity`), so combat is two-sided. Two new AI intent profiles,
  `territorial` (holds its zone) and `calculating` (strikes only when
  advantaged), join the existing `aggressive`/`cautious`, and all 10 starters wire
  their enemies to one. A fight ends in a **victory or defeat** screen (the
  0-HP soft-lock is gone), you can **save and resume** (`run` offers Continue),
  and **abilities and XP** are on the numbered action menu.
- **`ai-rpg-engine run <path>`** loads and runs a game you scaffolded, against
  the pack contract, with structured errors.
- **The AI design studio ships as its own `ai` command.** `@ai-rpg-engine/ollama`
  now has a `bin` — `npm install -g @ai-rpg-engine/ollama` then `ai chat`. The
  handbook's Chapter 36 commands are reachable at last.
- **Narration/audio stack wired.** A unified cue vocabulary maps every emitted
  module sound cue to a canonical soundpack id; a `NarrationPlan` builder derives
  tone, urgency, and sfx from a turn's events; a `TurnPresenter` styles the scene
  and produces deterministic audio commands. There is no terminal audio backend —
  the commands are a documented integration hook for a GUI/web embedder.

### Fixed

- **Security:** the webfetch SSRF guard now resolves each hostname and re-checks
  every resolved IP, **and re-validates every redirect hop** — closing two
  distinct bypasses (a DNS record pointing at an internal address, and a public
  URL that redirects to one).
- **Save integrity:** `WorldStore.deserialize` validates the whole bulk save
  state (a numeric `playerId` no longer silently resolves to the wrong entity;
  a non-array `eventLog` no longer crashes deep in unrelated code), and
  `itemChronicle` elements are validated, all with structured `SaveLoadError`s.
- **The interactive game spoke almost nothing before, and now does:** rejected
  actions show *why* ("not enough stamina", "cannot reach X"), inspect/look and
  the DoT/HoT lifecycle render, a defeated boss's killing blow survives to the
  screen (victories no longer render blank), a dialogue leaf node ends the
  conversation (it used to dead-lock the menu for the rest of the session), and
  `save game` actually saves (it was silently discarded).
- **A CLI crash:** an invalid character build (missing a required flaw, or two
  incompatible traits) re-prompts in place instead of crashing the process.
- **AI perception** across 8 starters read a non-existent stat and silently fell
  back to a flat value; each starter now reads its own declared perception stat.
- Correctness: the traversal handler now moves the entity that issued the action
  (not always the player); module state that lived in closures now survives
  save/reload; five starters' dialogue speakers referenced display names instead
  of entity ids; numerous save/deserialize boundary guards.
- When the local Ollama daemon is down, the studio surfaces an actionable hint
  instead of blaming the user's phrasing, and a missing model names the exact
  `ollama pull` command.

### Changed

- **`create-starter` works from any directory** and scaffolds a **standalone**
  project (self-contained tsconfig, real dependencies) — it was monorepo-bound.
- The `typecheck` script now actually type-checks (it was a no-op over an empty
  file set).
- Terminal output is composed into labeled sections with a glance-able HP-bar
  HUD and optional accessible color (honors `NO_COLOR` and non-TTY pipes; every
  cue is also in the text, never color alone).
- Documentation: a real install-and-play path, an honest "10 playable starters +
  a toolkit" framing, and corrected CLI references throughout.

## [2.5.0] - 2026-07-08

Strictly additive — every new field is optional and an unset `ruleProfileId`
resolves byte-identically to 2.4.0. Produced by a full dogfood swarm (health
pass A→C + feature pass), advisor-orchestrated with per-wave cross-family
verification.

### Added

- **Plug-in Profiles — per-entity rule resolution (the marquee feature).** A
  `might` fighter and a `will` mystic now resolve combat in ONE fight, each
  reading stats through its own mapping. New `RuleProfile` type +
  `WorldState.ruleProfiles?` + `EntityState.ruleProfileId?` (pure data,
  serializes byte-identically); `resolveEntityMapping()` in combat-core resolves
  every stat read against the entity's own profile mapping (fallback chain
  `entity profile → world mapping → DEFAULT`, so custom-mapping starters are
  unchanged). Critically, the `buildCombatFormulas` closures that all 10 starters
  use were routed through the resolver too — without that the feature would have
  been inert in every real game.
- **`applyProfile(world, entityId, profile)`** — attaches a built profile to an
  entity (registers the rule profile, sets `ruleProfileId`, initializes resource
  pools). **Per-entity abilities** resolve via a lazy world-state registry
  consulted after the base ability map (byte-identical when no profile is
  applied).
- **10 starter-derived profile templates** (`starterProfiles` / `starterProfileList`)
  — each shipping starter's playstyle as a reusable `Profile`.
- **`profile` CLI subcommand** — `profile validate <file.json>` and
  `profile scaffold <name>`.
- **Runnable proofs** — `docs/examples/mixed-party.ts` rewritten as the
  per-entity flagship, new `docs/examples/shared-profiles.ts`; the doc-example
  behavior tests now RUN in CI (they were type-checked but never executed); the
  isolated-consumer proof exercises per-entity resolution from packed tarballs.

### Fixed

- **Determinism: byte-identical replay on the save/load path (PC-1).** Module
  event emits (`ctx.events.emit`) captured a throwaway store during
  `Engine.deserialize`, so after save→load→continue every module-emitted reactive
  event (status reflect/DoT, cognition, defeat cascades) recorded into an
  orphaned store with the wrong id counter — silently absent from the live event
  log. A latent bug since before 2.4.0; fixed via a rebindable module store.
- **Correctness:** rule effects registered via `rules.registerEffect` now
  actually execute (were stored and never called); reactive-trigger depth is now
  per-entity uniform under AoE (was order-dependent); the `faction` affiliation
  filter now applies on the default targeting path so enemy AoE spares
  same-faction allies (previously only the zone path); `validateProfileSet`
  rejects duplicate profile ids; duplicate entity/zone ids are rejected instead
  of silently clobbering; numerous NaN / clamp / enum-exhaustiveness guards.
- **Robustness:** the image-generation ComfyUI provider degrades to a typed
  failure within a bounded timeout instead of hanging or crashing; corrupt AI
  sessions surface a structured error instead of silent loss; the Ollama client
  retry loop is configurable, observable, and tested.

### Changed

- **Quality gates made real (each with a mutation meta-test):** the pack rubric
  now runs against the real 10-pack catalog; the docs-integrity gate compares the
  manifest version to the latest release tag (was a semver-format no-op) and runs
  in CI; a coverage ratchet is enforced; a **LICENSE packaging gate** blocks
  `npm publish` on any tarball missing its LICENSE; `npm audit` gates on real
  high/critical production advisories (`--omit=dev`).
- Deterministic default portrait seed (was `Math.random()`, breaking
  reproducibility and content-address dedup); AI content generators gain an
  opt-in `--validate` that blocks writing invalid content.
- **Deferred (documented):** multiplayer / two-players-in-one-world (netcode),
  `RuleProfile.formulaOverrides` (closures are not serializable), starter-to-
  profile migration.

### Test suite

- 3190 → **3613 tests across 193 files**, deterministic across repeated runs
  (3/3); coverage 76.9% → 80%+, now ratchet-enforced in CI.

## [2.4.0] - 2026-06-02

### Added

- **Party combat — ally targeting & support.** `TargetSpec` gains independent axes (`scope` / `affiliation` / `life`) with back-compat mapping from the old flat `type`; `EntityState.faction` + an `affiliationOf` predicate; `resolveTargets` + deterministic selectors (`lowestHp`, random-N). `buildHealAbility`/`buildCleanseAbility` support ally targeting; new `buildBuffAbility`/`buildReviveAbility`. A healer can now heal/buff/revive a teammate, and enemy AoE spares allies (previously a hardcoded type check hit everyone in a zone). Per-candidate ally AI scoring (`heal the most-hurt ally`).
- **Status-effect system.** `StatusDefinition.modifiers[]` (passive stat changes) now reach combat via `effectiveStat` wired into `combat-core` (GAS-style `((base + Σadd) * mul) / div`, deterministic stable-key ordering, stacks clamped at `maxStacks`). `triggers[]` now fire: deterministic DoT/HoT off the engine tick counter, and reactive triggers (thorns/reflect) via a depth-capped (`PROC_DEPTH_LIMIT`) FIFO proc queue wired into the run loop.
- **Plug-in Profiles — Phase 1.** `Profile` type, `buildProfile()` validator, `validateProfileSet()` cross-profile linter, and `selectActionForProfile()` (the first real consumer of `selectBestAction`). Per-entity combat *resolution* is designed + grounded (docs/feature-architecture.md) and deferred to a Phase 2 slice — the code does not overclaim.
- **Content-authoring DX.** `ai-rpg-engine validate <file.json>` and `scaffold <kind> <name>` CLI commands; `loadContentFromFile()` to load packs from JSON.
- `docs/feature-architecture.md` — research-grounded design lock for the above (citations: GAS, Nystrom, Fiedler, MTG CR 104.4b, Liquid Fire, D&D 5e SRD, Game AI Pro / IAUS).

### Changed

- **Determinism hardened to byte-identical replay.** Eliminated every process-global mutable id counter (core `id.ts`, campaign-memory, rumor-system, pressure-system, player-rumor, npc-agency, endgame-detection, opportunity-core) in favor of a per-instance, serialized `state.meta.idCounter`; centralized event-id assignment in `recordEvent`; added `Engine.deserialize()` + save-version migration + RNG range guards.
- **Security & robustness.** SSRF guard canonicalizes host→IP (blocks link-local/IMDS, IPv4-mapped/compatible IPv6, NAT64, 6to4, CGNAT); webfetch + content-preview confined to the project root; `EventBus` isolates throwing consumer listeners (one bad listener can no longer abort a tick); structured errors on malformed content packs and saves.
- Correctness: heal/resource caps read `resources.maxHp` (was `stats.maxHp` → silent overheal); combat HP-ratio + ability cost-ratio read the resource convention; profile/save validation; negative-XP clamp.
- Docs/site: CHANGELOG completed through 2.3.7, site handbook synced to the full chapter set, doc examples compiled in CI.

### Test suite

- 2779 → **3195 tests across 169 files**, stable across repeated runs (3/3).

## [2.3.7] - 2026-05-02

### Added

- **`ai-rpg-engine create-starter <name>` CLI command** — scaffold a new game from the published starter template directly from the command line.

## [2.3.6] - 2026-05-02

### Added

- **`@ai-rpg-engine/starter-template` published on npm** — the starter scaffold is now an installable package, the foundation for the `create-starter` workflow.

## [2.3.5] - 2026-05-02

### Changed

- **All 10 starter worlds migrated to `buildCombatStack`** — every starter now uses the proven combat composition spine. `buildCombatStack()` owns combat infrastructure; starters own only their genre pressure.

## [2.3.4] - 2026-05-02

### Added

- **Cognition config API** — `cognition: CognitionCoreConfig | false` for per-starter AI tuning.

### Changed

- **Combat Stack API hardening** — `buildCombatStack()` surface tightened and made the canonical composition entry point.

## [2.3.3] - 2026-05-02

### Consumer Artifact Dogfood

Release-grade trust surface improvements proven by external consumer simulation.

### Added

- **Consumer proof test** — 7-gate integration test proving external package install + composition path
- **README quickstart test** — executable compilation proof that README code is accurate
- **Ollama integration proof** — 7-test suite proving AI authoring pipeline without live server
- **buildCombatStack() starter migrations** — Gladiator, Vampire, and Weird West now use shared combat composition

### Fixed

- **README quickstart bug** — `statusCore` was missing from module array; engagement-core depends on it
- **README version** — corrected 2.3.1 → 2.3.2

### Security

- `npm audit` clean — 0 vulnerabilities
- LICENSE file included in all 27 package tarballs

### Policy

- New ship gate: README quickstart must have corresponding executable smoke test
- New ship gate: every publishable package must pass tarball LICENSE inspection before release

## [2.3.1] - 2026-03-25

### Added

- CLI: `--version` / `-v` flag and `version` command
- CLI: `--help` / `-h` flag with usage information
- CLI: proper error on unknown commands (exits 1 with help text)
- 5 CLI integration tests (version, help, unknown command)

### Fixed

- SECURITY.md: updated supported versions to include 2.x
- README: corrected test count (2661 → 2743)
- CLI: removed hardcoded version string, reads from package.json

## [2.3.0] - 2026-03-11

### Combat System (Priorities 3-7) + Polish Pass

Full combat pillar stack — the engine now has a complete tactical combat system, audited for internal consistency, content expression, balance, authoring ergonomics, and documentation.

### Added

- **Combat tactics** — brace (resist OFF_BALANCE, hold position) and reposition (outflank for PROTECTED removal) actions with AI scoring
- **Combat states** — 4 visible states (guarded, off-balance, exposed, fleeing) with state-aware hit/damage/disengage formulas and narrator-channel narration
- **Zone engagement** — 4 engagement states (engaged, protected, backline, isolated) with `withEngagement()` formula wrapper, frontline collapse detection, and ambush zones
- **Defeat flow** — morale cascades on ally death, cognition-driven flee/surrender thresholds, defeat narration module
- **Precision vs force** — 3 stat dimensions (instinct/vigor/will) driving every combat formula. Guard breakthrough, guard counter, brace resistance, hit style, and AI dimension awareness
- **Companion interception** — scored formula replacing flat chance, driven by instinct, will, HP, morale, combat states, and role tags. FLEEING hard block, AI cover awareness, heroic interception narration
- **Combat resources** — stamina costs for actions, resource tracking
- **Engagement narration** — narrator text for engagement state changes
- **`buildCombatFormulas(statMapping)`** — DX helper that generates standard combat formulas from a stat mapping, eliminating 20 lines of copy-paste per world
- **`buildCombatStack(config)`** — DX helper that encapsulates formula wrapping, module wiring, and review tracing into a single call. Reduces combat setup from ~40 lines to 7
- **`PACK_BIAS_TAGS`** — exported constant listing all 16 built-in pack bias tags for discoverability
- **All 10 starter packs** integrated with stat dimensions and combat formulas

### Fixed

- **Detective dimension collapse** — resolve was mapped to 'grit' (same as attack), now correctly mapped to 'eloquence'
- **Weird West dimension collapse** — resolve was mapped to 'grit' (same as attack), now correctly mapped to 'lore'
- **Chokepoint coverage** — added chokepoint zone tags to Colony (alien-cavern), Fantasy (vestry-door), Ronin (hidden-passage). Previously 0/10 worlds used chokepoints
- **Engagement tag coverage** — added backlineTags/protectorTags to Colony, Cyberpunk, Ronin engagement configs

### Documentation

- **Combat Overview** (49a) — six pillars map, five actions, states at a glance, simple vs advanced worlds
- **Combat Pack Guide** (55) — step-by-step author guide for buildCombatStack, stat mapping, resource profiles, pack biases
- **Tuning Philosophy** (56) — what to tune vs leave alone, anti-number-soup doctrine, genre-appropriate silence
- **Cross-links** — See Also sections added to all combat chapters (49-54), all chapters linked from handbook index
- **Combat synthesis audit** — 15-pairwise interaction matrix, three-way combo audit, dominance/contradiction analysis
- **Starter world audit** — 10-world mechanic coverage grid, pillar expression analysis
- **Balance pass** — breakthrough rates, chokepoint stickiness, interception reliability calculated from actual entity stats across all 10 worlds

### Mixed-Game Hardening

- **Unified decision layer** — `selectBestAction()` merges combat + ability scoring into one call per entity, with configurable advantage threshold
- **Party orchestration** — `engine.submitActionAs(entityId, verb, options)` for non-player entity actions
- **Cognition auto-wiring** — `buildCombatStack()` now auto-includes `createCognitionCore()`, resolving hidden dependency
- **Resource cap flexibility** — `CombatResourceProfile.resourceCaps` for per-resource maximums (default: 100)
- **Tag taxonomy** — `classifyTag()`, `validateEntityTags()`, `validateZoneTags()` with canonical categories and validation
- **Boss phase guardrails** — `validateBossDefinition()` traces tag add/remove across phases
- **Role-tag precedence** — first `role:*` tag wins (documented, deterministic)
- **Golden scenario tests** — 24 regression tests for pillar interaction combos

### Stats

- 2661 tests across 130 test files
- 6500+ lines of new combat code
- 10 handbook chapters covering the combat system
- 0 engine constant changes needed (content fixes resolved all balance issues)

### Deferred (intentional)

- **Will stat breadth** — resolve maps to 5 mechanics (guard absorption, disengage, brace resistance, morale, interception composure). Not broken — each mechanic reads it differently — but worth monitoring if future pillars also key off resolve
- **Remaining 9 worlds on buildCombatStack** — Weird West refactored as proof; other worlds still use manual wiring (functional, just verbose)
- **Stat-scaled engagement modifiers** — engagement states are currently stat-neutral. A future pass could let precision influence BACKLINE bonuses or resolve influence ENGAGED penalties
- **Explicit "protect" stance** — interception is currently automatic. A dedicated protect action would give players agency over companion positioning
- ~~**Golden scenario test suite**~~ — shipped (24 tests in golden-scenarios.test.ts)

## [2.0.0] - 2025-07-17

### Release Polish & Public Surface

v2.0.0 is a presentation and packaging release — no new engine mechanics. It turns the workshop into a storefront: clearer docs, richer examples, polished metadata, a cohesive landing page, and proper npm packaging. Every feature from v1.0–v1.9 is now discoverable and well-explained.

### Changed

- **README overhaul** — complete rewrite positioning the engine as a simulation-native RPG design studio. Organized by capabilities (simulation, AI worldbuilding, analysis, tuning, experiments, studio UX). Includes architecture table, package listing, and documentation links.
- **Landing page** — hero, features, quick start, and design workflow sections rewritten for v2. Badge bumped to v2.0.0. CLI-first onboarding flow.
- **Handbook navigation** — new index.md with "Start Here" section, topic-based navigation, three pipeline diagrams (simulation, AI authoring, studio workflow), and full table of contents.
- **Starter world READMEs** — Chapel Threshold and Neon Lockbox READMEs rewritten as teaching tools with "What You'll Learn" tables, accurate content inventories, comparison table, and simplified `createGame()` usage.
- **Package READMEs** — added ollama package README (was missing). All existing package READMEs verified.
- **npm metadata** — keywords and bugs.url added to all 9 package.json files. Root package.json gets homepage, repository, and updated description.

### Added

- **PHILOSOPHY.md** — standalone design philosophy document covering deterministic worlds, evidence-driven design, AI-as-assistant boundaries, truth vs presentation layer.

### Upgraded

- All packages bumped from v1.x to v2.0.0.

## [1.9.0] - 2025-07-16

### Added — Studio UX (ollama)

- **chat-studio.ts** — single-module Studio UX layer: dashboard, browsers, onboarding, command discovery, display modes. No LLM calls, no file I/O.

- **P1 — Studio Dashboard**
  - `StudioSnapshot` type (15 fields: session overview, artifact counts, issues, experiments, findings, active workflows, suggested actions)
  - `buildStudioSnapshot(session, opts)` — assembles snapshot from session + engine state
  - `deriveSuggestedActions()` — contextual next-action recommendations
  - `formatStudioDashboard(snapshot)` — compact/verbose rendering
  - Shell: `/studio` (alias `/dash`)

- **P2 — Session History Browser**
  - `HistoryFilter` type (tail, type, grep, group)
  - `filterHistory(session, filter)` — combinable filters with 4 event groups (build, tuning, experiment, content)
  - `formatHistoryBrowser(events, session, filter)` — shows total/showing counts and active filters
  - Shell: `/history [--tail N] [--type T] [--grep G] [--group G]`

- **P3 — Issue & Finding Navigation**
  - `IssueFilter` / `FindingFilter` types
  - `filterIssues(session, filter)` — status/severity/bucket/grep with defaults
  - `gatherFindings(analysis, experiment, filter)` — merges balance + experiment findings into `CombinedFinding[]`
  - `formatIssueBrowser()` / `formatFindingBrowser()` — source tags (BAL/EXP), severity icons
  - Shell: `/issues [--status S] [--severity S] [--bucket B] [--grep G]`, `/findings [--source S] [--severity S] [--artifact A] [--recent]`

- **P4 — Experiment Browser**
  - `ExperimentEntry` type, `buildExperimentEntry(summary)`, `formatExperimentBrowser(experiments, comparison?)`
  - Shows runs, focus metrics, rates, variance findings count, comparison verdict
  - Shell: `/experiments` (alias `/exp`)

- **P5 — Command Discovery**
  - `COMMAND_GROUPS` — 7 groups (Studio, Scaffold, Diagnose, Tune, Experiment, Context, General), 41 total commands
  - `COMMAND_ALIASES` — 8 aliases (studio, dash, exp, fx, ctx, src, next, plan)
  - `resolveAlias(cmd)` — alias expansion before command dispatch
  - `formatGroupedHelp(topic?)` — full grouped listing or drill into group/command
  - Shell: `/help [topic]` (replaces flat help list)

- **P6 — Guided Onboarding**
  - `ONBOARDING_STEPS` — 8-step walkthrough from session creation through studio check
  - `formatOnboarding()` — step-by-step guide with examples and workflow group references
  - Shell: `/onboard`

- **P7 — Chat State Summaries**
  - `StateSummaryKind` (focus/changes/issues/picture/next)
  - `detectStateSummaryKind(message)` — regex detection for natural-language state queries
  - `buildStateSummary(kind, session, opts)` — targeted informational summaries

- **P8 — Output Polish**
  - `DisplayMode` (compact/verbose), `setDisplayMode()`, `getDisplayMode()`
  - `formatHeading()`, `formatSection()`, `paginate()`, `truncate()` — reusable formatting utilities
  - Shell: `/display compact|verbose`

- **Chat integration**
  - 5 new intents: `studio_status`, `studio_history`, `studio_issues`, `studio_findings`, `studio_experiments` (35 total)
  - 5 new tools: `studio-status`, `studio-history`, `studio-issues`, `studio-findings`, `studio-experiments` (34 total)
  - 5 new router patterns with `/studio`, `/history`, `/issues`, `/findings`, `/experiments` slash commands
  - `ChatToolParams.engineState` — tools can now access engine state (analysis, experiments, builds, tuning)
  - 2 new session events: `studio_dashboard_viewed`, `onboarding_started` (35 total)
  - 8 new shell commands: `/studio`, `/history`, `/issues`, `/findings`, `/experiments`, `/onboard`, `/display`, grouped `/help`
  - Personality mappings: studio_status/history→WORLDBUILDER, issues/findings/experiments→ANALYST

- 147 new tests (1301 total): dashboard (14+8), history browser (10+3), issues (10+3), findings (7+3), experiment browser (4+4), command groups (5), aliases (5+3), grouped help (6), onboarding (4+3), state summaries (6+10), display modes (3), output polish (2+1+7+4), router integration (11), personality integration (5), tool registry integration (7)

## [1.8.0] - 2025-07-15

### Added — Scenario Experiments (ollama)

- **chat-experiments.ts** — deterministic experiment engine: batch runs, sweeps, variance analysis, comparisons
  - `ExperimentSpec`, `ExperimentRunResult`, `AggregateMetrics`, `VarianceFinding`, `ExperimentSummary`, `ExperimentComparison`, `ParameterSweepSpec`, `SweepPoint`, `ParameterSweepResult`, `ExperimentPlanStep`, `ExperimentPlan`, `ReplayProducer` types

- **P1 — Deterministic Experiment Runner**
  - `runExperiment(spec, producer)` — batch-runs a scenario N times with deterministic seeds
  - `deriveSeeds(spec)` — seeds from `seedList` or `seedStart` with defensive copy
  - Seed isolation: each run gets its own seed, results are reproducible across machines
  - Graceful failure: failed runs recorded with error, non-failures still aggregate

- **P2 — Scenario Metrics Extraction**
  - `extractScenarioMetrics(replayData)` — tick-level metric extraction from replay JSON
  - Handles raw tick arrays, wrapped objects (`{ ticks: [...] }`), empty/single-tick replays
  - Extracts: totalTicks, escalationTick, rumorSpreadReach, encounterDuration, factionHostilityPeak, encounterTicks, escalationPhases

- **P3 — Variance Analysis**
  - `computeAggregate(metrics[])` — means, mins, maxes, variances, rates across all runs
  - `detectVarianceFindings(aggregate, runCount)` — 6 variance rules with severity levels
  - Rules: high_variance_encounter_duration, rare_escalation_trigger, unstable_rumor_spread, survival_outcomes_too_swingy, high_variance_hostility_peak, escalation_timing_unstable
  - Each finding includes code, severity (low/medium/high), metric, summary, likelyCause, suggestion

- **P4 — Parameter Sweeps**
  - `runParameterSweep(sweepSpec, producer)` — sweep a tunable parameter across values
  - `generateSweepValues(from, to, step)` — float-safe range generation
  - `isTunableParam(name)` / `getTunableParams()` — 7-param whitelist with ranges
  - Tunables: rumorClarity, alertGain, hostilityDecay, escalationThreshold, stabilityReactivity, escalationGain, encounterDifficulty
  - Each sweep point runs the full experiment, recommendation generated from results

- **P5 — Experiment Comparison**
  - `compareExperiments(before, after)` — structured comparison with improvements, regressions, unchanged
  - `isImprovementDirection` heuristic: lower-is-better for durations/peaks, higher for survival/reach
  - Metric diffs with before/after/delta, variance findings delta

- **P6 — Experiment Plans**
  - `generateExperimentPlan(goal, session?)` — 3 plan templates: compare (40 runs), sweep (60 runs), default batch (20 runs)
  - Goal keyword detection: "compare"→compare template, "sweep"→sweep template
  - Each step has id, description, command, params, status

- **P7 — Session Integration**
  - 6 new `SessionEventKind` values: `experiment_plan_created`, `experiment_started`, `experiment_run_completed`, `experiment_sweep_completed`, `experiment_compared`, `experiment_findings_added` (33 total)
  - Engine tracks `lastExperiment` and `baselineExperiment` state

- **P8 — Chat Integration**
  - 4 new intents: `experiment_run`, `experiment_sweep`, `experiment_compare`, `experiment_plan` (30 total)
  - 4 new tools: `experiment-run`, `experiment-sweep`, `experiment-compare`, `experiment-plan` (29 total)
  - 4 new router patterns with extractParams (run count, sweep param/range/step, plan goal)
  - 6 new shell commands: `/experiment-plan`, `/experiment-run`, `/experiment-sweep`, `/experiment-compare`, `/experiment-findings`
  - Personality mappings: experiment_run/sweep/compare→ANALYST, experiment_plan→WORLDBUILDER

- **5 formatting functions**: `formatExperimentSummary`, `formatExperimentComparison`, `formatParameterSweepResult`, `formatExperimentPlan`, `formatRunResults`

- 114 new tests (1154 total): seed derivation (5), experiment runner (10), metrics extraction (7), aggregate computation (8), variance detection (9), parameter sweeps (12), experiment comparison (7), experiment plans (7), session integration (2), chat router patterns (14), tool registry (6), formatting (18), edge cases (9)

## [1.7.0] - 2026-07-14

### Added — Guided Tuning (ollama)

- **chat-tuning-engine.ts** — operational tuning engine: bundles, patches, previews, impact predictions
  - `ConfigPatch`, `ReplayImpactPrediction`, `TuningBundle`, `PatchPreview`, `DesignImpactSection`, `DesignImpactComparison` types

- **P1 — Tuning Plans (operational)**
  - `generateOperationalPlan(goal, session, analysis)` — concrete config-level tuning plans grounded in analysis findings
  - Falls back to content-creation plans (v1.6.0) when no analysis available
  - Steps include preview → apply per bundle → verify via compare-scenarios
  - Each apply step stores serialized patches and impact predictions in params

- **P2 — Fix Bundles**
  - `bundleFindings(findings, fixes)` → groups related findings into systemic `TuningBundle[]`
  - 5 bundle templates: escalation_tuning, rumor_flow_fix, faction_dynamics_fix, district_stability_fix, encounter_design_fix
  - Each bundle includes finding codes, fix codes, config patches, and predicted impact

- **P3 — Patch Preview**
  - `generateConfigPatches(fix)` → concrete `ConfigPatch[]` with path, field, oldValue, newValue, unit
  - 7 patch templates mapping fix codes to config changes with default values and deltas
  - `buildPatchPreview(goal, findings, fixes, session)` → full `PatchPreview` with aggregate impact
  - `previewTuningStep(state, stepId)` → preview a specific step's patches and impact
  - `generatePatchYaml(bundle, goal)` → YAML config content grouped by path with comments

- **P4 — Replay Impact Modeling**
  - `predictImpact(patches, fixCodes?)` → heuristic `ReplayImpactPrediction` per patch set
  - 7 impact rules mapping fix codes to predicted metric changes (rumor reach, escalation timing, encounter duration, hostility curve)
  - Confidence scaling: 0.50 base + 0.10 per patch, capped at 0.85

- **P5 — Compare Before/After (design emphasis)**
  - `buildDesignImpact(comparison, intent?)` → Improved / Unchanged / Regression sections
  - Fills in unmeasured dimensions as unchanged; includes intent target mood when provided

- **P6 — Session Tracking**
  - 3 new `SessionEventKind` values: `tuning_step_previewed`, `tuning_step_applied`, `tuning_bundle_created` (27 total)
  - Engine captures `lastAnalysis` from analyze-balance runs for operational tuning

- **P7 — Chat Integration**
  - 3 new intents: `tune_preview`, `tune_apply`, `tune_bundles` (26 total)
  - 3 new tools: `tune-preview`, `tune-apply` (mutates), `tune-bundles` (25 total)
  - 3 new router patterns with keyword/regex matching
  - 4 new/enhanced shell commands: `/tune-preview` (now shows patches+impact), `/tune-apply`, `/tune-bundles`, `/tune-impact`
  - `/tune` now uses operational plan when prior analysis is available

- **5 formatting functions**: `formatConfigPatch`, `formatPatchPreview`, `formatTuningBundles`, `formatReplayImpact`, `formatDesignImpact`

- 114 new tests (1040 total): config patch generation (10), impact prediction (11), fix bundling (12), patch preview (8), operational plan generation (14), design impact comparison (10), step preview (6), YAML generation (6), formatting (12), router integration (8), tool integration (5), session events (3), edge cases (9)

## [1.4.0] - 2026-06-14

### Added — Adaptive Context (ollama)

- **Richer session-aware routing (A1-A2)**
  - `buildTaskString()` now includes issue buckets, replay signals, recent artifact types, stale issues, profile name
  - `IssueBucket` type with 8 route-friendly categories; `CODE_TO_BUCKET` mapping (25+ issue codes)
  - `summarizeIssueBuckets()` — deterministic issue compression for routing signals
  - Internal helpers: `extractReplaySignals()`, `recentArtifactTypes()`, `countStaleIssues()`

- **Personality-aware loadout routing (B1-B2)**
  - `PROFILE_SOURCE_BIAS` table: analyst→[replay,critique,decision], generator→[artifact,doc], worldbuilder→[artifact,doc,session,decision], router→[session]
  - `applyProfileBias()` — adds profile-biased sources (never removes)
  - `explainProfileInfluence()` — deterministic explanation of profile's effect on source selection
  - `routeContext()` and `buildTaskString()` now accept optional `PersonalityProfile`
  - `LoadoutRoutePlan.profileInfluence` field

- **Context budget transparency (C1-C3)**
  - `RetrievalResult` expanded: `excludedSources`, `droppedByBudget`, `truncatedCount`, `totalCandidates`
  - `RetrievalSummary` updated with excluded/dropped/truncated data
  - `ClassBreakdown.budgetSharePercent` — per-class share of total shaping budget
  - Pipeline utilization summary line in `/context` output
  - Loadout profile influence shown in `/context` when present

- **Telemetry-aware affordances (D1-D2)**
  - `LoadoutHistoryEntry` / `loadoutHistory` on `ChatEngine` — rolling history of routing decisions (max 20)
  - `/loadout-history` shell command with `formatLoadoutHistory()`
  - `detectRepeatedContext()` — warns when same source set is routed 3× with open issues
  - `ContextSnapshot.warnings` array shown in `/context` output

- **Documentation (E1-E2)**
  - "Adaptive Context" section in AI_WORLDBUILDING.md with pipeline overview and worked example
  - Shell command reference table for `/context`, `/sources`, `/loadout`, `/loadout-history`

- 37 new tests (745 total): issue buckets, profile influence, retrieval transparency, budget tracking, loadout history, repeated-context detection
## [1.6.0] - 2026-07-14

### Added — Simulation-Guided Balancing (ollama)

- **chat-balance-analyzer.ts** — deterministic simulation analysis, intent comparison, and tuning workflows
  - `DesignIntent`, `BalanceFinding`, `BalanceAnalysis`, `IntentComparison`, `WindowAnalysis`, `SuggestedFix`, `ScenarioComparison`, `TuningStep`, `TuningPlan`, `TuningState` types
  - `parseReplayData()` — flexible replay parser (array, object with ticks, single tick)
  - `extractMetrics()` — builds metric curves, detects escalation, counts rumor reach, hostility peak, escalation phases

- **P1 — Balance Analysis**
  - `analyzeBalance(replayData, session)` → structured `BalanceAnalysis` with metrics + findings
  - 7 deterministic balance checks: `DIFFICULTY_FLAT`, `ESCALATION_TOO_FAST`, `RUMOR_NO_SPREAD`, `HOSTILITY_PINNED`, `STABILITY_INERT`, `ENCOUNTER_NO_ESCALATION`, `SHORT_SIMULATION`
  - Session cross-reference: `SESSION_ESCALATION_ISSUES` correlates open session issues with replay data

- **P2 — Intent vs Outcome**
  - `parseDesignIntent(text)` — parses YAML-like `targetMood`, `desiredOutcomes`, `notes` declarations
  - `compareIntent(intent, replayData, session)` → `IntentComparison` with per-outcome status (achieved/partial/missed)
  - Outcome evaluation patterns: escalation-by-tick, rumor-reach, avoid-combat/dialogue, generic-byTick
  - Mood assessment: paranoia/suspicion/tension, calm/peace, danger/lethal, mystery/intrigue

- **P3 — Replay Window Analysis**
  - `analyzeWindow(replayData, startTick, endTick, focus?)` — tick-range slicing with optional category filter

- **P4 — Auto-Suggested Fixes**
  - `suggestFixes(findings)` → structured `SuggestedFix[]` with confidence scores, sorted by confidence
  - 7 fix templates: `increase_alert_sensitivity`, `reduce_alert_gain`, `add_rumor_path`, `increase_hostility_decay`, `connect_stability_events`, `lower_escalation_threshold`, `review_escalation_mechanics`
  - No changes applied without explicit confirmation — suggestions only

- **P5 — Compare Scenarios**
  - `compareScenarios(beforeData, afterData, intent?)` → `ScenarioComparison` with 6 dimensions
  - Dimensions: escalation pacing, rumor spread, encounter duration, faction hostility peak, escalation phases, district stability variance
  - Intent-aware verdict: improved/regressed/mixed/unchanged relative to design goals

- **P6 — Guided Tuning Plans**
  - `generateTuningPlan(goal, session)` with 4 built-in templates: paranoia (5 steps), lethality (5 steps), rumor speed (5 steps), escalation (5 steps)
  - `detectTuningTemplate()` — keyword-based template matching
  - State management: `createTuningState()`, `nextPendingTuningStep()`, `markTuningStepExecuted()`, `markTuningStepFailed()` with cascading failure
  - Tuning execution in ChatEngine: `executeTuningStep()`, `executeAllTuningSteps()`

- **8 formatting functions**: `formatBalanceAnalysis`, `formatIntentComparison` (●/◐/○ icons), `formatWindowAnalysis`, `formatSuggestedFixes`, `formatScenarioComparison` (+/-/= directions), `formatTuningPlan`, `formatTuningStatus` (○/●/✗/– icons), `formatTuningPlan`

- **Chat integration**
  - 6 new intents: `analyze_balance`, `compare_intent`, `analyze_window`, `suggest_fixes`, `compare_scenarios`, `tune_goal`
  - 6 new tools registered (22 total)
  - 11 new shell commands: `/analyze-balance`, `/compare-intent`, `/analyze-window`, `/suggest-fixes`, `/compare-scenarios`, `/tune`, `/tune-preview`, `/tune-step`, `/tune-execute`, `/tune-status`
  - 9 new `SessionEventKind` values for balance/tuning lifecycle tracking
  - Router pattern ordering fix: `suggest_fixes` now matches before `suggest_next`

- 100 new tests (926 total): replay parsing, metric extraction, all 7 balance checks, intent parsing, outcome evaluation (escalation/rumor/mood), window analysis, fix suggestions, scenario comparison (6 dimensions + intent-aware verdict), tuning plan generation (4 templates + generic), state management (create/execute/fail/cascade/complete), formatting, router integration, tool registration, session events, edge cases

## [1.5.0] - 2026-07-03

### Added — Guided Build Mode (ollama)

- **chat-build-planner.ts** — session-aware, plan-first build workflows
  - `BuildStep`, `BuildPlan`, `BuildState` types — full build lifecycle tracking
  - `generateBuildPlan(goal, session)` — deterministic plan generation from natural language goals
  - Three build templates: district, scenario, faction network — auto-detected from goal keywords
  - `detectTemplate()` — keyword-based template matching exported for testing
  - Smart artifact skip: if session already has matching artifacts, those steps are omitted
  - Issue-aware injection: open `RUMOR_*`, `FACTION_*`, `GAP_*` issues inject extra steps or warnings
  - Replay-aware injection: `never_triggered` / `regression` replay findings inject encounter-pack steps
  - Dependency ordering: steps carry `dependencies[]` and `usePriorContent` for critique injection

- **Build state management**
  - `createBuildState()`, `nextPendingStep()`, `markStepExecuted()`, `markStepFailed()`
  - `isBuildComplete()`, `finalizeBuild()` — lifecycle with cascading failure (dependent steps auto-skip)
  - `BuildState.generatedContent[]` accumulates YAML from scaffold steps for critique injection

- **Formatting**
  - `formatBuildPlan()` — numbered steps with warnings and available commands
  - `formatBuildPreview()` — detailed step view with kind/theme/artifact outputs
  - `formatBuildStatus()` — status icons (○/●/✗/–) with progress fraction
  - `formatBuildDiagnostics()` — post-build diagnostics (step counts, issues, missing artifacts)

- **Build execution in ChatEngine**
  - `activeBuild: BuildState | null` on engine — tracks active build plan
  - `executeBuildStep()` — executes next pending step through existing tool registry
  - `executeAllBuildSteps()` — runs all remaining steps with post-build diagnostics
  - Build plan captured automatically when `build_goal` tool returns

- **Session integration**
  - 4 new `SessionEventKind` values: `build_plan_created`, `build_step_executed`, `build_step_failed`, `build_plan_completed`
  - Every build action records events in session history

- **Chat + shell integration**
  - `build_goal` intent added to `ChatIntent` with keyword pattern + LLM fallback
  - `build-plan` tool registered in tool registry (non-mutating)
  - 6 new shell commands: `/build <goal>`, `/preview`, `/step`, `/execute`, `/status`, `/diagnostics`
  - Help text updated with all build commands

- 81 new tests (826 total): template detection, plan generation, artifact skipping, issue/replay injection, build state lifecycle, formatting, router integration, tool registration, edge cases, session event types
## [1.3.0] - 2026-06-13

### Added — Loadout-Guided Context (ollama)

- **chat-loadout.ts** — adapter wrapping `@mcptoolshop/ai-loadout` as a pre-retrieval routing layer
  - `buildTaskString()` — composites user message + classified intent + session summary into a routing signal
  - `routeContext()` — calls `planLoad()`, maps loadout entries to `SourceKind` values for RAG gating
  - `recordContextLoads()` — observability via `recordLoad()` JSONL usage log
  - `formatLoadoutRoute()` — human-readable loadout routing display for `/loadout` command
  - Graceful fallback: returns passthrough plan (all sources allowed) when ai-loadout is not installed
- **RetrievalQuery.allowedSources** — new optional field gates which `SourceKind` retrievers run
- **ChatEngineOptions.loadoutEnabled** — opt-in flag to activate loadout routing before RAG
- **ChatEngine.lastLoadoutPlan** — exposes last routing plan for introspection
- **ContextSnapshot.loadout** / **LoadoutSummary** — loadout routing info in context browser
- **`/loadout`** shell command — shows last loadout routing plan in the REPL
- **formatContextSnapshot** / **formatSources** — now show loadout gating info when active
- Optional peer dep: `@mcptoolshop/ai-loadout >= 0.1.0`
- 26 new tests (chat-loadout: 18, chat-rag allowedSources: 3, chat-context-browser loadout: 5)

## [1.2.0] - 2026-06-12

### Added — Action Intelligence + Context Browser (ollama)

- **chat-planner.ts** — session-aware multi-step planning (`planFromSession`, `formatPlan`, `validatePlan`)
- **chat-recommendations.ts** — leverage-scored structural recommendations (`generateRecommendations`)
- **replay-classifier.ts** — deeper replay diff classification (`classifyReplayChanges`, `formatClassification`)
- **chat-context-browser.ts** — inspectable view of RAG/shaping/profile decisions (`buildContextSnapshot`)
- 3 new intents: `context_info`, `show_plan`, `recommend`
- 3 new tools: `context-info`, `smart-plan`, `recommend` (15 total)
- `/context` and `/sources` slash commands in chat shell
- 92 new tests (682 total)

## [1.1.0] - 2026-06-10

### Added — Context Teeth (ollama)

- **chat-rag.ts** — file-system-based RAG retrieval (session, artifacts, docs, transcripts)
- **chat-memory-shaper.ts** — memory class shaping (current session, open issues, relevant artifacts, etc.)
- **chat-personality.ts** — 3 profiles (Worldbuilder, Analyst, Generator) + intent-based routing
- **chat-webfetch.ts** — URL fetching with domain allowlist
- Webfetch integration in chat engine

## [1.0.0] - 2026-03-06

### Added

- **Core runtime** — WorldStore, ActionDispatcher, ModuleManager, PresentationChannels, seeded RNG, persistence, deterministic replay
- **Combat core** — attack/defend verbs, damage resolution, defeat detection, stamina costs
- **Dialogue core** — graph-based dialogue trees, conditional choices, state effects
- **Inventory core** — item management, equipment slots, use/equip/unequip verbs
- **Traversal core** — zone movement, exit validation, location tracking
- **Status core** — status effects with duration, tick processing, stacking rules
- **Environment core** — dynamic zone properties (light, noise, stability), hazards, decay
- **Cognition core** — AI belief model, intent profiles, morale, memory systems
- **Perception filter** — sensory channels, clarity model, cross-zone perception
- **Narrative authority** — truth vs presentation, concealment, distortion, contradiction tracking
- **Progression core** — currency-based advancement, skill trees, unlock effects
- **Faction cognition** — faction beliefs, trust dynamics, inter-faction knowledge
- **Rumor propagation** — information spread with confidence decay, source tracking
- **Knowledge decay** — time-based confidence erosion for AI memories
- **District core** — spatial memory, zone metric aggregation, alert thresholds
- **Belief provenance** — query-based trace reconstruction across perception/cognition/rumor logs
- **Observer presentation** — per-observer event filtering with custom rules, divergence tracking
- **Simulation inspector** — runtime state inspection, health checks, diagnostics
- **Content schema** — 9 content types with validation, cross-reference checking, content loading pipeline
- **Terminal UI** — renderer, text parser, action selection, hybrid command interface
- **CLI** — run, replay, inspect-save commands
- **Fantasy starter** — The Chapel Threshold (dark fantasy demo)
- **Cyberpunk starter** — Neon Lockbox (cyberpunk demo)
- **Handbook** — 25 chapters + 4 appendices covering full engine documentation
- **Design document** — comprehensive architecture overview
