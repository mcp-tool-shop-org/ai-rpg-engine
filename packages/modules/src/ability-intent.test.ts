import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore } from './status-core.js';
import { createAbilityCore } from './ability-core.js';
import { createAbilityEffects } from './ability-effects.js';
import { scoreAbilityUse, selectNpcAbilityAction, formatAbilityDecision } from './ability-intent.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: [] },
];

const fireball: AbilityDefinition = {
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
  cooldown: 3,
};

const heal: AbilityDefinition = {
  id: 'heal',
  name: 'Heal',
  verb: 'pray',
  tags: ['divine', 'support', 'heal'],
  costs: [{ resourceId: 'mana', amount: 3 }],
  target: { type: 'self' },
  checks: [],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 10, resource: 'hp' } },
  ],
  cooldown: 0,
};

const shockwave: AbilityDefinition = {
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

const curse: AbilityDefinition = {
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

const allAbilities = [fireball, heal, shockwave, curse];

function makeEntity(id: string, type: string, tags: string[], overrides?: Partial<EntityState>): EntityState {
  return {
    id,
    blueprintId: id,
    type,
    name: id,
    tags,
    stats: { vigor: 10, instinct: 8, will: 5, maxHp: 30, maxMana: 20, maxStamina: 15 },
    resources: { hp: 25, mana: 20, stamina: 15 },
    statuses: [],
    zoneId: 'zone-a',
    ...overrides,
  };
}

function buildWorldState(entities: EntityState[]) {
  const engine = createTestEngine({
    modules: [
      statusCore,
      createAbilityCore({ abilities: allAbilities }),
      createAbilityEffects(),
    ],
    entities,
    zones,
  });
  return engine.store.state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ability-intent: scoreAbilityUse', () => {
  it('scores a single-target damage ability', () => {
    const npc = makeEntity('npc1', 'npc', ['enemy']);
    const player = makeEntity('player', 'pc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const world = buildWorldState([npc, player]);

    const scores = scoreAbilityUse(npc, fireball, world);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].abilityId).toBe('fireball');
    expect(scores[0].score).toBeGreaterThan(0);
    expect(scores[0].resolvedVerb).toBe('use-ability');
  });

  it('scores self-heal higher when HP is low', () => {
    const npcHealthy = makeEntity('npc-healthy', 'npc', ['enemy']);
    const npcHurt = makeEntity('npc-hurt', 'npc', ['enemy'], { resources: { hp: 5, mana: 20, stamina: 15 } });
    const player = makeEntity('player', 'pc', ['enemy']);

    const worldH = buildWorldState([npcHealthy, player]);
    const worldL = buildWorldState([npcHurt, player]);

    const scoresHealthy = scoreAbilityUse(npcHealthy, heal, worldH);
    const scoresHurt = scoreAbilityUse(npcHurt, heal, worldL);

    expect(scoresHurt[0].score).toBeGreaterThan(scoresHealthy[0].score);
  });

  it('scores AoE higher with more enemies', () => {
    const npc = makeEntity('npc1', 'npc', ['npc']);
    const e1 = makeEntity('e1', 'pc', ['enemy']);
    const e2 = makeEntity('e2', 'pc', ['enemy']);
    const e3 = makeEntity('e3', 'pc', ['enemy']);

    const world1 = buildWorldState([npc, e1]);
    const world3 = buildWorldState([npc, e1, e2, e3]);

    const scores1 = scoreAbilityUse(npc, shockwave, world1);
    const scores3 = scoreAbilityUse(npc, shockwave, world3);

    expect(scores3[0].score).toBeGreaterThan(scores1[0].score);
  });

  it('returns empty scores when no valid targets', () => {
    const npc = makeEntity('npc1', 'npc', ['npc']);
    const world = buildWorldState([npc]);

    const scores = scoreAbilityUse(npc, fireball, world);
    expect(scores.length).toBe(0);
  });

  it('prioritizes low-HP targets for damage abilities', () => {
    const npc = makeEntity('npc1', 'npc', ['npc']);
    const healthy = makeEntity('healthy', 'pc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { maxHp: 20, vigor: 5, instinct: 5, will: 5 } });
    const wounded = makeEntity('wounded', 'pc', ['enemy'], { resources: { hp: 3, mana: 0, stamina: 10 }, stats: { maxHp: 20, vigor: 5, instinct: 5, will: 5 } });

    const world = buildWorldState([npc, healthy, wounded]);
    const scores = scoreAbilityUse(npc, fireball, world);

    const healthyScore = scores.find(s => s.targetId === 'healthy');
    const woundedScore = scores.find(s => s.targetId === 'wounded');
    expect(woundedScore).toBeDefined();
    expect(healthyScore).toBeDefined();
    expect(woundedScore!.score).toBeGreaterThan(healthyScore!.score);
  });
});

describe('ability-intent: selectNpcAbilityAction', () => {
  it('selects the best ability for NPC', () => {
    const npc = makeEntity('npc1', 'npc', ['enemy']);
    const player = makeEntity('player', 'pc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const world = buildWorldState([npc, player]);

    const decision = selectNpcAbilityAction(npc, world, allAbilities);
    expect(decision.chosen).not.toBeNull();
    expect(decision.entityId).toBe('npc1');
    expect(decision.chosen!.resolvedVerb).toBe('use-ability');
  });

  it('returns null chosen when no abilities available', () => {
    const npc = makeEntity('npc1', 'npc', ['enemy'], { resources: { hp: 25, mana: 0, stamina: 0 } });
    const player = makeEntity('player', 'pc', ['enemy']);
    const world = buildWorldState([npc, player]);

    const decision = selectNpcAbilityAction(npc, world, allAbilities);
    // May or may not find abilities depending on costs — cursor should still be null if nothing is ready
    // With 0 mana and 0 stamina, fireball/curse/shockwave all cost resources
    // Only heal costs mana (which is 0), so nothing should be available
    expect(decision.chosen).toBeNull();
  });

  it('prefers heal when NPC HP is low', () => {
    const npc = makeEntity('npc1', 'npc', ['enemy'], { resources: { hp: 5, mana: 20, stamina: 15 } });
    const player = makeEntity('player', 'pc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const world = buildWorldState([npc, player]);

    const decision = selectNpcAbilityAction(npc, world, allAbilities);
    expect(decision.chosen).not.toBeNull();
    // heal should score very high due to low HP bonus
    expect(decision.chosen!.abilityId).toBe('heal');
  });
});

describe('ability-intent: formatAbilityDecision', () => {
  it('produces readable output', () => {
    const npc = makeEntity('npc1', 'npc', ['enemy']);
    const player = makeEntity('player', 'pc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const world = buildWorldState([npc, player]);

    const decision = selectNpcAbilityAction(npc, world, allAbilities);
    const formatted = formatAbilityDecision(decision);

    expect(formatted).toContain('AI Ability Decision');
    expect(formatted).toContain('npc1');
    expect(formatted).toContain('Score:');
  });

  it('handles no abilities gracefully', () => {
    const npc = makeEntity('npc1', 'npc', ['enemy'], { resources: { hp: 25, mana: 0, stamina: 0 } });
    const world = buildWorldState([npc]);

    const decision = selectNpcAbilityAction(npc, world, allAbilities);
    const formatted = formatAbilityDecision(decision);

    expect(formatted).toContain('no abilities available');
  });
});
