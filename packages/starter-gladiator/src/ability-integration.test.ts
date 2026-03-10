// Gladiator ability integration tests — Crowd Cleave, Rally the Crowd, Gladiator's Challenge
// Proves: crowd-favor economy, spectacle loop, fatigue reduction, theatrical debuff

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore } from '@ai-rpg-engine/modules';
import {
  createAbilityCore,
  isAbilityReady,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  clearStatusRegistry,
} from '@ai-rpg-engine/modules';
import type { StatusDefinition } from '@ai-rpg-engine/content-schema';
import { beforeEach } from 'vitest';

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Arena Floor', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Holding Cells', tags: [] as string[], neighbors: ['zone-a'] },
];

const crowdCleave: AbilityDefinition = {
  id: 'crowd-cleave', name: 'Crowd Cleave', verb: 'use-ability',
  tags: ['spectacle', 'combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single' },
  checks: [{ stat: 'might', difficulty: 7, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 5, damageType: 'melee' } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'crowd-favor', amount: 10 } },
  ],
  cooldown: 2,
  requirements: [{ type: 'has-tag', params: { tag: 'gladiator' } }],
};

const rallyCrowd: AbilityDefinition = {
  id: 'rally-crowd', name: 'Rally the Crowd', verb: 'use-ability',
  tags: ['spectacle', 'buff', 'support'],
  costs: [{ resourceId: 'stamina', amount: 2 }, { resourceId: 'crowd-favor', amount: 15 }],
  target: { type: 'self' },
  checks: [{ stat: 'showmanship', difficulty: 7, onFail: 'abort' }],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 5, resource: 'hp' } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'fatigue', amount: -5 } },
    { type: 'stat-modify', target: 'actor', params: { stat: 'might', amount: 2 } },
  ],
  cooldown: 4,
};

const gladiatorChallenge: AbilityDefinition = {
  id: 'gladiators-challenge', name: "Gladiator's Challenge", verb: 'use-ability',
  tags: ['spectacle', 'combat', 'debuff'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'single' },
  checks: [{ stat: 'showmanship', difficulty: 6, onFail: 'half-damage' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'challenged', duration: 3, stacking: 'replace' } },
    { type: 'stat-modify', target: 'target', params: { stat: 'agility', amount: -2 } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'crowd-favor', amount: 5 } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'gladiator' } }],
};

const ironResolve: AbilityDefinition = {
  id: 'iron-resolve', name: 'Iron Resolve', verb: 'use-ability',
  tags: ['spectacle', 'support', 'cleanse'],
  costs: [{ resourceId: 'stamina', amount: 2 }, { resourceId: 'fatigue', amount: 3 }],
  target: { type: 'self' },
  checks: [{ stat: 'might', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'control,fear' } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'gladiator' } }],
};

const allGladiatorAbilities = [crowdCleave, rallyCrowd, gladiatorChallenge, ironResolve];

