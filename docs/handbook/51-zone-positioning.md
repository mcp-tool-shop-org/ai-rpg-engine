# Chapter 51: Zone-Local Positioning

## Design Constraint

No grid. No hexes. No distance tracking. Positioning is zone-based: entities occupy zones, zones have neighbors, and engagement statuses describe where you are relative to the fight. Four engagement states, two battlefield tags, and deterministic formula modifiers. If a pack needs richer spatial effects, use resources and abilities — not new engagement states.

## Engagement State Reference

### ENGAGED (`engagement:engaged`)

**Role:** In melee contact. You're trading blows.

| Property | Value |
|----------|-------|
| Applied by | combat hit (both attacker and target), entering a chokepoint zone |
| Cleared by | successful disengage, entity defeated, zone re-evaluation |
| Hit chance | +5 as target (easier to hit in melee) |
| Disengage | -15 penalty (harder to break free) |
| Reposition | -10 penalty (restricted movement) |
| AI response | Guard +5, Brace +10, Reposition targets backline enemies |

**Key behavior:** ENGAGED is the default melee state. Any successful hit puts both sides into ENGAGED. Chokepoint zones force ENGAGED on entry regardless of combat contact. ENGAGED entities can intercept attacks on BACKLINE allies.

### PROTECTED (`engagement:protected`)

**Role:** Shielded by an ally. A bodyguard is absorbing threat.

| Property | Value |
|----------|-------|
| Applied by | ally with `bodyguard` tag in same zone |
| Cleared by | protector defeated, protector leaves zone, outflank |
| Guard reduction | +10% bonus (better defensive posture) |
| Intercept chance | +15% (bodyguard actively screening) |
| AI response | Brace +8 (protecting allies) |

**Key behavior:** PROTECTED requires an active bodyguard-tagged ally in the same zone. When the protector is defeated or leaves, PROTECTED clears automatically. Outflank (successful targeted reposition) also removes PROTECTED.

### BACKLINE (`engagement:backline`)

**Role:** Ranged or support position. You're not in the thick of it.

| Property | Value |
|----------|-------|
| Applied by | entity with `ranged` or `caster` tag, not ENGAGED, zone entry evaluation |
| Cleared by | combat hit (forced into melee), reposition into enemies |
| Hit chance | -10 as target (harder to reach) |
| Damage | -1 as attacker (ranged disadvantage in melee formulas) |
| Disengage | +15 bonus (easier to slip away) |
| Reposition | +10 bonus (freedom to maneuver) |
| AI response | Pressure targets BACKLINE exclusively, Reposition +15 vs backline targets |

**Key behavior:** BACKLINE is for ranged/caster entities who haven't been engaged in melee. It makes them harder to hit but limits their damage output. Any direct hit forces them out of BACKLINE into ENGAGED. BACKLINE entities are priority targets for the `pressure` intent. ENGAGED allies can intercept attacks targeting BACKLINE entities.

### ISOLATED (`engagement:isolated`)

**Role:** Alone. No allies nearby.

| Property | Value |
|----------|-------|
| Applied by | no same-type allies in zone |
| Cleared by | ally enters zone, zone re-evaluation |
| Damage | +2 taken (no one to share the load) |
| Disengage | -10 penalty (no covering fire) |
| AI response | Disengage +10 |

**Key behavior:** ISOLATED is automatically applied when an entity has no same-type allies in their zone. It clears immediately when an ally enters. Defeat of the last ally in a zone triggers ISOLATED on survivors.

## Zone Tags

### Chokepoint (`chokepoint`)

**Role:** Narrow passage. Favors defenders, punishes movement.

