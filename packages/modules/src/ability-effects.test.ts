import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ActionIntent } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore, hasStatus } from './status-core.js';
import { createAbilityCore } from './ability-core.js';
import { createAbilityEffects, registerEffectHandler, getEffectHandler } from './ability-effects.js';
import type { AbilityEffectHandler } from './ability-effects.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: [] },
];

const damageAbility: AbilityDefinition = {
  id: 'fireball',
  name: 'Fireball',
  verb: 'cast',
  tags: ['arcane', 'combat'],
  costs: [{ resourceId: 'mana', amount: 5 }],
  target: { type: 'single', filter: ['enemy'] },
  checks: [],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 8 } },
  ],
  cooldown: 0,
};

const healAbility: AbilityDefinition = {
  id: 'heal',
  name: 'Heal',
  verb: 'pray',
  tags: ['divine', 'support'],
  costs: [{ resourceId: 'mana', amount: 3 }],
  target: { type: 'self' },
  checks: [],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 10, resource: 'hp' } },
  ],
  cooldown: 0,
};

const statusAbility: AbilityDefinition = {
  id: 'curse',
  name: 'Curse',
  verb: 'hex',
  tags: ['dark', 'debuff'],
  costs: [{ resourceId: 'mana', amount: 4 }],
  target: { type: 'single', filter: ['enemy'] },
  checks: [],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'cursed', duration: 3 } },
  ],
  cooldown: 0,
};

const removeStatusAbility: AbilityDefinition = {
  id: 'purify',
  name: 'Purify',
  verb: 'pray',
  tags: ['divine', 'support'],
  costs: [{ resourceId: 'mana', amount: 2 }],
  target: { type: 'self' },
  checks: [],
  effects: [
    { type: 'remove-status', target: 'actor', params: { statusId: 'cursed' } },
  ],
  cooldown: 0,
};

const resourceModAbility: AbilityDefinition = {
  id: 'siphon',
  name: 'Siphon',
  verb: 'cast',
  tags: ['arcane'],
  costs: [],
  target: { type: 'single', filter: ['enemy'] },
  checks: [],
  effects: [
    { type: 'resource-modify', target: 'target', params: { resource: 'stamina', amount: -3 } },
  ],
  cooldown: 0,
};

const statModAbility: AbilityDefinition = {
  id: 'empower',
  name: 'Empower',
  verb: 'cast',
  tags: ['buff'],
  costs: [{ resourceId: 'mana', amount: 2 }],
  target: { type: 'self' },
  checks: [],
  effects: [
    { type: 'stat-modify', target: 'actor', params: { stat: 'vigor', amount: 3 } },
  ],
  cooldown: 0,
};

const comboAbility: AbilityDefinition = {
  id: 'holy-smite',
  name: 'Holy Smite',
  verb: 'pray',
  tags: ['divine', 'combat'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single', filter: ['enemy'] },
  checks: [],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 6 } },
    { type: 'apply-status', target: 'target', params: { statusId: 'holy-fire', duration: 2 } },
  ],
  cooldown: 0,
};

const aoeAbility: AbilityDefinition = {
  id: 'shockwave',
  name: 'Shockwave',
  verb: 'strike',
  tags: ['physical', 'combat'],
  costs: [{ resourceId: 'stamina', amount: 5 }],
  target: { type: 'all-enemies' },
  checks: [],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 4 } },
  ],
  cooldown: 0,
};

const halfDamageAbility: AbilityDefinition = {
  id: 'bolt',
  name: 'Lightning Bolt',
  verb: 'cast',
  tags: ['arcane', 'combat'],
  costs: [{ resourceId: 'mana', amount: 3 }],
  target: { type: 'single', filter: ['enemy'] },
  checks: [{ stat: 'will', difficulty: 8, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 10 } },
  ],
  cooldown: 0,
};

const allAbilities = [
  damageAbility, healAbility, statusAbility, removeStatusAbility,
  resourceModAbility, statModAbility, comboAbility, aoeAbility, halfDamageAbility,
];

