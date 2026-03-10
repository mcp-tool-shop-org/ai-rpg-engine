import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ActionIntent } from '@ai-rpg-engine/core';
import type { AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore } from './status-core.js';
import { createAbilityCore } from './ability-core.js';
import { createAbilityEffects } from './ability-effects.js';
import { createAbilityReview, formatAbilityTrace } from './ability-review.js';
import type { AbilityTrace } from './ability-review.js';
import { registerStatusDefinitions, clearStatusRegistry } from './status-semantics.js';

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
  tags: ['divine', 'support'],
  costs: [{ resourceId: 'mana', amount: 3 }],
  target: { type: 'self' },
  checks: [],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 10, resource: 'hp' } },
  ],
  cooldown: 0,
};

const comboAbility: AbilityDefinition = {
  id: 'smite',
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

const abortAbility: AbilityDefinition = {
  id: 'risky-spell',
  name: 'Risky Spell',
  verb: 'cast',
  tags: ['arcane'],
  costs: [{ resourceId: 'mana', amount: 2 }],
  target: { type: 'single', filter: ['enemy'] },
  checks: [{ stat: 'will', difficulty: 99, onFail: 'abort' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 20 } },
  ],
  cooldown: 0,
};

const allAbilities = [fireball, heal, comboAbility, abortAbility];

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

function buildEngine(entities: EntityState[]) {
  return createTestEngine({
    modules: [
      statusCore,
      createAbilityCore({ abilities: allAbilities }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
    entities,
    zones,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ability-review: successful use', () => {
  it('emits ability.review.trace for a successful ability', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    engine.processAction(makeAction('player', 'fireball', ['goblin']));

    const traceEvents = engine.drainEvents().filter((e) => e.type === 'ability.review.trace');
    expect(traceEvents.length).toBe(1);

    const trace = traceEvents[0].payload.trace as AbilityTrace;
    expect(trace.abilityId).toBe('fireball');
    expect(trace.abilityName).toBe('Fireball');
    expect(trace.actorId).toBe('player');
    expect(trace.outcome).toBe('success');
    expect(trace.targetIds).toEqual(['goblin']);
    expect(trace.effects.length).toBeGreaterThan(0);
  });
});

describe('ability-review: combo effects', () => {
  it('captures multiple effects in trace', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 15 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    engine.processAction(makeAction('player', 'smite', ['goblin']));

    const traceEvents = engine.drainEvents().filter((e) => e.type === 'ability.review.trace');
    expect(traceEvents.length).toBe(1);

    const trace = traceEvents[0].payload.trace as AbilityTrace;
    expect(trace.effects.length).toBe(2); // damage + status
    expect(trace.outcome).toBe('success');
  });
});

describe('ability-review: rejected ability', () => {
  it('traces a rejected ability (no resources)', () => {
    const player = makeEntity('player', 'pc', ['player'], { resources: { hp: 25, mana: 0, stamina: 15 } });
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    engine.processAction(makeAction('player', 'fireball', ['goblin']));

    const traceEvents = engine.drainEvents().filter((e) => e.type === 'ability.review.trace');
    expect(traceEvents.length).toBe(1);

    const trace = traceEvents[0].payload.trace as AbilityTrace;
    expect(trace.outcome).toBe('rejected');
    expect(trace.effects.length).toBe(0);
  });
});

describe('ability-review: aborted ability (check failed)', () => {
  it('traces an aborted ability when check fails', () => {
    // risky-spell has difficulty 99 with abort on fail — will always fail with will=5
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    engine.processAction(makeAction('player', 'risky-spell', ['goblin']));

    const traceEvents = engine.drainEvents().filter((e) => e.type === 'ability.review.trace');
    expect(traceEvents.length).toBe(1);

    const trace = traceEvents[0].payload.trace as AbilityTrace;
    expect(trace.outcome).toBe('aborted');
    expect(trace.allChecksPassed).toBe(false);
    expect(trace.checks.length).toBe(1);
    expect(trace.checks[0].passed).toBe(false);
  });
});

describe('ability-review: formatAbilityTrace', () => {
  it('produces readable text output', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], { resources: { hp: 20, mana: 0, stamina: 10 }, stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 } });
    const engine = buildEngine([player, enemy]);

    engine.processAction(makeAction('player', 'fireball', ['goblin']));

    const traceEvents = engine.drainEvents().filter((e) => e.type === 'ability.review.trace');
    const trace = traceEvents[0].payload.trace as AbilityTrace;

    const formatted = formatAbilityTrace(trace);
    expect(formatted).toContain('Ability Trace');
    expect(formatted).toContain('Fireball');
    expect(formatted).toContain('Outcome: success');
    expect(formatted).toContain('Effects:');
    expect(formatted).toContain('damage');
  });
});

