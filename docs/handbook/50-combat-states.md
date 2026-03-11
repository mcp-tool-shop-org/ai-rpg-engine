# Chapter 50: Combat States — The Four-State Doctrine

## Design Constraint

Exactly four visible combat states. No status zoo. Each state has a single tactical role, a clear counter, and predictable duration. If a pack needs genre-specific effects, use resources and abilities — not new combat states.

## State Reference

### GUARDED (`combat:guarded`)

**Role:** Short-horizon defense. Absorb the next hit.

| Property | Value |
|----------|-------|
| Duration | 2 ticks |
| Applied by | guard action, brace action |
| Cleared by | absorbing a hit, attacking (self-clear), disengaging (self-clear), outflanked by reposition, tick expiration |
| Hit chance | No direct modifier |
| Damage | 50-75% reduction (scales with resolve stat) on first hit, then clears |
| Counter | 30-48% chance to apply OFF_BALANCE to attacker (scales with resolve) |
| AI response | Attack -10 (avoid), Reposition +20 (outflank opportunity) |

**Key behavior:** Guard absorbs exactly one hit. The damage reduction scales with the resolve stat: base 50%, increasing by 3% per point of resolve above 3, capped at 75%. After absorbing, GUARDED clears automatically. Attacking or disengaging also clears own GUARDED — you cannot defend and act offensively simultaneously.

### OFF_BALANCE (`combat:off_balance`)

**Role:** Tempo punishment. You overcommitted and lost your footing.

| Property | Value |
|----------|-------|
| Duration | 1 tick |
| Applied by | counter (attacking into a guarded target, 30-48% chance) |
| Cleared by | guard (stabilization), brace (stabilization), successful untargeted reposition, tick expiration |
| Hit chance | -15 as attacker, +10 as target |
| Damage | +1 damage taken |
| Reposition | -20 penalty to success chance |
| AI response | Brace +25 (strong recovery signal), Reposition -15 (risky while unstable), Attack +8 vs off-balance enemy |

**Key behavior:** OFF_BALANCE is the rarest state — it only comes from the counter mechanic when you attack into a guarded target. Braced entities resist OFF_BALANCE application with 70% chance. The primary recovery is brace (AI strongly prefers it at +25), though guard also clears it.

### EXPOSED (`combat:exposed`)

**Role:** One-time vulnerability window. You're open and everyone knows it.

| Property | Value |
|----------|-------|
| Duration | 1 tick |
| Applied by | failed disengage, failed reposition, being outflanked by reposition |
| Cleared by | successful untargeted reposition, damage consumed (auto-clears after being hit) |
| Hit chance | +20 as target |
| Damage | +2 damage taken, then auto-clears |
| AI response | Attack +15 (high-value target), Guard +20 (self-recovery), Brace +15 (self-stabilize), Finish +10 |

**Key behavior:** EXPOSED is consumed by damage — the first hit against an exposed target gets the full bonus (+20 hit, +2 damage), then EXPOSED clears. This makes it a one-shot vulnerability, not a lingering debuff. Multiple attackers competing for the same exposed target only benefit one attacker.

### FLEEING (`combat:fleeing`)

**Role:** Escape commitment. You're running and vulnerable to pursuit.

| Property | Value |
|----------|-------|
| Duration | 2 ticks |
| Applied by | successful disengage (entity moves to neighbor zone) |
| Cleared by | tick expiration only |
| Hit chance | +10 as target |
| Damage | No direct modifier |
| Cognitive lock | Entity can ONLY disengage while fleeing (all other intents suppressed) |
| AI response | Attack +5 (pursue), Finish +20 (priority elimination target) |

**Key behavior:** FLEEING is the only state with cognitive suppression — a fleeing entity is locked into disengaging until the state expires or they successfully exit the zone. This makes fleeing a commitment, not a free escape. Enemies see fleeing targets as high-priority finisher candidates (+20 finish scoring).

## State Interaction Matrix

States can overlap. Here's what happens:

| Combination | Result |
|-------------|--------|
| GUARDED + EXPOSED | Both active. Guard absorbs the hit (with reduction), but EXPOSED bonus still applies. After absorb, both clear. |
| GUARDED + OFF_BALANCE | Both active. Entity is guarded but unstable. Guard still absorbs, but the entity's own attacks suffer -15 hit chance. |
| EXPOSED + OFF_BALANCE | Both active. Entity is extremely vulnerable: +20 hit, +10 hit (from off-balance as target), +2 damage, +1 damage. Brace recovers off-balance; untargeted reposition recovers exposed. |
| FLEEING + any | FLEEING dominates: cognitive lock forces disengage regardless of other states. Other states still apply their passive modifiers but the entity cannot act on recovery options. |

## Internal Flags vs Visible States

`RoundFlags` in combat-tactics are per-entity per-tick tracking flags. They are NOT visible combat states:

| Flag | Purpose | Lifetime |
|------|---------|----------|
| `braced` | Grants displacement resistance, enables OFF_BALANCE resistance (70%) | Cleared at tick start |
| `guarding` | Tracked for counter effect timing | Cleared at tick start |
| `attemptedDisengage` | Prevents double-disengage in one tick | Cleared at tick start |
| `attemptedReposition` | Prevents double-reposition in one tick | Cleared at tick start |

These flags exist for cross-referencing within a single tick. They don't appear in the entity's `statuses` array and are invisible to the narrator and AI intent system.

## Pack Author Rules

1. **Do not add combat states.** Four is the cap. If you need pack-specific effects, use resources (crowd-favor, ki, bloodlust) and abilities (focused strike, blood frenzy).

2. **Resources can resist states.** Use `resistState` and `resistChance` in `ResourceSpendModifier` to let genre resources interact with the state system without adding new states.

3. **Resources can modify state effects.** Use `TacticalHooks.preAction` and `defenseModifier` to change how states behave for specific packs without adding states.

4. **Test your AI.** Run `selectNpcCombatAction()` with your pack biases and verify enemies respond sensibly to all 4 states.

## Narration

The `combat-state-narration` module enriches status events with description text routed to the narrator channel:

| Event | GUARDED | OFF_BALANCE | EXPOSED | FLEEING |
|-------|---------|-------------|---------|---------|
| Applied | "{name} raises their guard" | "{name} is thrown off balance" | "{name} is left exposed" | "{name} breaks away and flees" |
| Removed | "{name} guard drops" | "{name} recovers their footing" | "{name} is no longer exposed" | "{name} stops fleeing" |
| Expired | "{name} guard stance fades" | "{name} steadies themselves" | "{name} regains composure" | "{name} slows their retreat" |

The module is optional. Combat works without it, but narrators receive no state change text without it registered.

## Module Registration

```typescript
import { createCombatStateNarration } from '@ai-rpg-engine/modules';

const engine = createEngine({
  modules: [
    statusCore,
    createCombatCore(formulas),
    createCombatTactics(),
    createCombatStateNarration(), // optional, adds narrator text
  ],
});
```

---

## See Also

- [Combat Overview](49a-combat-overview.md) — The six pillars and how they fit together
- [Combat Tactics](49-combat-tactics.md) — The five actions that produce these states
- [Zone Positioning](51-zone-positioning.md) — Engagement states (ENGAGED, PROTECTED, BACKLINE, ISOLATED)
- [Precision vs Force](53-precision-vs-force.md) — How stats drive guard counter and breakthrough
- [Defeat Flow](52-defeat-flow.md) — Morale cascade into FLEEING
