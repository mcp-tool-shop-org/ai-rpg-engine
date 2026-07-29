# C1 — The Contract v1

**Cycle:** second rung of the 2.5D arc ([[ai-rpg-engine-2p5d-quality-bar]] §5, row C1).
**Shape:** BUILD. Production code in both repos. No publishes, no tags, no version
bumps, no public-surface edits, no deletions.

| | |
|---|---|
| ai-rpg-engine | v3.8.0, branch `feat/c1-contract-v1`, from `3da148d` |
| world-forge | v4.5.0, branch `feat/c1-contract-v1`, from `7bd7a38` |
| Suites | engine **330 → 338 files / 6507 → 6684 tests** · world-forge **131 → 132 files / 2392 → 2403 tests** |
| Artifacts | [`CONTRACT.md`](CONTRACT.md) · [`e2e-transcript.md`](e2e-transcript.md) · [`rng-audit.json`](rng-audit.json) |

---

## 1. The headline

**Content reaches a runtime, and the wire crosses a process boundary without
losing determinism.**

C0 measured a content path that was a validator, not a loader — 0 of 12 exported
keys reached a running world — and a sim whose only presentation consumer was a
terminal calling it in-process. Both are now false, and both are proven by
measurement rather than by assertion:

- The byte-identical world-forge export **boots**. A played session through the
  CLI's own round loop runs in a world whose zones arrived through
  `applyContentPack`, the player walks ALL THREE exported zones (asserted, each entered more than once),
  and `noise`, `neighbors` and `tags` measurably move the simulation on
  converted content.
- A scripted session runs **over a real process boundary** against a spawned
  sim, and its event stream is **byte-identical** to the in-process run — 15
  events, 1818 serialized bytes, same end-state hash.
- The old pack is now **REFUSED**, with a diff report, by a four-check gate.

Three numbers carry the cycle: **1 of 3** "cheap wire gaps" turned out to be
routable, **0 of 12** shipped packs draw from the RNG stream the charter asked
about, and **5 of 5** conformance properties hold through the wire with a RED
control each.

---

## 2. The intake seam

`applyContentPack(engine, pack, options)` routes validated declarative content
into a world that pack CODE has already built. The boot contract was decided on
evidence before any code (CONTRACT.md §2, RG-C1 Lane 1): a pack stays a function.

**The converter.** `ZoneDefinition → ZoneState`, with `roomId` **derived** as the
zone id — the store requires it, the definition has no counterpart, and C0
measured it `stored-inert` in 12 of 12 worlds (REPORT §3.2). `stability` is
deliberately left unset: alive (4 of 12) and unauthorable, which is a schema
change, not a wire change.

**The contract that makes it more than a converter:** every field not carried is
NAMED in the result, with a closed reason vocabulary (`no-runtime-field`,
`needs-module-vocabulary`, `inert-without-pack-code`, `session-scoped`). C0's
headline failure was not lost data — it was data lost SILENTLY while an
instrument reported `losslessPercent: 100` on a 194-field drop. A converter that
drops without reporting rebuilds that failure one layer down and passes a suite
that only checks what it carried.

**Hazards are carried AND reported inert.** C0's sharpest measurement, re-confirmed
on converted content in both directions: adding `'unstable floor'` moves
starter-fantasy because a pack closure matches it; adding `'loose cobbles'` moves
nothing, anywhere. Hazard meaning is JavaScript the pack ships. Typed hazards are
C3; C1 does not paper over the gap.

### 2.1 A correction to the brief and to C0

**The "three cheap wire gaps" are not one class.** C0 filed `districts`,
`buildCatalog` and `progressionTrees` together as "the cheapest thing on this
whole list to close" (REPORT §3.1), and the C1 brief carried that forward as three
channels to route. The claim is exactly right about SHAPE and wrong about
INGESTION — and C1's own definition of "real" (reaches a runtime) is what exposes
the difference:

