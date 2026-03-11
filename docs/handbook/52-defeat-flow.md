# 52 — Defeat Flow

When an entity's HP hits zero the engine emits `combat.entity.defeated`. That
single event triggers a cascade of in-combat reactions: morale shifts, tactical
re-evaluation, AI behaviour changes, resource effects, and narration. This
chapter covers the full pipeline.

## Defeat Pipeline

```
hit → HP check → combat.entity.defeated
  ├─ morale cascade (cognition-core)
  │    ├─ will-mitigated delta
  │    ├─ per-tick cap (-20 max)
  │    ├─ combat.morale.shift
  │    └─ flee check → combat.morale.flee / combat.morale.rout
  ├─ zone re-evaluation (engagement-core)
  │    ├─ PROTECTED / ISOLATED / ENGAGED / BACKLINE refresh
  │    └─ frontline collapse → combat.frontline.collapsed
  ├─ AI defeat awareness (combat-intent)
  │    ├─ allyDefeatedRecently → panic contributions
  │    └─ enemyDefeatedRecently → momentum contributions
  ├─ resource triggers (combat-resources)
  │    ├─ defeat-enemy (on the killer)
  │    └─ ally-defeated (zone witnesses, same type)
  └─ narration (defeat-narration)
       ├─ defeat text (3 default variants + pack flavor)
       ├─ flee text
       ├─ rout text
       └─ frontline collapse text
```

## Morale Cascade

All morale shifts from ally/enemy defeat use will mitigation:

```
willMitigation = max(0.3, 1 - (will - 3) * 0.1)
delta = round(rawDelta * willMitigation)
```

| Will | Mitigation | -12 raw → actual |
|------|-----------|-------------------|
| 3    | 1.0       | -12               |
| 5    | 0.8       | -10               |
| 7    | 0.6       | -7                |
| 10   | 0.3       | -4                |

**Per-tick cap**: No entity can lose more than 20 morale from defeat events in a
single tick. Three simultaneous ally deaths hit the cap instead of causing -36.

## Morale-Triggered FLEEING

When `combat.morale.shift` fires and morale falls below a threshold, FLEEING is
auto-applied (duration 3, source `morale_collapse`).

**Threshold lookup**: Entity tags are checked against `moraleFleeThresholds`
config. First matching tag wins. Unmatched entities use 15.

**Will adjustment**: `threshold = max(0, packThreshold - willShift)` where
`willShift = min(10, max(0, (will - 3) * 3))`. High-will entities effectively
lower their own flee threshold.

| Pack Tag   | Base Threshold | Will 3 Effective | Will 7 Effective |
|-----------|---------------|------------------|------------------|
| zombie    | 0             | never            | never            |
| undead    | 5             | 5                | never            |
| feral     | 5             | 5                | never            |
| samurai   | 15            | 15               | 5                |
| criminal  | 45            | 45               | 35               |
| (default) | 15            | 15               | 5                |

**Rout penalty**: If an entity has no living allies in zone AND morale ≤ 20 AND
the shift reason is `ally_defeated`, an extra -10 morale is applied (bounded by
the per-tick cap). Emits `combat.morale.rout`.

## Frontline Collapse

When the last ENGAGED entity of a side falls and BACKLINE entities of that side
remain in the zone, `combat.frontline.collapsed` fires with `exposedIds`.

Conditions:
- Defeated entity had ENGAGED status
- No same-type entities remain ENGAGED in the zone
- At least one same-type entity has BACKLINE in the zone

## AI Defeat Awareness

The combat-intent module tracks defeats per tick via a module-scoped log cleared
on `tick.start`.

| Context Field            | True When                        |
|--------------------------|----------------------------------|
| `allyDefeatedRecently`   | Same-type entity defeated this tick |
| `enemyDefeatedRecently`  | Different-type entity defeated this tick |

Scorer contributions:
- **attack**: `enemyDefeatedRecently` → +8 momentum
- **guard**: `allyDefeatedRecently` → +8 ally_fallen
- **disengage**: `allyDefeatedRecently` → +12 ally_fallen
- **finish**: `enemyDefeatedRecently` → +10 momentum

## Resource Triggers

Two defeat-related triggers exist in `CombatResourceProfile`:

- **`defeat-enemy`**: Fires on the entity whose `defeatedBy` matches. Existing.
- **`ally-defeated`**: Fires on all living same-type entities in the defeated
  entity's zone. New in P5.

Example profile for pirates (morale crash on ally death):
```typescript
drains: [{ trigger: 'ally-defeated', resource: 'morale', amount: 5 }]
```

## Defeat Narration

The `defeat-narration` module patches description text onto four event types:

| Event | Default Templates |
|-------|-------------------|
| `combat.entity.defeated` | "{name} falls", "{name} crumples", "{name} is defeated" |
| `combat.morale.flee` | "{name} breaks under pressure and flees", etc. |
| `combat.morale.rout` | "{name} panics, alone and surrounded", etc. |
| `combat.frontline.collapsed` | "The front line crumbles — backliners are exposed", etc. |

**Pack flavor**: Pass `packFlavor: Record<string, string[]>` in config to map
entity tags to custom defeat text arrays. First matching tag wins.

## Enriched Defeat Payload

The `combat.entity.defeated` event includes:

| Field | Type | Description |
|-------|------|-------------|
| `entityId` | string | Defeated entity ID |
| `entityName` | string | Defeated entity name |
| `defeatedBy` | string | Attacker entity ID |
| `defeatedByName` | string | Attacker entity name |
| `defeatZoneId` | string | Zone where defeat occurred |
| `wasInterceptor` | boolean | Whether the defeated was intercepting |

## Design Constraints

- No new combat states or engagement states
- Morale cascades are bounded (per-tick cap, will mitigation)
- All changes are additive — existing packs work without modification
- `defeat-fallout.ts` handles post-combat social consequences (faction rep,
  heat, rumor). This chapter covers in-combat reactions only.

## Pack Author Guidance

To customise defeat behaviour for a new pack:

1. **Flee threshold**: Pass `moraleFleeThresholds` to `createCognitionCore()`
2. **Defeat narration**: Pass `packFlavor` to `createDefeatNarration()`
3. **Resource effects**: Add `ally-defeated` or `defeat-enemy` triggers to
   your `CombatResourceProfile`
4. **Pack biases**: Use `moraleFleeThreshold` in `PackBias` for AI scoring
