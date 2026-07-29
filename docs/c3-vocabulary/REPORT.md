# C3 — The Space Vocabulary: REPORT

**Cycle:** third rung of the 2.5D arc ([[ai-rpg-engine-2p5d-quality-bar]] §5, row C3).
**Shape:** BUILD. Production code in both repos. No publishes, no tags, no version
bumps, no public-surface edits, no deletions.

| | |
|---|---|
| ai-rpg-engine | branch `feat/c3-space-vocabulary`, from `cf43386` |
| world-forge | branch `feat/c3-space-vocabulary`, from `98301d4` |
| Suites | engine **338 → 342 files / 6684 → 6751 tests** · world-forge **133 → 135 / 2413 → 2431** |
| CI | the engine's FULL 11-stage chain plus the forge, green, re-run at every phase boundary |
| Artifacts | [`SPEC.md`](SPEC.md) (written before any code) · this report |

---

## 1. The headline

**The sim now speaks four of the five families C4's sentence needs, and the
`no-channel` count fell by exactly the rows those families closed.**

C0 measured a content path that carried 145 of 377 authored fields into a pack the
engine only validated. C1 made a pack BOOT. C3 makes the arrived content MEAN
something:

```
no-channel           194 → 169   (−25, mechanically recounted)
carried-lossless     168 → 190
carried-approximated  14 →  18
carried-garbled        1 →   0
total                377 → 377   all rows verified
```

The −25 decomposes exactly by phase — P1 2, P2 3, P3 19, P4 1 — and the sum is
checked in the artifact, not asserted here.

Three numbers carry the cycle:

- **0.45** — the observed spawn rate over 40 consecutive seeds, matching the
  AUTHORED anchor probability rather than the module's 0.35 default. The
  distinction between *carried* and *alive*, made numerical.
- **62 → 0** — first-tick zone-state events across the twelve shipped packs, before
  and after the threshold error I introduced and then measured.
- **1 → 0** — `carried-garbled` rows, because C1 fixed the behaviour and never
  flipped the row that described it.

---

## 2. What each phase closed

| Phase | Family | Proven by |
|---|---|---|
| P1 | placement + spawn sets | authored NPCs stand where placed, visible in the PLAYER's own `inspect` payload; an anchor spawns through the real `move` verb, respects cooldown and cleared state |
| P2 | entry gates as rules | a hard gate refuses with the authored reason rendered by the real terminal renderer; a soft gate warns and permits |
| P3 | typed hazards as data | the `'loose cobbles'` flip, with C0's contrast preserved |
| P4 | descriptors + zone state | an economy/stability shock re-dresses a forge-authored town, through the sidecar's own wire |

Each phase grew `ALLOWED_PACK_KEYS`, the `ContentPack` type and a shape guard **in
the same commit**, with a negative control per key. That was not ceremony: the
same-commit rule is what caught P3's channel being registered in
`createStandardChannels()` and not in `MODULE_INTAKE_KEYS`.

---

## 3. The corrections — four defects in prior cycles, found by measuring

### 3.1 C1's exit-condition fix broke the import direction

C1 correctly fixed the exporter to COMPILE the SpawnCondition grammar, closing the
audit's single `carried-garbled` row. `import-zones.ts:71` read
`condition?.type` and discarded the operands. Before C1 that accidentally worked —
the garble put the whole string in `type`, so a broken export and a lossy import
cancelled out. Measured on the built packages:

| authored | exported (correct) | imported | re-parses? |
|---|---|---|---|
| `item:rope` | `{type:'has-item', params:{id:'rope'}}` | `'has-item'` | **no** |
| `party-level:>=10` | `{type:'party-level', params:{op:'>=',value:10}}` | `'party-level'` | **no** |
| `always` | `{type:'always'}` | `'always'` | yes |

Only operand-free forms survived. Nothing caught it because C1's proof was
one-directional. **Compiling is half a codec** — `formatSpawnCondition` is the
inverse, pinned over all thirteen operand families, and it was proven to
discriminate by injecting the naive `return node.type` (8 of 11 red, then
reverted).

