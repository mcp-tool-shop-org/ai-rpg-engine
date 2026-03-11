# Mixed-Game Viability Proof — Writeup

**Date:** 2026-03-11
**Engine version:** 2.3.0
**Verdict:** PASS

---

## What Was Tested

Whether the AI RPG Engine supports multiple distinct playstyles coexisting in one game — sharing one stat model, one combat stack, one world, and one set of encounters — without hacks, per-archetype engine instances, or engine modifications.

---

## Method

Built a concrete mixed-game (`docs/mixed-game-viability-proof.ts`) containing:

- **4 archetypes** with distinct identities (interceptor, caster, skirmisher, commander)
- **1 shared stat mapping** (might / agility / resolve)
- **1 shared resource profile** (momentum)
- **1 engagement configuration** (bodyguard + caster backline)
- **6 encounter zones** (duel, ambush, chokepoint, boss, swarm, escort)
- **12 entities** across all encounter types
- **4 tag-gated abilities** (one per archetype)
- **1 boss with 3 phase transitions** using tag swaps

All wired into a single Engine instance using one call to `buildCombatStack`.

---

## Architecture Findings

### Stat Model

The three-role combat mapping (attack/precision/resolve) cleanly separates the combat axes. Each archetype emphasizes different stats:

| Archetype | might | agility | resolve | wits | Combat Identity |
|-----------|-------|---------|---------|------|-----------------|
| Vanguard  | 8     | 3       | 7       | 2    | High damage + guard, low hit/dodge |
| Sera      | 2     | 6       | 4       | 9    | Low damage, decent evasion, ability specialist |
| Cade      | 5     | 8       | 3       | 5    | Moderate damage, excellent hit/dodge |
| Thane     | 5     | 5       | 7       | 4    | Balanced, best guard absorption |

No archetype dominates. The stat mapping creates natural tradeoffs without engine changes.

Stats beyond the mapping (wits) are available for abilities and non-combat systems. The engine does not restrict stat names to the combat mapping.

### Engagement Roles

The tag-driven engagement system creates distinct positional behaviors:

- **bodyguard tag** → Vanguard intercepts attacks targeting Sera → PROTECTED status
- **caster tag** → Sera gets BACKLINE → -10 hit against her, +15 disengage
- **No engagement tag** → Cade fights freely, standard ENGAGED rules
- **commander tag** → Thane has no special engagement, gates rally ability

Engagement is driven entirely by entity tags and zone tags. No per-archetype configuration required.

### Resource Economy

Momentum flows through all archetypes via the shared profile, but produces different effects:

- Vanguard: gains slowly (low agility → fewer hits), spends for burst damage
- Cade: gains quickly (high agility → frequent hits), spends often
- Sera: drains less (backline reduces incoming damage triggers)
- Thane: rally ability grants momentum to allies (support role)

### AI Behavior Differentiation

The `role:` tag on each entity selects a built-in PackBias that adjusts AI intent scores:

| Role | Key Bias | Behavior |
|------|----------|----------|
| `role:bodyguard` | protect +5, guard +4, attack -2 | Defensive anchor |
| `role:backliner` | guard +3, disengage +5, attack -2 | Cautious ranged |
| `role:skirmisher` | pressure +5, attack +2, guard -3 | Flanking aggressor |
| `role:brute` | attack +5, guard -2, disengage -3 | Relentless hitter |
| `role:boss` | attack +3, guard +3, pressure +3 | Balanced commander |
| `role:minion` | attack +3, pressure +3, guard -5 | Expendable swarm |
| `role:coward` | disengage +8, attack -3, flee at 50% | Runs early |
| `role:elite` | attack +2, guard +2, all-round +2 | Tougher, smarter |

Boss phase transitions swap tags at runtime (e.g., adding `feral` tag at 40% HP), which changes which PackBias applies. No engine modification needed.

### Encounter Variety

Six encounter modes work with the same combat stack:

1. **Duel** — 1 elite in open arena. Pure stat model test.
2. **Ambush** — 2 skirmishers in dark/ambush zone. Ambush tag applies EXPOSED.
3. **Chokepoint** — 1 brute on narrow bridge. Chokepoint tag forces ENGAGED, negating backline.
4. **Boss** — 3-phase lich with tag swaps. Tests phase transitions + multi-archetype party.
5. **Swarm** — 4 goblins (minion/brute/backliner mix). Tests role diversity in enemy group.
6. **Escort** — Protect fragile merchant (coward role) vs 2 bandits. Tests protect + flee AI.

All encounter variety comes from zone tags + enemy composition. No encounter-specific modules.

### Ability System

Tag-gated abilities create archetype-specific actions without per-archetype engine config:

- Shield Slam → requires `bodyguard` tag → only Vanguard can use
- Arcane Bolt → requires `caster` tag → only Sera can use
- Backstab → requires `role:skirmisher` tag → only Cade can use
- Rally → requires `commander` tag → only Thane can use

Abilities use the same Engine, same event bus, same combat pipeline. They emit standard events (`combat.entity.defeated`, etc.) that all modules react to.

---

## Hack Audit

**Workarounds required: ZERO**

Every feature used in the proof is a documented, intentional API surface:

| Feature | API Used | Hack? |
|---------|----------|-------|
| Role-based AI | `EntityState.tags` with `role:` prefix | No |
| Engagement positioning | `CombatStackConfig.engagement` | No |
| Phase transitions | `BossDefinition` with tag swaps | No |
| Archetype abilities | `AbilityDefinition.requirements` | No |
| Resource economy | `CombatStackConfig.resourceProfile` | No |
| Encounter modes | `ZoneState.tags` (ambush/chokepoint/boss) | No |
| Extra stats | `EntityState.stats` with arbitrary keys | No |
| Ally entities | `EntityState.type = 'ally'` | No |
| Escort coward | `role:coward` bias (flee at 50%) | No |

No monkey-patching. No private API access. No engine modifications. No duplicate combat stacks.

---

## Blockers

**Hard blockers: NONE**

The engine architecture supports multi-archetype composition as-is.

**Known limitations (not blockers):**

| ID | Limitation | Impact | Mitigation |
|----|-----------|--------|------------|
| L1 | Single `playerId` | Only one entity acts as player | Swap playerId per turn, or extend submitAction (UI concern) |
| L2 | submitAction hardcodes actorId | Allies act via AI, not player input | Acceptable for NPC allies; party control needs playerId swap |
| L3 | Non-combat stats ignored by formulas | Sera's wits only helps ability checks | Intentional: stat mapping = combat only |
| L4 | Boss tag swaps are additive | Author must track tag state per phase | Content discipline, not architecture gap |
| L5 | Ability vs combat scoring is additive | Strong abilities might dominate basic attacks | Tunable via costs/cooldowns |

None of these prevent the mixed-game from working. L1/L2 are relevant only if the game wants direct player control of all party members (rather than AI-controlled allies), and even then the mitigation is straightforward.

---

## Verdict

**PASS**

The AI RPG Engine supports multi-archetype composition without hacks, engine changes, or per-archetype stacks. Four distinct playstyles coexist in one game with shared stats, shared combat, shared resources, and shared engagement — producing distinct behaviors through tags, stat allocation, and ability requirements alone. Six encounter modes work with the same combat stack and the same party composition.

The architecture claim in the composition guide is validated: **engine = product, starters = examples, composition = the real capability.**
