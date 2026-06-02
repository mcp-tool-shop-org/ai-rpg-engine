# Feature Architecture — Per-Entity Rules, Status Effects, Targeting

> Research-grounded design lock for three engine layers: per-entity mechanical
> config (the Profile runtime unblocker), the status modifier/trigger system, and
> the ability targeting model. Produced by a study-swarm (parallel research +
> external citation verification) on 2026-06-02. Determinism and composability are
> non-negotiable constraints on every decision here.

## Research grounding (the empirical floor)

Each finding was retrieval-verified (the URL was fetched and the claim checked against the source). Findings whose source could not be confirmed are listed under "Not load-bearing" and are NOT used to justify a decision.

1. **A reusable damage calc captures attributes from Source AND Target separately.** Epic/tranek *GASDocumentation* (2024, `github.com/tranek/GASDocumentation`) — GAS `ExecutionCalculation` reads a backing attribute's value from the `Source` (who created the effect) *or* the `Target` (who received it). **Implication:** the per-entity fix is to resolve attacker stats via the *attacker's* stat mapping and target stats via the *target's* mapping inside ONE formula — not one global mapping. (CR-1)
2. **Stat modifiers aggregate in a single fixed order.** tranek *GASDocumentation* (2024) — ops are `Add`/`Multiply`/`Divide`/`Override`, aggregated as `((Base + Additive) * Multiplicative) / Division`. **Implication:** effective-stat and status-modifier aggregation uses this exact ordered band; sort modifiers by a total stable key first so the result is order-independent and byte-identical.
3. **Snapshot vs live magnitude is an explicit per-effect choice.** tranek *GASDocumentation* (2024) — snapshot = capture at spec creation; non-snapshot = capture at application. **Implication:** DoT/HoT magnitudes default to snapshot (resolved from source at apply-tick, stored on the instance); passive stat modifiers recompute live.
4. **Stacking is a small set of orthogonal policies.** tranek *GASDocumentation* (2024) — aggregate-by-source vs aggregate-by-target, refresh, cap. **Implication:** map our `StatusDefinition.stacking` (`replace`/`stack`/`refresh`) to these; clamp at `maxStacks` BEFORE aggregating.
5. **Composition over inheritance; entities are à-la-carte data.** Nystrom *Game Programming Patterns* — Component + Type Object (2014, `gameprogrammingpatterns.com`). Corroborated by Bevy archetype docs + EnTT wiki (2024). **Implication:** a `RuleProfile` is *data* referenced by id, never a closure/subclass — so saves stay JSON-serializable and byte-identical.
6. **Fixed timestep / integer ticks are the basis of reproducibility.** Fiedler *Fix Your Timestep!* (2004, `gafferongames.com`). **Implication:** all status duration, expiry, and DoT/HoT periods key off the engine tick counter (`appliedAtTick`, `periodTicks`, `durationTicks`) — never `Date.now`.
7. **A mandatory-action loop is resolved by fiat, not left to hang.** *MTG Comprehensive Rules* 104.4b (2026, wizards.com) — a loop of mandatory actions with no exit ends the game as a draw. **Implication:** reactive status triggers run through a per-tick proc queue with a fixed `PROC_DEPTH_LIMIT` and an already-fired signature set; exceeding the cap halts the chain deterministically (no reflect-damage ping-pong hang).
8. **Targeting decomposes into independent orthogonal axes.** *Liquid Fire Tactics-RPG* (2015, `theliquidfire.com`) — Range × Area × EffectTarget as separate swappable pieces; corroborated by GAS Spec/Filter split (tranek 2024) and the 5e SRD valid-target contract (WotC 2016, `5thsrd.org`). **Implication:** `TargetSpec` becomes independent axes `scope` × `affiliation` × `filter` (+ optional area), killing the flat-enum anti-pattern.
9. **Friend/foe is a faction predicate, not a hardcoded type check.** GAS target-data filters (fp12 2020; tranek 2024) — `SelfFilter`/`RequiredActorClass` framework, faction logic left to the game. **Implication:** add a `faction`/team field to `EntityState` + ONE pure `affiliationOf(source, candidate)` predicate; zone-AoE resolves from an origin then runs the affiliation filter (fixes AoE hitting allies).
10. **Utility AI scores every (action,target) and picks max expected utility; considerations multiply.** Graham *Game AI Pro* ch.9 (2013) + Lewis IAUS *Game AI Pro 3* ch.13 (2017), both `gameaipro.com`. **Implication:** extend the existing `scoreAbilityUse` to score per-candidate; selectors (lowestHp, highestThreat) are [0,1] considerations multiplied; default to argmax with deterministic tie-break (lowest entity id); weighted-random is opt-in and consumes ONLY the seeded RNG.

