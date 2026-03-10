# Chapter 48 — Abilities System

> Part VII — Systems Reference

Complete reference for the ability system — definitions, effects, statuses, resistances, AI intent, review, and authoring tools.

## Overview

The ability system spans three layers:

| Layer | Files | Purpose |
|-------|-------|---------|
| Ability Core | `ability-core.ts` | Resolution pipeline: costs, checks, targeting, effect dispatch, cooldowns |
| Ability Effects | `ability-effects.ts` | Effect handlers: damage, heal, stat-modify, status apply/remove |
| Ability Intent | `ability-intent.ts` | AI scoring: self/AoE/single paths, resistance awareness, cleanse valuation |
| Ability Review | `ability-review.ts` | Runtime tracing: per-use breakdowns, inspector, formatted output |
| Ability Summary | `ability-summary.ts` | Authoring-time analysis: pack summary, balance audit, Markdown/JSON export |
| Ability Builders | `ability-builders.ts` | Convenience factories for common ability patterns |
| Status Semantics | `status-semantics.ts` | Tag vocabulary, registry, resistance-aware status application |

Ability Core and Effects are EngineModules (runtime). Intent, Summary, and Builders are pure functions (authoring/AI time). Review is an EngineModule that observes runtime events.

## Ability Definitions

Every ability is an `AbilityDefinition`:

```typescript
const fireball: AbilityDefinition = {
  id: 'fireball',
  name: 'Fireball',
  verb: 'use-ability',
  tags: ['magic', 'fire', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'will', difficulty: 7 }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 5, damageType: 'fire' } },
  ],
  cooldown: 3,
};
```

### Target Types

| Type | Behavior |
|------|----------|
| `self` | Actor only |
| `single` | One enemy (requires `targetIds`) |
| `all-enemies` | All enemies in the actor's zone |
| `zone` | Zone-targeted (no entity target) |
| `none` | No target needed |

### Cost Structure

Each cost deducts a named resource: `{ resourceId: string, amount: number }`. The engine validates that the actor has enough before resolving. Common resources: `stamina`, `hp`, `mana`, `morale`, `infection`, `power`, `fatigue`, `composure`.

### Stat Checks

Each check tests `stat + roll(1-20) >= difficulty * 2`. The `onFail` field controls what happens when a check fails:

- `'abort'` — entire ability fails (costs still deducted)
- `'half-damage'` — effects apply at reduced intensity
- Omitted — ability continues but the check is noted as failed

### Cooldowns

After use, the ability cannot be used again for `cooldown` ticks. Cooldown bands for analysis:

| Band | Ticks |
|------|-------|
| instant | 0 |
| short | 1–2 |
| medium | 3–4 |
| long | 5+ |

### Requirements

Optional conditions that must be true before use. Common condition types:

- `has-tag` — actor must have a specific tag (e.g., `investigator`, `survivor`)
- Evaluated before costs are deducted; rejected abilities emit `ability.rejected`

## Effect Types

Six built-in effect types:

| Effect | Params | Description |
|--------|--------|-------------|
| `damage` | `amount`, `damageType` | Deal damage to target |
| `heal` | `amount`, `resource` | Restore a resource (default: `hp`) |
| `stat-modify` | `stat`, `amount` | Temporarily adjust a stat |
| `resource-modify` | `resource`, `amount` | Add/subtract a resource |
| `apply-status` | `statusId`, `duration` | Apply a status effect (resistance-aware) |
| `remove-status-by-tag` | `tags` (comma-separated) | Remove statuses matching any listed tag |

## Status Definitions

Statuses are defined separately from abilities and registered globally:

```typescript
const rattled: StatusDefinition = {
  id: 'rattled',
  name: 'Rattled',
  tags: ['fear', 'debuff'],
  stacking: 'replace',
  duration: { type: 'ticks', value: 2 },
  ui: { icon: '!', color: '#e74c3c', description: 'Shaken by primal fury' },
};
```

### Semantic Tag Vocabulary

All status tags must come from the 11-tag vocabulary:

