# Contract v1 — the wire, the intake seam, and the load gate

**Cycle:** second rung of the 2.5D arc ([[ai-rpg-engine-2p5d-quality-bar]] §5, row C1).
**Shape:** specification first, code second. This document is written before the
implementation so the contract is reviewable as a contract rather than inferred
from a diff. Where a decision rests on a measurement, the measurement is cited —
C0's tables are the evidence base, not this author's recollection.

| | |
|---|---|
| ai-rpg-engine | v3.8.0, `3da148d`, branch `feat/c1-contract-v1` |
| world-forge | v4.5.0, `7bd7a38`, branch `feat/c1-contract-v1` |
| Baselines re-measured at HEAD | engine **330 files / 6507 tests** green · world-forge **131 files / 2392 tests** green |
| Evidence base | [`../c0-alignment/REPORT.md`](../c0-alignment/REPORT.md) · [`intake-table.json`](../c0-alignment/intake-table.json) · [`reverse-table.json`](../c0-alignment/reverse-table.json) · [`version-skew.json`](../c0-alignment/version-skew.json) |

---

## 0. Re-grounding — the brief's §3 citations, checked at HEAD

The C1 brief states it is testimony, not ground truth, and asks to be re-verified.
All nine citations hold. Two carry a correction worth recording.

| Claim | Verdict at `3da148d` |
|---|---|
| `ResolvedEvent` is already tick-indexed — `core/src/types.ts:198-209` | ✅ exact. **Correction:** the brief's field list (id, tick, type, payload, tags, visibility, presentation, causedBy) omits `actorId` and `targetIds`, both present. Ten fields, not eight. |
| `buildNarrationPlan` — `presentation/src/builder.ts:241` | ✅ exact line |
| Single-stream `SeededRNG` (mulberry32) — `core/src/rng.ts:22` | ✅ exact line; `class SeededRNG` opens at 22 |
| `WorldStore.addZone(zone: ZoneState)` — `core/src/world.ts:451-453` | ✅ exact |
| The loader reaches only `cli validate` | ✅ `loadContentFromFile` has exactly one non-test importer: `cli/src/validate.ts:18` |
| `PackEntry` has no content field | ✅ `pack-registry/src/types.ts:97-108` — `meta`, `manifest`, `ruleset`, `districts?`, `createGame`. Nothing else. |
| `ZoneState` requires `roomId` | ✅ `core/src/types.ts:157`, non-optional |
| No Phase-7A JSON-RPC bridge code in this repo | ✅ zero matches for `json-?rpc` across `packages/*/src`. The sidecar is built fresh. |
| Both repos green at the pins | ✅ re-measured, exact match on both counts |

**A second correction, load-bearing for §3 of this document.** The brief and the
C0 report both speak of resolving module ids against "the engine's registry."
There is no such registry. Module ids are string literals inside factory
functions (`modules/src/combat-core.ts:69`), and the only place an id becomes
knowable at runtime is `ModuleManager`, after a pack has registered its modules.
§3.2 builds the gate on that fact rather than on a registry that would have to be
invented and would then drift — which is the exact failure `DEFAULT_MODULES`
already demonstrates.

---

## 1. What C1 builds, in one paragraph

Two seams. **Content → runtime:** a converter and an `applyContentPack` entry
point so an authored world can boot, closing the gap C0 proved four ways
(REPORT §3.3). **Sim → client over a process boundary:** a JSON-RPC sidecar so a
renderer that is not a terminal can exist, which is what C4's diorama needs.
Guarding both: a four-check load gate, because a seam that accepts anything is
the silent-pass the audit measured (REPORT §3.1). Determinism survives both
crossings or C1 has not shipped.

**What C1 does not build.** The condition vocabulary stays closed. Typed hazards,
entry gates and `economyProfile` remain C3 (REPORT §9). The one grammar item C1
touches is the garbled exit condition, because it is a *compile* of an existing
parser, not new vocabulary.

---

