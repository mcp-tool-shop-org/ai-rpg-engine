# Chapter 49: Combat Tactics — The Tactical Triangle

## Design Goal

Make each combat turn ask a real question. Before the tactical triangle, combat was "attack until someone falls." Now every turn presents a meaningful choice between five actions with soft counter relationships.

The triangle creates three axes of pressure:

- **Aggression beats passivity** — attack punishes indecision
- **Preparation blunts aggression** — guard and brace absorb attacks
- **Movement punishes overcommitment** — reposition outflanks static defense

## Core Combat Actions

Five player-facing verbs. All cost 1 stamina.

### attack

Default pressure action. Press damage, force outcomes.

- Best against: exposed, fleeing, off-balance targets
- Weak against: guarded defenders (may cause attacker off-balance)
- Outputs: damage, may apply off-balance on failed attack into guard

### guard

Short-horizon defensive read. Absorb the next hit.

- Grants GUARDED status (duration 2 ticks, clears after absorbing one hit)
- Clears own OFF_BALANCE (stabilization)
- Weak against: reposition (can be outflanked)

### brace

Hold ground against impact and displacement.

- Grants GUARDED status + internal braced flag
- Clears own OFF_BALANCE (stabilization)
- Resists displacement effects (70% chance to negate off-balance)
- Stronger at chokepoints
- Best for: holding position, protecting allies, resisting force

### disengage

Break contact and withdraw.

- On success: move to neighbor zone, gain FLEEING status
- On failure: remain in zone, gain EXPOSED status
- Best for: escaping bad matchups, enabling retreat
- Weak against: enemies pressing attack

### reposition

Move for tactical advantage, not escape.

- Targeted: attempt to outflank a specific enemy
  - Success may expose the target (+60% outflank chance)
  - Breaks target's GUARDED if outflanked
- Untargeted: recover from bad position
  - Success clears own EXPOSED and OFF_BALANCE
- On failure: gain EXPOSED
- Soft-counters static guard; countered by braced defenders (-20% chance)

## Guard vs Brace

Both grant GUARDED, but they serve different tactical roles:

| Aspect | Guard | Brace |
|--------|-------|-------|
| Grants GUARDED | Yes | Yes |
| Clears OFF_BALANCE | Yes | Yes |
| Resists displacement | No | Yes (70% resist) |
| Vulnerable to reposition | Yes (outflanked) | Less so (-20% to enemy reposition) |
| Best at | Absorbing next hit | Holding ground under pressure |
| Chokepoint bonus | No | Yes (reported in events) |

## Combat States

Exactly four visible states. No status zoo.

### GUARDED (`combat:guarded`)

- Harder to damage (50-75% damage reduction based on resolve)
- Gained by: guard, brace
- Lost by: absorbing a hit, attacking (clears own guard), being outflanked by reposition, tick expiration (2 ticks)

### OFF_BALANCE (`combat:off_balance`)

- Reduced hit chance (-15) and defense (+10 to be hit, +1 damage taken)
- Gained by: attacking into a guarded target (30-48% counter chance based on resolve)
- Lost by: guard (stabilization), brace (stabilization), successful untargeted reposition, tick expiration (1 tick)

### EXPOSED (`combat:exposed`)

- Easier to hit (+20 hit chance) and more damage (+2)
- Gained by: failed disengage, failed reposition, being outflanked by reposition
- Lost by: successful untargeted reposition, damage consumed (auto-clears after being hit)

### FLEEING (`combat:fleeing`)

- Vulnerable to pursuit (+10 hit chance against)
- Gained by: successful disengage
- Lost by: tick expiration (2 ticks)

## Soft Counter Relationships

Not rock-paper-scissors. Soft advantages that create texture.

| Action | Soft-counters | Soft-countered by |
|--------|--------------|-------------------|
| attack | disengage, exposed/fleeing targets | guard (off-balance risk) |
| guard | attack (damage reduction + counter) | reposition (outflank) |
| brace | reposition (-20% chance), displacement | careful reposition, withdrawal |
| reposition | static guard (+15% chance) | braced defenders, chokepoints |
| disengage | stalled engagements | pressing attackers |