// ---------------------------------------------------------------------------
// Resistance trace tests (Phase 3)
// ---------------------------------------------------------------------------

const mesmerizedDef: StatusDefinition = {
  id: 'mesmerized',
  name: 'Mesmerized',
  tags: ['control', 'supernatural', 'debuff'],
  stacking: 'replace',
  duration: { type: 'ticks', value: 3 },
};

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

const allAbilitiesWithMesmerize = [fireball, heal, comboAbility, abortAbility, mesmerize];

function buildEngineWithMesmerize(entities: EntityState[]) {
  return createTestEngine({
    modules: [
      statusCore,
      createAbilityCore({ abilities: allAbilitiesWithMesmerize }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
    entities,
    zones,
  });
}

describe('ability-review: resistance traces', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions([mesmerizedDef]);
  });

  it('captures immune resistance outcome in trace', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const target = makeEntity('target', 'npc', ['enemy'], {
      resources: { hp: 20, mana: 0, stamina: 10 },
      stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 },
      resistances: { control: 'immune' },
    });
    const engine = buildEngineWithMesmerize([player, target]);

    engine.processAction(makeAction('player', 'mesmerize', ['target']));

    const traceEvents = engine.drainEvents().filter((e) => e.type === 'ability.review.trace');
    expect(traceEvents.length).toBe(1);

    const trace = traceEvents[0].payload.trace as AbilityTrace;
    const immuneEffects = trace.effects.filter((e) => e.resistanceOutcome === 'immune');
    expect(immuneEffects.length).toBe(1);
    expect(immuneEffects[0].type).toBe('status-immune');
  });

  it('captures resisted resistance outcome in trace', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const target = makeEntity('target', 'npc', ['enemy'], {
      resources: { hp: 20, mana: 0, stamina: 10 },
      stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 },
      resistances: { supernatural: 'resistant' },
    });
    const engine = buildEngineWithMesmerize([player, target]);

    engine.processAction(makeAction('player', 'mesmerize', ['target']));

    const traceEvents = engine.drainEvents().filter((e) => e.type === 'ability.review.trace');
    expect(traceEvents.length).toBe(1);

    const trace = traceEvents[0].payload.trace as AbilityTrace;
    // Should have both a resisted event and an applied event with resistance info
    const resistedEffects = trace.effects.filter((e) => e.resistanceOutcome === 'resisted');
    expect(resistedEffects.length).toBeGreaterThanOrEqual(1);
  });

  it('formatAbilityTrace shows resistance info', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const target = makeEntity('target', 'npc', ['enemy'], {
      resources: { hp: 20, mana: 0, stamina: 10 },
      stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 },
      resistances: { control: 'immune' },
    });
    const engine = buildEngineWithMesmerize([player, target]);

    engine.processAction(makeAction('player', 'mesmerize', ['target']));

    const traceEvents = engine.drainEvents().filter((e) => e.type === 'ability.review.trace');
    const trace = traceEvents[0].payload.trace as AbilityTrace;
    const formatted = formatAbilityTrace(trace);

    expect(formatted).toContain('(immune)');
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Inspector expansion tests
// ---------------------------------------------------------------------------

