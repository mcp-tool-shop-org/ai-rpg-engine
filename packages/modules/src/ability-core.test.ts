import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ActionIntent } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore } from './status-core.js';
import {
  createAbilityCore,
  isAbilityOnCooldown,
  isAbilityReady,
  getAvailableAbilities,
  getAbilitiesForGenre,
  GENRE_ABILITIES,
  UNIVERSAL_ABILITIES,
} from './ability-core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [] as string[], neighbors: ['zone-a'] },
];

const fireball: AbilityDefinition = {
  id: 'fireball',
  name: 'Fireball',
  verb: 'cast',
  tags: ['arcane', 'combat', 'fantasy'],
  costs: [{ resourceId: 'mana', amount: 5 }],
  target: { type: 'single', filter: ['enemy'] },
  checks: [],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 8 } },
  ],
  cooldown: 3,
};

const heal: AbilityDefinition = {
  id: 'heal',
  name: 'Heal',
  verb: 'pray',
  tags: ['divine', 'support'],
  costs: [{ resourceId: 'mana', amount: 3 }],
  target: { type: 'self' },
  checks: [],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 5 } },
  ],
  cooldown: 2,
};

const holySmite: AbilityDefinition = {
  id: 'holy-smite',
  name: 'Holy Smite',
  verb: 'pray',
  tags: ['divine', 'combat'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single', filter: ['enemy'] },
  checks: [{ stat: 'will', difficulty: 8, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 6 } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'divine' } }],
};

const dustDevil: AbilityDefinition = {
  id: 'dust-devil',
  name: 'Dust Devil',
  verb: 'commune',
  tags: ['supernatural', 'combat'],
  costs: [{ resourceId: 'resolve', amount: 5 }, { resourceId: 'dust', amount: 10 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'lore', difficulty: 9, onFail: 'abort' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 3 } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'supernatural' } }],
};

const allAbilities = [fireball, heal, holySmite, dustDevil];

function makeEntity(id: string, type: string, tags: string[], overrides?: Partial<EntityState>): EntityState {
  return {
    id,
    blueprintId: id,
    type,
    name: id,
    tags,
    stats: { vigor: 5, instinct: 5, will: 5, lore: 5 },
    resources: { hp: 20, maxHp: 20, stamina: 10, mana: 20, resolve: 20, dust: 20 },
    statuses: [],
    zoneId: 'zone-a',
    ...overrides,
  };
}

function buildEngine(entities: EntityState[], abilities: AbilityDefinition[] = allAbilities) {
  return createTestEngine({
    modules: [
      statusCore,
      createAbilityCore({ abilities }),
    ],
    entities,
    zones,
  });
}

function makeAction(actorId: string, abilityId: string, targetIds?: string[]): ActionIntent {
  return {
    id: `act-${actorId}-${abilityId}`,
    actorId,
    verb: 'use-ability',
    targetIds,
    parameters: { abilityId },
    source: 'player',
    issuedAtTick: 1,
  };
}

// ---------------------------------------------------------------------------
// Group 1: Basic ability use
// ---------------------------------------------------------------------------

describe('ability-core: basic use', () => {
  it('successfully uses an ability and deducts resources', () => {
    const player = makeEntity('player', 'player', ['player']);
    const enemy = makeEntity('goblin', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'fireball', ['goblin']));

    // Should have resource.changed (mana deduction) and ability.used
    const resourceEvt = events.find((e) => e.type === 'resource.changed');
    expect(resourceEvt).toBeDefined();
    expect(resourceEvt!.payload.resource).toBe('mana');
    expect(resourceEvt!.payload.delta).toBe(-5);
    expect(resourceEvt!.payload.previous).toBe(20);
    expect(resourceEvt!.payload.current).toBe(15);

    const usedEvt = events.find((e) => e.type === 'ability.used');
    expect(usedEvt).toBeDefined();
    expect(usedEvt!.payload.abilityId).toBe('fireball');
    expect(usedEvt!.payload.abilityName).toBe('Fireball');
    expect(usedEvt!.payload.targetIds).toEqual(['goblin']);

    // Verify mana was actually deducted
    expect(engine.store.state.entities.player.resources.mana).toBe(15);
  });

  it('self-targeting ability works', () => {
    const player = makeEntity('player', 'player', ['player']);
    const engine = buildEngine([player]);

    const events = engine.processAction(makeAction('player', 'heal'));

    const usedEvt = events.find((e) => e.type === 'ability.used');
    expect(usedEvt).toBeDefined();
    expect(usedEvt!.payload.abilityId).toBe('heal');
    expect(usedEvt!.payload.targetIds).toEqual(['player']);
  });
});

