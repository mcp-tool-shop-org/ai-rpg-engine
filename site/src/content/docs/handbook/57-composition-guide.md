---
title: "Chapter 57 — Composition Guide"
description: "How to build your own game by composing engine modules"
sidebar:
  order: 57
---

# Chapter 57 — Composition Guide

AI RPG Engine ships 10 starter worlds. They are **examples**, not templates. Each one demonstrates how to combine engine modules into a game with its own combat identity, resource economy, and narrative pressure.

This chapter shows you how to build your own game by composing the same pieces the starters use.

---

## The Shape of a Game

Every game built on the engine has the same structure:

```
stat mapping → combat stack → modules → content → Engine constructor
```

You define stats, configure combat, pick the modules you need, create your content (entities, zones, dialogue), and wire it all into `new Engine()`. That's the whole pattern.

The starters add demo glue on top — scripted event listeners for item gifts, audio cues, and fallout hooks. Those are polish, not architecture.

---

## Step 1: Name Your Stats

Every game needs a **stat mapping** — three stat roles that drive every combat formula:

| Role | What It Drives | Example Names |
|------|---------------|---------------|
| **Attack** | Damage, guard breakthrough | vigor, might, brawn, chrome, grit, fitness |
| **Precision** | Hit chance, disengage, guard counter | instinct, agility, cunning, reflex, perception, wits |
| **Resolve** | Guard absorption, brace resistance, morale | will, composure, sea-legs, command, presence, nerve |

The golden rule: **three distinct stats, never collapse attack = resolve**. If your attack and resolve map to the same stat, guard breakthrough becomes trivial and combat loses its tension.

```typescript
const statMapping = { attack: 'might', precision: 'agility', resolve: 'will' };
```

You can define stats beyond these three — exploration stats, social stats, crafting stats. The mapping only governs combat formulas.

---

## Step 2: Choose Your Combat Stack

`buildCombatStack` is the recommended entry point. It generates formulas, wraps them with engagement and resource modifiers, sets up review tracing, and returns a module array.

### Minimal combat (no resources, no engagement roles)

```typescript
import { buildCombatStack } from '@ai-rpg-engine/modules';

const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
});
```

### Combat with a resource profile

```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  resourceProfile: {
    packId: 'my-game',
    gains: [
      { trigger: 'attack-hit', resourceId: 'momentum', amount: 2 },
    ],
    spends: [
      { action: 'attack', resourceId: 'momentum', amount: 5, effects: { damageBonus: 2 } },
    ],
    drains: [],
    aiModifiers: [],
  },
});
```

### Combat with engagement roles

```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  engagement: {
    backlineTags: ['ranged', 'caster'],
    protectorTags: ['bodyguard'],
  },
  biasTags: ['undead', 'beast'],
});
```

See [Build a Combat Pack](./55-combat-pack-guide) for deep combat authoring.

---

## Step 3: Wire Your Modules

Pick the modules your game needs:

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { traversalCore, statusCore, buildCombatStack, createDialogueCore, /* ... */ } from '@ai-rpg-engine/modules';

const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  resourceProfile: myResourceProfile,
  cognition: { decay: { baseRate: 0.02 } },
});

const engine = new Engine({
  manifest: { id: 'my-game', title: 'My Game', version: '1.0.0' },
  seed: 42,
  modules: [
    traversalCore,
    statusCore,
    ...combat.modules,
    createDialogueCore(myDialogues),
    // ... add what you need
  ],
});
```

| If your game has... | You need |
|--------------------|----------|
| Rooms to move between | `traversalCore` |
| Combat | `buildCombatStack` |
| NPC dialogue | `createDialogueCore` |
| NPC beliefs and memory | `buildCombatStack({ cognition: {...} })` |
| Items and equipment | `createInventoryCore` |
| Factions | `createFactionCognition` |
| Character abilities | `createAbilityCore` + `createAbilityEffects` |
| Boss encounters | `createBossPhaseListener` |

---

## Step 4: Create Your Content

A zone connects to others through `neighbors` (zone ids), and entities locate themselves with `zoneId` — a zone does not carry an entity roster. Combatants must share a `zoneId` and carry a `stamina` resource, or combat-core rejects the attack ("target not in same zone" / "not enough stamina"). `blueprintId` is required on every entity.

```typescript
engine.store.addZone({ id: 'cave', roomId: 'cave', name: 'Goblin Cave', tags: ['dark'], neighbors: ['clearing'] });
engine.store.addEntity({ id: 'hero', blueprintId: 'hero', type: 'player', name: 'Fighter', tags: ['human'], stats: { might: 6, agility: 5, will: 4 }, resources: { hp: 25, maxHp: 25, stamina: 5 }, zoneId: 'cave', inventory: [], equipment: {}, statuses: [] });
engine.store.addEntity({ id: 'goblin', blueprintId: 'goblin', type: 'enemy', name: 'Cave Goblin', tags: ['beast'], stats: { might: 3, agility: 6, will: 2 }, resources: { hp: 12, maxHp: 12, stamina: 5 }, zoneId: 'cave', statuses: [] });
engine.store.state.playerId = 'hero';
// setPlayerLocation keeps state.locationId and the player's zoneId in sync.
engine.store.setPlayerLocation('cave');
```

---

## What the Stack Owns vs What Starters Own

`buildCombatStack()` is infrastructure. Starters are fantasy. The boundary is clear:

### Stack owns (combat structure)

| Concern | How |
|---------|-----|
| Formula generation | `statMapping` → hit/damage/guard/dodge/brace formulas |
| Formula wrapping | engagement modifiers, resource effects, review tracing |
| Cognition | belief decay, morale tracking, flee thresholds |
| Engagement | backline/protector/chokepoint zone states |
| Resources | gain/spend/drain triggers, AI resource-aware scoring |
| Intent | AI verb selection, pack biases, dimension awareness |
| Recovery | safe-zone healing, morale reset |
| State narration | combat state change narration |
| Tactics | brace stabilize, guard counter, tactical hooks |

### Starters own (fantasy pressure)

| Concern | Examples |
|---------|----------|
| Resource identity | infection, composure, bloodlust, crowd-favor, power, dust |
| Resource economy | what gains/spends/drains mean thematically |
| Environment hazards | roaming-dead, dark-alley, scorching-sand, dust-storm |
| Faction cognition | pack behavior, group morale, cohesion |
| Presentation rules | spirit perception, suspect paranoia, noir framing |
| Abilities | Deductive Strike, War Cry, Field Triage |
| AI modifiers | high-infection aggression, low-composure flee |
| Boss definitions | phase tags, threshold logic |
| Progression trees | XP rewards, unlock paths |
| Defeat fallout | what happens when entities die |

### The `cognition` config option

```typescript
// Custom decay (most starters)
buildCombatStack({ cognition: { decay: { baseRate: 0.02, instabilityFactor: 0.5 } } })