**Not load-bearing (could not be confirmed this run; each architectural point above has a confirmed corroborating source):** PoE two-band damage (poewiki 403 — order carried by finding 2); Pathfinder bonus-typing (aonprd page didn't state the rule — stacking carried by finding 4); Salesforce "16 iterations" (page existed but did not state the number — the depth-cap *pattern* is carried by finding 7; the `PROC_DEPTH_LIMIT` value is an engineering choice); Overwatch GDC ECS (paywalled — "components=data, systems=functions" carried by finding 5).

## Architecture lock

### A. Status modifiers & triggers (consumes the existing `StatusDefinition`)
- **Passive modifiers** → a pure `effectiveStat(entity, statId)` reduce over all active modifiers across all status instances, ordered `((base + Σadd) * mul) / div` (finding 2), modifiers sorted by `(statusId, modifierIndex, sourceId)` (finding 2), stacks clamped at `maxStacks` first (finding 4). Cache; recompute on active-set change.
- **Periodic DoT/HoT** → each instance stores `appliedAtTick`/`periodTicks`/`durationTicks`; fire when `(tick - appliedAtTick) % periodTicks === 0`, expire at `>= durationTicks`; pure integer math (finding 6). Magnitudes default snapshot (finding 3).
- **Reactive triggers** → per-tick FIFO proc context (reset each step) with `chainDepth` + already-fired `Set<(event,source,target,statusId)>`; halt at `PROC_DEPTH_LIMIT` (finding 7).
- New fields: per-modifier `snapshot?`, optional `bonusType?`, `periodTicks?`; one constant `PROC_DEPTH_LIMIT`.

### B. Ability targeting & ally support
- `TargetSpec` independent axes: `scope: 'self'|'single'|'all'`, `affiliation: 'ally'|'enemy'|'any'`, `filter: 'alive'|'dead'|'any'`, optional `area`, `includeSelf?` (finding 8). Back-compat: keep accepting the old flat `type` and map it.
- `EntityState.faction?` + pure `affiliationOf(source, candidate)` (finding 9). Pure `resolveTargets(spec, source, world): EntityState[]` → named selectors (`lowestHp`, `random-N`, …) with deterministic tie-break by entity id (finding 10).
- Heal/buff/revive collapse to ally-targeting abilities: heal = `{scope:single, affiliation:ally, filter:alive, includeSelf:true}`, revive = same with `filter:dead`. Delete `buildHealAbility`'s hardcoded `target:'self'`; add `buildBuffAbility`/`buildReviveAbility`. AI: `scoreAbilityUse` scores per-candidate; "heal most-hurt ally" = `lowestHp` selector pointed at `affiliation:ally` (finding 10).

### C. Per-entity rule resolution (CR-1) — the Profile runtime unblocker
- `WorldState.ruleProfiles?: Record<profileId, RuleProfile>` where `RuleProfile = { statMapping, formulaOverrides? }` — **data, not closures** (finding 5), serialized with state (byte-identical).
- `EntityState.ruleProfileId?`. `getStat(entity, role)` reads the entity's OWN profile's mapping, falling back to `DEFAULT_STAT_MAPPING` (Bevy `Option<T>` default idiom, finding 5).
- combat-core formulas capture **attacker stats via attacker mapping, target stats via target mapping** in one centralized formula (finding 1) — ONE formula set, per-entity variation comes only from the data it reads (finding 1 anti-duplication). Keep the module a pure `(state, action) => events`.
- **Scope note (honest, per the feature audit):** the smallest shippable Profile slice (type + `buildProfile` + `validateProfileSet` + `selectActionForProfile`) differentiates AI scoring + packaging and works TODAY without this change. CR-1 is the change that makes mixed-playstyle *combat resolution* real. It is specced here and grounded; build it as its own slice with a per-entity-resolution regression test (a `might` attacker and a `will` attacker resolve correctly in one fight).

## Determinism guardrails (apply to all three)
- No `Date.now`/`Math.random` in resolution; ticks from the engine counter; RNG only via the seeded `world.rng`.
- Every aggregation/selection sorts/ties-breaks by a total stable key (entity id, then index) so results are byte-identical across platforms and runs.
- All new ids via `genId(world, prefix)` (per-instance counter), never the deprecated global `nextId`.

## Implementation status (this slice)

- **A. Status system — SHIPPED, all three layers live.** Passive modifiers are wired into `combat-core.getStat` (a +stat buff changes a real damage result); periodic DoT/HoT run in the `statusCore` `action.resolved` hook off the tick counter; reactive triggers run in the same hook (seeded from the action's own damage events, depth-capped via `PROC_DEPTH_LIMIT`, re-entry-safe). Proven by an engine-level integration test (a spiked-armor defender reflects damage onto a real attacker).
- **B. Ally targeting & support — SHIPPED.** `TargetSpec` axes + `normalizeTargetSpec` (back-compat with the old flat `type`), `EntityState.faction` + `affiliationOf`, `resolveTargets` + selectors, `buildHealAbility` ally support + `buildBuffAbility`/`buildReviveAbility`, and per-candidate ally AI scoring. Enemy-AoE now spares allies.
- **C. Per-entity rule resolution (CR-1) — DESIGNED, build DEFERRED.** The Profile Phase 1 slice (type + `buildProfile` + `validateProfileSet` + `selectActionForProfile`) SHIPPED and differentiates AI scoring + packaging today. The combat-core per-entity-mapping change is specced + grounded above; build it as its own slice with the per-entity-resolution regression test. The shipped Profile code is explicit that it does NOT yet do per-entity combat resolution (no overclaim).

## Citations
GAS: github.com/tranek/GASDocumentation; dev.epicgames.com GAS docs; fp12.github.io GAS target filters. Nystrom: gameprogrammingpatterns.com (component, type-object). ECS: Bevy docs.rs, EnTT wiki. Determinism: gafferongames.com (Fix Your Timestep). Loop fiat: MTG Comprehensive Rules 104.4b. Targeting: theliquidfire.com tactics-RPG, 5thsrd.org. Utility AI: gameaipro.com (Graham ch.9 2013, Lewis ch.13 2017).