## 2. The boot contract — content into a code-supplied pack

**Decided, on evidence, before any code** (RG-C1 Lane 1, 8 sources): a pack stays
a function. `PackEntry.createGame(seed?) => Engine` remains the host for modules,
rulesets, closures and event wiring; the wire carries declarative content *into*
the world that code builds.

The audit is what makes this concrete rather than stylistic. C0's reverse table
(REPORT §4) inventories what a pack expresses in code today — module selection
and per-module config, rulesets, hazard condition/effect closures, event
subscriptions, presentation rules, AI intent `evaluate` functions, and
pack-local engine modules such as `starter-merchant/src/contract-core.ts`. A
content-only pack would need a data vocabulary for all of it. C3 shrinks that
residue; C1 does not pretend it is already gone.

### 2.1 The API

```ts
applyContentPack(engine: Engine, pack: ContentPack, options?): ApplyContentPackResult
```

Applied to an engine the pack code has already booted. It never constructs an
engine, never registers modules, and never runs pack code — it routes validated
declarative content into an existing `WorldStore`.

`ApplyContentPackResult` reports, per the instrument discipline:

| Field | Meaning |
|---|---|
| `ok` | false if any content was refused |
| `applied` | counts per channel, by id |
| `dropped` | **every field the converter did not carry, named** — the differ pattern from C0's export table, moved into production |
| `errors` | structured `{ path, message }`, never a raw throw |

`dropped` is the load-bearing field. C0's headline failure mode was not that data
was lost; it was that data was lost *silently* while an instrument reported
`losslessPercent: 100` (REPORT §1). A converter that drops without reporting
rebuilds that failure inside the engine.

### 2.2 The `ZoneDefinition → ZoneState` converter

The first converter, and `roomId` is its first decision. C0 measured the field as
`stored-inert` — 0 of 12 worlds moved, zero readers (REPORT §3.2). The store
requires it; the definition has no such field.

**Decision: derive it at the converter, `roomId = zone.id`.** Not authorable, not
removed. Removing it is an engine type change touching every starter for a field
no rule reads — out of C1's scope and listed under engine-hygiene in REPORT §9.
Deriving costs one line and keeps the store's invariant true.

The per-field mapping, and the evidence for each:

| `ZoneDefinition` | → `ZoneState` | C0 verdict (REPORT §3.2) |
|---|---|---|
| `id` | `id` | alive — every lookup keys on it |
| `name` | `name` | stored-inert (presentation); 11/12 narration-only |
| `tags` | `tags` (default `[]`) | **alive** — 8 sim / 3 narration / 1 none |
| `neighbors` | `neighbors` (default `[]`) | **alive** — 11/12 |
| `light` | `light` | **alive** — 12/12 |
| `noise` | `noise` | **alive** — 12/12 |
| `hazards` | `hazards` | alive only via pack closures — see below |
| `interactables` | `interactables` | stored-inert, 0/12 |
| — | `roomId` | **derived** = `id` |
| — | `stability` | **not authorable.** Alive (4/12) and has no definition field. Left unset; C1 does not add the field (REPORT §6.1, engine-hygiene in §9). |
| — | `authority` | not authorable, 0 readers |
| `description`, `exits`, `entities` | not zone state | `exits` has no `ZoneState` counterpart and nothing evaluates a zone `ConditionSpec` (REPORT §2) |

**The hazard honesty note, carried into the code.** C0's sharpest measurement:
adding `'unstable floor'` moves starter-fantasy because a pack closure matches
that string at `setup.ts:137`; adding `'loose cobbles'` moves nothing in any of
the twelve worlds (REPORT §3.2). Hazard strings carry no engine semantics. The
converter therefore carries `hazards` faithfully **and the result reports that
carried hazard strings are inert unless a pack closure matches them** — a
carried-but-inert channel, not a win. Typed hazards are C3.

### 2.3 The three cheap channels

