# Mixed-Game Hardening Report

**Date:** 2026-03-11
**Baseline:** v2.3.0 + mixed-game viability proof (PASS)
**Test files:**
- `packages/modules/src/hardening.test.ts` — 37 unit-level tests
- `packages/modules/src/golden-scenarios.test.ts` — 20 integration tests (real engine harness)

---

## Purpose

The viability proof established that four archetypes can coexist in one engine instance using documented APIs. This report tries to **break** that claim by targeting every weak spot in the hardening checklist (items #1–#11).

---

## 1. Party Control Debt (#1)

**Question:** Can allies act? Is playerId coupling an architecture blocker?

**Result: PASS — architecture supports it, ergonomics need work**

| Test | Outcome |
|------|---------|
| `submitAction` hardcodes playerId | Confirmed — always uses `store.state.playerId` |
| `processAction` accepts any actorId | Confirmed — allies can act via `dispatcher.createAction()` |
| Party turn via playerId swap | Works — swap `store.state.playerId`, call `submitAction` |

**Key finding:** The engine has TWO action paths:
- `submitAction(verb)` — convenience method, hardcodes playerId, source: 'player'
- `processAction(action)` — general method, accepts any actorId and source

Party control IS possible today via `processAction`. The limitation is UX, not architecture. A game wanting party turns can either:
- Swap `playerId` each turn (simple, tested)
- Use `processAction` with per-ally actions (flexible, tested)

### Finding: No high-level party orchestration helper

**Severity:** LOW
**Description:** Authors must manually create actions for non-player party members using `dispatcher.createAction()`. No `submitPartyAction(entityId, verb)` helper exists.
**Impact:** Boilerplate for games wanting party control. Not a blocker.
**Recommendation:** Add `submitActionAs(entityId, verb, options?)` convenience method.

---

## 2. Multi-Resource Coexistence (#2)

**Question:** Can two distinct resource identities (e.g., `momentum` + `focus`) coexist without collision?

**Result: PASS**

| Test | Outcome |
|------|---------|
| Dual-resource formula wrapping | Both resources wrap independently |
| Momentum spend does not drain focus | Confirmed — resources are namespace-independent |
| Focus spend does not drain momentum | Confirmed |
| AI modifiers from both resources apply independently | attack +10 from momentum, guard +8 from focus |
| Entity with only one resource ignores the other | No error, no phantom spend |
| Entity with neither resource gets base values only | No bonus, no error |
| Multiple spends on same action from different resources | Both fire: +2 from momentum, +3 from focus = +5 total |
| Spend at exactly the cost threshold | Succeeds (5 >= 5) |
| Spend one below cost | Fails gracefully, resource untouched |
| Guard reduction stacking capped at 0.90 | Confirmed — cannot exceed 90% absorption |
| Resource at 0 — drain floor | Confirmed — floors at 0, never negative |
| Resource at 100 — gain cap | Confirmed — caps at 100, never exceeds |

**Key mechanism:** Resources are keyed by `resourceId` string in `entity.resources[resourceId]`. The engine treats each as an independent namespace. `withCombatResources` iterates all spends per action — multiple resources on the same action stack additively.

### Finding: Resource cap is hardcoded to 100

**Severity:** LOW
**Impact:** An author who wants a resource capped at 10 must rely on low gain amounts.
**Recommendation:** Consider adding optional `maxResource` to `CombatResourceProfile`.

---

## 3. Archetype Stress Tests (#3)

**Question:** Do degenerate party compositions break combat formulas?

**Result: PASS**

| Composition | Outcome |
|-------------|---------|
| All-brute party (3 high-might, low-agility) | Valid hit chances (5–95 clamped), valid damage |
| All-backliner party (3 casters, no bodyguard) | Valid — everyone gets BACKLINE but no PROTECTED |
| Zero-might entity | Minimum 1 damage (floor in formula) |
| Extreme stat asymmetry (1 vs 20) | Hit clamped to 5–95% range |
| Same-resource entities in same zone | Independent tracking (A spends, B unaffected) |

**No degenerate composition produces invalid values or errors.** Formula clamping (5–95 hit, min 1 damage, 0–0.90 guard reduction) prevents pathological outputs.

---

## 4. Encounter-Mode Verification (#4)

**Question:** Do different encounter modes produce different system activation?

**Result: PASS**

| Encounter Mode | Systems Verified |
|----------------|-----------------|
| Duel (open arena) | `action.declared`, `combat.contact.hit`/`miss`, `combat.damage.applied` |
| Chokepoint (narrow bridge) | Zone tag `chokepoint` recognized, engagement forced |
| Guard | `combat.guard.start`, `combat:guarded` status applied |
| Disengage | `combat.disengage.success` or `combat.disengage.fail` |
| Boss (phase transitions) | `boss.phase.transition` fires on HP threshold, tags swap |

**Integration tested with real `createTestEngine` harness**, not mocked. Each encounter mode produces qualitatively different event patterns.

---

## 5. Ability-vs-Combat Scoring (#5)

**Question:** Can abilities dominate AI behavior and erase the tactical triangle?

**Result: PASS — but with a MEDIUM finding**

### Architecture

`selectNpcCombatAction()` and `selectNpcAbilityAction()` are **completely separate advisory functions**. Neither calls the other. They return independent scores and recommendations.

**Controls preventing ability spam:**
1. **Cooldowns** — hard gate, abilities unavailable for N ticks after use
2. **Resource costs** — soft gate, depletes the ability's fuel over time
3. **Readiness checks** — hard gate, must meet tag requirements + resource + cooldown

### Finding: No unified decision layer

**Severity:** MEDIUM
**Description:** There is no `unifiedDecision()` function that compares ability scores against combat intent scores. The caller must decide which advisor to use per entity turn. A naive caller that always checks abilities first could over-use them.
**Impact:** Not a bug — the engine is correctly factored into independent advisors. But authors building AI controllers need to explicitly orchestrate the merge.
**Recommendation:** Add a `selectBestAction(entity, world, config)` that:
1. Calls both `selectNpcAbilityAction` and `selectNpcCombatAction`
2. Compares top scores
3. Returns the winner with an explanation

---

## 6. Tag-Discipline Audit (#6)

**Question:** Do tag namespaces collide?

**Result: PASS — no collisions found**

### Canonical Tag Taxonomy

| Namespace | Prefix | Examples | Used by |
|-----------|--------|----------|---------|
| Role tags | `role:` | `role:brute`, `role:boss`, `role:elite` | `combat-intent`, `combat-roles`, interception |
| Companion tags | `companion:` | `companion:fighter`, `companion:healer` | Interception bonuses |
| Engagement tags | *(none)* | `bodyguard`, `ranged`, `caster` | `engagement-core` |
| Pack bias tags | *(none)* | `assassin`, `samurai`, `feral`, `beast` | `combat-intent` AI |
| Zone tags | *(none)* | `chokepoint`, `ambush_entry` | `engagement-core` |
| Status semantic tags | *(none)* | `buff`, `debuff`, `fear`, `poison` | `status-semantics` |
| Custom tags | *(none)* | `human`, `commander`, `civilian` | Ability requirements |

### Finding: No tag prefix enforcement for engagement or bias tags

**Severity:** LOW
**Impact:** Currently zero — no overlap exists. Convention-enforced only.
**Recommendation:** Add lint/validation or prefix convention.

---

## 7. Boss Phase Safety (#7)

**Question:** Do boss phase transitions handle edge cases safely?

**Result: PASS**

| Test | Outcome |
|------|---------|
| Removing a tag that doesn't exist | No-op, no error |
| Adding a tag that already exists | No duplicate |
| Rapid sequential phase transitions | Correct final state |
| Phase that removes AND adds same tag | Re-added, exactly once |
| Empty phases array | Module creates without error |
| Duplicate thresholds | `validateBossDefinition` warns |
| Threshold above 1.0 | `validateBossDefinition` warns |
| Out-of-order thresholds | `validateBossDefinition` warns |

### Finding: Phase tag discipline relies on author memory

**Severity:** LOW
**Recommendation:** `validateBossDefinition` could trace add/remove across phases.

---

## 8. World Portability (#8)

**Question:** Does the same party work in different worlds without changes?

**Result: PASS**

| World | Outcome |
|-------|---------|
| Tundra (frozen pass, chokepoint) | Party attacks, events fire, no errors |
| Desert (dune valley) | Party attacks, events fire, no errors |
| Dungeon (deep cavern, ambush) | Party attacks, events fire, no errors |

**Same party (Vanguard + Sera + Cade + Thane), same combat stack, three completely different worlds.** Zero code changes between worlds.

---

## 9. Author-Facing API (#9)

**Question:** Can an author build a mixed game using only public APIs?

**Result: PASS**

| Check | Outcome |
|-------|---------|
| `buildCombatStack` is a public export | Yes |
| `createBossPhaseListener` is a public export | Yes |
| `createAbilityCore`/`createAbilityEffects` are public exports | Yes |
| `traversalCore`/`statusCore` are public exports | Yes |
| Only 3 packages needed | `@ai-rpg-engine/core`, `@ai-rpg-engine/modules`, `@ai-rpg-engine/content-schema` |
| `buildCombatStack` wraps all internals | Yes — authors don't need `buildCombatFormulas`, `withEngagement`, etc. |

### Finding: cognition-core is a hidden dependency

**Severity:** LOW
**Description:** `combat-recovery` depends on `cognition-core`, which isn't obvious. Authors using `buildCombatStack` must also include `createCognitionCore()` in their module list, or the engine throws at construction time.
**Impact:** Error message is clear ("depends on cognition-core which is not registered"), but it's a stumble point.
**Recommendation:** Either auto-include `cognition-core` in `buildCombatStack` output, or document it prominently.

---

## 10. Golden Scenario Suite (#10)

**Question:** Do locked integration scenarios produce stable, repeatable results?

**Result: PASS — 20 integration tests, all green**

| Scenario | Tested |
|----------|--------|
| Mixed-party attack (player + ally) | Both produce `action.declared` events |
| Guard-then-attack sequence | Guard applies status, enemy attack interacts with it |
| Resource gain on hit | Momentum increases after successful attacks |
| Multi-turn combat (40 actions) | Engine stable, no crashes, entities persist |
| Party control via processAction | Ally acts independently of playerId |
| Party control via playerId swap | submitAction respects swapped player |

All scenarios use the real `createTestEngine` harness with actual module wiring (traversalCore, statusCore, cognitionCore, full combat stack).

---

## 11. Release Truthfulness Gate (#11)

### Hard Questions

| Question | Answer | Evidence |
|----------|--------|----------|
| Can multiple archetypes coexist in one game without hacks? | **YES** | Viability proof: 4 archetypes, 1 engine, 1 combat stack, 0 workarounds |
| Can one world support multiple encounter modes? | **YES** | Golden scenarios: duel, chokepoint, guard, disengage, boss all in one engine |
| Can one party use more than one resource logic safely? | **YES** | Hardening: dual-resource (momentum + focus) with independent gain/spend/drain |
| Can one player control model support the intended game style? | **PARTIAL** | `processAction` supports any actor, but no high-level party orchestration |
| Can authors build this with public docs and APIs? | **YES** | 3 packages, 1 entry point (buildCombatStack), all exports are public |
| Are the remaining limitations honestly documented? | **YES** | L1–L5 in viability proof, F1–F7 in this report |

### Remaining Limitations (Honestly Documented)

| ID | Description | Class | Status |
|----|-------------|-------|--------|
| F1 | Resource cap hardcoded at 100 | Author ergonomics | **RESOLVED** — `resourceCaps` added to `CombatResourceProfile` |
| F2 | No tag prefix enforcement | Convention risk | **RESOLVED** — `tag-taxonomy.ts` with `validateEntityTags()`, `classifyTag()` |
| F3 | Boss phase tag discipline is author-responsibility | Content discipline | **RESOLVED** — `validateBossDefinition()` now traces tag add/remove across phases |
| F4 | Multiple role tags picks first | Edge case | **RESOLVED** — documented deterministic precedence, `validateEntityTags()` warns |
| F5 | No party orchestration helper | UX convenience | **RESOLVED** — `engine.submitActionAs(entityId, verb, options)` added |
| F6 | No unified ability+combat decision layer | AI architecture gap | **RESOLVED** — `selectBestAction()` in `unified-decision.ts` with advantage threshold |
| F7 | cognition-core is a hidden combat-stack dependency | Documentation gap | **RESOLVED** — `buildCombatStack()` now auto-includes `createCognitionCore()` |

---

## Summary

### All Verdicts

| # | Checklist Item | Verdict |
|---|----------------|---------|
| 1 | Party control debt | **PASS** → **RESOLVED** (`submitActionAs` added) |
| 2 | Multi-resource coexistence | **PASS** |
| 3 | Archetype stress test | **PASS** |
| 4 | Encounter-mode verification | **PASS** |
| 5 | Ability-vs-combat scoring | **PASS** → **RESOLVED** (`selectBestAction` merge layer) |
| 6 | Tag-discipline audit | **PASS** → **RESOLVED** (tag-taxonomy + validation) |
| 7 | Boss phase safety | **PASS** → **RESOLVED** (cross-phase tag tracing) |
| 8 | World portability | **PASS** |
| 9 | Author-facing API | **PASS** → **RESOLVED** (cognition-core auto-included) |
| 10 | Golden scenario suite | **PASS** (21 integration tests) |
| 11 | Release truthfulness gate | **PASS** (all findings resolved) |

### Overall Verdict

**All 11 checklist items pass. All 7 findings (F1–F7) have been resolved.** Post-hardening cleanup adds: unified decision layer, party orchestration helper, tag taxonomy/validation, boss phase guardrails, configurable resource caps, cognition-core auto-inclusion.

---

## Test Coverage

| File | Tests | Type |
|------|-------|------|
| `packages/modules/src/hardening.test.ts` | 37 | Unit (formula-level, adversarial edge cases) |
| `packages/modules/src/golden-scenarios.test.ts` | 21 | Integration (real engine harness, full module wiring) |
| `packages/modules/src/unified-decision.test.ts` | 16 | Unit (unified decision merge, threshold, variety) |
| *Existing combat tests* | 1022 | Unit (all module test suites) |
| **Total** | **1096** | **All passing** |
