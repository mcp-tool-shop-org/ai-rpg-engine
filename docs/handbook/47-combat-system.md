# Chapter 47 — Combat System

> Part VII — Systems Reference

Complete reference for the combat system — roles, encounters, bosses, danger, and AI intent.

## Overview

Combat spans three layers, each building on the last:

| Layer | File | Purpose |
|-------|------|---------|
| Combat Core | `combat-core.ts` | Attack resolution, damage, defeat, stamina, guard, disengage |
| Combat Roles | `combat-roles.ts` | 8 role templates, encounter composition, boss phases, danger rating |
| Encounter Library | `encounter-library.ts` | Archetype factories, boss templates, pack audit |
| Combat Intent | `combat-intent.ts` | AI decision-making biases, morale, flee logic |
| Combat Engagement | `engagement-core.ts` | Frontline/backline positioning, bodyguard interception |
| Combat Recovery | `combat-recovery.ts` | Post-combat wound statuses, safe-zone healing |
| Combat Review | `combat-review.ts` | Formula explanation, hit-chance breakdown |
| Defeat Fallout | `defeat-fallout.ts` | Post-combat faction consequences, reputation shifts |
| Combat Summary | `combat-summary.ts` | Query, audit, format, and inspect combat content |

Combat Core is an EngineModule (runtime). Combat Roles, Encounter Library, and Combat Summary are pure functions (authoring time). The rest are EngineModules that layer behavior onto the core.

## Combat Roles

Eight built-in role templates define enemy archetypes. Each entity carries its role as a tag (`role:brute`, `role:boss`, etc.).

| Role | HP | Stamina | Bias | Position | Morale |
|------|----|---------|------|----------|--------|
| brute | 1.5x | 1.0x | +5 attack, +3 finish, -2 guard | Frontline | Stands firm |
| skirmisher | 0.8x | 1.3x | +5 pressure, +3 disengage | Flanker | Unpredictable |
| backliner | 0.7x | 1.0x | +3 guard, +5 disengage, -2 attack | Backline | Breaks early |
| bodyguard | 1.3x | 1.0x | +5 protect, +4 guard, -2 attack | Frontline | Stands firm |
| coward | 0.6x | 1.0x | +8 disengage, -3 attack | Variable | Breaks early |
| boss | 3.0x | 2.0x | +3 attack/guard/pressure, +2 finish | Frontline | Never flees |
| minion | 0.4x | 0.8x | +3 attack/pressure, -5 guard | Frontline | Breaks early |
| elite | 1.8x | 1.5x | +2 attack/guard/pressure/finish | Frontline | Stands firm |

HP and stamina multipliers apply relative to a base value. A brute with base 10 HP gets 15; a minion gets 4.

### Assigning Roles

Add a role tag to an entity's `tags` array:

```typescript
export const guard: EntityState = {
  id: 'gate-guard',
  name: 'Gate Guard',
  tags: ['enemy', 'human', 'role:brute'],
  // ...
};
```

Use `createRoledEnemy()` to apply multipliers and engagement tags automatically:

```typescript
import { createRoledEnemy } from '@ai-rpg-engine/modules';

const scaledGuard = createRoledEnemy(baseGuard, 'brute');
// HP scaled by 1.5x, tags include 'role:brute'
```

## Stat Mapping

Each starter maps its genre-specific stats to the three combat roles:

```typescript
const weirdWestFormulas: CombatFormulas = {
  statMapping: { attack: 'grit', precision: 'draw-speed', resolve: 'grit' },
  hitChance: (attacker, target) => { /* ... */ },
  damage: (attacker) => Math.max(1, attacker.stats.grit ?? 3),
  // ...
};
```

The `statMapping` tells combat-core which entity stats to read for `attack` (damage), `precision` (accuracy/evasion), and `resolve` (defense/guard).

## Encounter Composition

Seven composition types describe the shape of a fight:

| Composition | Description |
|-------------|-------------|
| solo | Single enemy |
| patrol | Routine sweep, mixed roles |
| ambush | Sudden surprise attack |
| boss-fight | Boss + optional support |
| horde | Many minions, optional leader |
| duel | 1-on-1 or small elite fight |
| custom | Author-defined |

Each encounter is an `EncounterDefinition`:

```typescript
export type EncounterDefinition = {
  id: string;
  name: string;
  participants: EncounterParticipant[];
  composition?: EncounterComposition;
  validZoneIds?: string[];
  narrativeHooks?: { tone?: string; trigger?: string; stakes?: string };
};
```