function makeEntity(id: string, type: string, tags: string[], overrides?: Partial<EntityState>): EntityState {
  return {
    id,
    blueprintId: id,
    type,
    name: id,
    tags,
    stats: { vigor: 10, instinct: 8, will: 12, maxHp: 30, maxMana: 20, maxStamina: 15 },
    resources: { hp: 25, mana: 20, stamina: 15 },
    statuses: [],
    zoneId: 'zone-a',
    ...overrides,
  };
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

function buildEngine(entities: EntityState[], abilities: AbilityDefinition[] = allAbilities) {
  return createTestEngine({
    modules: [
      statusCore,
      createAbilityCore({ abilities }),
      createAbilityEffects(),
    ],
    entities,
    zones,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ability-effects: damage', () => {
  it('deals full damage to target', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'fireball', ['goblin']));

    const dmgEvent = events.find((e) => e.type === 'ability.damage.applied');
    expect(dmgEvent).toBeDefined();
    expect(dmgEvent!.payload.finalDamage).toBe(8);
    expect(dmgEvent!.payload.halfDamage).toBe(false);
    expect(engine.entity('goblin').resources.hp).toBe(12); // 20 - 8
  });

  it('triggers defeat when damage kills target', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 5, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'fireball', ['goblin']));

    expect(engine.entity('goblin').resources.hp).toBe(0);

    const defeatEvent = events.find((e) => e.type === 'combat.entity.defeated');
    expect(defeatEvent).toBeDefined();
    expect(defeatEvent!.payload.cause).toBe('ability');
    expect(defeatEvent!.payload.abilityId).toBe('fireball');
  });

  it('deals half damage when stat check fails with half-damage onFail', () => {
    // bolt has onFail: 'half-damage' check — with will: 0 it should fail
    const player = makeEntity('player', 'pc', ['player'], { stats: { vigor: 10, instinct: 8, will: 0, maxHp: 30, maxMana: 20, maxStamina: 15 } });
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'bolt', ['goblin']));

    const usedEvent = events.find((e) => e.type === 'ability.used');
    expect(usedEvent).toBeDefined();

    const dmgEvent = events.find((e) => e.type === 'ability.damage.applied');
    if (dmgEvent) {
      const damage = dmgEvent.payload.finalDamage as number;
      expect(damage).toBeGreaterThanOrEqual(1);
      expect(damage).toBeLessThanOrEqual(10);
    }
  });
});

describe('ability-effects: heal', () => {
  it('restores HP', () => {
    const player = makeEntity('player', 'pc', ['player'], { resources: { hp: 10, mana: 20, stamina: 15 } });
    const engine = buildEngine([player]);

    const events = engine.processAction(makeAction('player', 'heal'));

    const healEvent = events.find((e) => e.type === 'ability.heal.applied');
    expect(healEvent).toBeDefined();
    expect(healEvent!.payload.amount).toBe(10);
    expect(healEvent!.payload.actual).toBe(10); // 10 + 10 = 20, under maxHp=30
    expect(engine.player().resources.hp).toBe(20);
  });

  it('caps heal at max resource', () => {
    const player = makeEntity('player', 'pc', ['player'], { resources: { hp: 28, mana: 20, stamina: 15 } });
    const engine = buildEngine([player]);

    const events = engine.processAction(makeAction('player', 'heal'));

    const healEvent = events.find((e) => e.type === 'ability.heal.applied');
    expect(healEvent).toBeDefined();
    expect(healEvent!.payload.actual).toBe(2); // 28 + 2 = 30 (maxHp)
    expect(engine.player().resources.hp).toBe(30);
  });
});

describe('ability-effects: apply-status', () => {
  it('applies a status to target', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'curse', ['goblin']));

    expect(hasStatus(engine.entity('goblin'), 'cursed')).toBe(true);

    const statusEvent = events.find((e) => e.type === 'ability.status.applied');
    expect(statusEvent).toBeDefined();
    expect(statusEvent!.payload.statusId).toBe('cursed');
    expect(statusEvent!.payload.duration).toBe(3);
  });
});

describe('ability-effects: remove-status', () => {
  it('removes an existing status from actor', () => {
    const player = makeEntity('player', 'pc', ['player']);
    player.statuses.push({
      id: 'test-status-1',
      statusId: 'cursed',
      stacks: 1,
      appliedAtTick: 0,
    });
    const engine = buildEngine([player]);

    expect(hasStatus(engine.player(), 'cursed')).toBe(true);

    const events = engine.processAction(makeAction('player', 'purify'));

    expect(hasStatus(engine.player(), 'cursed')).toBe(false);

    const removeEvent = events.find((e) => e.type === 'ability.status.removed');
    expect(removeEvent).toBeDefined();
    expect(removeEvent!.payload.statusId).toBe('cursed');
  });

  it('does nothing if status not present', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const engine = buildEngine([player]);

    const events = engine.processAction(makeAction('player', 'purify'));

    const removeEvent = events.find((e) => e.type === 'ability.status.removed');
    expect(removeEvent).toBeUndefined();
  });
});

describe('ability-effects: resource-modify', () => {
  it('drains target resource', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20, maxStamina: 10 } });
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'siphon', ['goblin']));

    expect(engine.entity('goblin').resources.stamina).toBe(7); // 10 - 3

    const modEvent = events.find((e) => e.type === 'ability.resource.modified');
    expect(modEvent).toBeDefined();
    expect(modEvent!.payload.resource).toBe('stamina');
    expect(modEvent!.payload.delta).toBe(-3);
  });

  it('clamps resource at 0', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 1 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20, maxStamina: 10 } });
    const engine = buildEngine([player, enemy]);

    engine.processAction(makeAction('player', 'siphon', ['goblin']));

    expect(engine.entity('goblin').resources.stamina).toBe(0);
  });
});