### 3.2 A row C1 should have flipped and didn't

`zones[].exits[].condition` still declared `carried-garbled`, with a note saying
"`parseSpawnCondition` is never called" — false since C1 merged. The committed
artifact published that for a whole cycle.

**And the differ cannot catch it.** A named-transform row is verified by confirming
values exist at the packPath, and both the garbled (`type: 'item:rope'`) and
compiled (`type: 'has-item'`) forms put a string there. The generated evidence line
says so out loud: *"semantics asserted separately."*

Carry the general form: **a table that mechanically verifies 377 of 377 rows can
still be wrong about what a row MEANS, and `verified: true` is not
`correct: true`.** This residual blindness is named, not smoothed over — it is the
honest limit of a shallow check, and the reason a row's PROSE is not
self-verifying.

### 3.3 The cross-repo hash test earned its keep, twice

Adding keys to the engine's `SIM_AFFECTING_KEYS` turned `c1-gate.test.ts` red
immediately on **both** P1 and P3 — the engine hashed a subset the forge's
duplicated implementation did not, so stamped and computed hashes disagreed for
byte-identical content. That is the silent divergence the duplication was defended
against, caught by the named mechanism rather than by review, on the first two
cycles after that test was proposed for retirement.

### 3.4 A gate that can never open, in committed content

The fixture gates `zone-under-vault` on `item:rope` while its item catalog calls
the same object `item-rope`. `has-item` looks for an id no item in the pack has, so
the door can never open. Nothing checked. Same phantom-id shape as C0 §5's nine
module ids: plausible, and dead.

The refs pass now reports dangling `has-item` / `party-member` gate operands as
ADVISORIES — an id can legitimately come from pack code or a reward, so refusing
would break valid content — with a control proving the check discriminates.

---

## 4. The `'loose cobbles'` flip

C0's sharpest measurement, inverted and committed with its contrast intact:

| fixture | C0/C1 | C3 |
|---|---|---|
| `'unstable floor'` as a STRING | moves the sim (a pack closure matches it) | **unchanged** — the escape hatch still works |
| `'loose cobbles'` as a STRING | moves nothing, in any of 12 worlds | **unchanged, deliberately** |
| `'loose cobbles'` as a typed `HazardSpec` | *did not exist* | **moves the sim, with no pack code** |

The middle row is the one that matters. It would be easy to make the string case
work too and lose the measurement.

Two structural facts shaped the implementation, both measured rather than assumed:
the engine already exports a `HazardDefinition` whose fields are CLOSURES (so the
wire type is `HazardSpec`, and the interpreter converts spec → closure shape so
data and code share ONE execution site); and `createEnvironmentCore`
closure-captures `config.hazards` with one listener per hazard, so a post-boot
registration cannot add a listener — the same structural class as
`progressionTrees`, which is why typed hazards run from the world tick instead.

---

## 5. Determinism (charter §6)

Every new path is seeded and controlled both ways.

| Path | Same-seed | Different-seed |
|---|---|---|
| spawn sets | byte-identical | swept over 8 seeds, diverges |
| hazard procs | identical | swept over 10 seeds, diverges |
| placement | seed-independent by construction, asserted anyway | — |
| gates | pure evaluation, no draws | — |
| zone state | pure derivation, no draws | — |

No `Math.random`, no clock, no environment reads anywhere in the cycle's code. The
hazard proc roll is a pure hash of `(seed, tick, hazard, entity)` for exactly this
reason — a stateful stream would couple every roll to global draw order.

---

## 6. ⚠ The honesty ledger — nine times the instrument or the author was wrong

C0 logged ten, C1 nine. A build cycle with none is not a cycle that made none.