| Key | Verdict | Why |
|---|---|---|
| `districts` | **routable** | district-core reads its definitions from world state (`district-core.ts:212`), so a post-boot write lands and every reader sees it. Measured: 2 districts applied, authored `commerce: 55` live in district state, `zoneToDistrict` wired. |
| `progressionTrees` | **session-scoped** | progression-core closure-captures its tree `Map` at construction (`progression-core.ts:70-72`) and never reads trees from world state. A post-boot write cannot reach it. |
| `buildCatalog` | **session-scoped** | consumed by character creation before a session exists, not by any world reader. |

The last two are not dead and not dropped. `extractSessionContent(pack)` is the
seam that serves them — read before constructing modules — and
`applyContentPack` reports them rather than pretending. All three still join the
declared key list; that half of C0's finding was correct and is closed.

---

## 3. The load gate

Four checks, hard failures, diff-style reports, and a RED control **plus** a GREEN
control per check. A gate that has only ever refused is as unproven as one that
has only ever passed.

| Check | Mechanism | RED control |
|---|---|---|
| `engineVersion` | semver RANGE vs the running engine; bare version accepted as exact match **and advised against** | a stale range, the literal C0 `'2.0.0'`, and an unparseable range each refused |
| module ids | resolved against `engine.moduleManager.getModules()` — the modules a booted pack actually registered | each of C0's nine phantoms refused by name |
| content hash | SHA-256 over the sim-affecting subset, stamped by the exporter | a tampered pack refused |
| key allowlist | closed list; unknown keys refused, listing the allowlist | C0's `thisKeyIsNotAThing` refused |

**Module resolution is live, not a catalog.** There is no "engine module
registry" — §0 of CONTRACT.md records that correction. Module ids are string
literals inside factory functions; the only place an id is knowable at runtime is
`ModuleManager`, after a pack registers. Resolving against the running engine has
three properties a static list would not: it kills the phantom-9, it **accepts a
pack-local module** (starter-merchant's `contract-core`, which a static catalog
would wrongly refuse — asserted), and it cannot drift, because there is nothing
to keep in sync.

**Honesty in the report itself.** Checks that could not run print
`⚠ NOT VERIFIED` with the reason, never under `✓ passed`. The first version
printed `✓ passed: engine-version (not verified)` — a tick beside a check that
never ran is the same class of claim as `losslessPercent: 100` from zero
observations.

**The gate refuses BEFORE it mutates.** A gate that refuses after half the pack
has landed is not a gate; asserted.

### 3.1 What the forge now emits

`engineVersion: '>=3.8.0 <4.0.0'` (in both places the stale `'2.0.0'` literal
lived), twelve real module ids, and a `contentHash`. Nine phantoms removed: six
dropped outright, three remapped (`movement-core → traversal-core`,
`npc-ai-core → cognition-core`, `rumor-core → rumor-propagation`). `EB-011`'s
comment asking a human to keep the list in sync is replaced by a test.

Zone exit conditions **compile** through the repo's own `parseSpawnCondition` —
the audit's single `carried-garbled` row. All three fixture forms verified:
`item:rope → has-item{id}`, `party-level:>=10 → party-level{op,value}`,
`flag:x → has-flag{id}`.

### 3.2 The before/after pair

[`e2e-transcript.md`](e2e-transcript.md) sits beside C0's. Same pack, same
command: C0 recorded `✓ Content valid … exit 0`; C1 records `Content pack
REFUSED`, with three of four checks failing against the manifest the exporter
used to write.

**The pack still fails on five keys after every repair, and that is correct.**
`items`, `playerTemplate`, `encounterAnchors`, `factionPresences` and
`pressureHotspots` are genuinely unknown to the engine — the last three with zero
hits repo-wide. Declaring them would be inventing vocabulary, which is C3's work.
The gate names them instead of preserving them in silence.

---

## 4. The wire

`@ai-rpg-engine/sidecar` + `ai-rpg-engine sidecar <pack-id>`. LSP framing and
topology, DAP capabilities instead of a protocol version, matklad's tick-stamped
push instead of request/response for derived state, Quake 3's
snapshot-as-delta-from-empty over the SAME serializer, per-tick state hashes,
additive-only events with the reserved graveyard started on day one.