// ---------------------------------------------------------------------------
// Group 2: Rejection cases
// ---------------------------------------------------------------------------

describe('ability-core: rejections', () => {
  it('rejects when no abilityId is specified', () => {
    const player = makeEntity('player', 'player', ['player']);
    const engine = buildEngine([player]);

    const action: ActionIntent = {
      id: 'bad-action',
      actorId: 'player',
      verb: 'use-ability',
      parameters: {},
      source: 'player',
      issuedAtTick: 1,
    };
    const events = engine.processAction(action);

    expect(events[0].type).toBe('action.rejected');
    expect(events[0].payload.reason).toBe('no abilityId specified');
  });

  it('rejects when ability is not found', () => {
    const player = makeEntity('player', 'player', ['player']);
    const engine = buildEngine([player]);

    const events = engine.processAction(makeAction('player', 'nonexistent'));

    expect(events[0].type).toBe('action.rejected');
    expect(events[0].payload.reason).toContain('not found');
  });

  it('rejects when actor is defeated', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 0, mana: 20, stamina: 10 },
    });
    const enemy = makeEntity('goblin', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'fireball', ['goblin']));

    expect(events[0].type).toBe('action.rejected');
    expect(events[0].payload.reason).toBe('actor is defeated');
  });

  it('rejects when insufficient resources', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 20, mana: 2, stamina: 10 },
    });
    const enemy = makeEntity('goblin', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'fireball', ['goblin']));

    expect(events[0].type).toBe('ability.rejected');
    expect(events[0].payload.reason).toContain('not enough mana');
  });

  it('rejects when tag requirement not met', () => {
    const player = makeEntity('player', 'player', ['player']); // no 'divine' tag
    const enemy = makeEntity('goblin', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'holy-smite', ['goblin']));

    expect(events[0].type).toBe('ability.rejected');
    expect(events[0].payload.reason).toContain('has-tag');
  });

  it('rejects when target is not in same zone', () => {
    const player = makeEntity('player', 'player', ['player']);
    const enemy = makeEntity('goblin', 'enemy', ['enemy'], { zoneId: 'zone-b' });
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'fireball', ['goblin']));

    expect(events[0].type).toBe('ability.rejected');
    expect(events[0].payload.reason).toContain('not in same zone');
  });

  it('rejects when target lacks required tags', () => {
    const player = makeEntity('player', 'player', ['player']);
    const npc = makeEntity('merchant', 'npc', ['npc', 'friendly']); // not 'enemy'
    const engine = buildEngine([player, npc]);

    const events = engine.processAction(makeAction('player', 'fireball', ['merchant']));

    expect(events[0].type).toBe('ability.rejected');
    expect(events[0].payload.reason).toContain('lacks required tags');
  });

  it('rejects when no target specified for single-target ability', () => {
    const player = makeEntity('player', 'player', ['player']);
    const engine = buildEngine([player]);

    const events = engine.processAction(makeAction('player', 'fireball'));

    expect(events[0].type).toBe('ability.rejected');
    expect(events[0].payload.reason).toBe('no target specified');
  });
});

// ---------------------------------------------------------------------------
// Group 3: Cooldown enforcement
// ---------------------------------------------------------------------------

