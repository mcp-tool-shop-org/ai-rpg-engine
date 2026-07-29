> ## ⚠ ADDENDUM — what C1 closed (2026-07-29)
>
> C1 (the Contract v1) built against this report and closed several of its
> findings. Every closure flipped the finding's pinned test in the same commit,
> which is why this report has not gone quietly stale. Full detail:
> [`../contract-v1/REPORT.md`](../contract-v1/REPORT.md).
>
> | Finding | State |
> |---|---|
> | §3.3 the boot gap — no converter exists | **CLOSED**. `applyContentPack` + a `ZoneDefinition → ZoneState` converter; `roomId` derived. The exported pack boots into a played session. |
> | §3.1 nine silently-preserved unknown keys | **PARTLY CLOSED**. Four declared (`schemaVersion`, `districts`, `buildCatalog`, `progressionTrees`); the remaining five are now REFUSED by name rather than preserved in silence. |
> | §3.1 nonsense key indistinguishable from real content | **CLOSED**. The key allowlist refuses it, listing the allowlist. |
> | §3.1 raw `TypeError` on six of ten declared keys | **CLOSED**. All ten shape-guarded; the cross-ref pass is gated on structural success (widening the guard alone was insufficient). |
> | §5 item 2 — `engineVersion: '2.0.0'` read by nothing | **CLOSED**. A semver range, enforced at load. |
> | §5 item 3 — nine phantom `DEFAULT_MODULES` ids | **CLOSED**. Twelve real ids; resolution is live against a booted engine's `ModuleManager`. |
> | §2 the one `carried-garbled` row (exit conditions) | **CLOSED**. Compiled through `parseSpawnCondition`. |
> | §1 `losslessPercent: 100` from zero observations | **CLOSED**. `null` + `observed: false`. Wiring every converter to the collector remains open. |
>
> **Corrected by C1, not closed:** §3.1's framing of `districts`, `buildCatalog`
> and `progressionTrees` as three equivalent "cheap wire gaps". Right about
> shape, wrong about ingestion — only `districts` is routable into a booted
> world; the other two are session-scoped for structural reasons measured in C1.
>
> **Still open:** the entity-placement hole (§2, `EntityBlueprint` has no
> `zoneId`), typed hazards (§9), quests, `authority`, `RoomDefinition`, the
> five genuinely-undeclared keys, and world-forge's 2.x engine dependency ranges
> (checklist item 1).

> ## ⚠ ADDENDUM 2 — the engine-deps errand (2026-07-29)
>
> The last item of the addendum above — "world-forge's 2.x engine dependency
> ranges (checklist item 1)" — is **CLOSED**. All six ranges are `^3.8.0` and
> all six resolve 3.8.0. §5's checklist now stands at **5 closed, 3 open**, and
> `version-skew.json` is regenerated to match: items 1 and 7 closed by this
> errand, 2 and 3 closed by C1 and flipped here, 5 closed at audit time.
>
> Two things this errand found that §5 could not have:
>
> - **Item 4 is an ANDON, not an oversight.** §5 called the missing
>   `mercantile` / `pursuit` entries a `GENRE_MAP` gap. It is a vocabulary
>   question: world-forge has three genre lists that already disagree — a free
>   `string` in the schema, six fixed options in the editor picker, eleven keys
>   onto nine targets in `GENRE_MAP` — so adding two identity entries would
>   reach genres the editor cannot author. Routed to C3.
> - **The exporter's duplicated content hash could NOT be de-duplicated**, and
>   the reason everyone had been carrying was wrong. It was never the 2.x
>   ranges: `computeContentHash` lives in `content-schema/src/gate.ts`, which C1
>   added to `main` and which has **never been published**. npm `latest` is
>   3.8.0, published **2026-07-28T23:12Z**, and no published 3.8.0 package
>   exports it. The same gap explains `GameManifest.contentHash`, which the forge
>   still has to intersect in locally. The duplicate stays, its cross-repo
>   equivalence test stays, and both are pinned to fail when a release lifts the
>   block.
>
>   *(⚠ DATE CORRECTED 2026-07-29 by C3/P0. This paragraph read "3.8.0 from
>   2026-03-07", which was the package's CREATED timestamp — the v1.x-era first
>   publish — not 3.8.0's publish time. The advisor corrected it at the errand's
>   verification gate and the fix landed in the world-forge branch files
>   (`0983a26`) but never reached this copy. The conclusion is unchanged and the
>   corrected fact is sharper: the 3.8.0 packages were cut HOURS BEFORE C1
>   merged, which is precisely why `main` and `latest` are different engines.)*
>
> Still open from §5: item 4 (above), item 6 (`EntityBlueprint.type` is still a
> bare string — nothing to verify against), item 8 (a real breaking change now
> that item 1 is done, deferred to release-time bookkeeping; no bump, tag or
> publish was authorised).