// Exclude cognition (caller provides their own)
buildCombatStack({ cognition: false })

// Default cognition (omit the key)
buildCombatStack({ statMapping, playerId })
```

Do **not** add a separate `createCognitionCore()` to your module list if you are using `buildCombatStack()`. The stack handles it.

---

## Starter Composition Matrix

All 10 starters use `buildCombatStack()`. This matrix shows how each genre maps to stack config:

| Starter | Genre Pressure | Stack Config Used | Starter-Owned Systems |
|---------|---------------|-------------------|----------------------|
| **Fantasy** | Simple baseline | `statMapping`, `biasTags`, `recovery`, `cognition` | Undead faction, unstable-floor hazard, boss phases |
| **Weird West** | Dual-resource frontier | `statMapping`, `resourceProfile`, `biasTags`, `cognition` | Dust/resolve resources, spirit-drain hazard, spirit perception |
| **Gladiator** | Performance economy | `statMapping`, `resourceProfile`, `biasTags`, `cognition` | Crowd-favor/fatigue, scorching-sand, trap-pit, 3-phase boss |
| **Vampire** | Opposing dual resources | `statMapping`, `resourceProfile`, `biasTags`, `engagement`, `recovery`, `cognition` | Bloodlust/humanity tension, blood-scent, consecrated-ground |
| **Zombie** | Survival/attrition | `statMapping`, `resourceProfile`, `biasTags`, `recovery`, `cognition` | Infection-as-resource, roaming-dead, infection-risk, safe-zone recovery |
| **Colony** | Party/settlement | `statMapping`, `resourceProfile`, `biasTags`, `engagement`, `recovery`, `cognition` | Power/morale economy, ally-defeated penalty, resonance-field |
| **Detective** | Social-combat | `statMapping`, `resourceProfile`, `biasTags`, `cognition` | Composure drains, dark-alley, suspect paranoia, no safe haven |
| **Cyberpunk** | Tech/network | `statMapping`, `resourceProfile`, `biasTags`, `engagement`, `cognition` | Bandwidth economy, exposed-wiring, ICE security framing |
| **Pirate** | Crew morale | `statMapping`, `resourceProfile`, `biasTags`, `recovery`, `cognition` | Morale drives everything, storm-surge, drowning-pressure |
| **Ronin** | Discipline/duel | `statMapping`, `resourceProfile`, `biasTags`, `engagement`, `recovery`, `cognition` | Ki/honor, poison-residue, shadow-watch, dual-faction |

**Key insight:** No starter required `formulaOverrides` or custom combat state definitions. The standard `buildCombatFormulas()` output plus `resourceProfile.spends[].resistState` covered all 10 genres.

---

## Remixing Starters

| Starter | Best Pattern to Borrow |
|---------|----------------------|
| **Fantasy** | Simplest combat wiring — no resources, no engagement roles |
| **Weird West** | `buildCombatStack` usage, dual resource profile |
| **Cyberpunk** | Squad engagement with backline/protector tags |
| **Detective** | Defensive resource spending |
| **Pirate** | Crew morale as shared group resource |
| **Zombie** | Consequence-only resource (infection) |
| **Vampire** | Opposing dual resources (bloodlust vs humanity) |
| **Gladiator** | Performance economy, 3-phase boss |
| **Ronin** | Multiple protector roles, dual-layer resources |

---

## See Also

- [Build a Combat Pack](./55-combat-pack-guide) — deep combat authoring
- [Combat Overview](./49a-combat-overview) — the six pillars
- [Tuning Philosophy](./56-tuning-philosophy) — what to tune vs leave alone
- [Modules](./06-modules) — module system architecture