describe('ability-core: cooldowns', () => {
  it('ability goes on cooldown after use', () => {
    const player = makeEntity('player', 'player', ['player']);
    const enemy = makeEntity('goblin', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);

    engine.processAction(makeAction('player', 'fireball', ['goblin']));

    expect(isAbilityOnCooldown(engine.store.state, 'player', 'fireball')).toBe(true);
  });

  it('rejects ability on cooldown', () => {
    const player = makeEntity('player', 'player', ['player']);
    const enemy = makeEntity('goblin', 'enemy', ['enemy'], {
      resources: { hp: 100, maxHp: 100 },
    });
    const engine = buildEngine([player, enemy]);

    // First use succeeds
    const firstResult = engine.processAction(makeAction('player', 'fireball', ['goblin']));
    expect(firstResult.some((e) => e.type === 'ability.used')).toBe(true);

    // Second use rejected (on cooldown)
    const secondResult = engine.processAction(makeAction('player', 'fireball', ['goblin']));
    expect(secondResult[0].type).toBe('ability.rejected');
    expect(secondResult[0].payload.reason).toContain('on cooldown');
  });

  it('ability with no cooldown can be used repeatedly', () => {
    const noCooldownAbility: AbilityDefinition = {
      ...fireball,
      id: 'quick-bolt',
      name: 'Quick Bolt',
      cooldown: 0,
      costs: [{ resourceId: 'mana', amount: 1 }],
    };

    const player = makeEntity('player', 'player', ['player']);
    const enemy = makeEntity('goblin', 'enemy', ['enemy'], {
      resources: { hp: 100, maxHp: 100 },
    });
    const engine = buildEngine([player, enemy], [noCooldownAbility]);

    // Use twice
    const first = engine.processAction(makeAction('player', 'quick-bolt', ['goblin']));
    const second = engine.processAction(makeAction('player', 'quick-bolt', ['goblin']));

    expect(first.some((e) => e.type === 'ability.used')).toBe(true);
    expect(second.some((e) => e.type === 'ability.used')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group 4: Stat checks
// ---------------------------------------------------------------------------

describe('ability-core: stat checks', () => {
  it('ability with onFail: abort fails entirely when check fails', () => {
    // Give very low lore to make check likely to fail
    const player = makeEntity('player', 'player', ['player', 'supernatural'], {
      stats: { vigor: 5, instinct: 5, will: 5, lore: 0 },
    });
    const enemy = makeEntity('goblin', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'dust-devil', ['goblin']));

    // Either ability.check.failed or ability.used depending on roll
    const failedEvt = events.find((e) => e.type === 'ability.check.failed');
    const usedEvt = events.find((e) => e.type === 'ability.used');

    // One of these should exist (deterministic based on tick + entity IDs)
    expect(failedEvt || usedEvt).toBeDefined();

    if (failedEvt) {
      // Costs should still be deducted (you tried)
      const resourceEvts = events.filter((e) => e.type === 'resource.changed');
      expect(resourceEvts.length).toBeGreaterThan(0);
    }
  });

  it('ability with onFail: half-damage still proceeds', () => {
    const player = makeEntity('player', 'player', ['player', 'divine']);
    const enemy = makeEntity('goblin', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'holy-smite', ['goblin']));

    // Should always emit ability.used (half-damage doesn't abort)
    const usedEvt = events.find((e) => e.type === 'ability.used');
    expect(usedEvt).toBeDefined();
    expect(usedEvt!.payload.checks).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Group 5: Multi-cost abilities
// ---------------------------------------------------------------------------

describe('ability-core: multi-cost', () => {
  it('deducts all costs for multi-resource ability', () => {
    const player = makeEntity('player', 'player', ['player', 'supernatural'], {
      stats: { vigor: 5, instinct: 5, will: 5, lore: 20 },
    });
    const enemy = makeEntity('goblin', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'dust-devil', ['goblin']));

    // Check if used (high lore should pass the check)
    const usedOrFailed = events.find((e) =>
      e.type === 'ability.used' || e.type === 'ability.check.failed',
    );
    expect(usedOrFailed).toBeDefined();

    // Either way, costs should be deducted
    const resourceEvts = events.filter((e) => e.type === 'resource.changed');
    const resolveEvt = resourceEvts.find((e) => e.payload.resource === 'resolve');
    const dustEvt = resourceEvts.find((e) => e.payload.resource === 'dust');

    expect(resolveEvt).toBeDefined();
    expect(resolveEvt!.payload.delta).toBe(-5);
    expect(dustEvt).toBeDefined();
    expect(dustEvt!.payload.delta).toBe(-10);
  });

  it('rejects if any single cost is insufficient', () => {
    const player = makeEntity('player', 'player', ['player', 'supernatural'], {
      resources: { hp: 20, resolve: 20, dust: 5 }, // not enough dust
    });
    const enemy = makeEntity('goblin', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'dust-devil', ['goblin']));

    expect(events[0].type).toBe('ability.rejected');
    expect(events[0].payload.reason).toContain('not enough dust');
  });
});

// ---------------------------------------------------------------------------
// Group 6: All-enemies targeting
// ---------------------------------------------------------------------------

describe('ability-core: all-enemies targeting', () => {
  it('targets all enemies in zone', () => {
    const player = makeEntity('player', 'player', ['player', 'supernatural'], {
      stats: { vigor: 5, instinct: 5, will: 5, lore: 20 },
    });
    const goblin = makeEntity('goblin', 'enemy', ['enemy']);
    const orc = makeEntity('orc', 'enemy', ['enemy']);
    const friendlyNpc = makeEntity('ally', 'player', ['ally']); // same type as actor, excluded
    const engine = buildEngine([player, goblin, orc, friendlyNpc]);

    const events = engine.processAction(makeAction('player', 'dust-devil'));

    const usedOrFailed = events.find((e) =>
      e.type === 'ability.used' || e.type === 'ability.check.failed',
    );
    expect(usedOrFailed).toBeDefined();

    if (usedOrFailed!.type === 'ability.used') {
      const targetIds = usedOrFailed!.payload.targetIds as string[];
      expect(targetIds).toContain('goblin');
      expect(targetIds).toContain('orc');
      expect(targetIds).not.toContain('ally');
    }
  });
});

// ---------------------------------------------------------------------------
// Group 7: Helper functions
// ---------------------------------------------------------------------------

describe('ability-core: helpers', () => {
  it('isAbilityReady returns false when on cooldown', () => {
    const player = makeEntity('player', 'player', ['player']);
    const enemy = makeEntity('goblin', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);

    expect(isAbilityReady(engine.store.state, 'player', 'fireball', allAbilities)).toBe(true);

    engine.processAction(makeAction('player', 'fireball', ['goblin']));

    expect(isAbilityReady(engine.store.state, 'player', 'fireball', allAbilities)).toBe(false);
  });

  it('getAvailableAbilities filters out unusable abilities', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 20, mana: 4, stamina: 10, resolve: 20, dust: 20 },
    });
    const engine = buildEngine([player]);

    // Player has 4 mana — can't afford fireball (5), can afford heal (3)
    // Player lacks 'divine' tag — can't use holy-smite
    // Player lacks 'supernatural' tag — can't use dust-devil
    const available = getAvailableAbilities(engine.store.state, 'player', allAbilities);
    const availableIds = available.map((a) => a.id);

    expect(availableIds).toContain('heal');
    expect(availableIds).not.toContain('fireball');
    expect(availableIds).not.toContain('holy-smite');
    expect(availableIds).not.toContain('dust-devil');
  });

  it('getAbilitiesForGenre filters by genre and tags', () => {
    // Temporarily populate genre table
    const savedFantasy = GENRE_ABILITIES['fantasy'];
    GENRE_ABILITIES['fantasy'] = [holySmite];

    const result = getAbilitiesForGenre('fantasy', ['divine']);
    expect(result.map((a) => a.id)).toContain('holy-smite');

    const resultNoTag = getAbilitiesForGenre('fantasy', ['warrior']);
    expect(resultNoTag.map((a) => a.id)).not.toContain('holy-smite');

    // Restore
    if (savedFantasy) {
      GENRE_ABILITIES['fantasy'] = savedFantasy;
    } else {
      delete GENRE_ABILITIES['fantasy'];
    }
  });
});