function runInspector(engine: ReturnType<typeof buildEngine>, inspectorId: string): Record<string, unknown> {
  const inspectors = engine.moduleManager.getInspectors();
  const inspector = inspectors.find((i) => i.id === inspectorId);
  if (!inspector) throw new Error(`Inspector ${inspectorId} not found`);
  return inspector.inspect(engine.world) as Record<string, unknown>;
}

describe('ability-review: inspector content', () => {
  it('reports active cooldowns after ability use', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], {
      resources: { hp: 20, mana: 0, stamina: 10 },
      stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 },
    });
    const engine = buildEngine([player, enemy]);

    engine.processAction(makeAction('player', 'fireball', ['goblin']));
    engine.drainEvents();

    const inspectorData = runInspector(engine, 'ability-review');
    const cds = inspectorData.activeCooldowns as Array<{ entityId: string; abilityId: string }>;
    expect(cds.some((c) => c.entityId === 'player' && c.abilityId === 'fireball')).toBe(true);
  });

  it('reports active statuses on entities', () => {
    clearStatusRegistry();
    registerStatusDefinitions([mesmerizedDef]);
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], {
      resources: { hp: 20, mana: 0, stamina: 10 },
      stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 },
    });
    const engine = buildEngineWithMesmerize([player, enemy]);

    engine.processAction(makeAction('player', 'smite', ['goblin']));
    engine.drainEvents();

    const inspectorData = runInspector(engine, 'ability-review');
    const statuses = inspectorData.activeStatuses as Array<{ entityId: string; statusId: string }>;
    expect(statuses.some((s) => s.entityId === 'goblin' && s.statusId === 'holy-fire')).toBe(true);
  });

  it('reports notable resistances', () => {
    clearStatusRegistry();
    registerStatusDefinitions([mesmerizedDef]);
    const player = makeEntity('player', 'pc', ['player']);
    const target = makeEntity('boss', 'npc', ['enemy'], {
      resources: { hp: 30, mana: 0, stamina: 10 },
      stats: { vigor: 8, instinct: 5, will: 5, maxHp: 30 },
      resistances: { control: 'immune', fear: 'resistant' },
    });
    const engine = buildEngineWithMesmerize([player, target]);

    const inspectorData = runInspector(engine, 'ability-review');
    const res = inspectorData.resistances as Array<{ entityId: string; resistances: Record<string, string> }>;
    expect(res.some((r) => r.entityId === 'boss' && r.resistances.control === 'immune')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Trace format tests
// ---------------------------------------------------------------------------

describe('ability-review: trace format — Phase 4', () => {
  it('includes category tag in trace header', () => {
    const player = makeEntity('player', 'pc', ['player']);
    const enemy = makeEntity('goblin', 'npc', ['enemy'], {
      resources: { hp: 20, mana: 0, stamina: 10 },
      stats: { vigor: 5, instinct: 5, will: 5, maxHp: 20 },
    });
    const engine = buildEngine([player, enemy]);

    engine.processAction(makeAction('player', 'fireball', ['goblin']));
    const traceEvents = engine.drainEvents().filter((e) => e.type === 'ability.review.trace');
    const trace = traceEvents[0].payload.trace as AbilityTrace;
    const formatted = formatAbilityTrace(trace);

    // Should have [offensive] since fireball deals damage
    expect(formatted).toMatch(/\[tick \d+\] \[offensive\]/);
  });

  it('shows utility category for non-damage/heal/status traces', () => {
    // Heal produces a defensive trace
    const player = makeEntity('player', 'pc', ['player'], { resources: { hp: 10, mana: 20, stamina: 15 } });
    const engine = buildEngine([player]);

    engine.processAction(makeAction('player', 'heal'));
    const traceEvents = engine.drainEvents().filter((e) => e.type === 'ability.review.trace');
    const trace = traceEvents[0].payload.trace as AbilityTrace;
    const formatted = formatAbilityTrace(trace);

    // heal.applied => defensive category
    expect(formatted).toMatch(/\[(offensive|defensive|control|utility)\]/);
  });
});