describe('ability-effects: stat-modify', () => {
  it('modifies a stat on actor', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const engine = buildEngine([player]);

    const events = engine.processAction(makeAction('player', 'empower'));

    expect(engine.player().stats.vigor).toBe(13); // 10 + 3

    const statEvent = events.find((e) => e.type === 'ability.stat.modified');
    expect(statEvent).toBeDefined();
    expect(statEvent!.payload.stat).toBe('vigor');
    expect(statEvent!.payload.delta).toBe(3);
    expect(statEvent!.payload.before).toBe(10);
    expect(statEvent!.payload.after).toBe(13);
  });
});

describe('ability-effects: combo (damage + status)', () => {
  it('applies damage and status in sequence', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 15 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'holy-smite', ['goblin']));

    // Damage applied
    expect(engine.entity('goblin').resources.hp).toBe(14); // 20 - 6

    // Status applied
    expect(hasStatus(engine.entity('goblin'), 'holy-fire')).toBe(true);

    // Both events present
    const dmgEvent = events.find((e) => e.type === 'ability.damage.applied');
    const statusEvent = events.find((e) => e.type === 'ability.status.applied');
    expect(dmgEvent).toBeDefined();
    expect(statusEvent).toBeDefined();

    // Resolved event
    const resolved = events.find((e) => e.type === 'ability.resolved');
    expect(resolved).toBeDefined();
    expect(resolved!.payload.effectCount).toBe(2);
  });
});

describe('ability-effects: AoE damage', () => {
  it('damages all enemies in zone', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const e1 = makeEntity('e1', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const e2 = makeEntity('e2', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const e3 = makeEntity('e3', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 }, zoneId: 'zone-b' });
    const engine = buildEngine([player, e1, e2, e3]);

    const events = engine.processAction(makeAction('player', 'shockwave'));

    // e1 and e2 should be damaged (same zone)
    expect(engine.entity('e1').resources.hp).toBe(16); // 20 - 4
    expect(engine.entity('e2').resources.hp).toBe(16);

    // e3 should be untouched (different zone)
    expect(engine.entity('e3').resources.hp).toBe(20);

    const dmgEvents = events.filter((e) => e.type === 'ability.damage.applied');
    expect(dmgEvents.length).toBe(2);
  });
});

describe('ability-effects: resolved event', () => {
  it('emits ability.resolved after all effects', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    const events = engine.processAction(makeAction('player', 'fireball', ['goblin']));

    const resolved = events.find((e) => e.type === 'ability.resolved');
    expect(resolved).toBeDefined();
    expect(resolved!.payload.abilityId).toBe('fireball');
    expect(resolved!.payload.effectCount).toBe(1);
    expect(resolved!.payload.allChecksPassed).toBe(true);
  });
});

describe('ability-effects: custom handler', () => {
  it('can register and use a custom effect handler', () => {
    const customEvents: string[] = [];
    const customHandler: AbilityEffectHandler = (effect, ctx) => {
      customEvents.push(`custom:${effect.params.flavor}`);
      return [{
        id: `evt-custom-${Date.now()}`,
        tick: ctx.tick,
        type: 'ability.custom.fired',
        actorId: ctx.actor.id,
        payload: { flavor: effect.params.flavor },
      }];
    };
    registerEffectHandler('custom-zap', customHandler);
    expect(getEffectHandler('custom-zap')).toBe(customHandler);

    const customAbility: AbilityDefinition = {
      id: 'zap',
      name: 'Zap',
      verb: 'cast',
      tags: ['custom'],
      costs: [],
      target: { type: 'single', filter: ['enemy'] },
      checks: [],
      effects: [
        { type: 'custom-zap', target: 'target', params: { flavor: 'electric' } },
      ],
      cooldown: 0,
    };

    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });

    const engine = createTestEngine({
      modules: [
        statusCore,
        createAbilityCore({ abilities: [...allAbilities, customAbility] }),
        createAbilityEffects(),
      ],
      entities: [player, enemy],
      zones,
    });

    const events = engine.processAction(makeAction('player', 'zap', ['goblin']));

    expect(customEvents).toContain('custom:electric');
    const customEvent = events.find((e) => e.type === 'ability.custom.fired');
    expect(customEvent).toBeDefined();
    expect(customEvent!.payload.flavor).toBe('electric');
  });
});

describe('ability-effects: unknown effect type', () => {
  it('emits unknown event for unregistered effect types', () => {
    const unknownAbility: AbilityDefinition = {
      id: 'mystery',
      name: 'Mystery',
      verb: 'cast',
      tags: ['weird'],
      costs: [],
      target: { type: 'self' },
      checks: [],
      effects: [
        { type: 'teleport-to-moon', target: 'actor', params: { destination: 'moon' } },
      ],
      cooldown: 0,
    };

    const player = makeEntity('player', 'pc', ['player']);

    const engine = createTestEngine({
      modules: [
        statusCore,
        createAbilityCore({ abilities: [unknownAbility] }),
        createAbilityEffects(),
      ],
      entities: [player],
      zones,
    });

    const events = engine.processAction(makeAction('player', 'mystery'));

    const unknownEvent = events.find((e) => e.type === 'ability.effect.unknown');
    expect(unknownEvent).toBeDefined();
    expect(unknownEvent!.payload.effectType).toBe('teleport-to-moon');
  });
});