| Tag | Meaning | Cleansed By |
|-----|---------|-------------|
| `buff` | Positive effect | — |
| `debuff` | Generic negative | Broad cleanse |
| `fear` | Psychological terror | Fear cleanse |
| `control` | Mind control, taunt | Control cleanse |
| `blind` | Vision impairment | Blind cleanse |
| `stance` | Tactical posture | — |
| `holy` | Divine effect | — |
| `breach` | System/armor breach | Breach cleanse |
| `poison` | Ongoing toxic damage | Poison cleanse |
| `supernatural` | Otherworldly force | — |
| `wound` | Physical injury | — |

### Stacking Modes

- `replace` — new application replaces existing (resets duration)
- `stack` — multiple instances accumulate (up to `maxStacks`)
- `refresh` — resets duration without adding stacks

## Resistance & Vulnerability

Entities can have resistance profiles on their `resistances` field:

```typescript
const boss: EntityState = {
  id: 'elder-vampire',
  resistances: { fear: 'immune', holy: 'vulnerable' },
  // ...
};
```

### Resistance Levels

| Level | Effect |
|-------|--------|
| `immune` | Status is completely blocked; `ability.status.immune` event fires |
| `resistant` | Duration halved; `ability.status.resisted` event fires |
| `vulnerable` | Duration doubled; `ability.status.vulnerable` event fires |

Resistance is checked against all tags on the status definition. Priority: immune > resistant > vulnerable. If a status has tags `[fear, debuff]` and the target has `{ fear: 'immune' }`, the status is blocked entirely.

### Defensive Bias

The resistance system has a deliberate defensive bias — immune always wins over vulnerable when both match different tags on the same status.

## Cleanse & Counter

Cleanse abilities use `remove-status-by-tag` to strip matching statuses:

```typescript
effects: [
  { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'fear,blind' } },
],
```

This removes any status on the actor whose registered tags include `fear` OR `blind`. Design guidance:

- Pair every status-heavy pack with at least one cleanse ability
- Cleanse should cover 1–3 tags (overbroad cleanse is flagged by validation)
- Costs should be meaningful — free cleanse undermines status gameplay

## AI Ability Intent

The AI scoring system (`ability-intent.ts`) evaluates abilities in three paths:

### Self-Target Scoring

Evaluates heal/buff/cleanse value based on actor state:
- Heal value scales with missing HP percentage
- Cleanse value scales with active debuff count
- Buff value is lower priority unless specific conditions met

### AoE Scoring

Scores based on number of valid targets:
- More enemies = higher value
- Penalized if many targets are immune to the ability's status effects

### Single-Target Scoring

Scores based on target health, status, and resistance:
- Damage preferred against high-HP targets
- Status preferred against targets without existing debuffs
- **Resistance awareness**: immune targets get heavy score penalty; vulnerable targets get bonus

### Contribution System

Every score includes a `contributions` array explaining the decision:

```typescript
contributions: [
  { factor: 'damage-value', value: 5, weight: 1.0, delta: 50 },
  { factor: 'resistance-penalty', value: -100, weight: 1.0, delta: -100 },
]
```

## Pack Design Best Practices

Building a genre-native ability pack:

1. **3–4 abilities per pack** — enough for tactical variety without filler
2. **Identity-first** — each ability should reinforce the genre fantasy
3. **Resource loops** — costs should create meaningful tension (e.g., infection-as-cost in zombie)
4. **Genre-native statuses** — one status per pack is typical; use semantic tags from the vocabulary
5. **At least one cleanse** — if the pack applies statuses, pair with a counter
6. **One signature ability** — cooldown >= 4, multiple effect types, defines the pack's identity
7. **Resistance profiles on key enemies** — bosses should resist the pack's primary status

### Anti-Patterns

- **Filler abilities**: plain damage-only abilities with no interesting cost or check
- **Reskinned spam**: multiple abilities with identical damage + same status, different names
- **Overbroad cleanse**: removing > 3 tag families makes cleanse feel mandatory
- **Missing counters**: applying statuses without any removal path
- **Zero-cost zero-cooldown**: free instant abilities bypass resource tension

## Review & Tracing

The `ability-review` module records an `AbilityTrace` for every ability use:

