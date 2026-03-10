// ability-intent-resistance tests — AI resistance awareness scoring
// Proves: AI penalizes abilities against immune/resistant targets,
// values abilities against vulnerable targets, and values cleanse when debuffed.

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import type { AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore } from './status-core.js';
import { createAbilityCore } from './ability-core.js';
import { createAbilityEffects } from './ability-effects.js';
import { scoreAbilityUse, selectNpcAbilityAction } from './ability-intent.js';
import {
  registerStatusDefinitions,
  clearStatusRegistry,
} from './status-semantics.js';

// ---------------------------------------------------------------------------
// Status definitions
// ---------------------------------------------------------------------------

const mesmerizedDef: StatusDefinition = {
  id: 'mesmerized',
  name: 'Mesmerized',
  tags: ['control', 'supernatural', 'debuff'],
  stacking: 'replace',
  duration: { type: 'ticks', value: 3 },
};

const terrifiedDef: StatusDefinition = {
  id: 'terrified',
  name: 'Terrified',
  tags: ['fear', 'supernatural', 'debuff'],
  stacking: 'replace',
  duration: { type: 'ticks', value: 2 },
};

// ---------------------------------------------------------------------------
// Ability definitions
// ---------------------------------------------------------------------------

const mesmerize: AbilityDefinition = {
  id: 'mesmerize',
  name: 'Mesmerize',
  verb: 'use-ability',
  tags: ['supernatural', 'debuff'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single' },
  checks: [],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'mesmerized', duration: 3, stacking: 'replace' } },
  ],
  cooldown: 0,
};

const fireball: AbilityDefinition = {
  id: 'fireball',
  name: 'Fireball',
  verb: 'use-ability',
  tags: ['combat'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single' },
  checks: [],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 8 } },
  ],
  cooldown: 0,
};

const purify: AbilityDefinition = {
  id: 'purify',
  name: 'Purify',
  verb: 'use-ability',
  tags: ['support', 'cleanse'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'self' },
  checks: [],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'control,fear' } },
  ],
  cooldown: 0,
};

const aoeDebuff: AbilityDefinition = {
  id: 'mass-mesmerize',
  name: 'Mass Mesmerize',
  verb: 'use-ability',
  tags: ['supernatural', 'debuff', 'combat'],
  costs: [{ resourceId: 'stamina', amount: 5 }],
  target: { type: 'all-enemies' },
  checks: [],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'mesmerized', duration: 3, stacking: 'replace' } },
  ],
  cooldown: 0,
};

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: [] },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(id: string, type: string, overrides?: Partial<EntityState>): EntityState {
  return {
    id,
    blueprintId: id,
    type,
    name: id,
    tags: type === 'pc' ? ['enemy'] : ['npc'],
    stats: { vigor: 10, instinct: 8, will: 5, maxHp: 30, maxStamina: 20 },
    resources: { hp: 25, stamina: 20 },
    statuses: [],
    zoneId: 'zone-a',
    ...overrides,
  };
}