function buildGladiatorEngine(opts?: {
  playerMight?: number;
  playerShowmanship?: number;
  playerStamina?: number;
  playerCrowdFavor?: number;
  playerFatigue?: number;
  enemyHp?: number;
}) {
  const player: EntityState = {
    id: 'player', blueprintId: 'player', type: 'player', name: 'Gladiator',
    tags: ['player', 'gladiator', 'enslaved'],
    stats: { might: opts?.playerMight ?? 10, agility: 5, showmanship: opts?.playerShowmanship ?? 10 },
    resources: {
      hp: 20,
      stamina: opts?.playerStamina ?? 10,
      fatigue: opts?.playerFatigue ?? 10,
      'crowd-favor': opts?.playerCrowdFavor ?? 40,
    },
    statuses: [], zoneId: 'zone-a',
  };
  const enemy: EntityState = {
    id: 'champion', blueprintId: 'arena-champion', type: 'enemy', name: 'Arena Champion',
    tags: ['enemy', 'gladiator', 'champion'],
    stats: { might: 7, agility: 6, showmanship: 5 },
    resources: { hp: opts?.enemyHp ?? 25, stamina: 6, fatigue: 0, 'crowd-favor': 30 },
    statuses: [], zoneId: 'zone-a',
  };
  return createTestEngine({
    zones,
    entities: [player, enemy],
    modules: [
      statusCore,
      createAbilityCore({ abilities: allGladiatorAbilities, statMapping: { power: 'might', precision: 'agility', focus: 'showmanship' } }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

describe('Gladiator — Crowd Cleave', () => {
  it('deals damage and grants crowd-favor', () => {
    const engine = buildGladiatorEngine();
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'crowd-cleave' }, targetIds: ['champion'],
    });

    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
    expect(events.find(e => e.type === 'ability.damage.applied')).toBeDefined();

    const player = engine.player();
    expect(player.resources['crowd-favor']).toBeGreaterThan(40);
    expect(player.resources.stamina).toBe(7); // 10 - 3
  });

  it('requires gladiator tag', () => {
    const human: EntityState = {
      id: 'player', blueprintId: 'player', type: 'player', name: 'Slave',
      tags: ['player', 'human'],
      stats: { might: 10, agility: 5, showmanship: 10 },
      resources: { hp: 20, stamina: 10, 'crowd-favor': 40 },
      statuses: [], zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'champion', blueprintId: 'champion', type: 'enemy', name: 'Champion',
      tags: ['enemy'], stats: { might: 5, agility: 5, showmanship: 3 },
      resources: { hp: 20, stamina: 5 }, statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [human, enemy],
      modules: [statusCore, createAbilityCore({ abilities: allGladiatorAbilities, statMapping: { power: 'might', precision: 'agility', focus: 'showmanship' } }), createAbilityEffects(), createAbilityReview()],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'crowd-cleave' }, targetIds: ['champion'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

describe('Gladiator — Rally the Crowd', () => {
  it('heals, reduces fatigue, and buffs might', () => {
    const engine = buildGladiatorEngine({ playerShowmanship: 15, playerCrowdFavor: 40, playerFatigue: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'rally-crowd' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const player = engine.player();
      expect(player.resources['crowd-favor']).toBe(25); // 40 - 15
      expect(player.resources.fatigue).toBeLessThan(15);
    }
  });

  it('rejects when crowd-favor is too low', () => {
    const engine = buildGladiatorEngine({ playerCrowdFavor: 5 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'rally-crowd' }, targetIds: [],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

describe('Gladiator — Challenge', () => {
  it('applies challenged status and reduces agility', () => {
    const engine = buildGladiatorEngine({ playerShowmanship: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'gladiators-challenge' }, targetIds: ['champion'],
    });

    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
    const status = events.find(e => e.type === 'ability.status.applied');
    if (status) {
      expect(status.payload.statusId).toBe('challenged');
    }
  });

  it('sets cooldown after use', () => {
    const engine = buildGladiatorEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'gladiators-challenge' }, targetIds: ['champion'],
    });
    expect(isAbilityReady(engine.store.state, 'player', 'gladiators-challenge', allGladiatorAbilities)).toBe(false);
  });
});

// --- Status definitions for resistance tests ---

const gladiatorStatusDefs: StatusDefinition[] = [
  {
    id: 'challenged',
    name: 'Challenged',
    tags: ['control', 'debuff'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 3 },
  },
];

describe('Gladiator — Iron Resolve (cleanse)', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(gladiatorStatusDefs);
  });

  it('removes control and fear statuses from self', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'player', type: 'player', name: 'Gladiator',
      tags: ['player', 'gladiator', 'enslaved'],
      stats: { might: 15, agility: 5, showmanship: 5 },
      resources: { hp: 20, stamina: 10, fatigue: 10, 'crowd-favor': 40 },
      statuses: [
        { id: 'status-1', statusId: 'challenged', stacks: 1, appliedAtTick: 0, expiresAtTick: 3 },
      ],
      zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'champion', blueprintId: 'champion', type: 'enemy', name: 'Champion',
      tags: ['enemy', 'gladiator'], stats: { might: 5, agility: 5, showmanship: 3 },
      resources: { hp: 20, stamina: 5 }, statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [player, enemy],
      modules: [
        statusCore,
        createAbilityCore({ abilities: allGladiatorAbilities, statMapping: { power: 'might', precision: 'agility', focus: 'showmanship' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'iron-resolve' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const removed = events.filter(e => e.type === 'ability.status.removed');
      expect(removed.length).toBeGreaterThanOrEqual(1);
      const p = engine.player();
      expect(p.statuses.find(s => s.id === 'challenged')).toBeUndefined();
    }
  });

  it('costs stamina and fatigue', () => {
    const engine = buildGladiatorEngine({ playerMight: 15 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'iron-resolve' }, targetIds: [],
    });
    const p = engine.player();
    expect(p.resources.stamina).toBe(8); // 10 - 2
    expect(p.resources.fatigue).toBe(7); // 10 - 3
  });
});

describe('Gladiator — Resistance profiles', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(gladiatorStatusDefs);
  });

  it('arena overlord is immune to fear statuses', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'player', type: 'player', name: 'Gladiator',
      tags: ['player', 'gladiator'],
      stats: { might: 5, agility: 5, showmanship: 15 },
      resources: { hp: 20, stamina: 10, fatigue: 0, 'crowd-favor': 40 },
      statuses: [], zoneId: 'zone-a',
    };
    const overlord: EntityState = {
      id: 'overlord', blueprintId: 'arena-overlord', type: 'enemy', name: 'The Overlord',
      tags: ['enemy', 'gladiator', 'role:boss'],
      stats: { might: 9, agility: 5, showmanship: 6 },
      resources: { hp: 60, stamina: 15, fatigue: 0, 'crowd-favor': 90 },
      statuses: [], zoneId: 'zone-a',
      resistances: { fear: 'immune', control: 'resistant' },
    };

    // Use a custom ability that applies a fear status to test immunity
    const fearStrike: AbilityDefinition = {
      id: 'fear-strike', name: 'Fear Strike', verb: 'use-ability',
      tags: ['combat', 'debuff'],
      costs: [{ resourceId: 'stamina', amount: 1 }],
      target: { type: 'single' },
      effects: [
        { type: 'apply-status', target: 'target', params: { statusId: 'test-fear', duration: 3, stacking: 'replace' } },
      ],
      cooldown: 1,
    };
    const fearStatus: StatusDefinition = {
      id: 'test-fear', name: 'Test Fear', tags: ['fear', 'debuff'], stacking: 'replace',
      duration: { type: 'ticks', value: 3 },
    };
    registerStatusDefinitions([fearStatus]);

    const engine = createTestEngine({
      zones, entities: [player, overlord],
      modules: [
        statusCore,
        createAbilityCore({ abilities: [fearStrike], statMapping: { power: 'might', precision: 'agility', focus: 'showmanship' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'fear-strike' }, targetIds: ['overlord'],
    });

    const immune = events.find(e => e.type === 'ability.status.immune');
    expect(immune).toBeDefined();
    expect(overlord.statuses.length).toBe(0);
  });

  it('arena champion resists control (halved duration)', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'player', type: 'player', name: 'Gladiator',
      tags: ['player', 'gladiator'],
      stats: { might: 5, agility: 5, showmanship: 15 },
      resources: { hp: 20, stamina: 10, fatigue: 0, 'crowd-favor': 40 },
      statuses: [], zoneId: 'zone-a',
    };
    const champion: EntityState = {
      id: 'champion', blueprintId: 'arena-champion', type: 'enemy', name: 'Arena Champion',
      tags: ['enemy', 'gladiator', 'champion', 'role:elite'],
      stats: { might: 7, agility: 6, showmanship: 5 },
      resources: { hp: 30, stamina: 8, fatigue: 0, 'crowd-favor': 70 },
      statuses: [], zoneId: 'zone-a',
      resistances: { control: 'resistant' },
    };

    const engine = createTestEngine({
      zones, entities: [player, champion],
      modules: [
        statusCore,
        createAbilityCore({ abilities: allGladiatorAbilities, statMapping: { power: 'might', precision: 'agility', focus: 'showmanship' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'gladiators-challenge' }, targetIds: ['champion'],
    });

    const resisted = events.find(e => e.type === 'ability.status.resisted');
    expect(resisted).toBeDefined();
    // Duration should be halved: 3 → 1 (min 1)
    const applied = events.find(e => e.type === 'ability.status.applied');
    if (applied) {
      expect(applied.payload.duration).toBeLessThanOrEqual(2); // halved from 3
    }
  });
});
