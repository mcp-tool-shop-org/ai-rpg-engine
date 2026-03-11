# DX Polish — Combat Authoring Ergonomics

**Date:** 2025-03-11
**Scope:** Audit combat-facing API surface, identify boilerplate, ship helpers

---

## Audit Findings

### Boilerplate Problem

Average starter world setup.ts is **253 lines**. Of those, **~160 lines (63%)** are identical boilerplate:

| Category | Lines | Identical? |
|----------|-------|------------|
| Import statements | 35 | ~30 identical, ~5 content-specific |
| CombatFormulas definition | 20 | Logic identical, only stat names differ |
| Formula wrapping pattern | 3 | 100% identical |
| Combat module wiring | 8 | 100% identical |
| Zone/entity loading loops | 15 | 100% identical |
| Cognition config | 1 | 100% identical |
| Audio/dialogue hooks | 25 | Same pattern, different IDs |
| **Total boilerplate** | **~160** | |

The remaining **~93 lines (37%)** are genuine genre expression: resource profiles, hazards, factions, custom event listeners.

### CombatFormulas Copy-Paste

All 9 combat-enabled worlds define the **exact same formula logic** with only stat names changed:

```typescript
// This block is copy-pasted 9 times with different stat names
hitChance: (attacker, target) => {
  const atkPrec = attacker.stats[PRECISION_STAT] ?? 5;
  const tgtPrec = target.stats[PRECISION_STAT] ?? 5;
  return Math.min(95, Math.max(5, 50 + atkPrec * 5 - tgtPrec * 3));
},
damage: (attacker) => Math.max(1, attacker.stats[ATTACK_STAT] ?? 3),
guardReduction: (defender) => {
  const res = defender.stats[RESOLVE_STAT] ?? 3;
  const bonus = Math.max(0, (res - 3) * 0.03);
  return Math.min(0.75, 0.5 + bonus);
},
disengageChance: (actor) => {
  const prec = actor.stats[PRECISION_STAT] ?? 5;
  const res = actor.stats[RESOLVE_STAT] ?? 3;
  return Math.min(90, Math.max(15, 40 + prec * 5 + res * 2));
},
```

### Opaque Wrapping Pattern

Every world must know the correct composition order:

```typescript
const review = createCombatReview({ baseFormulas });
const wrapped = withCombatResources(profile, withEngagement(formulas));
createCombatCore(review.explain(wrapped));
// + manually wire: review.module, createEngagementCore, createCombatTactics,
//   createCombatResources, createCombatIntent, createCombatRecovery
```

This is internal engine knowledge that leaks into pack authoring.

### Config Naming Inconsistencies

| Module | Config style | Issue |
|--------|-------------|-------|
| createCombatCore | `formulas?: CombatFormulas` | Not wrapped in config object |
| createCombatResources | `profile: CombatResourceProfile` | Named "profile" not "config" |
| createCombatReview | `config: { baseFormulas }` | **Requires** baseFormulas |
| createCombatIntent | `config?` | Separate from `selectNpcCombatAction(entity, world, config)` |

### Pack Bias Discoverability

Pack authors must know BUILTIN_PACK_BIASES tag names by inspecting source code. No exported constant lists available tags. Current tags: `assassin, samurai, feral, beast, pirate, colonial, vampire, hunter, ice-agent, zombie, undead, criminal, drone, alien, spirit, gladiator`.

### Event Naming

Mostly consistent (`combat.{verb}.{outcome}`), with one exception: `combat.guard.broken` uses "broken" while all others use `success/fail/start`.

---

## Changes Shipped

### 1. `buildCombatFormulas(statMapping)` — New Helper

**File:** `packages/modules/src/combat-builders.ts`

Eliminates the 20-line formula copy-paste. Takes a `CombatStatMapping` and returns complete `CombatFormulas` with standard hitChance, damage, guardReduction, and disengageChance.

```typescript
import { buildCombatFormulas } from '@ai-rpg-engine/modules';

// Before: 20 lines of copy-pasted formula logic
const formulas = buildCombatFormulas({
  attack: 'grit',
  precision: 'draw-speed',
  resolve: 'lore',
});

// Override individual formulas when needed:
const custom = { ...buildCombatFormulas(mapping), damage: myCustomDamage };
```

