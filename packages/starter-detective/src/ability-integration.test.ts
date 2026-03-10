// Detective ability integration tests — Deductive Strike, Composure Shield, Expose Weakness
// Proves: genre-native combat, composure economy, exposed status, resistance profiles, AI scoring

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import type { AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore } from '@ai-rpg-engine/modules';
import {
  createAbilityCore,
  isAbilityReady,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  clearStatusRegistry,
} from '@ai-rpg-engine/modules';
import { scoreAbilityUse } from '@ai-rpg-engine/modules';

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Crime Scene', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Back Alley', tags: [] as string[], neighbors: ['zone-a'] },
];

// --- Ability definitions (inline, matching content.ts) ---

const deductiveStrike: AbilityDefinition = {
  id: 'deductive-strike', name: 'Deductive Strike', verb: 'use-ability',
  tags: ['combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single' },
  checks: [{ stat: 'grit', difficulty: 5, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 4, damageType: 'melee' } },
  ],
  cooldown: 2,
  requirements: [{ type: 'has-tag', params: { tag: 'investigator' } }],
};

const composureShield: AbilityDefinition = {
  id: 'composure-shield', name: 'Composure Shield', verb: 'use-ability',
  tags: ['support', 'buff'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'self' },
  checks: [{ stat: 'perception', difficulty: 5, onFail: 'abort' }],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 4, resource: 'composure' } },
    { type: 'stat-modify', target: 'actor', params: { stat: 'perception', amount: 1 } },
  ],
  cooldown: 3,
};

const exposeWeakness: AbilityDefinition = {
  id: 'expose-weakness', name: 'Expose Weakness', verb: 'use-ability',
  tags: ['combat', 'debuff', 'social'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'composure', amount: 3 },
  ],
  target: { type: 'single' },
  checks: [{ stat: 'perception', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'exposed', duration: 2, stacking: 'replace' } },
    { type: 'stat-modify', target: 'target', params: { stat: 'grit', amount: -2 } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'investigator' } }],
};

const allDetectiveAbilities = [deductiveStrike, composureShield, exposeWeakness];

const detectiveStatusDefs: StatusDefinition[] = [
  {
    id: 'exposed', name: 'Exposed',
    tags: ['breach', 'debuff'], stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
  },
];

// --- Engine builder ---

