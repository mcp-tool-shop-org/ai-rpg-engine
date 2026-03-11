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

**Reference:** All 10 starter mappings are listed in the [Starter Decomposition Audit](../starter-decomposition-audit.md#cross-starter-matrix).

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

This gives you: hit/damage formulas, guard, disengage, combat states, AI tactics, and review tracing. Fantasy uses this pattern.

### Combat with a resource profile

```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  resourceProfile: {
    packId: 'my-game',
    gains: [
      { trigger: 'attack-hit', resourceId: 'momentum', amount: 2 },
      { trigger: 'defeat-enemy', resourceId: 'momentum', amount: 5 },
    ],
    spends: [
      { action: 'attack', resourceId: 'momentum', amount: 5, effects: { damageBonus: 2 } },
      { action: 'brace', resourceId: 'momentum', amount: 3, effects: { guardBonus: 0.10 } },
    ],
    drains: [
      { trigger: 'take-damage', resourceId: 'momentum', amount: 1 },
    ],
    aiModifiers: [
      { resourceId: 'momentum', highThreshold: 60, highModifiers: { attack: 10 } },
    ],
  },
});
```

Resources add tactical economy: you earn them through combat actions and spend them for bonuses. The AI reads resource levels through `aiModifiers` to adjust its behavior.

**Resource design patterns from the starters:**
- **Defensive spending:** Detective's composure is spent on guard/reposition to resist status effects
- **Consequence-only:** Zombie's infection accumulates on damage but can't be spent
- **Opposing dual:** Vampire's bloodlust rises with kills while humanity drains — narrative tension
- **Performance:** Gladiator's crowd-favor rewards flashy play with large gains on kills
- **Spiritual + social:** Ronin's ki fuels combat, honor tracks narrative standing

### Combat with engagement roles

```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  engagement: {
    backlineTags: ['ranged', 'caster'],
    protectorTags: ['bodyguard'],
    chokepointTag: 'chokepoint',
  },
  biasTags: ['undead', 'beast'],
});
```

Engagement gives you frontline/backline positioning, interception, and chokepoint control. Pack biases shape AI personality — an `undead` enemy fights differently from a `beast`.

See [Build a Combat Pack](55-combat-pack-guide.md) for deep combat authoring.

---

## Step 3: Wire Your Modules

After building your combat stack, choose which other modules your game needs:

```typescript
import { Engine } from '@ai-rpg-engine/core';
import {
  traversalCore, statusCore,
  buildCombatStack,
  createDialogueCore, createCognitionCore, createPerceptionFilter,
  createInventoryCore, createProgressionCore,
  createFactionCognition, createRumorPropagation,
  createDistrictCore, createEnvironmentCore,
  createBeliefProvenance, createObserverPresentation,
  createSimulationInspector,
} from '@ai-rpg-engine/modules';

const combat = buildCombatStack({ /* ... */ });

const engine = new Engine({
  manifest: { id: 'my-game', title: 'My Game', version: '1.0.0' },
  seed: 42,
  modules: [
    // Movement
    traversalCore,
    statusCore,

    // Combat (from buildCombatStack)
    ...combat.modules,

    // World systems — pick what you need
    createInventoryCore(),
    createDialogueCore(myDialogues),
    createCognitionCore({ decay: { baseRate: 0.02 } }),
    createPerceptionFilter(),
    createProgressionCore({ trees: myTrees, rewards: myRewards }),
    createEnvironmentCore({ hazards: myHazards }),
    createFactionCognition({ factions: myFactions }),
    createRumorPropagation({ propagationDelay: 2 }),
    createDistrictCore({ districts: myDistricts }),
    createBeliefProvenance(),
    createObserverPresentation({ rules: myPresentationRules }),
    createSimulationInspector(),
  ],
});
```

You don't need all 27 modules. Pick what your game uses:

| If your game has... | You need |
|--------------------|----------|
| Rooms to move between | `traversalCore` |
| Combat | `buildCombatStack` (or individual combat modules) |
| NPC dialogue | `createDialogueCore` |
| NPC memory and beliefs | `createCognitionCore` |
| Items and equipment | `createInventoryCore` |
| Factions | `createFactionCognition` |
| Information spreading between NPCs | `createRumorPropagation` |
| Zone grouping and metrics | `createDistrictCore` |
| Environmental hazards | `createEnvironmentCore` |
| Character abilities | `createAbilityCore` + `createAbilityEffects` |
| Boss encounters | `createBossPhaseListener` |
| Progression/XP | `createProgressionCore` |

---

## Step 4: Create Your Content

Content is entities, zones, dialogues, items, abilities, and statuses. This is where your genre lives.

### Entities

```typescript
import type { EntityState } from '@ai-rpg-engine/core';

const hero: EntityState = {
  id: 'hero',
  type: 'player',
  name: 'The Hero',
  tags: ['human', 'player'],
  stats: { might: 7, agility: 5, will: 4 },
  resources: { hp: 30, maxHp: 30 },
  inventory: [],
  equipment: {},
  statuses: [],
};

const goblin: EntityState = {
  id: 'goblin-1',
  type: 'enemy',
  name: 'Cave Goblin',
  tags: ['goblin', 'beast'],
  stats: { might: 3, agility: 6, will: 2 },
  resources: { hp: 12, maxHp: 12 },
  inventory: [],
  equipment: {},
  statuses: [],
};
```

Entity stats should use the names from your stat mapping. Tags should match your pack bias tags (so `['beast']` biases apply to entities tagged `beast`).

### Zones

```typescript
import type { ZoneState } from '@ai-rpg-engine/core';

const cave: ZoneState = {
  id: 'goblin-cave',
  name: 'Goblin Cave',
  tags: ['underground', 'dark'],
  exits: [{ to: 'forest-clearing' }],
  entities: ['goblin-1'],
};
```

### Adding content to the engine

```typescript
engine.store.addZone(cave);
engine.store.addEntity(hero);
engine.store.addEntity(goblin);
engine.store.state.playerId = 'hero';
engine.store.state.locationId = 'goblin-cave';
```

---

## Step 5: Add Demo Glue (Optional)

Event listeners for scripted moments. These are game-specific — they reference your content by ID.

```typescript
// Grant an item after a dialogue
engine.store.events.on('dialogue.ended', (event) => {
  if (event.payload.dialogueId === 'blacksmith-greeting') {
    const player = engine.store.state.entities['hero'];
    if (player && !(player.inventory ?? []).includes('iron-sword')) {
      const giveEvent = giveItem(player, 'iron-sword', engine.tick);
      engine.store.recordEvent(giveEvent);
    }
  }
});

// Audio cue on zone entry
engine.store.events.on('world.zone.entered', (event) => {
  if (event.payload.zoneId === 'boss-chamber') {
    engine.store.emitEvent('audio.cue.requested', {
      cueId: 'scene.boss-reveal',
      channel: 'stinger',
      priority: 'high',
    });
  }
});
```

All 10 starters use this exact pattern. It's polish, not architecture — your game works without it.

---

## Composition Patterns

### Minimal game — combat only

```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'str', precision: 'dex', resolve: 'con' },
  playerId: 'player',
});

const engine = new Engine({
  manifest: { id: 'arena', title: 'Arena', version: '1.0.0' },
  modules: [traversalCore, statusCore, ...combat.modules],
});

engine.store.addZone({ id: 'pit', name: 'The Pit', tags: [], exits: [] });
engine.store.addEntity({ id: 'player', type: 'player', name: 'Fighter', tags: ['human'], stats: { str: 6, dex: 5, con: 4 }, resources: { hp: 25, maxHp: 25 }, inventory: [], equipment: {}, statuses: [] });
engine.store.addEntity({ id: 'rat', type: 'enemy', name: 'Giant Rat', tags: ['beast'], stats: { str: 3, dex: 7, con: 2 }, resources: { hp: 8, maxHp: 8 }, inventory: [], equipment: {}, statuses: [] });
engine.store.state.playerId = 'player';
engine.store.state.locationId = 'pit';
```

That's a complete game. ~15 lines of setup.

### Social-only game — no combat

```typescript
const engine = new Engine({
  manifest: { id: 'court', title: 'Court Intrigue', version: '1.0.0' },
  modules: [
    traversalCore,
    statusCore,
    createDialogueCore(courtDialogues),
    createCognitionCore({ decay: { baseRate: 0.01 } }),
    createPerceptionFilter(),
    createFactionCognition({ factions: courtFactions }),
    createRumorPropagation({ propagationDelay: 3 }),
    createDistrictCore({ districts: palaceDistricts }),
    createBeliefProvenance(),
    createObserverPresentation({ rules: courtPerception }),
  ],
});
```

No combat modules at all. The engine runs faction beliefs, rumor spreading, NPC cognition, and perception without combat.

### Full simulation — everything

Wire `buildCombatStack` + all social/world modules + abilities + boss phases + progression + environment. This is what the 10 starters do. See the [Starter Decomposition Audit](../starter-decomposition-audit.md) for the full module list each uses.

---

## Remixing Starters

Each starter demonstrates specific patterns. Here's what to borrow from each:

| Starter | Best Pattern to Borrow |
|---------|----------------------|
| **Fantasy** | Simplest combat wiring — no resources, no engagement roles |
| **Weird West** | `buildCombatStack` usage, dual resource profile |
| **Cyberpunk** | Squad engagement with backline/protector tags |
| **Colony** | Environment-driven resource pressure, squad roles |
| **Detective** | Defensive resource spending (resist status effects) |
| **Pirate** | Crew morale as shared group resource |
| **Zombie** | Consequence-only resource (infection accumulates, can't be spent) |
| **Vampire** | Opposing dual resources (bloodlust vs humanity) |
| **Gladiator** | Performance resource economy, 3-phase boss |
| **Ronin** | Multiple protector roles, spiritual + social dual resources |

To study a starter's wiring, read its `packages/starter-*/src/setup.ts`. The resource profile and `buildCombatStack` call (or equivalent manual wiring) are always in the first 100 lines.

---

## See Also

- [Build a Combat Pack](55-combat-pack-guide.md) — deep combat authoring guide
- [Combat Overview](49a-combat-overview.md) — the six pillars, actions, states
- [Tuning Philosophy](56-tuning-philosophy.md) — what to tune vs leave alone
- [Modules](06-modules.md) — module system architecture
- [Rulesets](07-rulesets.md) — stat and resource schema
- [Starter Decomposition Audit](../starter-decomposition-audit.md) — per-starter component breakdown
- [Composition Model](../composition-model.md) — the six composition layers
- [Profile Roadmap](../profile-roadmap.md) — plug-in profiles: the engine's destination feature (planned)