## Encounter Library

Five archetype factories build encounters from common patterns:

```typescript
import {
  createPatrolEncounter,
  createAmbushEncounter,
  createBossFightEncounter,
  createHordeEncounter,
  createDuelEncounter,
} from '@ai-rpg-engine/modules';
```

### Patrol

```typescript
const patrol = createPatrolEncounter(
  { id: 'gate-patrol', name: 'Gate Patrol', validZoneIds: ['castle-gate', 'great-hall'] },
  [{ entityId: 'guard-a', role: 'brute' }, { entityId: 'guard-b', role: 'skirmisher' }],
);
```

### Ambush

```typescript
const ambush = createAmbushEncounter(
  { id: 'alley-ambush', name: 'Alley Ambush', validZoneIds: ['back-alley'] },
  [{ entityId: 'assassin', role: 'skirmisher' }],
);
```

### Boss Fight

Boss is always first in participants:

```typescript
const bossFight = createBossFightEncounter(
  { id: 'throne-room', name: 'Throne Room Showdown', validZoneIds: ['lords-chamber'] },
  { entityId: 'dragon-lord', role: 'boss' },
  [{ entityId: 'minion-a', role: 'minion' }, { entityId: 'minion-b', role: 'minion' }],
);
```

### Horde

Optional leader placed first:

```typescript
const horde = createHordeEncounter(
  { id: 'swarm-attack', name: 'Swarm Attack' },
  [{ entityId: 'm1', role: 'minion' }, { entityId: 'm2', role: 'minion' }],
  { entityId: 'alpha', role: 'elite' }, // optional leader
);
```

### Duel

```typescript
const duel = createDuelEncounter(
  { id: 'rival-duel', name: 'Rival Duel' },
  [{ entityId: 'rival', role: 'elite' }],
);
```

## Boss Phase System

Bosses shift behavior at HP thresholds. A `BossDefinition` declares the entity ID and an array of phase transitions:

```typescript
export type BossPhaseTransition = {
  hpThreshold: number;       // 0-1, triggers when HP drops at or below
  narrativeKey: string;       // e.g. 'enraged', 'desperate'
  addTags?: string[];         // tags added on transition
  removeTags?: string[];      // tags removed on transition
  spawnEntityIds?: string[];  // entities spawned on transition
};
```

### Boss Templates

Three factory functions cover common boss patterns:

**Escalating** — 2 phases at 50% and 25% HP. Adds aggression tags.

```typescript
const boss = createEscalatingBoss({ entityId: 'warlord' });
// Phase 1 (50%): adds 'enraged'
// Phase 2 (25%): removes 'enraged', adds 'desperate'
```

**Summoner** — 3 phases at 75%, 50%, 25% HP. Spawns reinforcements each phase.

```typescript
const boss = createSummonerBoss(
  { entityId: 'necromancer' },
  { phase1Spawns: ['skeleton-a'], phase2Spawns: ['skeleton-b'], phase3Spawns: ['skeleton-c'] },
);
```

**Phase-Shift** — Custom phases with tag swaps. Full control.

```typescript
const boss = createPhaseShiftBoss({ entityId: 'shapeshifter' }, [
  { hpThreshold: 0.7, narrativeKey: 'charging', addTags: ['charging'] },
  { hpThreshold: 0.3, narrativeKey: 'overloaded', addTags: ['overloaded'], removeTags: ['charging'] },
]);
```

### Wiring at Runtime

Register the boss phase listener in your setup:

```typescript
import { createBossPhaseListener } from '@ai-rpg-engine/modules';

const engine = new Engine({
  modules: [
    // ...other modules
    createBossPhaseListener(myBossDef),
  ],
});
```

The listener watches `combat.damage.applied` events and emits `boss.phase.transition` when HP crosses a threshold.

### Boss Entity Requirements

Boss entities need `maxHp` and `maxStamina` in their resources for the phase system to calculate HP ratios:

```typescript
export const dragon: EntityState = {
  id: 'dragon-lord',
  tags: ['enemy', 'role:boss'],
  resources: { hp: 50, maxHp: 50, stamina: 14, maxStamina: 14 },
  // ...
};
```

## Danger Rating

`calculateDangerRating()` scores an encounter's threat level (0–100):

