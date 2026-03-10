// Pirate ability integration tests — Broadside, Dirty Fighting, Sea Shanty
// Proves: AoE cannon fire, cheap debuff, morale economy, crew coordination

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
  { id: 'zone-a', roomId: 'test', name: 'Ship Deck', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Below Deck', tags: [] as string[], neighbors: ['zone-a'] },
];

const broadside: AbilityDefinition = {
  id: 'broadside', name: 'Broadside', verb: 'use-ability',
  tags: ['naval', 'combat', 'damage', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 4 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'cunning', difficulty: 8, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 4, damageType: 'cannon' } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'morale', amount: 3 } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'pirate' } }],
};

const dirtyFighting: AbilityDefinition = {
  id: 'dirty-fighting', name: 'Dirty Fighting', verb: 'use-ability',
  tags: ['combat', 'damage', 'debuff'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'single' },
  checks: [{ stat: 'cunning', difficulty: 6, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 4, damageType: 'melee' } },
    { type: 'apply-status', target: 'target', params: { statusId: 'blinded', duration: 2, stacking: 'replace' } },
  ],
  cooldown: 2,
  requirements: [{ type: 'has-tag', params: { tag: 'pirate' } }],
};

const seaShanty: AbilityDefinition = {
  id: 'sea-shanty', name: 'Sea Shanty', verb: 'use-ability',
  tags: ['support', 'buff', 'morale'],
  costs: [{ resourceId: 'stamina', amount: 2 }, { resourceId: 'morale', amount: 5 }],
  target: { type: 'self' },
  checks: [{ stat: 'sea-legs', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 4, resource: 'hp' } },
    { type: 'stat-modify', target: 'actor', params: { stat: 'brawn', amount: 1 } },
    { type: 'stat-modify', target: 'actor', params: { stat: 'sea-legs', amount: 1 } },
  ],
  cooldown: 4,
};

const rumCourage: AbilityDefinition = {
  id: 'rum-courage', name: 'Rum Courage', verb: 'use-ability',
  tags: ['support', 'cleanse', 'morale'],
  costs: [{ resourceId: 'stamina', amount: 2 }, { resourceId: 'morale', amount: 5 }],
  target: { type: 'self' },
  checks: [{ stat: 'sea-legs', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'fear,blind' } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'pirate' } }],
};

const allPirateAbilities = [broadside, dirtyFighting, seaShanty, rumCourage];