function buildDetectiveEngine(opts?: {
  playerGrit?: number;
  playerPerception?: number;
  playerStamina?: number;
  playerComposure?: number;
  enemyHp?: number;
}) {
  const player: EntityState = {
    id: 'player', blueprintId: 'inspector', type: 'player', name: 'Inspector',
    tags: ['player', 'law', 'investigator'],
    stats: { perception: opts?.playerPerception ?? 10, eloquence: 5, grit: opts?.playerGrit ?? 10 },
    resources: {
      hp: 15,
      stamina: opts?.playerStamina ?? 10,
      composure: opts?.playerComposure ?? 12,
    },
    statuses: [], zoneId: 'zone-a',
  };
  const enemy: EntityState = {
    id: 'thug', blueprintId: 'thug', type: 'enemy', name: 'Dock Thug',
    tags: ['enemy', 'criminal', 'male'],
    stats: { perception: 3, eloquence: 2, grit: 6 },
    resources: { hp: opts?.enemyHp ?? 14, stamina: 5, composure: 6 },
    statuses: [], zoneId: 'zone-a',
  };
  return createTestEngine({
    zones,
    entities: [player, enemy],
    modules: [
      statusCore,
      createAbilityCore({ abilities: allDetectiveAbilities, statMapping: { power: 'grit', precision: 'perception', focus: 'eloquence' } }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

// ---------------------------------------------------------------------------
// Deductive Strike
// ---------------------------------------------------------------------------

describe('Detective — Deductive Strike', () => {
  it('deals damage and costs stamina', () => {
    const engine = buildDetectiveEngine();
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'deductive-strike' }, targetIds: ['thug'],
    });

    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
    expect(events.find(e => e.type === 'ability.damage.applied')).toBeDefined();

    const player = engine.player();
    expect(player.resources.stamina).toBe(7); // 10 - 3
  });

  it('requires investigator tag', () => {
    const civilian: EntityState = {
      id: 'player', blueprintId: 'player', type: 'player', name: 'Civilian',
      tags: ['player', 'human'],
      stats: { perception: 5, eloquence: 5, grit: 5 },
      resources: { hp: 15, stamina: 10, composure: 12 },
      statuses: [], zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'thug', blueprintId: 'thug', type: 'enemy', name: 'Thug',
      tags: ['enemy'], stats: { perception: 3, eloquence: 2, grit: 4 },
      resources: { hp: 14, stamina: 5 }, statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [civilian, enemy],
      modules: [statusCore, createAbilityCore({ abilities: allDetectiveAbilities, statMapping: { power: 'grit', precision: 'perception', focus: 'eloquence' } }), createAbilityEffects(), createAbilityReview()],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'deductive-strike' }, targetIds: ['thug'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });

  it('sets cooldown after use', () => {
    const engine = buildDetectiveEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'deductive-strike' }, targetIds: ['thug'],
    });
    expect(isAbilityReady(engine.store.state, 'player', 'deductive-strike', allDetectiveAbilities)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Composure Shield
// ---------------------------------------------------------------------------

describe('Detective — Composure Shield', () => {
  it('heals composure and buffs perception', () => {
    const engine = buildDetectiveEngine({ playerComposure: 5, playerPerception: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'composure-shield' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const player = engine.player();
      expect(player.resources.composure).toBeGreaterThan(5); // healed composure
      expect(player.resources.stamina).toBe(8); // 10 - 2
    }
  });

  it('rejects when stamina is too low', () => {
    const engine = buildDetectiveEngine({ playerStamina: 1 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'composure-shield' }, targetIds: [],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Expose Weakness
// ---------------------------------------------------------------------------

describe('Detective — Expose Weakness', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(detectiveStatusDefs);
  });

  it('applies exposed status and reduces grit', () => {
    const engine = buildDetectiveEngine({ playerPerception: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'expose-weakness' }, targetIds: ['thug'],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      expect(events.find(e => e.type === 'ability.used')).toBeDefined();
      const statusApplied = events.find(e => e.type === 'ability.status.applied');
      if (statusApplied) {
        expect(statusApplied.payload.statusId).toBe('exposed');
      }
      // Costs composure + stamina
      const player = engine.player();
      expect(player.resources.stamina).toBe(8); // 10 - 2
      expect(player.resources.composure).toBe(9); // 12 - 3
    }
  });

  it('rejects when composure is too low', () => {
    const engine = buildDetectiveEngine({ playerComposure: 1 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'expose-weakness' }, targetIds: ['thug'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Resistance profiles
// ---------------------------------------------------------------------------

describe('Detective — Resistance profiles', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(detectiveStatusDefs);
  });

  it('crime boss is immune to fear statuses', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'inspector', type: 'player', name: 'Inspector',
      tags: ['player', 'law', 'investigator'],
      stats: { perception: 15, eloquence: 5, grit: 5 },
      resources: { hp: 15, stamina: 10, composure: 20 },
      statuses: [], zoneId: 'zone-a',
    };
    const boss: EntityState = {
      id: 'crime-boss', blueprintId: 'crime-boss', type: 'enemy', name: 'Mr. Hargreaves',
      tags: ['enemy', 'criminal', 'mastermind', 'role:boss'],
      stats: { perception: 6, eloquence: 7, grit: 5 },
      resources: { hp: 40, stamina: 10, composure: 20 },
      statuses: [], zoneId: 'zone-a',
      resistances: { control: 'resistant', fear: 'immune' },
    };

    // Test fear immunity with a custom fear ability
    const intimidate: AbilityDefinition = {
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
      zones, entities: [player, boss],
      modules: [
        statusCore,
        createAbilityCore({ abilities: [intimidate], statMapping: { power: 'grit', precision: 'perception', focus: 'eloquence' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'intimidate' }, targetIds: ['crime-boss'],
    });

    const immune = events.find(e => e.type === 'ability.status.immune');
    expect(immune).toBeDefined();
    expect(boss.statuses.length).toBe(0);
  });

  it('crime boss resists control (halved duration)', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'inspector', type: 'player', name: 'Inspector',
      tags: ['player', 'law', 'investigator'],
      stats: { perception: 15, eloquence: 5, grit: 5 },
      resources: { hp: 15, stamina: 10, composure: 20 },
      statuses: [], zoneId: 'zone-a',
    };
    const boss: EntityState = {
      id: 'crime-boss', blueprintId: 'crime-boss', type: 'enemy', name: 'Mr. Hargreaves',
      tags: ['enemy', 'criminal', 'mastermind', 'role:boss'],
      stats: { perception: 6, eloquence: 7, grit: 5 },
      resources: { hp: 40, stamina: 10, composure: 20 },
      statuses: [], zoneId: 'zone-a',
      resistances: { control: 'resistant', fear: 'immune' },
    };

    // Use a custom control ability to test resistance
    const controlAbility: AbilityDefinition = {
      id: 'test-control', name: 'Test Control', verb: 'use-ability',
      tags: ['combat', 'debuff'],
      costs: [{ resourceId: 'stamina', amount: 1 }],
      target: { type: 'single' },
      effects: [
        { type: 'apply-status', target: 'target', params: { statusId: 'test-control-status', duration: 4, stacking: 'replace' } },
      ],
      cooldown: 1,
    };
    const controlStatus: StatusDefinition = {
      id: 'test-control-status', name: 'Controlled', tags: ['control', 'debuff'], stacking: 'replace',
      duration: { type: 'ticks', value: 4 },
    };
    registerStatusDefinitions([controlStatus]);

    const engine = createTestEngine({
      zones, entities: [player, boss],
      modules: [
        statusCore,
        createAbilityCore({ abilities: [controlAbility], statMapping: { power: 'grit', precision: 'perception', focus: 'eloquence' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'test-control' }, targetIds: ['crime-boss'],
    });

    const resisted = events.find(e => e.type === 'ability.status.resisted');
    expect(resisted).toBeDefined();
    // Duration halved from 4 → 2
    const applied = events.find(e => e.type === 'ability.status.applied');
    if (applied) {
      expect(applied.payload.duration).toBeLessThanOrEqual(2);
    }
  });

  it('hired muscle resists fear (halved duration)', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'inspector', type: 'player', name: 'Inspector',
      tags: ['player', 'law', 'investigator'],
      stats: { perception: 15, eloquence: 5, grit: 5 },
      resources: { hp: 15, stamina: 10, composure: 20 },
      statuses: [], zoneId: 'zone-a',
    };
    const muscle: EntityState = {
      id: 'hired-muscle', blueprintId: 'hired-muscle', type: 'enemy', name: 'Hired Muscle',
      tags: ['enemy', 'criminal', 'enforcer', 'role:brute'],
      stats: { perception: 3, eloquence: 2, grit: 6 },
      resources: { hp: 18, stamina: 5, composure: 8 },
      statuses: [], zoneId: 'zone-a',
      resistances: { fear: 'resistant' },
    };

    const fearAbility: AbilityDefinition = {
      id: 'test-fear-strike', name: 'Fear Strike', verb: 'use-ability',
      tags: ['combat', 'debuff'],
      costs: [{ resourceId: 'stamina', amount: 1 }],
      target: { type: 'single' },
      effects: [
        { type: 'apply-status', target: 'target', params: { statusId: 'test-fear', duration: 4, stacking: 'replace' } },
      ],
      cooldown: 1,
    };
    const fearStatus: StatusDefinition = {
      id: 'test-fear', name: 'Test Fear', tags: ['fear', 'debuff'], stacking: 'replace',
      duration: { type: 'ticks', value: 4 },
    };
    registerStatusDefinitions([fearStatus]);

    const engine = createTestEngine({
      zones, entities: [player, muscle],
      modules: [
        statusCore,
        createAbilityCore({ abilities: [fearAbility], statMapping: { power: 'grit', precision: 'perception', focus: 'eloquence' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'test-fear-strike' }, targetIds: ['hired-muscle'],
    });

    const resisted = events.find(e => e.type === 'ability.status.resisted');
    expect(resisted).toBeDefined();
    const applied = events.find(e => e.type === 'ability.status.applied');
    if (applied) {
      expect(applied.payload.duration).toBeLessThanOrEqual(2); // halved from 4
    }
  });
});

// ---------------------------------------------------------------------------
// AI Scoring
// ---------------------------------------------------------------------------

describe('Detective — AI scoring', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(detectiveStatusDefs);
  });

  it('AI scores deductive-strike against healthy enemy', () => {
    const engine = buildDetectiveEngine();
    const player = engine.player();
    const scores = scoreAbilityUse(player, deductiveStrike, engine.store.state);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].score).toBeGreaterThan(0);
  });

  it('AI scores composure-shield positively for self-heal', () => {
    const engine = buildDetectiveEngine({ playerComposure: 3, playerPerception: 10 });
    const player = engine.player();
    const scores = scoreAbilityUse(player, composureShield, engine.store.state);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].score).toBeGreaterThan(0);
  });
});