1. **I calibrated a threshold against one FIXTURE and it broke the catalog.** P4's
   first draft used absolute cut-offs (stability ≤ 25 damaged) calibrated against
   the forge fixture's authored `stability: 45`. Run against the catalog it declared
   **every zone in every pack `ruined` on the first tick — 62 events across 12
   packs** — and that flood broke `bounty` opportunity reachability catalog-wide, 8
   suites red. Measured cause: `DEFAULT_METRICS.stability` is 5, and **all 27
   districts across all 12 shipped packs sit at the defaults**; not one authors
   `baseMetrics`. A low stability is the normal resting state, so the threshold was
   measuring the engine's defaults, not the world. This is C0's ledger entry 3 in a
   new costume — "a single-world probe measures the world, not the engine" — except
   I calibrated against a single fixture. Repaired by deriving from a drop below the
   district's own persisted baseline, reusing the reasoning
   `DistrictEconomy.baseline` already documents. The flood control is now a
   permanent catalog-wide gate.
2. **My depth-cap test recursed SEQUENTIALLY, not nested** — so it never reached the
   cap and would have "proved" the guard by never testing it. The `finally` block
   correctly restores depth between passes, which is precisely why a sequential
   loop cannot reach it. Rewritten to genuinely stack.
3. **A channel registered in one list and not the other.** `hazardDefinitions` was
   in `createStandardChannels()` but not in `MODULE_INTAKE_KEYS`, which is what
   `applyContentPack` iterates — so the channel was never called and every
   forge-export hazard test read zero. **A channel registered nowhere looks exactly
   like a channel that does nothing.**
4. **The hazard cursor baselined past its own round's events**, so hazards never
   fired. That is `encounter-spawn`'s documented P8-WL-006 hit from the other side:
   the namespace must be registered at BOOT, or the first access happens inside the
   step, after the entry events already exist. Fixed with a factory default in
   environment-core, for the same reason `freshEncounterSpawnState` is one.
5. **`submitAction({verb})` when it takes a verb STRING** — produced
   `"unknown verb: [object Object]"` and a silent zero-spawn, and I briefly
   suspected the spawn system. The move helper now THROWS with the rejection reason
   when a move does not produce `world.zone.entered`, so the next such mistake names
   itself.
6. **Wrong fixture zone ids** (`z1` for `zone-a`), so placements were correctly
   refused while I read it as a code failure. Same class as 5 and 8: writing against
   an assumed API instead of reading it.
7. **A write to the read-only `world.locationId`**, caught by `typecheck:tests`
   after the suite was already green — which is why that stage is in the chain.
8. **I assumed the companion API** (`getActiveCompanions(world)`, `companion.entityId`)
   when it is `getActiveCompanions(partyState)` and `npcId`. Caught by the build.
9. **"Emit unless intact" fired five events on a world that had always been that
   way.** `ashfall-dead`'s genre supply profile authors a genuinely scarce economy,
   so `strained` was CORRECT — but a client would have received five "the town just
   changed" notices about an unchanged town. **Authored initial state and a shock are
   different facts and must not share an event.** First observation is now recorded
   silently, whatever the condition.

**Process note, not an instrument error:** every phase boundary ran the FULL
11-stage engine chain plus the forge, because "green on the gates you remembered"
is C1's own named process error and this cycle did not want a tenth entry.

---

## 7. Carried and honestly inert — what does NOT work yet

Named rather than implied, because an effect that silently does nothing is the
failure mode this cycle exists to end.

| Field | State | Why |
|---|---|---|
| `hazard.moveCostDelta` | carried, reported inert | the engine has no movement-cost economy to spend into |
| `hazard.blocksVision` | carried, reported inert | no perception reader consumes a per-zone vision block |
| `hazard.weatherConditions` | gate reported UNEVALUABLE | no weather source; fail-OPEN, unlike a gate's fail-closed, because a hazard that silently stops existing is a floor the player crosses safely by accident |
| `statusId` live resolution | BUILT, NOT WIRED | `IntakeChannel.apply(engine, data)` receives only its own slice, not the pack, so the channel cannot see `pack.statuses`. Widening that signature touches two sibling channels — a contract change this cycle did not authorise on the way past. `registerTypedHazards` already accepts the set; wiring it is one argument. |
| gate operands `player-level`, `party-level` | UNEVALUABLE | this engine has no character level at all — progression-core tracks currencies and unlocked nodes; stats are vigor/instinct/will |
| gate operand `time-of-day` | **input now exists** | P4's descriptor gives `Zone.timeOfDay` its channel; the operand itself is still listed unevaluable and wiring it is one line plus a test |

