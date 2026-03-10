// Zombie ability integration tests — Desperate Swing, Field Triage, War Cry, Survival Instinct
// Proves: survivor combat, infection management, AoE fear debuff, cleanse, resistance profiles

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
  { id: 'zone-a', roomId: 'test', name: 'Overrun Street', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Safehouse', tags: [] as string[], neighbors: ['zone-a'] },
];

// --- Ability definitions (inline, matching content.ts) ---

const desperateSwing: AbilityDefinition = {
  id: 'desperate-swing', name: 'Desperate Swing', verb: 'use-ability',
  tags: ['combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single' },
  checks: [{ stat: 'fitness', difficulty: 5, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 5, damageType: 'melee' } },
  ],
  cooldown: 2,
  requirements: [{ type: 'has-tag', params: { tag: 'survivor' } }],
};

const fieldTriage: AbilityDefinition = {
  id: 'field-triage', name: 'Field Triage', verb: 'use-ability',
  tags: ['support', 'heal'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'self' },
  checks: [{ stat: 'wits', difficulty: 5, onFail: 'abort' }],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 4, resource: 'hp' } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'infection', amount: -2 } },
  ],
  cooldown: 4,
};

const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [
    { resourceId: 'stamina', amount: 3 },
    { resourceId: 'infection', amount: 5 },
  ],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2, stacking: 'replace' } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'survivor' } }],
};

const survivalInstinct: AbilityDefinition = {
  id: 'survival-instinct', name: 'Survival Instinct', verb: 'use-ability',
  tags: ['support', 'cleanse'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'self' },
  checks: [{ stat: 'nerve', difficulty: 5, onFail: 'abort' }],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'fear,blind' } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'survivor' } }],
};

const allZombieAbilities = [desperateSwing, fieldTriage, warCry, survivalInstinct];

const zombieStatusDefs: StatusDefinition[] = [
  {
    id: 'rattled', name: 'Rattled',
    tags: ['fear', 'debuff'], stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
  },
];

// --- Engine builder ---