## Action Resolution Order

1. **Declare intent** — each combatant selects action and target
2. **Initiative / timing** — existing instinct-driven action order
3. **Movement pressure** — resolve disengage, reposition, interception
4. **Attacks and defenses** — resolve attacks with guard/brace modifications
5. **State outcomes** — apply/remove guarded, off_balance, exposed, fleeing
6. **Aftermath hooks** — event hooks for morale, resources, pack effects

## AI Tactical Behavior

Enemy AI uses all five actions via the combat-intent scoring system. Eight intent types are scored: attack, guard, brace, disengage, reposition, pressure, protect, finish.

### AI heuristics

**Attack when:** target is exposed/fleeing, actor has advantage, enemy is finishable

**Guard when:** actor is injured, exposed, or protecting allies

**Brace when:** off-balance (strong +25 bonus), holding chokepoint, exposed (+15), protecting allies, facing displacement

**Disengage when:** low morale, critical HP, isolated, outmatched

**Reposition when:** target is guarded (+20 bonus), target is backline, actor is healthy and free to maneuver, recovering from exposed/off-balance

### Pack biases

All 15 built-in pack biases include `brace` and `reposition` modifiers:

- **Assassin:** reposition +15, brace -15 (mobile, never hunkers)
- **Samurai:** brace +15, reposition -5 (disciplined, holds ground)
- **Feral:** brace -20, reposition +5 (never defends, always pressing)
- **Colonial:** brace +15, reposition -5 (formation fighters)
- **Zombie:** brace -20, reposition -15 (mindless aggression only)
- Others scaled appropriately to archetype identity

## Genre Hook Points

The tactical module exposes `TacticalHooks` for pack-specific resource integration:

```typescript
type TacticalHooks = {
  preAction?: (action, actor, world) => { hitBonus?, damageBonus?, guardBonus?, repositionBonus? };
  defenseModifier?: (defender, action, world) => { damageReduction?, displacementResist? };
  movementModifier?: (actor, action, world) => { successBonus?, exposureReduction? };
  afterAction?: (action, actor, events, world) => ResolvedEvent[];
};
```

Future pack integration examples:

- **Ki** enhances reposition or guard timing via `preAction`
- **Bloodlust** rewards attack chains but punishes disengage via `afterAction`
- **Composure** resists off-balance/exposed outcomes via `defenseModifier`
- **Crowd-favor** rewards risky press plays via `afterAction`

## Round Flags

Internal per-entity per-tick tracking for actions that need cross-reference:

```typescript
type RoundFlags = {
  braced?: boolean;      // grants displacement resistance
  guarding?: boolean;    // tracked for counter effects
  attemptedDisengage?: boolean;
  attemptedReposition?: boolean;
};
```

Flags are cleared at the start of each tick. They are not visible combat states.

## Module Registration

```typescript
import { createCombatCore } from '@ai-rpg-engine/modules';
import { createCombatTactics } from '@ai-rpg-engine/modules';

// Combat tactics is additive — combat-core works without it
const engine = createEngine({
  modules: [
    statusCore,
    createCombatCore(formulas),
    createCombatTactics({ hooks: myPackHooks }),
  ],
});
```

The module is backward-compatible. Packs that only use `attack` continue to work without registering combat-tactics.

## Authoring Guidance for Pack Designers

1. **Start with the triangle.** Every encounter should have at least one enemy that uses non-attack actions.
2. **Use pack biases** to give enemies personality. A feral beast that never guards feels different from a disciplined soldier that braces at chokepoints.
3. **Zone tags matter.** Place `chokepoint` tags on narrow passages to make brace more meaningful. Use positioning to create tactical decisions.
4. **Don't add more states.** Four visible combat states is the cap. If you need pack-specific effects, use resources and abilities, not new combat states.
5. **Test the AI.** Run `selectNpcCombatAction()` with your pack biases and verify enemies make sensible choices.