9 of the grammar's 13 operand families are evaluable today; 3 have no input; 1
(`random-probability`) is refused in a gate position by design, recorded separately
because conflating a design ruling with a gap makes a reader fix the wrong one.

---

## 8. The five undeclared keys, disposed

| Key | Disposition |
|---|---|
| `encounterAnchors` | **became real vocabulary** (P1) |
| `hazardDefinitions` | **became real vocabulary** (P3) — was in `DROPPED_CONTAINERS`, a whole domain |
| `items` | **ANDON, stated before any code.** The authoring side matches entity placement, but the runtime side needs a zone-container vocabulary `WorldState` has no shape for: there is no `zone.items`, and `EntityState.inventory` is the only place an item id lives. That is a new world-state shape, not a placement record. Item-placement rows stay `no-channel` in the recount. |
| `playerTemplate` | **stays undeclared, session-scoped** — consumed before a world exists, C1's `extractSessionContent` precedent. Recorded, not routed. |
| `factionPresences` | **EVALUATED — do not map.** Field-level reason: of `factionId / districtIds[] / influence / alertLevel / patrolRoutes[].zoneIds[]`, only `districtIds` has an engine counterpart, and it is **already carried** as `districts[].controllingFaction`. `influence`, `alertLevel` and `patrolRoutes` have no reader anywhere; `FactionState` is keyed by id with `reputation`, and `WorldPressure` carries `sourceFactionId` only. Mapping it would add three fields with no consumer — the "declared and never produced" shape. C0's reverse-table warning ("shares not one field name") is confirmed. |
| `pressureHotspots` | **EVALUATED — do not map, and this is the sharper refusal.** `WorldPressure` is `{id, kind, sourceFactionId, description, triggeredBy, urgency, visibility, turnsRemaining, potentialOutcomes, tags, createdAtTick}` — an INSTANCE with narrative content, not a spawn-probability config. v3.8's producers are `evaluatePressures(inputs)` driven by live district state, not by authored hotspots. A hotspot's `{zoneId, pressureType, baseProbability}` would be a **fourth parallel spawn system** beside encounter-spawn, the pressure system and typed hazards. That is the outcome the reconcile-both-ways rule exists to refuse. |
| `economyProfile` | **EVALUATED, mapping identified, NOT BUILT — ANDON on my own stated condition.** `District.economyProfile.scarcityDefaults{}` maps one-to-one onto `DistrictEconomy.baseline?: Partial<Record<SupplyCategory, number>>`, which already exists and is already read by `tickDistrictEconomy`. The mapping is real and small. I declared it in SPEC §7.5 as a bounded addition conditional on being cheap; with P5's report outstanding it stopped being cheap in the sense that mattered, and scaling the work down is not my call to make silently. Named here with the exact seam so it is one channel away. |

---

## 9. C4-READINESS STATEMENT

C4's rung is one sentence: *a state shock re-dresses the diorama, a spawn set
populates it, an entry gate refuses without the ability, and MIKE PLAYS IT.*

| Clause | Demonstrable? | Transcript |
|---|---|---|
| "a spawn set populates it" | **YES** | `c3-placement-spawn.test.ts` — authored NPCs stand where placed and appear in the player's own `inspect` payload; the anchor fires through the real `move` verb at `FIRING_SEED`, respects cooldown after the pack is cleared, and the observed rate over 40 seeds is the authored 0.45 |
| "an entry gate refuses without the ability" | **YES** | `c3-entry-gates.test.ts` — the hard gate refuses, the player does not move, and the authored reason renders as `> No one goes down without rope and a delver.` through the real terminal renderer; the GREEN control opens the same gate on the same move |
| "a state shock re-dresses the diorama" | **YES, at the sim/wire layer** | `c3-zone-state.test.ts` — a district stability shock flips `intact → damaged`, `variantTags` change from `dressing:intact` to `dressing:damaged` + `props:rubble`, the authored `timeOfDay` is untouched, and the event serialises through `toWireEvent` so a client would receive it |
| "and MIKE PLAYS IT" | **NO — and this is C4's work, not a gap in C3** | there is no visual client. The charter's client seat is open and the UE5-vs-Godot decision is forced at C4 (§7.1). What C3 delivers is that all three preceding clauses are now demonstrable on **Forge-authored content in a running engine**, which is what C4 needs to have something to render |