function buildZombieEngine(opts?: {
  playerFitness?: number;
  playerWits?: number;
  playerNerve?: number;
  playerStamina?: number;
  playerInfection?: number;
  playerHp?: number;
  enemyHp?: number;
  numEnemies?: number;
}) {
  const player: EntityState = {
    id: 'player', blueprintId: 'survivor', type: 'player', name: 'Survivor',
    tags: ['player', 'human', 'survivor'],
    stats: { fitness: opts?.playerFitness ?? 10, wits: opts?.playerWits ?? 10, nerve: opts?.playerNerve ?? 10 },
    resources: {
      hp: opts?.playerHp ?? 18,
      stamina: opts?.playerStamina ?? 12,
      infection: opts?.playerInfection ?? 10,
    },
    statuses: [], zoneId: 'zone-a',
  };
  const enemies: EntityState[] = [];
  const numEnemies = opts?.numEnemies ?? 1;
  for (let i = 0; i < numEnemies; i++) {
    enemies.push({
      id: `zombie-${i}`, blueprintId: 'shambler', type: 'enemy', name: `Shambler ${i + 1}`,
      tags: ['enemy', 'zombie', 'undead'],
      stats: { fitness: 3, wits: 1, nerve: 10 },
      resources: { hp: opts?.enemyHp ?? 12, stamina: 20, infection: 0 },
      statuses: [], zoneId: 'zone-a',
    });
  }
  return createTestEngine({
    zones,
    entities: [player, ...enemies],
    modules: [
      statusCore,
      createAbilityCore({ abilities: allZombieAbilities, statMapping: { power: 'fitness', precision: 'wits', focus: 'nerve' } }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

// ---------------------------------------------------------------------------
// Desperate Swing
// ---------------------------------------------------------------------------

describe('Zombie — Desperate Swing', () => {
  it('deals damage and costs stamina', () => {
    const engine = buildZombieEngine();
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'desperate-swing' }, targetIds: ['zombie-0'],
    });

    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
    expect(events.find(e => e.type === 'ability.damage.applied')).toBeDefined();
    const player = engine.player();
    expect(player.resources.stamina).toBe(9); // 12 - 3
  });

  it('requires survivor tag', () => {
    const zombie: EntityState = {
      id: 'player', blueprintId: 'zombie', type: 'player', name: 'Zombie',
      tags: ['player', 'zombie', 'undead'],
      stats: { fitness: 10, wits: 1, nerve: 10 },
      resources: { hp: 20, stamina: 20, infection: 0 },
      statuses: [], zoneId: 'zone-a',
    };
    const target: EntityState = {
      id: 'target', blueprintId: 'target', type: 'enemy', name: 'Target',
      tags: ['enemy'], stats: { fitness: 3, wits: 3, nerve: 3 },
      resources: { hp: 10, stamina: 5 }, statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [zombie, target],
      modules: [statusCore, createAbilityCore({ abilities: allZombieAbilities, statMapping: { power: 'fitness', precision: 'wits', focus: 'nerve' } }), createAbilityEffects(), createAbilityReview()],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'desperate-swing' }, targetIds: ['target'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Field Triage
// ---------------------------------------------------------------------------

describe('Zombie — Field Triage', () => {
  it('heals HP and reduces infection', () => {
    const engine = buildZombieEngine({ playerHp: 10, playerInfection: 20, playerWits: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'field-triage' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const player = engine.player();
      expect(player.resources.hp).toBeGreaterThan(10);
      expect(player.resources.infection).toBeLessThan(20);
      expect(player.resources.stamina).toBe(9); // 12 - 3
    }
  });

  it('sets cooldown after use', () => {
    const engine = buildZombieEngine({ playerWits: 15 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'field-triage' }, targetIds: [],
    });
    expect(isAbilityReady(engine.store.state, 'player', 'field-triage', allZombieAbilities)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// War Cry (AoE debuff)
// ---------------------------------------------------------------------------

describe('Zombie — War Cry', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(zombieStatusDefs);
  });

  it('applies rattled to all enemies and costs infection', () => {
    const engine = buildZombieEngine({ playerNerve: 15, playerInfection: 20, numEnemies: 2 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'war-cry' },
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      expect(events.find(e => e.type === 'ability.used')).toBeDefined();
      const statusEvents = events.filter(e => e.type === 'ability.status.applied');
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);

      const player = engine.player();
      expect(player.resources.stamina).toBe(9); // 12 - 3
      expect(player.resources.infection).toBe(15); // 20 - 5
    }
  });

  it('rejects when infection resource is too low', () => {
    const engine = buildZombieEngine({ playerInfection: 2 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'war-cry' },
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Survival Instinct (cleanse)
// ---------------------------------------------------------------------------

describe('Zombie — Survival Instinct (cleanse)', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(zombieStatusDefs);
  });

  it('removes fear statuses from self', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'survivor', type: 'player', name: 'Survivor',
      tags: ['player', 'human', 'survivor'],
      stats: { fitness: 5, wits: 5, nerve: 15 },
      resources: { hp: 18, stamina: 12, infection: 10 },
      statuses: [
        { id: 'status-1', statusId: 'rattled', stacks: 1, appliedAtTick: 0, expiresAtTick: 2 },
      ],
      zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'zombie-0', blueprintId: 'shambler', type: 'enemy', name: 'Shambler',
      tags: ['enemy', 'zombie', 'undead'],
      stats: { fitness: 3, wits: 1, nerve: 10 },
      resources: { hp: 12, stamina: 20 }, statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [player, enemy],
      modules: [
        statusCore,
        createAbilityCore({ abilities: allZombieAbilities, statMapping: { power: 'fitness', precision: 'wits', focus: 'nerve' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'survival-instinct' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const removed = events.filter(e => e.type === 'ability.status.removed');
      expect(removed.length).toBeGreaterThanOrEqual(1);
      const p = engine.player();
      expect(p.statuses.find(s => s.statusId === 'rattled')).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Resistance profiles
// ---------------------------------------------------------------------------

describe('Zombie — Resistance profiles', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(zombieStatusDefs);
  });

  it('bloater alpha is immune to fear statuses', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'survivor', type: 'player', name: 'Survivor',
      tags: ['player', 'human', 'survivor'],
      stats: { fitness: 5, wits: 5, nerve: 15 },
      resources: { hp: 18, stamina: 12, infection: 20 },
      statuses: [], zoneId: 'zone-a',
    };
    const bloater: EntityState = {
      id: 'bloater', blueprintId: 'bloater-alpha', type: 'enemy', name: 'Bloater Alpha',
      tags: ['enemy', 'zombie', 'undead', 'role:boss'],
      stats: { fitness: 8, wits: 2, nerve: 10 },
      resources: { hp: 50, stamina: 30 },
      statuses: [], zoneId: 'zone-a',
      resistances: { fear: 'immune', poison: 'resistant' },
    };

    const engine = createTestEngine({
      zones, entities: [player, bloater],
      modules: [
        statusCore,
        createAbilityCore({ abilities: allZombieAbilities, statMapping: { power: 'fitness', precision: 'wits', focus: 'nerve' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'war-cry' },
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const immune = events.find(e => e.type === 'ability.status.immune');
      expect(immune).toBeDefined();
      expect(bloater.statuses.length).toBe(0);
    }
  });

  it('shambler is immune to control statuses', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'survivor', type: 'player', name: 'Survivor',
      tags: ['player', 'human', 'survivor'],
      stats: { fitness: 5, wits: 15, nerve: 5 },
      resources: { hp: 18, stamina: 12, infection: 0 },
      statuses: [], zoneId: 'zone-a',
    };
    const shambler: EntityState = {
      id: 'shambler', blueprintId: 'shambler', type: 'enemy', name: 'Shambler',
      tags: ['enemy', 'zombie', 'undead'],
      stats: { fitness: 3, wits: 1, nerve: 10 },
      resources: { hp: 12, stamina: 20 },
      statuses: [], zoneId: 'zone-a',
      resistances: { control: 'immune' },
    };

    // Custom control ability to test
    const controlAbility: AbilityDefinition = {
      id: 'test-control', name: 'Test Control', verb: 'use-ability',
      tags: ['combat', 'debuff'],
      costs: [{ resourceId: 'stamina', amount: 1 }],
      target: { type: 'single' },
      effects: [
        { type: 'apply-status', target: 'target', params: { statusId: 'test-ctrl', duration: 3, stacking: 'replace' } },
      ],
      cooldown: 1,
    };
    const ctrlStatus: StatusDefinition = {
      id: 'test-ctrl', name: 'Controlled', tags: ['control', 'debuff'], stacking: 'replace',
      duration: { type: 'ticks', value: 3 },
    };
    registerStatusDefinitions([ctrlStatus]);

    const engine = createTestEngine({
      zones, entities: [player, shambler],
      modules: [
        statusCore,
        createAbilityCore({ abilities: [controlAbility], statMapping: { power: 'fitness', precision: 'wits', focus: 'nerve' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'test-control' }, targetIds: ['shambler'],
    });

    const immune = events.find(e => e.type === 'ability.status.immune');
    expect(immune).toBeDefined();
    expect(shambler.statuses.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AI Scoring
// ---------------------------------------------------------------------------

describe('Zombie — AI scoring', () => {
  it('AI scores desperate-swing against enemy', () => {
    const engine = buildZombieEngine();
    const player = engine.player();
    const scores = scoreAbilityUse(player, desperateSwing, engine.store.state);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].score).toBeGreaterThan(0);
  });

  it('AI scores field-triage positively for self-heal', () => {
    const engine = buildZombieEngine({ playerHp: 5, playerWits: 10 });
    const player = engine.player();
    const scores = scoreAbilityUse(player, fieldTriage, engine.store.state);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].score).toBeGreaterThan(0);
  });
});