### 2. `buildCombatStack(config)` — New Helper

**File:** `packages/modules/src/combat-builders.ts`

Encapsulates the entire combat module wiring pattern. Takes a simple config, returns wrapped formulas + module array.

```typescript
import { buildCombatStack } from '@ai-rpg-engine/modules';

const combat = buildCombatStack({
  statMapping: { attack: 'grit', precision: 'draw-speed', resolve: 'lore' },
  playerId: 'drifter',
  resourceProfile: weirdWestCombatProfile,
  biasTags: ['undead', 'spirit', 'beast'],
  engagement: { protectorTags: ['bodyguard'] },
});

// In Engine constructor:
modules: [
  traversalCore,
  statusCore,
  ...combat.modules,  // All combat modules in correct order
  // ... other modules
]
```

**What it handles internally:**
- Calls `buildCombatFormulas` with the stat mapping
- Creates `CombatReview` with tracing
- Wraps formulas with `withEngagement` + `withCombatResources`
- Wires `review.explain()` for trace attribution
- Creates all combat modules in correct order:
  - `createEngagementCore`
  - `review.module`
  - `createCombatCore`
  - `createCombatTactics` (with resource hooks if profile exists)
  - `createCombatResources` (if profile exists)
  - `createCombatIntent`
  - `createCombatRecovery`
  - `createCombatStateNarration`

**What pack authors still control:**
- Stat mapping (required)
- Resource profile (optional — omit for simple combat like Fantasy)
- Pack bias tags (optional — filters BUILTIN_PACK_BIASES)
- Engagement config (backlineTags, protectorTags)
- Formula overrides (spread individual formulas)
- Recovery config overrides
- Tactics config overrides

### 3. `PACK_BIAS_TAGS` — Discoverability Constant

**File:** `packages/modules/src/combat-builders.ts`

Exports all available built-in pack bias tags as a string array. Pack authors can inspect this to see what's available without reading source code.

```typescript
import { PACK_BIAS_TAGS } from '@ai-rpg-engine/modules';
// ['assassin', 'samurai', 'feral', 'beast', 'pirate', 'colonial', ...]
```

### 4. Weird West Refactored — Example

**File:** `packages/starter-weird-west/src/setup.ts`

Refactored to use `buildCombatStack`. Before/after comparison:

**Before (lines removed):**
- 20-line CombatFormulas definition
- 8 combat module imports (createCombatCore, createCombatReview, withEngagement, etc.)
- 3-line formula wrapping pattern
- 8 lines of combat module wiring in modules array

**After (lines added):**
- 1 import: `buildCombatStack`
- 7-line `buildCombatStack` call
- 1-line `...combat.modules` spread

**Net reduction:** ~32 lines of boilerplate eliminated from one world.

---

## Remaining DX Observations (Not Changed)

These are noted for the docs pass but don't warrant code changes:

### Config Naming

The `profile` vs `config` naming inconsistency (createCombatResources takes "profile", everything else takes "config") is a minor aesthetic issue. Changing it would break existing packs for no functional gain. Document it instead.

### Event Naming

`combat.guard.broken` is the only event using "broken" instead of the `success/fail` pattern. It's semantically correct (guard is "broken through") and changing it would break event listeners. Document the exception.

### Fantasy Special Case

Fantasy uses no combat resource profile and has minimal formulas. With `buildCombatStack`, it can now use:
```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
  playerId: 'player',
  biasTags: ['undead'],
  recovery: { safeZoneTags: ['safe', 'sacred'] },
});
```
This is simpler than its current approach but refactoring all 10 worlds is a mechanical task for a future pass.

### Cognition Config

All 10 worlds use identical `createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } })`. Could export a `DEFAULT_COGNITION_CONFIG` constant, but this is outside combat scope.

---

## Verification

- `npm run build` — clean compile ✓
- `npx vitest run` — 2661 tests pass ✓
- Weird West refactored setup produces identical behavior ✓

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/src/combat-builders.ts` | **Created** | buildCombatFormulas, buildCombatStack, PACK_BIAS_TAGS |
| `packages/modules/src/index.ts` | Edited | Export new helpers |
| `packages/starter-weird-west/src/setup.ts` | Edited | Refactored to use buildCombatStack |