```
--- Ability Trace [tick 3] [offensive] ---
Survivor → War Cry (war-cry)
Outcome: success
Targets: Shambler, Runner
Costs:
  stamina: -3 (15 → 12)
  infection: -5 (10 → 5)
Checks:
  nerve vs 6: roll 14 → PASS
Effects:
  [status] Shambler
  [status-immune] Bloater Alpha (immune)
Summary: Survivor used War Cry on Shambler, Runner — 2 effects applied
```

Traces include resistance outcomes (`immune`, `resisted`, `vulnerable`) and are categorized as offensive/defensive/control/utility.

### Debug Inspector

The review module registers a debug inspector showing:
- Recent traces (last 5)
- Active cooldowns with ticks remaining
- Active statuses with expiry
- Entity resistance profiles

## Summary & Audit

### Pack Summary

`summarizeAbilityPack(genre, abilities, opts?)` produces:

- Ability count, average cooldown, cooldown band distribution
- Cost economy (total per resource type)
- Effect type distribution (damage, heal, status, etc.)
- Target type distribution
- Statuses applied and cleanse tags covered
- Abilities by category (offensive/defensive/control/utility)
- Abilities by resource type
- Resistance profile count (when entities provided)

### Balance Audit

`auditAbilityBalance(packs)` scans for balance problems:

| Flag | Severity | Trigger |
|------|----------|---------|
| `zero-cost` | info | Ability has no resource costs |
| `no-cooldown` | info | Ability has cooldown of 0 |
| `extreme-damage` | warning | Damage > 2x pack mean |
| `no-cleanse` | info | Pack applies statuses but has no cleanse |
| `status-heavy-low-counter` | info | Pack applies >= 3 statuses but <= 1 cleanse |
| `resource-economy-skew` | info | One resource used in > 70% of costs |
| `signature-missing` | info | Pack has >= 3 abilities but none qualifies as signature |
| `thin-pack` | advisory | Pack has <= 2 abilities |
| `no-tactical-triangle` | info | Pack >= 3 abilities but missing offense/defense/control |

### Pack Comparison

`compareAbilityPacks(packs)` produces a `PackComparisonMatrix` with identity profiles per pack, a status ecosystem summary, and recommendations. Each `PackIdentityProfile` includes:

- Dominant category, signature ability, resource identity
- Status family and cleanse tag coverage
- Tactical triangle completeness
- Distinctiveness score (0–100)

`formatPackComparisonMarkdown(matrix)` renders the matrix as a comparison table.

### Export Formats

- `formatAbilityPackMarkdown(summary)` — pack identity, tactical triangle, abilities, cost economy, cooldown distribution, categories, status interactions, resistance profiles
- `formatAbilityPackJSON(summary)` — serializable object with all summary fields
- `formatPackComparisonMarkdown(matrix)` — cross-pack comparison table with ecosystem summary

## Validation

`validateAbilityPack(abilities, ruleset, tags?)` checks:

- Costs reference resources that exist in the ruleset (implicit: `hp`, `stamina`)
- Checks reference stats that exist
- Effects reference known stats/resources
- Status tags are from the semantic vocabulary (when `tags` provided)

Advisories (non-blocking warnings):
- `zero-cost-zero-cooldown` — suspicious free + instant ability
- `overbroad-cleanse` — cleanse covers > 3 semantic tags
- `excessive-duplicate-semantics` — > 50% of pack applies same status tag
- `high-cost-low-value` — expensive ability with lowest pack damage

`validateStatusDefinitionPack(statuses, tags?)` checks status definitions against the tag vocabulary.

## Builder Helpers

Four convenience builders in `ability-builders.ts`:

```typescript
import { buildDamageAbility, buildCleanseAbility } from '@ai-rpg-engine/modules';

const strike = buildDamageAbility({
  id: 'power-strike', name: 'Power Strike',
  damage: 5, damageType: 'melee',
  stat: 'might', difficulty: 5,
  costs: [{ resourceId: 'stamina', amount: 3 }],
  cooldown: 2, tags: ['combat', 'damage'],
});

const purify = buildCleanseAbility({
  id: 'purify', name: 'Purify',
  cleanseTags: ['fear', 'poison'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  cooldown: 3, tags: ['support', 'cleanse'],
});
```