**Strict in, tolerant out** (RFC 9413, applied asymmetrically). Unknown method
refused; unknown FIELD on a known method refused, naming the field. Ignoring one
would mean the sim executed a different intent than the client submitted, with
nothing able to detect the difference. Events only gain fields, and a client that
narrows to the four it knows is proven to lose nothing.

**Attach is designed in, not promised.** `stdio.ts` is the only module that names
a transport, and it takes its streams as arguments. A socket server is the same
two calls with a different pair of streams.

---

## 5. Conformance — C1's exit gate

A scripted six-step session, run in-process and over a spawned child process,
compared.

| Property | Result | RED control |
|---|---|---|
| Event stream byte-identical | ✅ 15 events, 1818 bytes | a doctored stream is caught |
| End-state hash matches | ✅ | a doctored state hashes differently |
| Re-emission idempotent | ✅ replaying a window twice is stable | replaying a DIFFERENT window differs |
| Client rebuilds from patches alone and agrees | ✅ | — |
| Staleness detection fires | ✅ honest mirror agrees, doctored mirror caught | (both directions in one test) |
| Values quantized | ✅ every number survives round-trip; no NaN/Infinity | — |

Every one spawns a real child process. An in-memory stream pair would test the
protocol and skip the boundary, and the boundary is the part that has never
existed before this cycle.

---

## 6. The RNG audit — the charter's question was the wrong question

The standing audit item read: *"today's rolls consume the world seed; verify
stream separation meets this bar."* The obvious reading of `rng.ts:22` (one
`SeededRNG`) and `world.ts:362` (one per store) is "a single shared stream that
needs splitting."

**Measured across all twelve shipped packs, playing the pinned 40-round session
with the store's RNG instrumented at `next`/`int`/`pick`: ZERO DRAWS.** Nothing
in production consumes it. It is constructed, serialized as `rngState`, restored,
and never advanced — dormant state, the "unproduced" class from v3.8's three ways
to be dead.

What the engine does instead:

- `combat-core.simpleRoll` is a **pure hash** of `(tick, attackerId, targetId,
  seed)`. Its docstring says why: a stateful stream would couple every roll to
  global draw ORDER, so one extra NPC turn would shift all later rolls and break
  stateless-per-tick replay.
- `targeting.deriveRng` builds a **fresh `SeededRNG` per `(worldSeed, tick,
  salt)`**, salt = source/ability id. That IS per-domain separation with an
  avalanched seed — the charter's bar, reached by derivation rather than by
  holding N stream objects.

**Recommendation: no split. There is nothing to split.** The bar is met by
construction, and all three properties are asserted behaviourally (same-seed
identity, different-seed divergence, and 500 client-side draws leaving end state
byte-identical). The honest follow-up is engine-hygiene, not C1: `WorldStore.rng`
is serialized dormant state — give it a consumer or retire it.

A grep would have produced the opposite recommendation. Full data:
[`rng-audit.json`](rng-audit.json).

---

## 7. ⚠ The honesty ledger — nine times the instrument or the author was wrong

C0 logged ten. An audit with no entries here is an audit that did not check
itself; a build cycle with none is worse.

1. **`light` measured INERT on converted content, and my hypothesis about why was
   REFUTED.** I asserted `'simulation'` on C0's 12/12 verdict and got `'none'`. I
   then hypothesised the cause — `light`'s reader takes `observer.zoneId`, and
   the exported entities carry no `zoneId` (verified: all three lack the field,
   `EntityBlueprint` has no location field at all) — so nobody stands in a
   converted zone. **That hypothesis is refuted.** Placing an AI observer there
   does not make it alive, and neither does a CONTROLLED placement re-pinning the
   observer every round for all 40 (a one-shot placement is not a placement: the
   sim relocates NPCs, which was the second wrong version). The session emits zero
   perception events start to finish. What the test claims now is only what was
   measured, and the C3 lesson is that carrying a field is necessary and not
   sufficient — a rule needs the REST of its inputs, and the exported vocabulary
   supplies none of them.