| Effect | Value |
|--------|-------|
| Zone entry | Forces ENGAGED status, prevents BACKLINE |
| Disengage | -10 penalty (on top of ENGAGED's -15) |
| Reposition | -15 penalty (no room to maneuver) |
| Brace stabilize | +15% chance (85% instead of 70%) |

**Key behavior:** Chokepoints are defender-friendly zones. Braced defenders at chokepoints are extremely hard to destabilize (+15% stabilize vs off-balance). Movement through chokepoints is punished: disengage takes a -10 penalty and reposition takes -15. The combined effect of ENGAGED + chokepoint on disengage is -25.

### Ambush Entry (`ambush_entry`)

**Role:** Concealed position. First contact favors occupants.

| Effect | Value |
|--------|-------|
| Zone entry (with enemies) | Entering entity gets EXPOSED (duration 1 tick) |
| Zone entry (empty) | No effect |
| Event | `combat.ambush.triggered` emitted |

**Key behavior:** When an entity enters an `ambush_entry` zone and enemies are already present, the entering entity receives the EXPOSED combat state. This grants the ambushers +20 hit chance and +2 damage on the first attack, after which EXPOSED clears. If the entity is already EXPOSED, no duplicate is applied.

## Frontliner Screening

ENGAGED allies can intercept attacks targeting BACKLINE allies in the same zone. This is the "frontliner screens backliner" behavior.

| Condition | Intercepts? |
|-----------|-------------|
| Player is target | Yes (always eligible for interception) |
| BACKLINE ally is target | Yes (ENGAGED allies can screen) |
| Non-backline, non-player target | No |
| Interceptor not ENGAGED | No (only frontliners screen) |

The interception chance follows the same formula as player interception (default 30%, +15 if target is PROTECTED).

## AI Zone Awareness

The AI evaluates exit zone quality when scoring disengage decisions:

| Factor | Score |
|--------|-------|
| Non-chokepoint exit | +5 |
| Exit zone has allies | +5 |
| Exit zone has no enemies | +5 |

Maximum exit quality bonus: +15. The AI also selects the safest neighbor when actually disengaging (prefers non-chokepoint zones with allies).

## Engagement vs Combat States

Engagement states and combat states are separate systems that coexist:

| System | States | Duration | Applied by |
|--------|--------|----------|------------|
| **Combat states** | GUARDED, OFF_BALANCE, EXPOSED, FLEEING | 1-2 ticks, auto-expire | Combat actions (guard, brace, attack, disengage, reposition) |
| **Engagement states** | ENGAGED, PROTECTED, BACKLINE, ISOLATED | Persistent until re-evaluated | Zone composition, entity tags, combat events |

Both systems modify the same formulas (hit chance, damage, disengage chance) additively. An entity can be both ENGAGED and GUARDED, or both BACKLINE and EXPOSED. The effects stack.

## Pack Author Rules

1. **Do not add engagement states.** Four is the cap. Use entity tags and zone tags for pack-specific positioning.

2. **Use entity tags for roles.** Tag entities `ranged`, `caster`, or `bodyguard` to opt into BACKLINE/PROTECTED mechanics.

3. **Use zone tags for terrain.** Mark zones as `chokepoint` or `ambush_entry` in your encounter definitions.

4. **Resources can interact with positioning.** Use `TacticalHooks.movementModifier` to let resources affect reposition/disengage success.

## Module Registration

```typescript
import { createEngagementCore, withEngagement, createEngagementNarration } from '@ai-rpg-engine/modules';

const engine = createEngine({
  modules: [
    statusCore,
    createEngagementCore({ playerId: 'player' }),
    createCombatCore(withEngagement(formulas)),
    createCombatTactics(),
    createEngagementNarration(), // optional, adds narrator text
  ],
});
```

---

## See Also

- [Combat Overview](49a-combat-overview.md) — The six pillars and how they fit together
- [Combat Tactics](49-combat-tactics.md) — Brace at chokepoints, reposition mechanics
- [Combat States](50-combat-states.md) — GUARDED, OFF_BALANCE interact with engagement states
- [Companion Interception](54-companion-interception.md) — PROTECTED boosts interception chance
- [Defeat Flow](52-defeat-flow.md) — Frontline collapse and ISOLATED state