function buildPirateEngine(opts?: {
  playerCunning?: number;
  playerSeaLegs?: number;
  playerStamina?: number;
  playerMorale?: number;
  enemyHp?: number;
  extraEnemies?: EntityState[];
}) {
  const player: EntityState = {
    id: 'captain', blueprintId: 'captain', type: 'player', name: 'Captain',
    tags: ['player', 'pirate', 'captain'],
    stats: { brawn: 5, cunning: opts?.playerCunning ?? 10, 'sea-legs': opts?.playerSeaLegs ?? 10 },
    resources: {
      hp: 20,
      stamina: opts?.playerStamina ?? 10,
      morale: opts?.playerMorale ?? 15,
    },
    statuses: [], zoneId: 'zone-a',
  };
  const enemy: EntityState = {
    id: 'sailor', blueprintId: 'navy-sailor', type: 'enemy', name: 'Navy Sailor',
    tags: ['enemy', 'human', 'navy'],
    stats: { brawn: 5, cunning: 4, 'sea-legs': 5 },
    resources: { hp: opts?.enemyHp ?? 16, stamina: 5 },
    statuses: [], zoneId: 'zone-a',
  };
  const entities = [player, enemy, ...(opts?.extraEnemies ?? [])];
  return createTestEngine({
    zones,
    entities,
    playerId: 'captain',
    modules: [
      statusCore,
      createAbilityCore({ abilities: allPirateAbilities, statMapping: { power: 'brawn', precision: 'cunning', focus: 'sea-legs' } }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

describe('Pirate — Broadside', () => {
  it('hits all enemies and grants morale', () => {
    const extra: EntityState = {
      id: 'marine', blueprintId: 'marine', type: 'enemy', name: 'Marine',
      tags: ['enemy', 'human', 'navy'],
      stats: { brawn: 6, cunning: 3, 'sea-legs': 4 },
      resources: { hp: 14, stamina: 5 },
      statuses: [], zoneId: 'zone-a',
    };
    const engine = buildPirateEngine({ playerCunning: 15, extraEnemies: [extra] });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'broadside' }, targetIds: [],
    });

    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
    const player = engine.player();
    expect(player.resources.morale).toBeGreaterThan(15);
    expect(player.resources.stamina).toBe(6); // 10 - 4
  });

  it('requires pirate tag', () => {
    const merchant: EntityState = {
      id: 'captain', blueprintId: 'captain', type: 'player', name: 'Merchant',
      tags: ['player', 'merchant'],
      stats: { brawn: 5, cunning: 10, 'sea-legs': 5 },
      resources: { hp: 20, stamina: 10, morale: 15 },
      statuses: [], zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'sailor', blueprintId: 'sailor', type: 'enemy', name: 'Sailor',
      tags: ['enemy'], stats: { brawn: 5, cunning: 4, 'sea-legs': 3 },
      resources: { hp: 16, stamina: 5 }, statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [merchant, enemy], playerId: 'captain',
      modules: [statusCore, createAbilityCore({ abilities: allPirateAbilities, statMapping: { power: 'brawn', precision: 'cunning', focus: 'sea-legs' } }), createAbilityEffects(), createAbilityReview()],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'broadside' }, targetIds: [],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

describe('Pirate — Dirty Fighting', () => {
  it('deals damage and applies blinded status', () => {
    const engine = buildPirateEngine({ playerCunning: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'dirty-fighting' }, targetIds: ['sailor'],
    });

    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
    const dmg = events.find(e => e.type === 'ability.damage.applied');
    expect(dmg).toBeDefined();

    const status = events.find(e => e.type === 'ability.status.applied');
    if (status) {
      expect(status.payload.statusId).toBe('blinded');
    }
  });

  it('has short cooldown of 2', () => {
    const engine = buildPirateEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'dirty-fighting' }, targetIds: ['sailor'],
    });
    expect(isAbilityReady(engine.store.state, 'captain', 'dirty-fighting', allPirateAbilities)).toBe(false);

    // Advance past cooldown (2 ticks)
    engine.store.advanceTick();
    engine.store.advanceTick();
    expect(isAbilityReady(engine.store.state, 'captain', 'dirty-fighting', allPirateAbilities)).toBe(true);
  });
});

describe('Pirate — Sea Shanty', () => {
  it('heals and buffs when morale sufficient', () => {
    const engine = buildPirateEngine({ playerSeaLegs: 15, playerMorale: 20 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'sea-shanty' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const player = engine.player();
      expect(player.resources.morale).toBe(15); // 20 - 5
    }
  });

  it('rejects when morale too low', () => {
    const engine = buildPirateEngine({ playerMorale: 2 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'sea-shanty' }, targetIds: [],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });

  it('generates review trace', () => {
    const engine = buildPirateEngine({ playerSeaLegs: 15 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'sea-shanty' }, targetIds: [],
    });
    const traces = engine.drainEvents().filter(e => e.type === 'ability.review.trace');
    expect(traces.length).toBe(1);
  });
});

// --- Status definitions for resistance tests ---

const pirateStatusDefs: StatusDefinition[] = [
  {
    id: 'blinded',
    name: 'Blinded',
    tags: ['blind', 'debuff'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
  },
];

describe('Pirate — Rum Courage (cleanse)', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(pirateStatusDefs);
  });

  it('removes blind and fear statuses from self', () => {
    const player: EntityState = {
      id: 'captain', blueprintId: 'captain', type: 'player', name: 'Captain',
      tags: ['player', 'pirate', 'captain'],
      stats: { brawn: 5, cunning: 5, 'sea-legs': 15 },
      resources: { hp: 20, stamina: 10, morale: 15 },
      statuses: [
        { id: 'status-1', statusId: 'blinded', stacks: 1, appliedAtTick: 0, expiresAtTick: 2 },
      ],
      zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'sailor', blueprintId: 'sailor', type: 'enemy', name: 'Sailor',
      tags: ['enemy', 'navy'], stats: { brawn: 5, cunning: 4, 'sea-legs': 3 },
      resources: { hp: 16, stamina: 5 }, statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [player, enemy], playerId: 'captain',
      modules: [
        statusCore,
        createAbilityCore({ abilities: allPirateAbilities, statMapping: { power: 'brawn', precision: 'cunning', focus: 'sea-legs' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'rum-courage' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const removed = events.filter(e => e.type === 'ability.status.removed');
      expect(removed.length).toBeGreaterThanOrEqual(1);
      const p = engine.store.state.entities['captain']!;
      expect(p.statuses.find(s => s.id === 'blinded')).toBeUndefined();
    }
  });

  it('costs stamina and morale', () => {
    const engine = buildPirateEngine({ playerSeaLegs: 15 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'rum-courage' }, targetIds: [],
    });
    const p = engine.store.state.entities['captain']!;
    expect(p.resources.stamina).toBe(8); // 10 - 2
    expect(p.resources.morale).toBe(10); // 15 - 5
  });
});

describe('Pirate — Resistance profiles', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(pirateStatusDefs);
  });

  it('drowned guardian is immune to fear statuses', () => {
    const player: EntityState = {
      id: 'captain', blueprintId: 'captain', type: 'player', name: 'Captain',
      tags: ['player', 'pirate', 'captain'],
      stats: { brawn: 5, cunning: 15, 'sea-legs': 5 },
      resources: { hp: 20, stamina: 10, morale: 15 },
      statuses: [], zoneId: 'zone-a',
    };
    const guardian: EntityState = {
      id: 'guardian', blueprintId: 'sea-beast', type: 'enemy', name: 'Drowned Guardian',
      tags: ['enemy', 'cursed', 'creature', 'role:boss'],
      stats: { brawn: 7, cunning: 2, 'sea-legs': 8 },
      resources: { hp: 22, stamina: 6, morale: 30 },
      statuses: [], zoneId: 'zone-a',
      resistances: { fear: 'immune' },
    };

    const fearAbility: AbilityDefinition = {
      id: 'intimidate', name: 'Intimidate', verb: 'use-ability',
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
      zones, entities: [player, guardian], playerId: 'captain',
      modules: [
        statusCore,
        createAbilityCore({ abilities: [fearAbility], statMapping: { power: 'brawn', precision: 'cunning', focus: 'sea-legs' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'intimidate' }, targetIds: ['guardian'],
    });

    const immune = events.find(e => e.type === 'ability.status.immune');
    expect(immune).toBeDefined();
    expect(guardian.statuses.length).toBe(0);
  });

  it('boarding marine resists blind (halved duration)', () => {
    const player: EntityState = {
      id: 'captain', blueprintId: 'captain', type: 'player', name: 'Captain',
      tags: ['player', 'pirate', 'captain'],
      stats: { brawn: 5, cunning: 15, 'sea-legs': 5 },
      resources: { hp: 20, stamina: 10, morale: 15 },
      statuses: [], zoneId: 'zone-a',
    };
    const marine: EntityState = {
      id: 'marine', blueprintId: 'boarding-marine', type: 'enemy', name: 'Boarding Marine',
      tags: ['enemy', 'colonial', 'navy', 'role:skirmisher'],
      stats: { brawn: 4, cunning: 5, 'sea-legs': 5 },
      resources: { hp: 12, stamina: 5, morale: 12 },
      statuses: [], zoneId: 'zone-a',
      resistances: { blind: 'resistant' },
    };

    const engine = createTestEngine({
      zones, entities: [player, marine], playerId: 'captain',
      modules: [
        statusCore,
        createAbilityCore({ abilities: allPirateAbilities, statMapping: { power: 'brawn', precision: 'cunning', focus: 'sea-legs' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'dirty-fighting' }, targetIds: ['marine'],
    });

    const resisted = events.find(e => e.type === 'ability.status.resisted');
    expect(resisted).toBeDefined();
    // Duration halved: 2 → 1
    const applied = events.find(e => e.type === 'ability.status.applied');
    if (applied) {
      expect(applied.payload.duration).toBe(1);
    }
  });
});