> ## ⚠ ADDENDUM 3 — what C3 closed (2026-07-29)
>
> C3 (the space vocabulary) built against this report. Full detail:
> [`../c3-vocabulary/REPORT.md`](../c3-vocabulary/REPORT.md).
>
> **The recount, mechanically:** `no-channel` **194 → 169**, and the −25
> decomposes exactly by phase (P1 2, P2 3, P3 19, P4 1). `carried-garbled`
> **1 → 0**. Total still 377, all rows verified.
>
> | Finding | State |
> |---|---|
> | §2 the entity-placement hole (`EntityBlueprint` has no `zoneId`) — "the single most consequential drop in the lane" | **CLOSED**. `placements` is its own pack channel; `applyContentPack` writes `EntityState.zoneId`. Authored NPCs appear in the player's own `inspect` payload. |
> | §2 `entityPlacements[].spawnCondition` dropped | **CLOSED**. Compiles through `parseSpawnCondition`. The grammar's ORIGINAL home field now has a channel. |
> | §2 `zones[].entryGate` (conditions / mode / reason) | **CLOSED**. Compiled at export, evaluated in `traversal-core`; a hard gate refuses with the authored reason rendered. |
> | §2 `zones[].hazardRefs` + the whole `hazardDefinitions` domain | **CLOSED**. 19 rows. `hazardDefinitions` LEFT `DROPPED_CONTAINERS`. |
> | §2 `zones[].timeOfDay` | **CLOSED** via the scene descriptor — which also supplies the input the `time-of-day` gate operand was measured missing. |
> | §3.1 `encounterAnchors` "zero hits repo-wide, dead on arrival" | **CLOSED**. Registers into `encounter-spawn`'s own registry; the observed spawn rate over 40 seeds is the AUTHORED 0.45, not the module's 0.35 default. |
> | §3.2 the hazard pair — `'loose cobbles'` inert in 12 of 12 worlds | **CLOSED, with the contrast preserved.** The typed hazard moves the sim with no pack code; the bare STRING stays exactly as inert as measured here. |
> | §5 item 4 (`GENRE_MAP`, the inherited ANDON) | **RULED** — the engine owns the genre vocabulary; identity entries + warn-on-fallback + a drift guard derived from `VALID_GENRES`. The editor picker is a public surface and stays untouched; that half is named as remaining. |
> | §9 "Starter comments misattributing `encounterTable` to `ZoneDefinition`" | **CLOSED**. It is on `RoomDefinition`. |
>
> **Corrected by C3, not closed:** §2's `carried-garbled` row for
> `zones[].exits[].condition`. C1 fixed the behaviour and flipped its own bespoke
> assertion but never flipped THIS row, so the artifact published
> "`parseSpawnCondition` is never called" for a cycle after it stopped being true —
> **and the differ cannot catch it**, because both the garbled and compiled forms
> put a string at the same packPath. The generated evidence line admits the limit
> ("semantics asserted separately"). A table that verifies 377 of 377 rows can
> still be wrong about what a row MEANS.
>
> **Still open:** `items` (ANDON — needs a zone-container vocabulary `WorldState`
> lacks), `playerTemplate` (session-scoped), `factionPresences` and
> `pressureHotspots` (both EVALUATED and deliberately NOT mapped, with field-level
> reasons in C3 REPORT §8), `economyProfile` (mapping identified onto the existing
> `DistrictEconomy.baseline`, not built), quests, `authority`, `RoomDefinition`,
> and the C3.2 residue (strata / elevation / overworld / markets / lootTables /
> transitions / landmarks).

# C0 — The Forge↔Engine Alignment Audit

**Cycle:** first rung of the 2.5D arc ([[ai-rpg-engine-2p5d-quality-bar]] §5, row C0).
**Shape:** audit, not fix. Fixtures, test instruments and docs only. No converter
built, no schema changed, no export-lane or engine behaviour altered.