`districts`, `buildCatalog` and `progressionTrees` arrive in shapes the engine
genuinely understands and are rejected only by `ContentPack`'s key list — wire
gaps, not vocabulary gaps (REPORT §3.1, and §6.3 where the brief's "eight unknown
keys" summary is corrected precisely because it hid this distinction). They join
the declared key list and route to their existing engine consumers.

The advisor's recorded ruling stands: these were held back from being a pre-C1
errand because closing the key list alone buys nothing a player can feel. They
land here, inside the cycle that gives "reaches a runtime" its meaning.

The remaining unknown keys stay unknown, and now fail loudly (§3.4): `items`,
`playerTemplate`, `encounterAnchors`, `factionPresences`, `pressureHotspots` —
the last three with zero hits repo-wide, `playerTemplate` likewise (REPORT §6.4).

---

## 3. The load gate — four checks, hard failures, diff-style reports

Today a pack stamped `engineVersion: '2.0.0'` passes 3.8.0's validators clean and
a pure nonsense key produces a byte-identical load report to `districts`
(REPORT §3.1). Acceptance is not comprehension. RG-C1 Lane 3 (8 sources) settles
the posture: unknown input fails loudly (RFC 9413), version claims are
machine-checked (Factorio's `factorio_version`, Confluent), ranges beat single
ints (Minecraft `pack_format` → supported range, 1.21.9), and content is hashed
(Factorio mod checksums, Paradox ironman).

All four are **hard failures**. All four produce a **diff-style report** — what
was expected, what arrived, what to do.

### 3.1 `engineVersion` as a semver range

The manifest carries a range (`">=3.8.0 <4.0.0"`); the gate checks the running
engine satisfies it. A bare version string is accepted as the exact-match range
for backward compatibility with existing packs *and reported as an advisory*,
because a bare `'2.0.0'` is what let the skew hide (REPORT §5, item 2).

Zero-dep house style holds: a bounded internal range checker, comparator sets
only (`>=`, `>`, `<=`, `<`, `=`, `-` ranges, `||` unions). No eval, no regex
backtracking on user input, termination by construction — the same safety bar
Lane 2 sets for conditions.

### 3.2 Module-id resolution against the running engine

**Not against a static registry.** §0 established there is none; inventing one
recreates the drift that produced nine phantom ids (REPORT §5, item 3).

The gate resolves every `manifest.modules` entry against
`engine.moduleManager.getModules()` — the modules actually registered by the pack
code that booted this engine. This is a resolution against reality, and it has
three properties a static list would not:

1. **It kills the phantom-9.** A manifest naming `movement-core` is refused
   because the engine registered `traversal-core`.
2. **It accepts pack-local modules.** `starter-merchant` ships its own
   `contract-core` (REPORT §4). A static engine catalog would refuse a
   legitimate pack; the running engine knows about it.
3. **It cannot drift**, because there is nothing to keep in sync.

Unknown id → error naming the id, listing the registered ids, and suggesting the
closest match by shared stem and edit distance over the registered set. The
suggester recovers `rumor-core → rumor-propagation` (shared stem); it does *not*
recover `movement-core → traversal-core` or `npc-ai-core → cognition-core`, which
share no surface. That ceiling is stated rather than papered over with a
hardcoded alias table — the forge is fixed at the source (§5.1) so those two
never reach the gate.

`@ai-rpg-engine/core` additionally exports `ENGINE_MODULE_IDS`, the catalog of
module ids the engine *ships*, for producers like world-forge that must name
modules without a running engine. Its drift guard boots all twelve starters,
unions their registered module ids, and asserts every one is either listed or
declared pack-local. **Stated ceiling:** a shipped module no starter activates
cannot be caught by that test. It is a subset proof, not an equality proof, and
it is written that way on purpose rather than claimed as more.

### 3.3 A content hash over sim-affecting data

The manifest records `contentHash` over the pack's sim-affecting subset —
canonical JSON (sorted keys, stable array order), SHA-256. Verified at load;
mismatch is refused. Paradox's shape: hash what affects the simulation, not the
whole file, so a comment or an asset path does not invalidate a save.

The hashed subset is exactly the keys that reach a runtime after §2 — the intake
channels. Presentation-only and re-import channels are excluded and the exclusion
list is part of the contract, not an implementation detail.

### 3.4 A top-level key allowlist

Unknown top-level key → error listing the allowlist. This replaces the silent
pass-through C0's nonsense-key control measured.

Allowlist = `ContentPack`'s ten declared keys + `districts`, `buildCatalog`,
`progressionTrees` (§2.3) + `schemaVersion` (a real emitted key, declared rather
than tolerated).

**Compatibility posture.** The gate is opt-in at the loader boundary: `validate`
and `applyContentPack` run it; `loadContent` keeps its current permissive
behaviour for callers that only want structural validation. Strictness arrives
where a pack claims to be loadable *into a world*, which is the boundary that
did not exist before this cycle.

### 3.5 The raw-`TypeError` hole

Six of ten declared keys have no shape guard and raw-throw from `validateRefs`
(REPORT §3.1). The gate's own boundary discipline cannot rest on a validator that
throws, so the guard extends to all ten. This closes a pinned finding, and the
pin flips in the same commit (§7).

---

## 4. The wire — JSON-RPC sidecar

RG-C1 Lane 4 (8 sources) plus charter §3 (RG-A, binding). One authoritative sim
process; clients render and never decide.

### 4.1 Transport and framing

JSON-RPC 2.0 over stdio, `Content-Length` framed (LSP's framing — chosen because
it is unambiguous over a byte stream and every client ecosystem already has a
reader for it). Launch is first-class; **attach** is designed into the framing
now — the framing layer is transport-agnostic over a duplex byte stream, so a
socket implementation is a constructor argument, not a redesign.

### 4.2 `initialize` — capabilities, not version numbers

DAP's lesson. The handshake exchanges capability flags (`preview`, `hashes`,
`replay`, `snapshot`), so a partial client and a fuller server interoperate
without either bumping a protocol number.

### 4.3 Commands in — strict

Unknown method → JSON-RPC error. Unknown *field* on a known method → error, not
ignored. RFC 9413 applied asymmetrically and deliberately: a silently dropped
command field is a divergent simulation, which is the one failure a deterministic
core cannot absorb.

### 4.4 Events out — tolerant, additive-only

Tick-stamped **notifications**, never request/response for derived state
(matklad's critique of LSP's core defect). Clients never gate tick advancement
(Screeps). The event schema is additive-only from day one, with a reserved
graveyard for removed fields (protobuf practice) started in this cycle.

### 4.5 Snapshot = delta-from-empty

Quake 3's shape: the snapshot is produced by the *same* serializer as incremental
updates, against an empty baseline. One code path, so snapshot and stream cannot
diverge.

### 4.6 Per-tick state hashes

Every tick notification carries a state hash. Clients detect staleness and
**never correct the sim** (AoE/SupCom, charter §3.3). Values crossing the
boundary are quantized so the process boundary cannot introduce float drift
(Overwatch, charter §3.2).

---

## 5. The forge side

### 5.1 The manifest tells the truth

`convertManifest` currently emits `engineVersion: '2.0.0'` and eighteen module ids
of which nine do not exist (REPORT §5). Repaired: a real range, twelve real ids
(nine correct, three near-misses remapped `movement-core → traversal-core`,
`npc-ai-core → cognition-core`, `rumor-core → rumor-propagation`, six phantoms
dropped — `faction-core`, `leverage-core`, `pressure-core`, `relationship-core`,
`arc-core`, `endgame-core`), and a `contentHash`.

`EB-011`'s comment — "DEFAULT_MODULES must stay in sync with the engine module
registry" — becomes a test asserting `DEFAULT_MODULES ⊆ ENGINE_MODULE_IDS`. A
comment asking a human to remember is what produced nine phantoms.

### 5.2 Exit conditions get compiled, not stringified

`convert-zones.ts:48` places a whole SpawnCondition-grammar string into
`ConditionSpec.type` with `params: {}` — the audit's single `carried-garbled` row
(REPORT §2). The repo's own `parseSpawnCondition` already returns
`{ type: 'has-item', params: { id: 'rope' } }` and is never called. It gets
called. An unparseable condition becomes a warning naming the zone and the exit,
not a silently malformed spec.

This is a *compile* of an existing closed grammar into an existing wire shape —
Lane 2's ink pattern — not vocabulary growth. Entry gates, typed hazards and
`economyProfile` stay C3.

### 5.3 The fidelity report stops claiming 100% from zero observations

`summarizeFidelity` returns `losslessPercent: 100` when `total === 0`
(`fidelity.ts:101`), and only one converter is wired to the export-side collector
— so the export result reports 100% lossless on an export that drops 194 fields
(REPORT §1).

**Smallest honest fix:** with zero observations the percentage is not 100, it is
unmeasured. `losslessPercent` becomes `null` and the summary carries `observed:
false`. Consumers that print a number print "unmeasured". Wiring every converter
to the collector is the real repair and is *not* C1's job — the brief's ANDON
applies and is honoured: this cycle makes the instrument stop lying, and records
the remaining work rather than doing it.

---

## 6. Determinism through the wire — the exit gate

Charter §6.1. Proven, not asserted:

1. **Byte-identical replay** — one starter session, in-process vs over the wire:
   identical event stream and identical end-state hash.
2. **Idempotent re-emission** keyed to `(tick, event id)` — replay a tick window
   twice, same result (GGPO).
3. **Staleness detection** fires on a doctored hash.
4. **Preview is side-effect-free** — state hash before == after (Into the Breach).
5. **Per-domain RNG audit, measured** — who consumes which stream. `rng.ts:22` is
   a single `SeededRNG`; the charter's audit item stands. If the audit recommends
   splits they land behind a same-seed control with before/after documented,
   because splitting streams is a determinism-visible change.

Each property ships a RED control in the same commit. A gate that has only ever
passed proves nothing ([[feedback_proof_gates_that_cant_fail_prove_nothing]]).

---

## 7. The pinned-test flip rule

C0's instruments are written to fail when a finding is fixed. Closing a finding
without flipping its pin in the same commit is a defect, not a green.

| C0 pin | Closed by | Flips to |
|---|---|---|
| boot gap — no converter exists | §2.2 | the converter exists and produces a storable zone |
| `SILENT PASS` — 9 unknown keys preserved unmentioned | §2.3 + §3.4 | 3 declared, the rest refused by name |
| nonsense key loads byte-identically | §3.4 | refused, listing the allowlist |
| raw `TypeError` on 6 of 10 keys | §3.5 | structured error on all ten |
| `DEFAULT_MODULES` phantom-9 | §5.1 | zero phantoms; subset assertion |
| `engineVersion: '2.0.0'` unread | §3.1 + §5.1 | a range, checked |
| exit condition `carried-garbled` | §5.2 | `carried-lossless` |
| `losslessPercent: 100` on a 194-drop export | §5.3 | `null` + `observed: false` |

The C0 REPORT gains a dated addendum listing what closed, so the report stays
true rather than going quietly stale.

---

## 8. Scope boundary

**In:** the intake seam, the load gate, the sidecar, preview, the RNG audit, the
conformance harness, the forge-side manifest/condition/fidelity repairs above.

**Out, and routed to the advisor if tempted:** C2 combat-feel substrate · C3
vocabulary (typed hazards, entry gates, `economyProfile`, quests) · any visual
client (C4 is the Director's fork) · Motif binding (C6) · engine-hygiene items
not on C1's path (`authority`, `RoomDefinition` removal, `stability`
authorability, `EntityBlueprint.type` enum, starter comment fixes) · npm
publishes, version bumps, public-surface edits.
