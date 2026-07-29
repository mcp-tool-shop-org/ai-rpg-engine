# C3 — The Space Vocabulary: SPEC

**Cycle:** third rung of the 2.5D arc ([[ai-rpg-engine-2p5d-quality-bar]] §5, row C3),
scoped by its kickoff to what C4's diorama sentence depends on.
**Shape:** BUILD. Production code in both repos. No publishes, no tags, no version
bumps, no public-surface edits, no deletions.

**This document is written BEFORE the code** (P0's exit gate). Every channel below
names the C0/C1 measurement it answers and the charter clause it serves. Where a
claim here turns out wrong against source, the REPORT corrects it — C0 and C1 both
did, and both were better for it.

| | |
|---|---|
| ai-rpg-engine | branch `feat/c3-space-vocabulary`, from `cf43386` (main, post-errand) |
| world-forge | branch `feat/c3-space-vocabulary`, from `98301d4` (main, post-errand) |
| Prerequisite | dep-bump errand MERGED — verified: all six `@ai-rpg-engine/*` ranges declare `^3.8.0` and **resolve** 3.8.0, one copy each, no nested 2.x (`package-lock.json`; the errand's incoherent-tree ANDON does not reproduce) |
| Baseline suites | engine **338 files / 6684 tests** · world-forge **133 / 2413** — both re-run at P0 by hand, green |
| Baseline CI | engine's **FULL 11-stage chain** run locally and green: audit (0 vulns) · lint (0 errors, 696 pre-existing warnings) · build · doc-examples typecheck · `typecheck:tests` · doc-examples behavior 12/12 · viability gate PASS · packaging gate 32/32 · suite · plus forge build + suite. Recorded because "green on the gates you remembered" is C1's named process error. |

**Environment note.** world-forge's four `docs/c0-alignment/*` artifacts show as
modified in `git status` on a clean tree. Verified zero-content: `git ls-files --eol`
reports `i/lf w/lf` and `git diff --numstat` produces no rows — it is
`core.autocrlf=true` pending-normalization noise ([[feedback_biome_crlf_local_lint]]),
recurring on every suite run that rewrites them. Not touched. It also independently
confirms the C0 artifacts are **byte-deterministic across runs**, which §8's recount
depends on.

---

## §0 — The five families, and why exactly these

C4's rung is one sentence in the charter: *a state shock re-dresses the diorama, a
spawn set populates it, an entry gate refuses without the ability, and MIKE PLAYS
IT.* Every noun in it is vocabulary the sim cannot say today. C3 makes the sim say
them, as rule-bearing state.

| Family | C4 clause served | The measurement it answers |
|---|---|---|
| P1 placement + spawn sets | "a spawn set populates it" | C0 §2 `entityPlacements[].zoneId` = `no-channel`, "the single most consequential drop in the lane"; C1 §9 "entity placement is the newly-sharp gap" |
| P2 entry gates | "an entry gate refuses without the ability" | C0 §9 "One grammar, three broken paths"; C1 closed one (exits) — gates remain unrouted |
| P3 typed hazards | ground truth underfoot | C0 §3.2 the hazard pair — `'loose cobbles'` moves nothing in any of 12 worlds; "no data format can express hazard meaning today" |
| P4 descriptors + zone state | "a state shock re-dresses the diorama" | charter §4 Pillar 2's SIM-provides list; the moat bridge |
| P5 round-trip + recount | the instrument | C0 §1 `losslessPercent: 100` from zero observations; C1 stopped the lie, did not make it measure |

**Deliberately NOT here** (charter vocabulary, later rungs — recorded as C3.2 in the
kickoff §10): strata / elevation / `stratumLinks`, the overworld graph and traversal
modes, markets and crafting stations, buildings / hubs / strongholds, `lootTables`,
`transitions`, `landmarks`, typed connections beyond gates. They serve visual depth
and later rungs, not C4's sentence.

---

## §1 — Binding properties (Lane 2, from [[2p5d-c1-contract-v1-kickoff]] §2)

Every vocabulary below is designed against these, and each is asserted somewhere in
the phase that introduces it:

1. **Closed, engine-owned, versioned enumerations.** Content SELECTS and
   PARAMETERIZES engine-owned predicates and effects; it never defines one.
   (Bethesda CTDA: one condition-function table across ~20 record types.)
2. **Effect payloads as data; imperative sequencing as code.** (UE GameplayEffects.)
3. **Totality.** No `eval`, no loops, no user functions; termination by
   construction. (CEL; JsonLogic.)
4. **Composition bounded system-wide, not per-operand.** (MTG Turing-completeness,
   arXiv:1904.09828 — hazard-triggers-status-triggers-hazard needs a hard depth cap.)
5. **The authoring grammar COMPILES to the closed format.** (ink.) World Forge's
   `parseSpawnCondition` is the compiler; `ConditionSpec` is the closed format. C1
   proved the pattern on exits; P2 extends it to gates and entity spawn conditions.

And one measured lesson from C1 that governs all five phases:

> **Carrying a field is necessary and not sufficient — a rule needs the REST of its
> inputs.** C1's `light` finding: the field crossed faithfully and measured INERT
> because nothing in the converted session exercised its reader, and two successive
> hypotheses about why were refuted by measurement. No C3 channel may claim "alive"
> on the strength of arriving. Each lands with its full input chain proven on a
> played session, or the REPORT names which input is still missing.

---

## §2 — Reconciliation map (reconcile BOTH ways; no parallel systems)

The house method. Before adding vocabulary, name what already exists and decide
whether C3 extends it or duplicates it. Duplication is the failure; C0's phantom
module ids and the exporter's duplicated content hash are both what it looks like.

| C3 wants | Already in the engine | Ruling |
|---|---|---|
| deterministic per-zone spawn sets with cleared state | **`encounter-spawn.ts`** — a complete system: module-side registry keyed by `world.meta.gameId`, `zoneTables: Record<string, string[]>` (weight = repetition), one-live-encounter-per-zone ledger in persisted state, safety-modulated chance, local FNV-1a+avalanche `spawnRoll(seed, tick, zoneId, salt)`, `encounter.spawned` event with a renderable payload | **EXTEND, do not replace.** `encounterAnchors` becomes an intake channel that REGISTERS into this system's existing registry shape. C3 adds no second roll, no second ledger, no second event type. The anchor's `probability` and `cooldownTurns` are the two axes `encounter-spawn` does NOT yet express per-entry — that is the real delta (see §4.2). |
| entity placement | `EntityState.zoneId` (exists, read everywhere); `EntityBlueprint` has no location field | **Add a placement channel, not a field on the blueprint.** The blueprint stays a TEMPLATE — `encounter-spawn` already clones templates and overrides `zoneId`, and `EntityBlueprint`→`EntityState` is 1:1 today only by accident of the exporter. Placement is its own record. |
| entry-gate evaluation | `traversal-core.moveHandler` — adjacency check at `traversal-core.ts:46`, target-existence at `:50`, then the mutation at `:58` | **One insertion point**, between target-existence and the mutation. Gates are a refusal, and every other refusal on that path is already an `action.rejected` event. |
| hazard semantics | `environment-core.HazardDefinition` — `condition`/`effect` are **closures** (`environment-core.ts:35-37`), checked at `:295` | **Add a data interpreter ALONGSIDE the closure path**, not instead of it. OpenRA's mature endpoint: data-by-default with a declared code escape hatch. The closure path is the hatch and stays; typed definitions are the default. Name collision is real — the engine already exports a type called `HazardDefinition`; §5.1 resolves it. |
| status application from a hazard | `status-core.applyStatus(entity, statusId, tick, opts, world)` — mints ids via `genId(world, …)`, honours `replace`/`stack`/`refresh` | **Call it.** The forge's `HazardEffect{kind:'status'}` carries `statusId` + `stacking` and its docstring already says why (FFT: tile-poison === spell-poison). `stacking` maps 1:1 onto `applyStatus`'s option, except `'ignore'` (§5.1). |
| zone state riding the strategic sim | `district-core` metrics (`commerce`/`morale`/`stability`/`surveillance`/`alertPressure`/`rumorDensity`), `economy-core` `DistrictEconomy` + `deriveEconomyDescriptor` + `applyEconomyShift` | **Derive, do not duplicate.** Zone state is a DERIVED projection over district+economy state plus authored thresholds — not a fifth independent number nobody updates. |
| scene descriptors | nothing | New. Charter Pillar 2's "stable descriptor keys the client's dioramas bind to". |
| genre vocabulary | three disagreeing lists (schema free `string`, editor's six options, `GENRE_MAP`'s eleven keys) | **The inherited ANDON** from the dep-bump errand (item 4). §7 rules on it. |

### 2.1 A misattribution to fix in passing

`encounter-spawn.ts:14` says `zoneTables` is "the same shape as content-schema's
ZoneDefinition `encounterTable` (schemas.ts)". Measured: `encounterTable` is on
**`RoomDefinition`** (`schemas.ts:245`), not `ZoneDefinition` — and C0 §9 filed
"Starter comments misattributing `encounterTable` to `ZoneDefinition`" as
engine-hygiene. P1 corrects the comment where it touches it. It is one line and the
alternative is leaving a cross-file pointer that is wrong, which is exactly how
`EB-011`'s comment rotted into nine phantom module ids.

---

## §3 — Pack channels: the shape of the growth

Four new top-level pack keys, plus one new field family on `ZoneDefinition`.

```
ContentPack (additions)
├── placements        : EntityPlacementRecord[]   NEW key   (P1)
├── encounterAnchors  : EncounterAnchorRecord[]   PROMOTED  (P1) — was an undeclared pass-through
├── hazardDefinitions : HazardSpec[]              NEW key   (P3)
└── zones[]                                                 (P2/P3/P4)
    ├── entryGate     : EntryGateSpec             NEW field (P2)
    ├── hazardRefs    : string[]                  NEW field (P3)
    └── scene         : SceneDescriptor           NEW field (P4)
```

**The gate grows in lockstep.** Every new key joins `ALLOWED_PACK_KEYS`, the
`ContentPack` type, and a shape guard **in the same commit** — plus
`SIM_AFFECTING_KEYS` where the key can change what the sim computes, and a negative
control proving the allowlist refuses it before it was declared. This is not
ceremony: C0's headline silent-pass exists because the allowlist did not exist, and
growing vocabulary without growing the guard is the disease.

| Key | `ALLOWED_PACK_KEYS` | `SIM_AFFECTING_KEYS` | Routed by |
|---|---|---|---|
| `placements` | yes | **yes** — placement changes what the sim computes | `applyContentPack` (core-only: `EntityState.zoneId`) |
| `encounterAnchors` | yes | **yes** | injected channel (`encounter-spawn` is in `@ai-rpg-engine/modules`) |
| `hazardDefinitions` | yes | **yes** | injected channel (`environment-core` is in modules) |
| `zones[].entryGate` | n/a (nested) | inherits `zones` | `zoneDefinitionToState` → `ZoneState.entryGate` |
| `zones[].hazardRefs` | n/a (nested) | inherits `zones` | `zoneDefinitionToState` → `ZoneState.hazardRefs` |
| `zones[].scene` | n/a (nested) | inherits `zones` | `zoneDefinitionToState` → `ZoneState.scene` |

**`items` rides P1 only if it is cheap.** The kickoff §3 authorises `items` (+ item
placements) on P1 "ONLY if it shares entity placement's shape cheaply — executor
judgment, ANDON if not." Measured shape: `itemPlacements[].zoneId` is dropped for the
same structural reason (`ItemDefinition` is a catalog record with no location, C0 §2),
so the AUTHORING side is identical. But the runtime side is not: an item in a zone
needs a container/ground vocabulary `WorldState` does not have — there is no
`zone.items`, and `EntityState.inventory` is the only place an item id lives. That is
a new world-state shape, not a placement record. **ANDON: `items` does NOT ride P1.**
Recorded here, re-stated in the REPORT, and the item-placement rows stay `no-channel`
in the recount rather than being quietly counted.

**Layering (DECOMPOSE_BY_SECRETS).** `@ai-rpg-engine/content-schema` sits BELOW
`@ai-rpg-engine/modules`, so it can only route core-only channels directly. C1
established the split and `createStandardChannels()` was written to grow here — its
own docstring names "typed hazards, entry gates, economyProfile" as the C3 growth.
`placements` is core-only (it writes `EntityState.zoneId`) and lands in
`content-schema`; `encounterAnchors` and `hazardDefinitions` are module-owned and
land in `intake-channels.ts`.

---

## §4 — P1: placement + spawn sets

### 4.1 Placement

```ts
/** In @ai-rpg-engine/content-schema — the pack's `placements` key. */
export type EntityPlacementRecord = {
  /** An `EntityBlueprint.id` in this pack. Unresolvable ⇒ refused, named. */
  entityId: string;
  /** A `ZoneDefinition.id` in this pack. Unresolvable ⇒ refused, named. */
  zoneId: string;
  /** Compiled at export from the SpawnCondition grammar. Absent ⇒ always. */
  spawnCondition?: ConditionSpec;
};
```

Forge side: `convertEntities` keeps emitting blueprints unchanged; a new
`convertPlacements` emits one record per `EntityPlacement`, compiling
`spawnCondition` through `parseSpawnCondition` exactly as `compileExitCondition`
does (same warn-and-drop-on-unparseable discipline — a malformed spec that reaches
the engine is worse than an absent one, because it looks like a rule).

Engine side: `applyContentPack` gains a `placements` pass that runs AFTER entities
(so the referent exists) and sets `EntityState.zoneId`. Both referential checks are
errors, not advisories: a placement into a zone that does not exist is the
`orphanedEntities` warning the exporter already emits (`export.ts:224-247`) arriving
at the runtime, where it can be refused instead of narrated.

**What this closes, and how it is proven.** C1's `applyContentPack` currently emits
a per-channel advisory — *"EntityBlueprint has no `zoneId`, so converted entities
are placed nowhere"* — on every intake. P1 deletes that advisory and flips the
assertion that pins it. Played proof: a session on Forge-authored content where the
player enters a converted zone and the authored NPC is THERE (`world.entities[id].zoneId`
equals the authored zone, asserted, and the NPC appears in the `inspect` payload's
`entities` list — the player-visible surface, not just the store).

**The `light` trap, deliberately not re-sprung.** C1 hypothesised that placement was
why `light` measured inert, and *disproved it twice* (a placed observer did not
revive it; a controlled placement re-pinned for all 40 rounds did not either). P1
therefore does **not** claim placement revives `light`. If it does, that is a bonus
finding to be measured and reported; if it does not, the honest statement is that
placement closes the placement gap and `light`'s missing input is still unnamed.

### 4.2 Spawn sets

`encounterAnchors` is promoted from undeclared pass-through to a real channel that
feeds `encounter-spawn`'s existing registry. The mapping:

| `EncounterAnchor` field | Destination | Note |
|---|---|---|
| `zoneId` | `zoneTables` key | already the registry's own keying |
| `enemyIds[]` | `EncounterDefinition.participants[].entityId` | resolved against pack entities |
| `encounterType` | `EncounterDefinition.composition` | closed set — `ambush`/`patrol`/`horde`/`duel`; an unmapped value is REFUSED, not defaulted (the silent-fallback shape C0 measured four times) |
| `tags[]` | `EncounterDefinition` tags | verbatim |
| `probability` | **per-entry chance override** | NEW axis — see below |
| `cooldownTurns` | **per-zone cooldown** | NEW axis — see below |

The two new axes are the honest delta. `encounter-spawn` today has ONE chance
(`baseChance` per pack, safety-modulated) and ONE anti-restack rule (one live
encounter per zone). An anchor authors a per-anchor `probability` and a
`cooldownTurns` — neither has an expression today. Both are added to the module's
existing structures rather than beside them:

- `probability` → an optional per-zone chance on the registry entry, consulted
  instead of `baseChance` when present. Safety modulation still applies (the F-ENG005
  loop is not being undone).
- `cooldownTurns` → a `cooledUntilTick: Record<string, number>` beside the existing
  `liveByZone` in `EncounterSpawnState`, checked in the same guard function. It rides
  the same persisted namespace, so it survives save/reload like everything else there,
  and the cursor discipline is untouched.

**Determinism.** No new RNG. `spawnRoll(seed, tick, zoneId, salt)` is the only
source, already pure and already avalanched, and the charter's §6 controls apply:
same-seed byte-identical, different-seed divergent, both asserted.

**Boss safety is preserved, not re-litigated.** `encounter-spawn` refuses
`boss-fight` compositions and any `role:boss` participant, for a stated reason (the
CLI's victory check live-scans `role:boss` hostiles, so a cloned boss can un-win a
won game). An authored anchor naming a boss is REFUSED with that reason, at intake,
by the module's own `validateEncounterSpawnContent` — which is why the channel calls
it rather than reimplementing the check.

**Exit gate (P1).** Placement + spawn rows leave the `no-channel` table, recounted
mechanically; the C0 entity-placement pin flips in its closing commit; the
`applyContentPack` placement advisory is gone and its assertion inverted.

---

## §5 — P2: entry gates as rule-bearing state

```ts
export type EntryGateSpec = {
  /** Compiled ConditionSpecs — ALL must hold (AND). */
  conditions: ConditionSpec[];
  mode: 'hard' | 'soft';
  /** The authored "show the lock" message. Rendered verbatim. */
  reason?: string;
};
```

Forge side: `convertZones` compiles `Zone.entryGate.conditions[]` — a
`string[]` of SpawnCondition grammar — through `parseSpawnCondition`, one per
element, reusing `compileExitCondition`'s exact discipline. `mode` and `reason`
cross verbatim. An entry gate whose conditions ALL fail to parse exports with a
warning and **no gate** rather than an empty-conditions gate, because an
empty AND-array is vacuously true and would silently unlock the zone.

### 5.1 ⚠ A MEASURED REGRESSION C1 INTRODUCED — the decompiler is mandatory

Found at P0, by probing rather than reading, and it changes this phase's design.

`import-zones.ts:71` reconstructs an exit condition as **`condition: e.condition?.type`**
— it takes the `ConditionSpec`'s `type` and discards `params`. Before C1 that
accidentally worked: the garble put the WHOLE grammar string into `type`, so
`'item:rope'` went out and came back unchanged. C1 correctly fixed the export to
compile — and thereby broke the import. Measured on the built packages:

| authored | C1 exports (correct) | import returns | re-parses? |
|---|---|---|---|
| `item:rope` | `{type:'has-item', params:{id:'rope'}}` | `'has-item'` | **null — INVALID grammar** |
| `party-level:>=10` | `{type:'party-level', params:{op:'>=',value:10}}` | `'party-level'` | **null — INVALID** |
| `flag:x` | `{type:'has-flag', params:{id:'x'}}` | `'has-flag'` | **null — INVALID** |
| `always` | `{type:'always'}` | `'always'` | OK — the only survivors are operand-free |

So an export→import round-trip today produces a project whose exit conditions fail
`validateSpawnCondition`. Nothing caught it because C1's proof was one-directional
(it asserted the *exported* shape, correctly) and the round-trip suite only exercises
operand-free forms. **This is the "carried, therefore fine" error in the other
direction, and it is exactly what P5's byte-stable round-trip requirement exists to
find.**

**Consequence for the design:** compiling is only half a codec. C3 adds
`formatSpawnCondition(spec): string` — the inverse of `parseSpawnCondition`, in
`@world-forge/schema` beside it, with a **round-trip property test over every one of
the thirteen operand families** (`parse(format(parse(s))) === parse(s)`). Every
condition-bearing channel in this cycle uses it on the import side: exits (repairing
C1's regression), entry gates (P2), entity `spawnCondition` (P1). One codec, one
inverse, thirteen families, proven both directions — rather than three importers each
guessing.

The repair to `import-zones.ts` is in scope precisely because C3 is the cycle that
adds two more consumers of the same broken pattern. Leaving it would mean shipping
three one-way doors instead of one.

### 5.2 Evaluation

Engine side, and this is the whole point: `ZoneState.entryGate` is evaluated in
`traversal-core.moveHandler`, between the target-zone-existence check and the
mutation.

```
hard + unmet → refuse the move. `gate.refused` event, public, carrying
               { zoneId, mode:'hard', reason, unmet: ConditionSpec[] }.
               The actor does NOT move; `world.locationId` does NOT change.
soft + unmet → `gate.warned` event, then the move proceeds exactly as today.
met          → byte-identical to today. No event, no branch taken.
```

**Condition evaluation is a closed, total evaluator.** A new
`evaluateCondition(spec, world, actorId): boolean` over the grammar's thirteen
operand families. Properties, each asserted: total (an unknown `type` returns
`false` and emits an advisory — never throws, never defaults to `true`), pure (no
RNG, no clock — `random-probability` is the one operand that would need a draw, and
it is **refused at export** for gates, because a gate that rolls dice is not a lock),
and terminating by construction (no recursion; the AND-array is a fixed-length fold).

**The party-state operands need the rest of their inputs.** This is the `light`
lesson applied before the fact. `party-level`, `party-size`, `party-member` and
`party-class` need a party notion; `has-item` needs inventory; `has-flag` needs
globals. Measured availability, per operand, is P2's first task and its result goes
in the REPORT as a table — any operand whose input does not exist yet evaluates
`false` and is REPORTED as unevaluable rather than silently failing closed. A gate
built on an unevaluable operand is named in the intake report, not discovered by a
player who cannot open a door.

**Rendering.** The terminal renderer gains one case in the existing
`formatEventLine` family for `gate.refused`, printing the authored reason. That is
the proof the event vocabulary reaches a player — charter Pillar 2's
"access stays rule-bound while traversal feel is client-authored" (Dionne 2023), and
the "show the lock" doctrine the forge's own schema comment already names.

**RED controls (all three, or the instrument is not an instrument):**
1. An **ungated** move refused ⇒ instrument failure.
2. A **hard-gated, unmet** move that PASSES ⇒ failure.
3. A **soft-gated, unmet** move must emit the warning AND permit; a soft gate that
   blocks is as wrong as a hard gate that does not.

Plus a GREEN control: a hard gate whose conditions are MET permits the move and
emits nothing, so the gate is not simply always-refusing.

**Exit gate (P2).** The C4 clause "an entry gate refuses without the ability" is
demonstrable in a played session on Forge-authored content, with the authored reason
rendered in the transcript.

---

## §6 — P3: typed hazards as data

### 6.1 The name collision, resolved first

`@ai-rpg-engine/modules` already exports `HazardDefinition` — the CLOSURE shape
(`environment-core.ts:30-38`). World Forge exports `HazardDefinition` — the DATA
shape (`hazard.ts:55`). Two different things under one name across a wire is how a
silent divergence starts.

**Ruling:** the pack key is `hazardDefinitions` and the wire type is **`HazardSpec`**
in `content-schema`. `environment-core.HazardDefinition` keeps its name (renaming an
exported type on a shipped package is a public-surface change this cycle does not
authorise) and gains a docstring pointing at `HazardSpec`. The interpreter converts
`HazardSpec` → the closure shape internally, which means **the data path and the
code path share one execution site** (`checkHazard`, `environment-core.ts:281`) —
one code path, the Quake-3 property C1 applied to the serializer, applied here.

### 6.2 The spec

```ts
export type HazardEffectSpec =
  | { kind: 'damage'; amount: number; amountIsPercentMaxHp?: boolean;
      tickOn: 'turn-start' | 'turn-end'; durationTicks?: number }
  | { kind: 'status'; statusId: string; chance: number;
      stacking: 'refresh' | 'stack' | 'ignore' }
  | { kind: 'instakill' }
  | { kind: 'ignite'; igniteChance: number };

export type HazardSpec = {
  id: string; name: string;
  effects: HazardEffectSpec[];                        // may be empty (terrain-only)
  trigger: 'on-enter' | 'per-turn' | 'on-exit' | 'timed';
  moveCostDelta?: number;
  passable?: 'yes' | 'flying-only' | 'never';
  blocksVision?: boolean;
  weatherConditions?: string[];
  immuneTags?: string[];
  tags: string[];
};
```

Byte-for-byte the forge's authored shape (`hazard.ts:18-73`), which is the point:
the vocabulary is **co-evolved, not invented** (charter §5 row C3), and the forge's
grounding — Brogue's flags/mechflags split, FFT poison as fraction+tick+duration over
a *shared* status, Tactics Ogre terrain move-cost + weather gating, DCSS's orthogonal
passable/vision axes — carries across with it.

### 6.3 Interpretation, effect by effect

| Effect | Executed as | Reconciled with |
|---|---|---|
| `damage` | resource delta on `hp`, `amount` or `round(maxHp * amount)`; `tickOn` selects the phase; `durationTicks` present ⇒ applied as a **periodic status** rather than a bespoke timer | `status-core`'s existing periodic (DoT) machinery — `PERIODIC_KEYS`, snapshot-at-apply. C3 does not build a second DoT. |
| `status` | `applyStatus(entity, statusId, tick, { stacking, … }, world)` | `status-core.applyStatus` directly. `'refresh'`/`'stack'` map 1:1. **`'ignore'` has no counterpart** — `applyStatus`'s three modes are `replace`/`stack`/`refresh`. Mapping: `ignore` ⇒ apply only when absent (a real semantic, expressible as a pre-check, NOT as `replace`). Named here because silently aliasing it to `replace` is the `safety`→`surveillance` mistake. |
| `instakill` | `hp → 0` through the same damage path, so defeat/fallout/chronicle consumers all fire | combat-core's defeat path — no bespoke kill. |
| `ignite` | `applyStatus` with a pack-resolvable burn status id | §6.4 |
| `moveCostDelta` | reported, **not enforced** — the engine's traversal has no move-cost economy | honesty: carried, reported inert, and SAID SO. This is the ZONE_HAZARD_NOTE discipline, not a claim. |
| `passable` | evaluated in `moveHandler`, beside the entry gate: `never` refuses, `flying-only` refuses unless the actor carries a flight tag | the gate path. One refusal mechanism, two reasons. |
| `blocksVision` | reported inert unless a perception reader is measured to consume it | measured, then claimed — never the reverse. |
| `weatherConditions` | gated on a weather key; if no weather source exists, the hazard is **always active** and the gate is REPORTED as unevaluable | same discipline as P2's unevaluable operands. |
| `immuneTags` | checked against `EntityState.tags` before any effect | `tags` is the engine's richest carried field; nothing new needed. |

### 6.4 Two closed-vocabulary obligations

`statusId` is a reference into a vocabulary the pack must supply. A hazard naming a
status no pack declares is the hazard equivalent of C0's phantom module ids —
plausible, and dead. **Resolution is live, against reality, exactly as C1's module
check is:** at intake, every `statusId` is resolved against the pack's declared
`statuses` plus whatever the booted engine's status registry knows; unresolved ⇒
REFUSED by name, with a suggestion (`suggestModuleId`'s shape is reusable). A static
list would drift the way `DEFAULT_MODULES` drifted.

`ignite`'s burn status has no id in the authored spec at all. Options were: invent an
engine-owned `'burning'` constant (invents vocabulary — violates §1.1), or require the
pack to declare it. **Ruling:** `ignite` resolves a burn status id from the hazard's
own `tags` convention if present, else refuses at intake naming what to declare. No
invented constant, no silent no-op.

### 6.5 The composition cap

`hazard → status → trigger → hazard` is a real cycle: `status-core` runs reactive
triggers, and a triggered effect can re-enter a zone check. Per §1.4 the bound is
**system-wide**. `status-effects.ts` already ships a `PROC_DEPTH_LIMIT` with a fiat
halt and a dedup set — the same shape, for the same reason. C3 adds a
`HAZARD_DEPTH_LIMIT` in the same idiom, exported so a test pins the threshold rather
than a magic number, with a **cycle fixture** that would not terminate without it and
does with it. A cap with no test that reaches it is a cap nobody has measured.

### 6.6 The flip that proves the whole family

C0's sharpest measurement, inverted and committed:

| Fixture | C0/C1 result | C3 expected |
|---|---|---|
| `'unstable floor'` as a STRING, starter-fantasy | moves the sim (a pack closure matches it at `setup.ts:137`) | **unchanged** — the escape hatch still works |
| `'loose cobbles'` as a STRING, any of 12 worlds | moves nothing | **unchanged** — the contrast is preserved deliberately |
| `'loose cobbles'` as a typed `HazardSpec`, no pack code | *did not exist* | **moves the sim** |

The middle row is the one that matters. It would be easy to make the string case
work too and lose the measurement; the string case stays inert, and the test says
why. That contrast IS the finding.

**Exit gate (P3).** The flip is committed with its preserved contrast; C0 §3.2's and
C1 §2's hazard pins flip in the closing commit.

---

## §7 — P4: scene descriptors + zone-state versioning

### 7.1 Descriptors: stable keys, never layout

```ts
export type SceneDescriptor = {
  /** Stable key, not prose. e.g. 'harbour-stone'. */
  biome?: string;
  /** Stable key. Authored from Zone.timeOfDay. */
  timeOfDay?: string;
  /** Coarse, ordinal, client-interpreted. */
  dressingDensity?: 'sparse' | 'normal' | 'dense';
  /** Free tags for client binding. Closed at the CLIENT, open on the wire. */
  variantTags?: string[];
};
```

Charter Pillar 2, from RG-C: HD-2D's look is wholly client-side, so the sim owes a
scene DESCRIPTOR (Takahashi/Miyauchi 2018); zone records are canonical content
manifests the client fully realizes (OT2 2023); **state flags swap lighting and
dressing variants, never layout** (Triangle Strategy). The descriptor therefore
carries no geometry, no coordinates, no asset paths — nothing whose change would move
a wall. `Zone.timeOfDay` (C0: `no-channel`, "even though the SpawnCondition grammar
has a `time:` operand the engine could gate on") gets its channel here, and P2's
`time-of-day` operand gets a real input — two rows closed by one field, which is the
kind of thing the reconciliation map exists to find.

**Explicitly NOT in the descriptor:** `parallaxLayers`, `skylineRef`, `collisionType`,
the physics fields, the light/sky hints. Those are client-owned per the charter and
stay `no-channel` in the recount. A descriptor that carried them would be a renderer
config crossing a sim boundary.

### 7.2 Zone state

```ts
export type ZoneCondition = 'intact' | 'strained' | 'occupied' | 'damaged' | 'ruined';
```

A closed, ordinal enumeration on `ZoneState`, **derived** — not a fifth independent
number. The derivation reads what five cycles already simulate:

```
district stability + morale   (district-core)
+ economy tone                (economy-core deriveEconomyDescriptor: thriving|normal|strained|crisis)
+ authored thresholds         (the zone's own scene/variant authoring)
→ ZoneCondition
```

Recomputed where district metrics already change, and when it MOVES it emits
`zone.state.changed { zoneId, from, to, cause }` — where `cause` names the event that
moved it, so the change is legible rather than mysterious. The descriptor's
`variantTags` are re-derived at the same moment: **the state flips the dressing
variant, and the client re-dresses.** That is the moat bridge, in one sentence and
one event.

Determinism: pure derivation from state the store already holds. No clock, no RNG.
Same-seed identity is asserted with the rest.

### 7.3 The played proof

Cause a real shock in merchant's economy (the Salt Road Ledger is the cycle's proof
pack for exactly this reason — economy-rich, so zone state has something real to
ride), and watch the town's zones re-dress:

```
a scarcity/blockade shock lands  →  economy tone: normal → strained
                                →  ZoneCondition: intact → strained
                                →  zone.state.changed through the sidecar
                                →  variantTags change
                                →  the terminal renders the change
```

RED control: a shock too small to cross a threshold must emit NOTHING (a state that
flips on every tick is not a state), and a doctored derivation must be caught.

### 7.4 The five undeclared keys, disposed

| Key | C3 disposition |
|---|---|
| `encounterAnchors` | **becomes real vocabulary** (P1/§4.2) |
| `items` | **ANDON — does not ride P1** (§3): needs a world-state container vocabulary, not a placement record |
| `playerTemplate` | **stays undeclared, session-scoped** — C1's `extractSessionContent` precedent; consumed before a world exists. Recorded, not routed. |
| `factionPresences` | P4 evaluates. The reverse table's warning is load-bearing: `FactionPresence` "shares not one field name with what `buildWorldStack` accepts" (C0 §4). Reconcile or report with the FIELD-LEVEL reason. |
| `pressureHotspots` | P4 evaluates against v3.8's spawn-pressure producers. Same reconcile-don't-duplicate rule; v3.8 found all three producers already authored and reached by nothing, so a mapping may be closing a real loop — or may be a fourth parallel spawn system, which is the outcome to refuse. |

### 7.5 `economyProfile` — a bounded, declared addition

`District.economyProfile` (`supplyCategories[]` + `scarcityDefaults{}`) is in neither
the kickoff's §4 design nor its §10 out-of-scope list. C0 §9 files it C3-shaped;
`createStandardChannels()`'s own docstring names it as C3 growth.

Measured: `DistrictEconomy.baseline?: Partial<Record<SupplyCategory, number>>` already
exists, is already read by `tickDistrictEconomy`, and exists for exactly this reason —
its docstring says that without it "a sacred quarter, a contested slum and a crown
audit house all converged on the same neutral numbers inside ~15 rounds, which made
the whole genre-and-tag seeding cosmetic."

**Ruling: include it in P4, bounded.** It is a one-to-one mapping onto an existing,
already-read field, and it is what makes P4's shock legible (an authored scarcity
profile is the difference between "a number moved" and "the medicine district ran
dry"). Conditions: `supplyCategories` must map onto the closed `SupplyCategory` union
with **refusal, not fallback**, on an unmapped category; if the mapping is not
one-to-one and cheap, **ANDON and report** rather than widen. Declared here rather
than done quietly, because scaling scope is the Director's call and this is a small
addition I am naming, not assuming.

### 7.6 The genre ANDON, ruled

The dep-bump errand routed `GENRE_MAP` here (checklist item 4). Three lists disagree:
schema (`project.genre`, free `string`), editor (`SaveTemplateModal.tsx:12` — six
fixed options), `GENRE_MAP` (eleven keys → nine targets). The engine's
`VALID_GENRES` added `mercantile` and `pursuit`, which `GENRE_MAP` targets with
nothing, so `convert-pack.ts:147` silently falls them back to `'fantasy'`.

**Ruling: the ENGINE owns the genre vocabulary** (§1.1 — closed, engine-owned
enumerations; content selects, never defines). Concretely, and minimally:
1. `GENRE_MAP` gains `mercantile` and `pursuit` as identity entries, so the engine's
   full vocabulary is reachable.
2. The **silent fallback becomes a warning** — the same silent-fallback shape C0
   measured on `slot`, `rarity`, `difficulty` and `genre`, fixed once here where it
   costs one line.
3. A drift guard derives the map's target set from the engine's `VALID_GENRES`
   (imported type-only at `convert-pack.ts:5` today and unused — the errand named
   this as "the ready-made handle"), so the engine ADDING a genre fails the build
   instead of being silently omitted. That is the one-directional-guard defect the
   errand flagged on `convert-items.ts`, fixed in its sibling.
4. The **editor picker is NOT changed.** It is a public surface (`SaveTemplateModal`),
   and this cycle authorises no public-surface edits. Recorded as the remaining half:
   two genres are now reachable by hand-editing a project file and not by the picker.
   Named, not hidden.

**Exit gate (P4).** The played shock-re-dress session recorded in the REPORT, with
its transcript; the faction/pressure evaluations answered either way with reasons.

---

## §8 — P5: round-trip, recount, report

1. **Byte-stable round-trip per channel.** export → intake → re-export, byte-identical.
   world-forge has import-side converters for every existing domain (`import-zones.ts`
   et al.); each new channel gets its importer in the same phase, or its absence is
   named. A channel that exports and cannot import is a one-way door, and C0 measured
   what those cost. **The C1 exit-condition regression measured in §5.1 is repaired
   here and pinned** — a round-trip test over all thirteen operand families, which
   would have failed on `main` before this cycle.
2. **Fidelity collectors WIRED.** C1 stopped the instrument lying (`null` +
   `observed: false`); C3 makes it MEASURE the channels C3 ships. Not all eight
   converters — that is the full pass C1 deferred — but every C3 channel reports real
   observations, and the REPORT says which converters are still unwired.
3. **The mechanical recount.** `expandTable(project).filter(r => r.class === 'no-channel').length`
   is the number; `export-table.json`'s `tally.byClass` is the artifact. The count
   drops by **exactly** the in-scope rows and no others. Every row that moves is
   listed in the REPORT by path, with the phase that moved it. The C0 export table's
   `engineDepVersions` block stays a frozen C0 stamp (already commented as such) — a
   dated record stays dated.
4. **Cross-family jury** — advisory, floor-primary. Claims reasoning-stripped with
   measured ground truth attached; roster re-fetched before the run; a seat that
   fails to serve is EXCLUDED and reported, never rounded up.
5. **The REPORT** — headline, per-phase measurements, the honesty ledger, C0 and C1
   ADDENDA, and the **C4-readiness statement**: which of the four C4-sentence clauses
   are now demonstrable, each with its transcript, and which are not.

### 8.1 A doc-drift correction owed at P0

C0's `REPORT.md` ADDENDUM 2 still reads *"npm `latest` is 3.8.0 from 2026-03-07."*
That date was corrected by the advisor at the errand's verification gate — 3.8.0 was
published **2026-07-28T23:12Z**, hours before C1 merged; `2026-03-07` was the
package's CREATED timestamp. The fix landed in the world-forge branch files
(commit `0983a26`) and did **not** reach the engine's copy. Corrected in P0, because
the corrected fact is the sharper one: the packages were cut before C1 existed, which
is why `main` and `latest` are different engines.

---

## §9 — Standards compliance

Per `.claude/rules/workflow-standards.md`, scored 0–3 with evidence.

- **PIN_PER_STEP — 2.** Both repos' post-errand SHAs pinned in the header and
  verified from `.git/refs` + the lockfile's *resolved* versions (not just declared
  ranges — the errand's lesson). All probes seeded and pinned (`seed 71`, 40 rounds,
  12 packs, the C0/C1 harness). Spec-before-code is this document. Not 3: no
  byte-replayable dispatch lock for the phases themselves.
- **ANDON_AUTHORITY — 3.** Per-phase exit gates below each section; two ANDONs
  already called in the spec before any code (`items` §3, `economyProfile` §7.5's
  conditional), the inherited genre ANDON ruled in §7.6 with its unfinished half
  named, and the §2 escalation rule routes a genuine design fork to the advisor
  rather than guessing.
- **NAMED_COMPENSATORS — 3.** Full table in the kickoff §7; nothing irreversible is
  authorised in this cycle (no publish, tag, bump, deletion, or public surface).
  Every commit is independently revertible per slice.
- **DECOMPOSE_BY_SECRETS — 3.** The layering is the design: core-only channels in
  `content-schema`, module-owned channels in `intake-channels.ts`, and §2's
  reconciliation map exists specifically to keep ownership single — every C3 family
  extends the module that already owns that secret rather than standing beside it.
- **UNCERTAINTY_GATED_HUMANS — 2.** The Director is untouched except charter §7.2's
  diorama-world decision, which this cycle deliberately does not pre-empt. Forks are
  routed contrastively with one recommendation. Not 3: no measured uncertainty signal
  drives the checkpoints; they are phase-boundary gates.
- **EXTERNAL_VERIFIER — 2.** P5's cross-family jury, generator-reasoning stripped,
  advisory and floor-primary; the advisor verifies independently against the tree
  before any merge. Not 3: the jury does not gate, by design — no C3 finding rests on
  it, and C1's jury produced no dissent, which is worth strictly less than C0's did.

---

Related: [[ai-rpg-engine-2p5d-quality-bar]] (§4 Pillar 2 binding, §5 row C3, §6),
[[2p5d-c3-space-vocabulary-kickoff]] (the brief),
[[2p5d-c1-contract-v1-complete]] (the seam this builds on, and its corrections),
[[2p5d-c0-alignment-audit-complete]] (the tables this recounts),
[[2p5d-forge-engine-dep-bump-complete]] (the prerequisite, and the genre ANDON),
[[workflow-standards]], [[cross-family-cloud-verification]].