function buildWorldState(entities: EntityState[], abilities: AbilityDefinition[]) {
  const engine = createTestEngine({
    modules: [
      statusCore,
      createAbilityCore({ abilities }),
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

beforeEach(() => {
  clearStatusRegistry();
  registerStatusDefinitions([mesmerizedDef, terrifiedDef]);
});

describe('AI resistance awareness — single target', () => {
  it('penalizes status ability against immune target', () => {
    const npc = makeEntity('npc', 'npc');
    const immuneTarget = makeEntity('target', 'pc', {
      resistances: { control: 'immune' },
    });
    const normalTarget = makeEntity('normal', 'pc');

    const allAbilities = [mesmerize, fireball];
    const world = buildWorldState([npc, immuneTarget, normalTarget], allAbilities);

    const immuneScores = scoreAbilityUse(npc, mesmerize, world);
    const immuneScore = immuneScores.find(s => s.targetId === 'target');
    const normalScore = immuneScores.find(s => s.targetId === 'normal');

    expect(immuneScore).toBeDefined();
    expect(normalScore).toBeDefined();
    // Immune target should get a much lower score
    expect(immuneScore!.score).toBeLessThan(normalScore!.score);
    // Check that immune penalty contribution is present
    const immuneContrib = immuneScore!.contributions.find(c => c.factor === 'all_statuses_immune');
    expect(immuneContrib).toBeDefined();
    expect(immuneContrib!.delta).toBeLessThan(0);
  });

  it('penalizes status ability against resistant target', () => {
    const npc = makeEntity('npc', 'npc');
    const resistantTarget = makeEntity('target', 'pc', {
      resistances: { supernatural: 'resistant' },
    });
    const normalTarget = makeEntity('normal', 'pc');

    const world = buildWorldState([npc, resistantTarget, normalTarget], [mesmerize]);

    const scores = scoreAbilityUse(npc, mesmerize, world);
    const resistedScore = scores.find(s => s.targetId === 'target');
    const normalScore = scores.find(s => s.targetId === 'normal');

    expect(resistedScore).toBeDefined();
    expect(normalScore).toBeDefined();
    expect(resistedScore!.score).toBeLessThan(normalScore!.score);
    const resistContrib = resistedScore!.contributions.find(c => c.factor === 'status_resisted');
    expect(resistContrib).toBeDefined();
  });

  it('rewards status ability against vulnerable target', () => {
    const npc = makeEntity('npc', 'npc');
    const vulnerableTarget = makeEntity('target', 'pc', {
      resistances: { control: 'vulnerable' },
    });
    const normalTarget = makeEntity('normal', 'pc');

    const world = buildWorldState([npc, vulnerableTarget, normalTarget], [mesmerize]);

    const scores = scoreAbilityUse(npc, mesmerize, world);
    const vulnScore = scores.find(s => s.targetId === 'target');
    const normalScore = scores.find(s => s.targetId === 'normal');

    expect(vulnScore).toBeDefined();
    expect(normalScore).toBeDefined();
    expect(vulnScore!.score).toBeGreaterThan(normalScore!.score);
    const vulnContrib = vulnScore!.contributions.find(c => c.factor === 'status_vulnerable');
    expect(vulnContrib).toBeDefined();
    expect(vulnContrib!.delta).toBeGreaterThan(0);
  });

  it('does not penalize non-status abilities against resistant targets', () => {
    const npc = makeEntity('npc', 'npc');
    const resistantTarget = makeEntity('target', 'pc', {
      resistances: { control: 'immune' },
    });

    const world = buildWorldState([npc, resistantTarget], [fireball]);

    const scores = scoreAbilityUse(npc, fireball, world);
    expect(scores.length).toBe(1);
    // No resistance contribution should exist for a pure damage ability
    const resContrib = scores[0].contributions.find(
      c => c.factor === 'all_statuses_immune' || c.factor === 'status_resisted' || c.factor === 'status_vulnerable'
    );
    expect(resContrib).toBeUndefined();
  });
});

describe('AI resistance awareness — AoE', () => {
  it('penalizes AoE status ability when all enemies are immune', () => {
    const npc = makeEntity('npc', 'npc');
    const immune1 = makeEntity('e1', 'pc', { resistances: { control: 'immune' } });
    const immune2 = makeEntity('e2', 'pc', { resistances: { supernatural: 'immune' } });

    const world = buildWorldState([npc, immune1, immune2], [aoeDebuff]);

    const scores = scoreAbilityUse(npc, aoeDebuff, world);
    expect(scores.length).toBe(1);
    const resContrib = scores[0].contributions.find(c => c.factor === 'resistance_avg');
    expect(resContrib).toBeDefined();
    expect(resContrib!.delta).toBeLessThan(0);
  });
});

describe('AI cleanse awareness', () => {
  it('values cleanse ability when entity has matching debuffs', () => {
    const debuffedNpc = makeEntity('npc', 'npc', {
      statuses: [
        { id: 's1', statusId: 'mesmerized', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
      ],
    });
    const cleanNpc = makeEntity('npc-clean', 'npc', {
      statuses: [],
    });
    const enemy = makeEntity('enemy', 'pc');

    const worldDebuffed = buildWorldState([debuffedNpc, enemy], [purify, fireball]);
    const worldClean = buildWorldState([cleanNpc, enemy], [purify, fireball]);

    const scoresDebuffed = scoreAbilityUse(debuffedNpc, purify, worldDebuffed);
    const scoresClean = scoreAbilityUse(cleanNpc, purify, worldClean);

    expect(scoresDebuffed.length).toBe(1);
    expect(scoresClean.length).toBe(1);
    // Debuffed entity should value cleanse more
    expect(scoresDebuffed[0].score).toBeGreaterThan(scoresClean[0].score);
    // Debuffed should have cleanse_value contribution
    const cleanseContrib = scoresDebuffed[0].contributions.find(c => c.factor === 'cleanse_value');
    expect(cleanseContrib).toBeDefined();
    expect(cleanseContrib!.delta).toBeGreaterThan(0);
  });

  it('does not value cleanse when entity has no matching debuffs', () => {
    const npc = makeEntity('npc', 'npc', { statuses: [] });
    const enemy = makeEntity('enemy', 'pc');

    const world = buildWorldState([npc, enemy], [purify]);

    const scores = scoreAbilityUse(npc, purify, world);
    expect(scores.length).toBe(1);
    const cleanseContrib = scores[0].contributions.find(c => c.factor === 'cleanse_value');
    expect(cleanseContrib).toBeUndefined();
  });

  it('AI prefers cleanse over attack when heavily debuffed', () => {
    const debuffedNpc = makeEntity('npc', 'npc', {
      statuses: [
        { id: 's1', statusId: 'mesmerized', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
        { id: 's2', statusId: 'terrified', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
      ],
    });
    const enemy = makeEntity('enemy', 'pc');

    const abilities = [purify, mesmerize];
    const world = buildWorldState([debuffedNpc, enemy], abilities);

    const decision = selectNpcAbilityAction(debuffedNpc, world, abilities);
    expect(decision.chosen).not.toBeNull();
    // With 2 matching debuffs, purify gets +30 (capped) on base 40 = 70
    // mesmerize against normal target gets base 45
    expect(decision.chosen!.abilityId).toBe('purify');
  });
});

describe('AI scoring unchanged for non-resistance cases', () => {
  it('scores unchanged when target has no resistances', () => {
    const npc = makeEntity('npc', 'npc');
    const target = makeEntity('target', 'pc');

    const world = buildWorldState([npc, target], [mesmerize]);

    const scores = scoreAbilityUse(npc, mesmerize, world);
    expect(scores.length).toBe(1);
    // No resistance contributions
    const resContribs = scores[0].contributions.filter(
      c => c.factor === 'all_statuses_immune' || c.factor === 'status_resisted' || c.factor === 'status_vulnerable'
    );
    expect(resContribs).toHaveLength(0);
    // Base score 45 + no_debuffs 10 = 55 (debuff tag on mesmerize triggers no_debuffs bonus)
    expect(scores[0].score).toBe(55);
  });
});