`buildAbilitySuite(genre, abilities, ruleset)` validates + summarizes + audits in one call.

## Wiring Abilities in Setup

Register ability modules in your starter pack's `setup.ts`:

```typescript
import { statusCore, createAbilityCore, createAbilityEffects, createAbilityReview } from '@ai-rpg-engine/modules';

const modules = [
  statusCore,
  createAbilityCore({
    abilities: myAbilities,
    statMapping: { power: 'might', precision: 'agility', focus: 'will' },
  }),
  createAbilityEffects(),
  createAbilityReview(),
];
```

The `statMapping` tells the ability system which genre-specific stats correspond to the generic roles used by AI scoring. Register status definitions globally before use:

```typescript
import { registerStatusDefinitions } from '@ai-rpg-engine/modules';
registerStatusDefinitions(myStatusDefinitions);
```

## 10-Pack Coverage

All 10 starter packs have 3+ abilities, cleanse coverage, and resistance profiles as of Phase 5:

| Pack | Abilities | Statuses | Cleanse | Resistances | Identity |
|------|-----------|----------|---------|-------------|----------|
| Fantasy | 3 | 1 | Yes | 2 entities | Divine caster — holy damage + healing + cleanse |
| Cyberpunk | 3 | 1 | Yes | 2 entities | Netrunner — ICE damage + debugging + nano-heal |
| Weird West | 3 | 1 | Yes | 2 entities | Gunslinger — AoE dust + grit cleanse + dead-eye |
| Vampire | 4 | 2 | Yes | 2 entities | Predator — drain + mesmerize + blood fury + purge |
| Gladiator | 4 | 1 | Yes | 1 entity | Arena fighter — cleave + rally + challenge + resolve |
| Ronin | 4 | 1 | Yes | 2 entities | Disciplined blade — iaijutsu + calm + ward + center |
| Pirate | 4 | 1 | Yes | 1 entity | Swashbuckler — broadside + dirty fight + shanty + rum |
| Detective | 4 | 1 | Yes | 1 entity | Investigator — deduce + composure + expose + cleanse |
| Zombie | 4 | 1 | Yes | 2 entities | Survivor — swing + triage + war-cry + instinct |
| Colony | 4 | 1 | Yes | 2 entities | Commander — plasma + protocol + override + reboot |

### Status Ecosystem

The 11-tag semantic vocabulary: `buff`, `debuff`, `fear`, `control`, `blind`, `stance`, `holy`, `breach`, `poison`, `supernatural`, `wound`.

- **Active tags** (used by statuses): fear, control, blind, stance, holy, breach, supernatural, buff, debuff
- **Vocabulary reserve** (unused): poison, wound — available for future packs
- **Uncleansable**: stance (intentional — self-applied posture, not a debuff)

### Common Balance Pathologies

- **Dead abilities**: an ability that AI never prefers in any scenario (no pack has this currently)
- **Spam loops**: heal/cleanse abilities repeatedly chosen when not needed (prevented by low-HP/debuff gating)
- **Overbroad cleanse**: cleansing > 3 tag families makes it universally optimal (no pack does this)
- **Thin packs**: < 3 abilities limits tactical variety (all packs now have >= 3)
- **Missing tactical triangle**: a pack needs offense + defense/support + control for situational variety

### How to Judge a Healthy Ability Suite

A healthy pack has:
1. **Tactical triangle** — offense, defense/support, and control/utility abilities
2. **Resource tension** — costs create meaningful choices (not just "spend stamina")
3. **Identity clarity** — a unique resource, status family, or signature ability
4. **Resistance-aware enemies** — at least one boss/elite with relevant resistances
5. **No dead abilities** — every ability is the best choice in at least one scenario

See also: [Combat System](./47-combat-system.md), [Items and Status Effects](./17-items-and-status-effects.md), [Crimson Court](./44-crimson-court.md), [Iron Colosseum](./45-iron-colosseum.md), [Jade Veil](./46-jade-veil.md)