| | |
|---|---|
| ai-rpg-engine | v3.8.0, `c00cd16`, branch `feat/c0-alignment-audit` |
| world-forge | v4.5.0, `6ac7bcf`, branch `feat/c0-alignment-audit` |
| Suites | engine **330 files / 6507 tests** green (typecheck, typecheck:tests, lint all clean) · world-forge **131 files / 2392 tests** green |
| Artifacts | [`export-table.json`](https://github.com/mcp-tool-shop-org/world-forge/blob/feat/c0-alignment-audit/docs/c0-alignment/export-table.json) (world-forge) · [`intake-table.json`](intake-table.json) · [`reverse-table.json`](reverse-table.json) · [`version-skew.json`](version-skew.json) · [`e2e-transcript.md`](e2e-transcript.md) |

Both repos were at their pinned SHAs with no drift. Every finding F1–F6 from the
commissioning brief was re-verified at HEAD before anything was built; where the
brief was imprecise or wrong, §6 says so.

---

## 1. The headline

**The content path between World Forge and ai-rpg-engine is a validator, not a
loader.** Of 377 authored fields, 145 reach the pack the engine reads, and the
engine's only production consumer of that pack is a command that prints a
report and exits. Nothing routes a loaded pack into a world.

Three numbers carry the cycle:

- **377 authored fields → 194 with no channel at all (51.5%).** Whole domains —
  strata, typed hazards, entry gates, markets, crafting stations, town
  structures, transitions, loot tables, spawn points, tilesets, props, the map
  itself — have no pack field of any kind.
- **145 of 377 (38.5%) reach the `ContentPack`.** The rest of what survives
  lands in `manifest` / `packMeta` / the asset round-trip channels, which the
  engine's intake never opens.
- **0 of 12 exported keys reach a runtime.** Three are validated, nine are
  silently preserved unknown keys, and none has a route into a `WorldStore`.

The lane's own instrument disagrees. On the same export, `ExportResult.fidelity`
reports **`losslessPercent: 100`, `dropped: 0`**, and **zero warnings**.
`fidelity.ts` scopes itself to the IMPORT direction in its docstring, and only
one converter is wired to the export-side collector — but the field is surfaced
on the *export* result, where it reads as an export-fidelity claim. A green
number computed from zero observations.

---

## 2. The export table (WorldProject → export artifacts)

Instrument: `world-forge/packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts`
over a coverage fixture that populates every field on the `project.ts` master
list. The table **declares** each classification; the differ **verifies** it
against a live export. All 377 rows verified.

| Class | Rows |
|---|---:|
| `carried-lossless` | 168 |
| `carried-approximated` | 14 |
| `carried-garbled` | 1 |
| `no-channel` | **194** |

| Channel | Rows | Read by the engine's intake? |
|---|---:|---|
| `contentPack` | 145 | validated, never run |
| `packMeta` | 6 | pack registry only |
| `manifest` | 3 | pack registry only |
| `assetBindings` | 7 | no — World Forge re-import channel |
| `assets` | 11 | no |
| `assetPacks` | 11 | no |
| none | 194 | — |

### What arrives changed

- **Zone exit conditions — the one `carried-garbled` row.** `ZoneExit.condition`
  is a SpawnCondition-grammar string. `convert-zones.ts:48` places it *whole*
  into `ConditionSpec.type` with `params: {}`. `type` is meant to name a
  condition KIND; here it carries the operands too. The repo's own
  `parseSpawnCondition` would return `{type:'has-item', params:{id:'rope'}}`
  and is never called. The result is a structurally valid ConditionSpec that
  means nothing — and it would not matter yet, because `ZoneState` has no
  `exits` field and nothing ever evaluates a zone `ConditionSpec`.
- **`District.baseMetrics.safety` → `surveillance`** (`convert-districts.ts:26`).
  Not synonyms: in the engine's own doctrine high surveillance drives heat and
  pursuit. The value crosses; the meaning inverts.
- **Six entity roles collapse to two types.** `merchant` / `quest-giver` /
  `companion` all become `npc`; `boss` becomes `enemy`. The distinction survives
  only indirectly, in tags `ROLE_TAGS` adds — so an importer cannot tell an
  authored `boss` tag from a role-derived one.
- **`factionId` becomes the string `faction:<id>` in a flat tag list**, and
  becomes the literal `faction:UNKNOWN` when the id is undeclared.
- **`slot: 'consumable'`** — legal in the World Forge schema, absent from
  `convert-items`' accepted set — **silently becomes `trinket`**. No warning, no
  fidelity entry.
- **`hidden: true` is re-encoded as the economic provenance flag `contraband`.**
  A placement fact becomes a legality fact, and only the `true` case is written,
  so the field is not recoverable.
- **`container` survives only when `description` is unset**, folded into a
  synthesised `Found in <container>` string.
- **The authoring `mode` survives as the tag `mode:district`** — recoverable by
  convention, not by field.

### What has no channel at all

Every field of: `map`, `connections`, `spawnPoints`, `craftingStations`,
`marketNodes`, `buildings`, `hubs`, `strongholds`, `strata`, `stratumLinks`,
`hazardDefinitions`, `tilesets`, `tileLayers`, `props`, `propPlacements`,
`ambientLayers`, `lootTables`, `transitions` — plus, on zones: `elevation`,
`elevationRange`, `stratumId`, `hazardRefs`, `entryGate`, `parallaxLayers`,
`skylineRef`, all physics and sky fields, `timeOfDay`, `collisionType`, all grid
coordinates and `parentDistrictId`; on districts: the whole `economyProfile`; on
entities: `zoneId`, `dialogueId`, `spawnCondition` and both AI lists; on items:
`zoneId` and `lootTableId`.

Two of those deserve naming on their own:

- **`entityPlacements[].zoneId`.** `EntityBlueprint` has no location field. An
  exported pack cannot say where any NPC stands. Item placements are the same:
  the pack knows every item and where none of them are.
- **`District.economyProfile`** (supply categories + scarcity defaults) is
  dropped while the engine runs live per-district economies — the exact surface
  the charter calls the moat.

---

## 3. The intake table (pack → engine)

Instrument: `packages/cli/src/c0-intake-table.test.ts`. Three probes, all
executed rather than inferred.

### 3.1 The loader, on the real exported pack

`ai-rpg-engine validate` on the pack, verbatim ([`e2e-transcript.md`](e2e-transcript.md)):

```
✓ Content valid: packages/cli/src/__fixtures__/c0-forge-pack.json
  Content loaded: 3 entities, 3 zones, 1 dialogues, 0 quests
```

Exit 0. A pack stamped `engineVersion: '2.0.0'` passes the 3.8.0 validators
clean, and the report names four of its twelve keys.

| Intake class | Exported keys |
|---|---:|
| `validated-only` | 3 — entities, zones, dialogues |
| `unknown-key` | 9 — schemaVersion, districts, items, playerTemplate, buildCatalog, progressionTrees, encounterAnchors, factionPresences, pressureHotspots |
| `alive-as-rules` | **0** |

Silent-pass is structural, and the audit supplies the detection the pipeline
lacks:

- A pure nonsense key (`thisKeyIsNotAThing`) produces a **byte-identical** load
  report to `districts`. Acceptance is not comprehension.
- `validateZoneDefinition` does no excess-property rejection: a zone carrying
  `elevation`, `stratumId`, `entryGate`, `hazardRefs` and `physicsMode` loads
  with `ok:true` and `errors:[]`, values preserved and unread.
- The shape guard covers **four of ten** declared keys. A non-array `abilities`,
  `statuses`, `verbs`, `archetypes`, `backgrounds` or `itemUseEffects` escapes
  as a **raw `TypeError`** from `validateRefs`, past the boundary discipline
  `loader.ts`'s own docstring promises. Pinned by assertion so a later fix
  fails loudly here.

Three of the nine unknown keys are worth separating: `districts`,
`buildCatalog` and `progressionTrees` carry data in shapes the engine genuinely
understands (`DistrictDefinition`, build catalogs, `ProgressionTreeDefinition`
are all live engine concepts) — they simply arrive at a key
`ContentPack` does not declare. Those are wire gaps, not vocabulary gaps, and
they are the cheapest thing on this whole list to close.

### 3.2 What the engine does with each zone field

A differential-mutation probe: boot at a pinned seed, play 40 rounds, hash the
end-of-session **simulation state** and the **event log** separately, mutate one
`ZoneState` field, replay, compare. Swept across **all twelve shipped worlds**.

| Field | Worlds moved (sim / narration-only / none) | Class |
|---|---|---|
| `light` | 12 / 0 / 0 | alive-as-rules |
| `noise` | 12 / 0 / 0 | alive-as-rules |
| `neighbors` | 11 / 0 / 1 | alive-as-rules |
| `tags` (+`safe`) | 8 / 3 / 1 | alive-as-rules |
| `stability` | 4 / 0 / 8 | **alive, and unauthorable** |
| `hazards` (+matched string) | 1 / 0 / 11 | alive only via pack code |
| `roomId` | 0 / 0 / 12 | stored-inert |
| `authority` | 0 / 0 / 12 | inert and unauthorable |
| `interactables` | 0 / 0 / 12 | stored-inert |
| `name` | 0 / 11 / 1 | stored-inert (presentation) |

**The hazard pair is the sharpest measurement in the cycle.** Same field, two
mutations: adding `'unstable floor'` — which starter-fantasy's closure matches
at `setup.ts:137` — moves the simulation. Adding `'loose cobbles'` — which no
closure anywhere references — moves nothing, in any of the twelve worlds.
Hazard strings carry no engine semantics; their meaning is JavaScript the pack
ships, invoked at `environment-core.ts:295`. **A data-only JSON export ships no
closures, so the one rule-bearing zone field the lane transports faithfully
still arrives inert.**

**`stability` is the finding I did not expect.** It sits on the line below
`authority` in `ZoneState`, and I filed it inert on that resemblance. The sweep
moved four worlds and refused the claim: `district-core.ts:348` aggregates it
into district stability, `rumor-propagation.ts:226` gates rumour spread on it,
`cognition-core.ts:1173` and `observer-presentation.ts:395` read it. It is a
live rule input that **no content pack can author** — `ZoneDefinition` has no
such field.

### 3.3 The boot gap

Committed as a test, four ways:

1. A loaded `ContentPack` exposes no `createGame` and no `world`; the result
   object is `{advisories, errors, ok, pack, summary}` — a report, not a runtime.
2. `loadExternalPack` **refuses** a content-pack JSON with a `PackLoadError`
   whose hint reads "must export createGame(seed?) returning an Engine". The
   path resolves first, so this is a contract refusal, not file-not-found.
3. `ZoneState` requires `roomId`; `ZoneDefinition` has no such field. No
   exported pack can produce a storable zone without a converter inventing one,
   and no converter exists.
4. All twelve shipped packs build their worlds in code.

---

## 4. The reverse table (what the engine says that the forge cannot author)

30 rows, in [`reverse-table.json`](reverse-table.json). Proof pack:
`starter-merchant` (Salt Road Ledger), the economy starter.

**The structural finding: a pack is a function, not a document.**
`PackEntry.createGame(seed?) => Engine` has no content field. The ceiling on any
future JSON content contract is set by how much of a pack is *code*:

| Unauthorable by construction | Where |
|---|---|
| module selection and per-module config | `starter-merchant/src/setup.ts:218-266` |
| rulesets | `starter-merchant/src/ruleset.ts` |
| hazard condition/effect closures | `setup.ts:176-196` |
| event subscriptions | `setup.ts:288-300` |
| presentation rules (condition + transform) | `setup.ts:59-63` |
| AI intent profiles (`evaluate` functions) | `setup.ts:111-112` |
| pack-local engine modules | `starter-merchant/src/contract-core.ts` |

**Seven engine pack keys the forge never fills.** Five are wholly unauthorable —
`quests` (World Forge has no quest domain at all: not a type, not an editor
surface, not a converter — the single largest authoring hole), `abilities`,
`statuses`, `verbs`, `itemUseEffects`. Two are a different problem:
`archetypes` and `backgrounds` **are** authored and **are** exported — they just
land under `buildCatalog`, a key the engine's `ContentPack` does not declare.
An authoring win cancelled by a wire gap.

A note on `verbs` worth carrying into C3: the forge can *name* verbs — on items,
archetypes and disciplines — but cannot *define* one. It emits dangling
references into a slot it never fills.

**Merchant vocabulary with no forge words:** staged quests, abilities, statuses,
encounter definitions and spawn tables (the forge's `encounterAnchors` is a
pass-through with zero engine hits), boss phases, three separate genre keys
(`economyGenre`/`tradeGenre`/`craftingGenre` vs the forge's one free-text
`genre`), faction cohesion and membership (the forge's `FactionPresence` shares
not one field name with what `buildWorldStack` accepts), per-pack safe-zone and
bias tag config, currency rewards with recipient predicates, item catalogs and
transfer guards, chronicle recognition closures.

**The one bright line.** `District.baseMetrics.commerce` is authorable in the
forge AND carried lossless — and merchant's own source comment records that
leaving it at the default 50 kept `recovery` opportunities from firing anywhere
in the catalog. The lane transports exactly one lever of the living economy, and
it is a consequential one. The `economyProfile` that would give it context is
dropped.

---

## 5. Version skew — the 3.x checklist, worked

`ENGINE_CONTRACT.md` says to work its eight-item checklist *before* bumping dep
ranges for a 3.x engine. The engine reached 3.8.0. **Seven of eight are open.**

| # | Item | Status |
|---|---|---|
| 1 | Bump the six dep ranges | **open** — resolves content-schema 2.0.1 / core 2.0.1 / modules 2.1.0 / pack-registry 2.0.2 |
| 2 | Update hard-coded `engineVersion: '2.0.0'` | **open** — and nothing on the intake path reads it |
| 3 | Re-verify `DEFAULT_MODULES` | **open** — see below |
| 4 | Re-verify tone / genre / difficulty maps | **open** for genre; tone and difficulty still match exactly |
| 5 | Re-verify item slots / rarities | **closed** — still 5/5 and 4/4 |
| 6 | Re-verify role maps | **open in effect** — nothing to verify against |
| 7 | Run the suite; update fixtures | **open** — the contract's dialogue-text note never described what the exporter emits |
| 8 | Bump the major | **open** |

**Item 3 is the one that matters: nine of the eighteen module ids the exporter
writes into every manifest do not exist in the engine.** `arc-core`,
`endgame-core`, `faction-core`, `leverage-core`, `movement-core`, `npc-ai-core`,
`pressure-core`, `relationship-core`, `rumor-core`. Three are near-misses for
real modules under other names — `movement-core`/`traversal-core`,
`npc-ai-core`/`cognition-core`, `rumor-core`/`rumor-propagation` — which is
exactly why the list reads plausible. And nothing catches it: manifest
validation (`core/src/manifest.ts:77-89`) checks that `modules` is an array of
strings and never resolves an id.

Item 4's concrete cost: 3.x added `mercantile` and `pursuit` to `VALID_GENRES`
and no `GENRE_MAP` entry targets either — so a forge author cannot produce a
pack of the two newest starter genres, and the silent fallback turns the attempt
into `fantasy`.

Item 6 reads clean and is not: `EntityBlueprint.type` is a bare `string` with no
enum and no validation, so the six-roles-to-two-types collapse can never be
caught by a type or a gate.

---

## 6. Where the commissioning brief was wrong

The brief asked to be corrected. Four places:

1. **"`ZoneState.stability` … exist[s] on ZoneState but NOT on ZoneDefinition —
   unauthorable from any pack."** True and incomplete in a way that matters. The
   brief grouped it with `authority`, whose zero-readers claim is correct.
   `stability` has four real readers and moves four of twelve worlds. The pair
   is not a pair.
2. **"The three raw pass-through keys … have zero hits in the engine repo."**
   True for the plural pack keys (`encounterAnchors`, `factionPresences`,
   `pressureHotspots` — all genuinely 0). But a naive grep for the *singular*
   `factionPresence` returns 9 hits: a local variable in `district-core` and a
   derived field in `strategic-map`, both unrelated. Right claim, adjacent trap.
3. **"Eight exported keys are unknown to the engine's type."** Correct about the
   *type*, and misleading as a summary: `districts`, `buildCatalog` and
   `progressionTrees` carry data in shapes the engine understands via other
   routes. Filing all eight together hides that three are one-line wire gaps and
   five are vocabulary gaps.
4. **`playerTemplate`** was listed among the exported keys without comment; it
   has **zero** hits anywhere in the engine repo, making it as dead as the three
   the brief singled out.

Everything else in F1–F6 re-verified at HEAD.

---

## 7. ⚠ The honesty ledger — ten times the instrument was wrong

An audit with no entries here is an audit that did not check itself.

1. **The intake probe drove no player.** `runHostileRound` runs NPC turns,
   companion turns and the world tick — not the player. With no player actions
   nothing moves, so severing every zone's `neighbors` fingerprinted
   byte-identically and the probe reported the engine's movement gate dead.
   Caught by the calibration control, which is the only reason it was caught.
   Fixed by reusing the exported `playerHalfRound` the POR-1/POC-1 suites drive.
2. **The simulation tier was event-sequence hashing.** `type|tick` is not
   outcome identity: clearing `tags` changes combat results without changing
   which event types fire in which order, so the engine's most-read zone field
   scored `presentation-only`. Replaced with an end-of-session world-state hash.
3. **The sweep was single-world.** Against `chapel-threshold` alone, *no* tag
   mutation moves anything. Across the catalog the safe-zone tag moves eight
   worlds. A single-world probe measures the world, not the engine — and this
   one was one commit from filing `tags` as inert.
4. **`stability` was filed inert on resemblance** to the field above it. The
   sweep moved four worlds and refused it. (§3.2.)
5. **Eleven export-table rows were classified with unsound proofs**, all caught
   by the differ in one run: `author`, `category` and `projectTags` "leaked"
   into the export because their values collide with unrelated asset fields;
   `entityPlacements[].ai.fears` collided with a `pressureHotspots` value;
   three `zoneId` rows used a key-absence proof that is globally false because
   the raw pass-through domains carry one; `interactables[].type` scoped its key
   proof to the wrong key; and three `{}`-record rows named an image path
   missing its `{}` suffix, so they compared an object to its values. Fixed by
   adding **scoped** absence proofs — and scoping is not weakening, it is what
   makes the claim precise.
6. **The fixture made one row unprovable.** `category` held `'fantasy'`,
   identical to `genre`, so no evidence could separate "dropped" from "carried
   into `packMeta.genres`". The differ refused to certify it. An audit fixture
   owes every dropped field a distinguishable value.
7. **The module harvest missed constants.** The first pass matched only literal
   `id:` declarations and reported `economy-core` as nonexistent. It is real —
   its id comes from `ECONOMY_MODULE_ID` — and `companion-core` is declared the
   same way and would have been the next false positive. Phantom count corrected
   10 → 9. A grep-shaped harvest finds the shape it greps for.
8. **A near-miss claim was about a file, not a module.** I wrote that
   `pressure-core` had a real counterpart in `pressure-system`. `pressure-system.ts`
   is a source file that registers no module id at all — pressure has no entry
   in the registry under any name.
9. **"Two majors behind" was wrong.** 2.x → 3.x is ONE major boundary (eight
   minor releases of drift). Caught by the cross-family jury's `glm-5.2` seat,
   which refuted the claim while the other two seats confirmed it. Corrected in
   the source and here.
10. **Two C0 tests passed in the full suite and failed when the C0 files were
    run alone.** The reverse and version-skew files imported `FIXTURE_PACK_PATH`
    from the intake *test* file, which drags its `describe` blocks into each
    importer's module graph — so the intake suite ran three times, in parallel
    workers, racing on the same temp filenames. Fixed by moving the constant to
    a plain module and giving scratch files per-process unique names. Two
    tells worth keeping: the engine test count *fell* from 6609 to 6507 when
    the duplication went away (a suite total that only goes up is not
    self-evidently healthy), and **"green in the full run" is not the same
    claim as "green"** — the same family of error as running four of eight CI
    stages and calling the chain green.

The instrument's own controls are committed in both directions: the export
differ has four RED runs (deleted field, silently *changed* field, a
no-channel field that starts being carried, and a proof shape that cannot fail);
the intake probe has a GREEN calibration, a no-op RED calibration, and a
tier-separability check.

---

## 8. Cross-family jury

Panel: `deepseek-v4-pro:cloud` (DeepSeek) · `glm-5.2:cloud` (Z.ai) ·
`minimax-m3:cloud` (MiniMax) — three disjoint families, roster re-fetched from
`ollama.com/search?c=cloud` before the run. 12 claims in 4 batches of 3, each
with source files and measured ground truth attached.

**Result: 12/12 CONFIRMED, 0 REFUTED, 0 NEEDS_REVIEW. 3/3 jurors cloud-served on
every batch** (no local fallback, no excluded seats).

One dissent, and it was right: `glm-5.2` refuted C0-6 on the "two majors old"
phrasing while confirming every fact inside it. Ledger entry 9; fixed.

Disposition: **advisory, floor-primary.** No finding in this report rests on the
jury — every one rests on a committed test. The jury's value here was the
dissent.

---

## 9. SCOPING INPUT for the advisor

**Not a next-cycle mandate.** Sequencing and cut-lines are the advisor's and the
Director's. Grouped by the shape of the work, not by priority.

### C1-shaped — the wire contract

- **The intake seam is the whole gap.** There is no "partial" here: a loaded
  pack reaches a report and stops. C1's conformance harness needs a route from
  pack to `WorldStore` before it can replay anything through a wire.
- **`ZoneDefinition → ZoneState` is the first converter**, and `roomId` is its
  first design decision — required by the store, absent from the definition,
  read by nothing. Three options, all cheap: drop it from `ZoneState`, derive
  it, or make it authorable.
- **Three one-line wire gaps.** `districts`, `buildCatalog` and
  `progressionTrees` already arrive in shapes the engine understands and are
  rejected only by `ContentPack`'s key list. Cheapest ratio in the audit.
- **The boot contract needs a name.** `PackEntry.createGame` means a pack is
  code. C1 should decide explicitly whether the wire carries *content into a
  code-supplied pack* or aims at *content-only packs* — the second requires a
  vocabulary for hazard closures, module config and rulesets that does not
  exist, and the reverse table is the inventory of what it would cost.

### C3-shaped — schema co-evolution

- **The 2.5D vocabulary the charter names** — strata, elevation, entry gates,
  typed hazards — is authored, editor-supported, Godot-exported, and has no
  engine channel. C3 is where it becomes rule-bearing state.
- **`economyProfile` → district economies.** The forge authors supply categories
  and scarcity defaults; the engine runs live per-district economies. Merchant
  proved district commerce is consequential; the profile that contextualises it
  is dropped.
- **Typed hazards are the highest-value single item**, because they close a
  structural hole rather than a wire hole: today hazard meaning lives in pack
  closures, so *no* data format can express it. `HazardDefinition`'s typed
  effect union (damage / status / instakill / ignite, with triggers, move cost,
  passability, vision blocking, weather gating, immunity tags) is exactly the
  vocabulary that would let data mean something.
- **Exits and the SpawnCondition grammar.** The grammar has a parser, thirteen
  operand families, an editor, and no intact channel anywhere: entity
  `spawnCondition` is dropped, exit conditions are garbled, entry gates have no
  field. One grammar, three broken paths.
- **Quests are the largest authoring hole** — a first-class engine pack key with
  no forge domain at all.

### Engine-hygiene — small, independent, no dependency on C1 or C3

- `roomId`: required, universally written, read by nothing.
- `authority`: zero readers, unauthorable. Delete or fill.
- `exits` on `ZoneDefinition`: validated, never evaluated, no `ZoneState`
  counterpart.
- The loader's raw `TypeError` on six of ten declared keys.
- `stability` authorable from packs (it is already alive).
- `EntityBlueprint.type` as a bare string with no enum.
- `RoomDefinition`: authoring-only and unconsumed.
- Starter comments misattributing `encounterTable` to `ZoneDefinition`.

### World-forge-side — noted, out of this cycle's scope

The eight open checklist items; the `consumable` slot with no engine home;
`Zone.tilesetId` validated as an asset id rather than a `Tileset.id`;
`skyAtmosphereRef` with no referential check at all; and the export-side
fidelity report that computes 100% from zero observations.

---

## 10. How to re-run

```bash
cd E:/AI/world-forge && npx vitest run packages/export-ai-rpg/src/__tests__/
```

```bash
cd E:/AI/ai-rpg-engine && npx vitest run packages/cli/src/c0-
```

Every artifact in this directory is regenerated by those two commands. The
export table and the fixture pack are byte-identical across runs; the intake
sweep is seeded and pinned (`seed 71`, 40 rounds, all 12 packs). No wall-clock,
no RNG, no environment reads anywhere in the audit code.

Module-id harvest, for the version-skew table:

```bash
for f in packages/*/src/*.ts; do case "$f" in *.test.ts) continue;; esac; grep -hoE "id: '[a-z][a-z0-9-]*'" "$f"; grep -hoE "const [A-Z_]*MODULE_ID[^=]*= '[^']*'" "$f"; done | sort -u
```