2. **The CONTROL for that finding was itself wrong** — the third mistake from one
   field. It darkened host zones inside the CONVERTED session, where the player is
   relocated into the exported subgraph and never returns, so nothing exercised
   light anywhere and it would have "proved" the probe blind. The valid control
   reproduces C0's own session shape.

3. **Both converters ALIASED their source arrays** (`tags: def.tags ?? []`).
   Invisible through `applyContentPack` because `addZone` structuredClones — so
   the "store detaches" test was passing for the STORE's reason, not the
   converter's. These functions are exported and callable without a store.

4. **A pin defined by SUBTRACTION drifted.** C0's raw-`TypeError` test derived its
   subject by subtracting guarded keys from `ENGINE_DECLARED_KEYS`, so declaring
   four new keys silently grew the "gap" from 6 to 10 and failed it for a reason
   unrelated to raw throws. A pin whose subject is defined by subtraction moves
   whenever anything else moves.

5. **Widening the shape guard did not close the raw-`TypeError` hole.**
   `loadContentFromFile` called `validateGameContent` UNCONDITIONALLY afterward,
   so a pack whose shape had already been refused was still handed to
   `pack.abilities?.map(...)` and threw anyway. The fix I first wrote was correct
   and insufficient, and only running the flipped pin showed it.

6. **`canonicalize` hashed `undefined`-valued keys as `null`**, but
   `JSON.stringify` drops them — so a hash computed before serialization could
   never match one computed after, which is the hash's only job. The forge stamped
   `c078…` and the engine computed `d053…` for byte-identical content. Found by
   the cross-repo equivalence test, which is exactly why that test exists.

7. **`satisfiesRange(">=1.0.0 ||")` returned TRUE.** The first alternative matched
   and returned before the malformed empty one was ever parsed. At a gate that
   turns "does this parse?" into "did I happen to match before I noticed?".

8. **My own arg parser dropped the file path.** With no `--manifest`,
   `manifestIdx` is `-1`, so `manifestIdx + 1` is `0` and index 0 was filtered out
   as the flag's value. The first run of the new command printed
   "Missing <file.json>".

9. **`preview` returned `submitAction`'s return value**, which for `look` is an
   EMPTY array while the log grows by two. Most verbs resolve into the log rather
   than back through the return, so a preview built on the return value silently
   under-reports exactly the outcomes a player would want telegraphed. It reads
   the log delta now.

**And two process errors, not instrument errors:**

- I committed P4 without re-reading lint output and shipped a `prefer-const`
  error through a gate whose whole value is being zero. Fixed in the following
  commit, and named here rather than quietly amended.
- **I ran the local gates I knew about and called the chain green.** Build,
  typecheck, typecheck:tests, lint, tests, docs-integrity — all green locally,
  and CI went red anyway on a stage I had not run: the **packaging gate**, which
  requires every publishable workspace's tarball to carry LICENSE and README.md.
  The new `@ai-rpg-engine/sidecar` package had neither. This is exactly the class
  v3.8's ledger names — "ran 4 of 8 CI stages and called the chain green" — and I
  cited that line in an earlier commit message *in this cycle* while doing it.
  Knowing the failure mode by name is not the same as checking. The fix is
  mechanical (the package gets its LICENSE and README); the lesson is that
  "green locally" means green on the gates you remembered.

**A tenth, worth separating because it is a near-miss rather than an error:** the
conformance harness compares the in-process stream against the wire stream using
the sidecar's OWN `toWireEvent`. An earlier draft hand-copied that mapping into
the test — which would have compared a serializer against a copy of itself and
proven nothing about the serializer.

---

## 8. Cross-family jury

Eight claims, each stated as a single falsifiable assertion with measured ground
truth attached and the author's reasoning stripped (jurors judge evidence, not
arguments). Two runs, because the first panel came back degraded.

