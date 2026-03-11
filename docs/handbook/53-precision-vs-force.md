# 53 — Precision vs Force

Combat uses three stat dimensions. Each drives distinct mechanics so that a
high-instinct duelist plays differently from a high-vigor bruiser or a
high-will stoic. Default stats (vigor=5, instinct=5, will=3) produce identical
outcomes to prior versions — the system is backward compatible.

## Three Dimensions

| Dimension | Logical Role | Default Mapping | What It Drives |
|-----------|-------------|-----------------|----------------|
| **Instinct** | `precision` | `instinct` | Hit chance, counter reaction, intercept, reposition |
| **Vigor** | `attack` | `vigor` | Damage, guard breakthrough, brace resistance, displacement hold |
| **Will** | `resolve` | `will` | Guard quality, morale resistance, flee thresholds, composure |

All stat reads go through `CombatStatMapping` so pack authors can rename stats
without touching formulas:

```typescript
// Default
{ attack: 'vigor', precision: 'instinct', resolve: 'will' }

// Ronin starter
{ attack: 'discipline', precision: 'perception', resolve: 'composure' }

// Pirate starter
{ attack: 'brawn', precision: 'cunning', resolve: 'sea-legs' }
```

## Per-Mechanic Stat Table

| Mechanic | Stat(s) | Formula | File |
|----------|---------|---------|------|
| Hit chance | precision | `50 + precision * 4` | combat-core |
| Damage | attack | `max(1, floor(attack * 1.5))` | combat-core |
| Guard reduction | resolve | `min(0.75, 0.5 + max(0, (resolve-3)*0.03))` | combat-core |
| Guard counter | precision + resolve | `25 + precision*2 + resolve*2` | combat-core |
| Guard breakthrough | attack vs resolve | `min(25, max(0, (attack - resolve - 2) * 5))` | combat-core |
| Intercept chance | precision | `20 + precision * 2` | combat-core |
| Brace resistance | attack | `min(90, 40 + attack * 6)` | combat-tactics |
| Reposition chance | precision | `40 + precision * 4` | combat-tactics |
| Disengage chance | precision + resolve | `30 + precision*3 + resolve*2` | combat-core |
| Morale mitigation | resolve | `max(0.3, 1 - (resolve-3)*0.1)` | cognition-core |
| Flee threshold | resolve | `max(10, 30 - (resolve-3)*3)` | cognition-core |

## Guard Breakthrough

When a high-vigor attacker hits a guarded target, brute force can stagger
through the defense. The formula uses a `-2` offset so default stats produce
0% — breakthrough only activates when the attacker's vigor significantly
exceeds the defender's resolve.

```
breakChance = min(25%, max(0%, (attackerVigor - defenderResolve - 2) * 5))
```

| Attacker Vigor | Defender Resolve | Break Chance |
|---------------|-----------------|-------------|
| 5 | 3 | 0% (default) |
| 7 | 3 | 10% |
| 8 | 3 | 15% |
| 10 | 3 | 25% (cap) |
| 5 | 5 | 0% |
| 10 | 7 | 5% |

On breakthrough:
- Target gains `OFF_BALANCE` for 1 tick
- `combat.guard.broken` event fires (narrator priority: high)
- Guard was already consumed by the hit

This means a bruiser attacking a low-will guard has two effects: reduced damage
(guard absorbs) plus a chance to stagger for the next round.

## Guard Counter (Updated)

Counter chance now rewards both reaction speed and composure:

```
counterChance = 25 + precision*2 + resolve*2
```

| Precision | Resolve | Counter % |
|-----------|---------|-----------|
| 5 | 3 | 41 (default) |
| 8 | 3 | 47 |
| 3 | 7 | 45 |
| 8 | 7 | 55 |

A slow-but-composed entity (low instinct, high will) is less reactive than
before. A fast reflexed entity (high instinct) gains counter advantage.

## Brace Resistance

Braced entities resist `OFF_BALANCE` application. The stabilize chance now
scales with vigor (physical force to hold ground):

```
stabilizeChance = min(90%, 40 + vigor * 6)
```

| Vigor | Stabilize % |
|-------|-------------|
| 2 | 52 |
| 5 | 70 (default) |
| 7 | 82 |
| 10 | 90 (cap) |

Chokepoint bonus (+15%) stacks on top. Config override via
`braceStabilizeChance` is preserved.

## Hit Style

Each hit event carries a `hitStyle` field comparing the attacker's vigor and
instinct:

| Condition | hitStyle |
|-----------|---------|
| precision > attack | `precise` |
| attack > precision | `forceful` |
| equal | `balanced` |

Narration modules can use this to differentiate descriptions (e.g. "delivers
a precise strike" vs "lands a crushing blow").

## AI Dimension Awareness

The combat intent scorer adds dimension-aware contributions when stats exceed
the default value of 5. At default stats, all bonuses are zero.

| Scorer | Stat | Factor | Formula |
|--------|------|--------|---------|
| Attack | attack > 5 | `vigor_advantage` | `min(5, (attack-5)*3)` |
| Pressure | attack > 5 | `force_pressure` | `min(5, (attack-5)*2)` |
| Reposition | precision > 5 | `precision_advantage` | `min(5, (precision-5)*3)` |
| Brace | attack > 5 | `force_hold` | `min(5, (attack-5)*2)` |

The scoring context also tracks `dominantDimension` (`force` / `precision` /
`composure`) based on whichever stat is highest.

## Balance Guardrails

1. **Default parity**: vigor=5, instinct=5, will=3 produces identical outcomes
   to the pre-dimension system. No existing pack behavior changes.
2. **Caps**: Guard breakthrough maxes at 25%. Brace resistance maxes at 90%.
   AI dimension bonuses max at +5.
3. **No new states**: The system uses existing `OFF_BALANCE` and `GUARDED`.
   No new combat states or engagement states were added.
4. **Offset buffers**: Breakthrough uses a -2 offset. AI bonuses only activate
   above stat 5. These prevent edge-case activation at default values.

## Pack Author Guidance

To create stat-differentiated enemies:

```yaml
# Bruiser — high vigor, low instinct
entities:
  - id: ogre
    stats: { vigor: 8, instinct: 3, will: 3 }
    # AI prefers attack (vigor_advantage), brace (force_hold)
    # Hits hard but misses often, can break guard

# Duelist — high instinct, low vigor
  - id: fencer
    stats: { vigor: 3, instinct: 8, will: 3 }
    # AI prefers reposition (precision_advantage)
    # Hits often, counters reliably, low damage

# Stoic — high will, moderate vigor
  - id: sentinel
    stats: { vigor: 5, instinct: 5, will: 7 }
    # High guard quality, resists morale loss, hard to break
    # Guards reduce 56% damage (vs 50% default)
```

Stat differentiation is additive — you can combine it with pack biases,
engagement states, and zone positioning for layered tactical identity.