| Score | Level |
|-------|-------|
| 0–20 | Trivial |
| 21–40 | Routine |
| 41–60 | Dangerous |
| 61–80 | Deadly |
| 81–100 | Overwhelming |

Factors: total enemy HP vs player HP, total attack vs player attack, enemy count, boss presence (1.5x multiplier).

## AI Intent System

`combat-intent.ts` drives NPC decision-making through `PackBias`:

```typescript
type PackBias = {
  tag: string;
  name: string;
  modifiers: Partial<Record<CombatIntentType, number>>;
  moraleFleeThreshold?: number;
};
```

Intent types: `attack`, `guard`, `pressure`, `finish`, `disengage`, `protect`.

Each role template includes a built-in PackBias. Brutes favor attack/finish. Cowards favor disengage. Bosses are well-rounded but almost never flee.

## Combat Recovery

`createCombatRecovery()` handles post-combat healing. Safe zones (tagged `safe` or custom tags) restore HP and remove wound statuses. Configure with:

```typescript
createCombatRecovery({ safeZoneTags: ['safe', 'colony-core'] })
```

## Defeat Fallout

`createDefeatFallout()` triggers faction-level consequences when entities are defeated — reputation shifts, morale changes, and narrative events.

## Combat Summary

`combat-summary.ts` provides inspection functions:

| Function | Purpose |
|----------|---------|
| `queryCombatEntities()` | Find entities by role, tag, or stat range |
| `summarizeCombatContent()` | Pack-level overview of all combat content |
| `auditCombatContent()` | Flag warnings (missing roles, unbalanced encounters) |
| `formatCombatSummary()` | Human-readable text output for director prompts |

## Pack Coverage Audit

`auditPackCoverage()` checks a starter against the minimum content bar:

- 3+ role-tagged enemies (one with `role:boss` + `maxHp`/`maxStamina`)
- 3+ encounters (including at least one patrol and one boss-fight)
- 1+ boss definition with 2+ phases
- Encounters spread across zones

```typescript
import { auditPackCoverage } from '@ai-rpg-engine/modules';

const result = auditPackCoverage('my-pack', enemies, encounters, bossDefs, zoneIds);
if (result.missingMinimumBar.length > 0) {
  console.warn('Missing:', result.missingMinimumBar);
}
```

## Pack Coverage Matrix

All 10 starters meet the minimum content bar:

| Starter | Pack ID | Enemies | Roles | Encounters | Boss Defs |
|---------|---------|---------|-------|------------|-----------|
| Fantasy | chapel-threshold | 3 | brute, skirmisher, boss | 3 | 1 |
| Gladiator | iron-colosseum | 3 | brute, skirmisher, boss | 3 | 1 |
| Zombie | ashfall-dead | 3 | brute, skirmisher, boss | 3 | 1 |
| Pirate | black-flag-requiem | 3 | brute, skirmisher, boss | 3 | 1 |
| Ronin | jade-veil | 3 | skirmisher, bodyguard, boss | 3 | 1 |
| Vampire | crimson-court | 3 | elite, minion, boss | 3 | 1 |
| Cyberpunk | neon-lockbox | 3 | bodyguard, skirmisher, boss | 3 | 1 |
| Colony | signal-loss | 3 | bodyguard, minion, boss | 3 | 1 |
| Detective | gaslight-detective | 3 | minion, brute, boss | 3 | 1 |
| Weird West | dust-devils-bargain | 3 | elite, skirmisher, boss | 3 | 1 |

## Best Practices

1. **Role diversity** — Use at least 3 different roles per pack. Brute + skirmisher + boss is the minimum. Adding a bodyguard or minion creates more interesting compositions.

2. **Zone spread** — Spread encounters across zones. Players should encounter combat in multiple areas, not just the final boss room.

3. **Danger curves** — Design encounters that escalate: patrols (routine) → ambushes (dangerous) → boss fights (deadly). Avoid overwhelming encounters early.

4. **Narrative hooks** — Use `narrativeHooks` on encounters to guide the AI narrator. Tone, trigger, and stakes give context beyond raw mechanics.

5. **Boss pacing** — Two phases is the minimum. Place the first threshold at 50% and the second at 25% for natural escalation. Use `addTags`/`removeTags` to shift behavior rather than just damage.

6. **Validation** — Run `validateBossDefinition()` and `validateEncounter()` in tests. Both return arrays of warning strings — empty means valid.