**Honest ceiling on clause three:** "re-dresses the diorama" is proven as far as a
diorama can be proven without one. The sim emits the state change, the descriptor
changes, and the event crosses the serializer C1 proved byte-identical over a
process boundary. Whether a renderer binds to those keys correctly is untestable
here by construction.

---

## 10. Standards compliance

- **PIN_PER_STEP — 2.** Post-errand SHAs pinned and verified from `.git/refs` plus
  the lockfile's *resolved* versions; all probes seeded (`seed 71`, plus named
  `FIRING_SEED` where a probabilistic gate required one); spec written before code.
  Not 3: no byte-replayable dispatch lock for the phases.
- **ANDON_AUTHORITY — 3.** Two ANDONs called before any code (`items`, the
  `economyProfile` condition), the inherited genre ANDON ruled with its unfinished
  half named, and two mid-cycle halts — the P4 threshold flood and the
  `statusId`-wiring contract change — both stopped and reported rather than
  worked around.
- **NAMED_COMPENSATORS — 3.** Table below; nothing irreversible was authorised or
  performed. Every commit independently revertible per slice.
- **DECOMPOSE_BY_SECRETS — 3.** Core-only channels in `content-schema`,
  module-owned channels in `intake-channels.ts`; every family EXTENDED the module
  that already owned that secret (encounter-spawn, status-core, environment-core,
  district-core/economy-core) rather than standing beside it. Two proposed mappings
  were refused specifically to avoid a parallel system.
- **UNCERTAINTY_GATED_HUMANS — 2.** The Director was untouched except the
  charter §7.2 diorama-world decision, deliberately not pre-empted. Not 3: the
  checkpoints are phase boundaries, not uncertainty-driven.
- **EXTERNAL_VERIFIER — 1.** ⚠ **Below 2 — remediation named.** No cross-family
  jury was run. The floor is primary and every finding rests on a committed test
  with a control, but P5's advisory jury did not happen. **Remediation: the advisor
  runs the jury at the verification gate, over this report's claims, before merge.**
  Recorded as a gap rather than scored generously.

---

## 11. Compensators

| Action | Undo | Owner |
|---|---|---|
| `feat/c3-space-vocabulary` (either repo) | `git push origin --delete feat/c3-space-vocabulary` | executor |
| Production commits on branches | `git revert` per slice / delete branch | executor |
| Flipped C0/C1 pins + regenerated C0 artifacts | slice-scoped commits; revert restores | executor |
| PRs | **not opened** — per the Director's instruction this cycle | — |

No publish, no tag, no version bump, no deletion, no public-surface edit. Versions
remain 3.8.0 / 4.5.0.

---

## 12. How to re-run

```bash
cd E:/AI/ai-rpg-engine && npm run build && npx vitest run packages/cli/src/c3- packages/content-schema
```

```bash
cd E:/AI/world-forge && npm run build && npx vitest run packages/export-ai-rpg packages/schema
```

The C0 export table and the fixture pack are regenerated by the second command;
the fixture is then copied into `packages/cli/src/__fixtures__/` in the engine
repo, which is a manual cross-repo step and is the one piece of this pipeline a
human has to remember.

---

Related: [[ai-rpg-engine-2p5d-quality-bar]] (§4 Pillar 2 binding, §5 row C3),
[[2p5d-c3-space-vocabulary-kickoff]] (the brief),
[[2p5d-c1-contract-v1-complete]] (the seam this builds on, and the two defects it
left), [[2p5d-c0-alignment-audit-complete]] (the tables this recounts),
[[2p5d-forge-engine-dep-bump-complete]] (the prerequisite; `main` and `latest` are
different engines), [[workflow-standards]],
[[feedback_a_consumer_finds_what_the_producer_cannot]].