| Run | Panel | Result |
|---|---|---|
| 1 | `deepseek-v4-pro:cloud` (DeepSeek) · `glm-5.2:cloud` (Z.ai) · `kimi-k2.7-code:cloud` (Moonshot) | **8/8 CONFIRMED, 0 refuted.** 2 of 3 seats served — Moonshot returned markdown-fenced output the parser rejected and was **EXCLUDED, not silently counted**. |
| 2 | `minimax-m3:cloud` (MiniMax — a fourth disjoint family) | 6 claims re-judged, **6/6 individually CONFIRMED**. Aggregate reads NEEDS_REVIEW because a single-juror panel is weak by construction — a lone confirm decides nothing, the same rule that stops a lone dissent deciding. |

**Net: three disjoint families (DeepSeek, Z.ai, MiniMax) each individually
confirmed every claim they judged. Zero refutations across 22 individual juror
verdicts.** The formal aggregate for the primary run is 8/8 CONFIRMED on 2 of 3
served seats — reported as degraded rather than rounded up, because a panel that
loses a seat and says 3/3 is the failure this whole cycle is about.

**Disposition: advisory, floor-primary.** No finding in this report rests on the
jury. Every one rests on a committed test, and the honest ceiling stands — a
CONFIRMED on frontier-model-authored claims is weak evidence, not proof. C0's
jury earned its keep through a correct DISSENT; this one produced none, which is
worth strictly less.

---

## 9. SCOPING INPUT for the advisor

**Not a next-cycle mandate.** Grouped by shape, not priority.

### C2-shaped (combat-feel substrate)

The wire is ready for it. `ResolvedEvent` already carries `presentation`,
`visibility`, `tags` and `causedBy`; the sidecar delivers them tick-stamped with
per-tick hashes and a working preview. C2's timing-window events, published
intents and per-hit semantic events are **new event types on an existing
contract**, not new plumbing.

### C3-shaped (vocabulary)

- **Typed hazards remain the highest-value single item**, and C1 sharpened why: a
  carried hazard string is provably inert without pack code, measured on
  converted content in both directions. No data format can express hazard meaning
  today.
- **Entity placement is the newly-sharp gap.** `EntityBlueprint` has no `zoneId`,
  so an exported pack knows every NPC and where none of them stand. C1's seam
  reports it on every intake.
- **Five pack keys remain genuinely undeclared** (`items`, `playerTemplate`,
  `encounterAnchors`, `factionPresences`, `pressureHotspots`). The gate names
  them; giving them meaning is vocabulary work.
- **`progressionTrees` and `buildCatalog` need a construction-time seam in the
  pack contract**, not a world write — C1 supplies `extractSessionContent` and
  documents the boundary, but a pack that wants exported trees still has to wire
  them by hand.
- The SpawnCondition grammar now has ONE intact channel (exits). Entity
  `spawnCondition` and entry gates remain unrouted.

### Engine-hygiene (small, independent)

- **`WorldStore.rng` is dormant serialized state** — the new item, measured this
  cycle. Give it a consumer or retire it.
- Carried from C0 and still open: `authority` (zero readers, unauthorable),
  `roomId` (now derived, still read by nothing), `RoomDefinition`,
  `EntityBlueprint.type` as a bare string, `stability` unauthorable.

### world-forge-side

- **The engine dependency ranges are still 2.x** (`@ai-rpg-engine/core` 2.0.1,
  `modules` 2.1.0, `pack-registry` 2.0.2) against a 3.8.0 engine — C0 checklist
  item 1, still open. It is why the forge cannot boot an engine to resolve module
  ids, and why the content hash is a deliberate duplicate defended by a cross-repo
  equivalence test. **Bumping it is the single highest-value forge-side item**,
  and it deletes the duplicate.
- Wiring all eight converters to the export-side fidelity collector. C1 stopped
  the instrument lying (`null` + `observed: false`); it did not make it measure.

---

## 10. How to re-run

```bash
cd E:/AI/ai-rpg-engine && npm run build && npx vitest run packages/cli/src/c1- packages/sidecar packages/content-schema/src/intake.test.ts
```

```bash
cd E:/AI/world-forge && npx vitest run packages/export-ai-rpg/src/__tests__/
```

Every artifact in this directory is regenerated by those commands. All probes are
seeded and pinned (`seed 71`, 40 rounds, all 12 packs). No wall-clock, no
`Math.random`, no environment reads anywhere in the cycle's code.
