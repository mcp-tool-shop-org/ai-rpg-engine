# 54 — Companion Interception

Companion interception determines whether an ally steps in to absorb an
attack aimed at a protected target (the player or a backline entity). The
scored formula replaces the old flat `20 + instinct * 2` with a multi-factor
calculation driven by reaction speed, composure, health, morale, combat
state, and role.

## When Interception Fires

1. An attack hits and damage is calculated.
2. The target qualifies for interception (player, or backline when
   engagement-core is loaded).
3. Eligible allies in the same zone are checked in order. An ally is
   eligible when: alive, same zone, `isAlly()` returns true, not FLEEING,
   and either ENGAGED or the target is the player.
4. Each ally rolls against their interception chance. First ally to pass
   absorbs the damage.

## Scored Formula

```typescript
defaultInterceptChance(ally, target, world, statMapping)
```

| Component | Formula | Range |
|-----------|---------|-------|
| Base | `8` | fixed |
| Reaction speed | `floor(instinct * 2.5)` | 0-25 |
| Composure | `max(0, floor((will - 3) * 1.5))` | 0+ |
| Health | `floor(hpRatio * 8)` | 0-8 |
| Critical HP | `-15` when HP < 25% | 0 or -15 |
| Morale | `floor((morale - 50) * 0.15)` | -7 to +6 |
| FLEEING | hard block (returns 0) | 0 |
| OFF_BALANCE | `-10` | 0 or -10 |
| GUARDED | `+8` | 0 or +8 |
| Role bonus | per-tag table below | -12 to +15 |
| **Clamp** | `max(5, min(90, total))` | 5-90 |

At default stats (instinct=5, will=3, full HP, morale=70, no status, no
role), the formula produces **31%** — within 1 point of the old flat 30%.

## Role Bonuses

| Tag | Bonus | Rationale |
|-----|-------|-----------|
| `role:bodyguard` | +15 | Dedicated protector |
| `role:sentinel` | +8 | Defensive specialist |
| `role:brute` | +5 | Physically imposing |
| `role:elite` | +5 | Trained fighter |
| `companion:fighter` | +8 | Combat companion |
| `role:minion` | -5 | Expendable |
| `companion:scout` | -5 | Not built for tanking |
| `companion:smuggler` | -5 | Self-preservation instinct |
| `role:skirmisher` | -8 | Hit-and-run style |
| `companion:healer` | -8 | Avoids frontline |
| `role:backliner` | -10 | Stays behind |
| `companion:diplomat` | -10 | Non-combatant |
| `companion:scholar` | -10 | Non-combatant |
| `role:coward` | -12 | Self-preserving |

Combat role tags (`role:*`) take priority over companion tags
(`companion:*`). If neither is present, the role bonus is 0.

## Balance Tables

**Factor variations from baseline (instinct=5, will=3, full HP, morale=70):**

| Scenario | Old | New |
|----------|-----|-----|
| Baseline | 30 | 31 |
| instinct=7 | 34 | 36 |
| instinct=10 | 40 | 44 |
| will=5 | 30 | 34 |
| HP=50% | 30 | 27 |
| HP < 25% (critical) | 30 | 9 |
| morale=30 | 30 | 25 |
| morale=90 | 30 | 37 |
| FLEEING | 30 | 0 |
| OFF_BALANCE | 30 | 21 |
| GUARDED | 30 | 39 |
| role:bodyguard | 30 | 46 |
| role:coward | 30 | 19 |

**Extreme combinations:**

| Scenario | Chance |
|----------|--------|
| Bodyguard, guarded, will=6, morale=90, instinct=7 | 72 |
| Coward, half HP, morale=20, OFF_BALANCE | 5 (clamp) |

## FLEEING Hard Block

A FLEEING ally never intercepts. This is enforced in two places:

1. **Ally eligibility filter** — FLEEING allies are excluded before rolling.
2. **Formula** — returns 0 if the ally has FLEEING status (defense in depth).

## Engagement Integration

When `engagement-core` is loaded, `withEngagement()` wraps the formula:

- PROTECTED targets get an additional +15 to their allies' interception
  chance.
- The wrapper calls `defaultInterceptChance` (not a flat fallback).
- Total is clamped to [5, 90].

## Narration

The `combat-state-narration` module listens for `combat.companion.intercepted`
and generates narrator-channel text:

- **Standard**: "steps in front of {target}, taking the blow"
- **Heroic** (HP < 30% before interception): "staggers forward to shield
  {target}, barely standing"

Heroic interceptions get `priority: 'high'`.

## AI Cover Awareness

The combat intent scorer estimates interception cover for each enemy:

- Allies with `role:bodyguard` or `role:sentinel` contribute 15 cover.
- `role:brute` or `role:elite` contribute 8.
- `role:coward` or `role:backliner` contribute 2.
- Default allies contribute 5.
- FLEEING allies are excluded.

The AI applies a penalty of `-min(10, floor(cover * 0.6))` to attack scores
against well-covered targets, preferring to target enemies with weaker
interception support.

## Override

Pack authors can fully replace the interception formula:

```typescript
createCombatCore({
  interceptChance: (ally, target, world) => {
    // Custom logic
    return 50;
  },
});
```

When `interceptChance` is provided, the default scored formula is bypassed
entirely. The engagement-core PROTECTED bonus still stacks on top.

## Pack Author Guidance

To create companion archetypes with distinct interception behavior:

```yaml
# Loyal bodyguard — high interception, protects at all costs
entities:
  - id: iron-shield
    tags: [ally, role:bodyguard]
    stats: { vigor: 6, instinct: 7, will: 5 }
    # Interception: ~60% (bodyguard + high instinct + high will)

# Scholar companion — avoids frontline, rarely intercepts
  - id: sage
    tags: [ally, companion:scholar]
    stats: { vigor: 3, instinct: 4, will: 6 }
    # Interception: ~14% (scholar penalty + low instinct)

# Wounded veteran — intercepts heroically at low HP
  - id: old-knight
    tags: [ally, role:sentinel]
    stats: { vigor: 5, instinct: 5, will: 7 }
    # At full HP: ~45%. At critical HP: heroic narration fires.
```

---

## See Also

- [Combat Overview](49a-combat-overview.md) — The six pillars and how they fit together
- [Zone Positioning](51-zone-positioning.md) — PROTECTED state boosts interception
- [Combat States](50-combat-states.md) — FLEEING blocks interception, GUARDED/OFF_BALANCE modify it
- [Defeat Flow](52-defeat-flow.md) — Morale-driven FLEEING disables interception
- [Precision vs Force](53-precision-vs-force.md) — How precision and resolve drive the formula
- [Build a Combat Pack](55-combat-pack-guide.md) — Configuring protectorTags and engagement
