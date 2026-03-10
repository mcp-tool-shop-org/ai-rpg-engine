import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { statusCore } from './status-core.js';
import { createCognitionCore, getCognition } from './cognition-core.js';
import { selectNpcCombatAction, createCombatIntent, BUILTIN_PACK_BIASES } from './combat-intent.js';
import type { PackBias } from './combat-intent.js';
import {
  BUILTIN_COMBAT_ROLES,
  COMBAT_ROLES,
  createRoledEnemy,
  getEntityRole,
  getRoleBiases,
  createEncounter,
  validateEncounter,
  collectEncounterBiases,
  calculateDangerRating,
  formatDangerForNarrator,
  createBossPhaseListener,
  analyzeEncounter,
} from './combat-roles.js';
import type { CombatRole, BossDefinition } from './combat-roles.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [] as string[], neighbors: ['zone-a'] },
];

function makeEntity(id: string, type: string, tags: string[], overrides?: Partial<EntityState>): EntityState {
  return {
    id,
    blueprintId: id,
    type,
    name: id,
    tags,
    stats: { vigor: 5, instinct: 4, will: 3 },
    resources: { hp: 20, maxHp: 20, stamina: 8, maxStamina: 8 },
    statuses: [],
    zoneId: 'zone-a',
    ...overrides,
  };
}

function buildEngine(entities: EntityState[]) {
  return createTestEngine({
    modules: [
      statusCore,
      createCognitionCore(),
      createCombatIntent(),
    ],
    entities,
    zones,
  });
}

// ---------------------------------------------------------------------------
// Group 1: Role Template System
// ---------------------------------------------------------------------------

describe('combat-roles: role templates', () => {
  it('BUILTIN_COMBAT_ROLES has all 8 roles', () => {
    const expected: CombatRole[] = ['brute', 'skirmisher', 'backliner', 'bodyguard', 'coward', 'boss', 'minion', 'elite'];
    for (const role of expected) {
      expect(BUILTIN_COMBAT_ROLES[role]).toBeDefined();
      expect(BUILTIN_COMBAT_ROLES[role].role).toBe(role);
    }
    expect(COMBAT_ROLES.length).toBe(8);
  });

  it('each template has valid PackBias with tag, name, and modifiers', () => {
    for (const role of COMBAT_ROLES) {
      const template = BUILTIN_COMBAT_ROLES[role];
      expect(template.bias.tag).toBe(`role:${role}`);
      expect(template.bias.name).toBeTruthy();
      expect(Object.keys(template.bias.modifiers).length).toBeGreaterThan(0);
    }
  });

  it('HP multipliers are reasonable per role', () => {
    expect(BUILTIN_COMBAT_ROLES.brute.hpMultiplier).toBeGreaterThan(1);
    expect(BUILTIN_COMBAT_ROLES.minion.hpMultiplier).toBeLessThan(1);
    expect(BUILTIN_COMBAT_ROLES.boss.hpMultiplier).toBeGreaterThanOrEqual(3);
    expect(BUILTIN_COMBAT_ROLES.coward.hpMultiplier).toBeLessThan(1);
    expect(BUILTIN_COMBAT_ROLES.elite.hpMultiplier).toBeGreaterThan(1);
  });

  it('createRoledEnemy applies HP/stamina multipliers', () => {
    const base = makeEntity('grunt', 'enemy', ['enemy']);
    const brute = createRoledEnemy(base, 'brute');

    expect(brute.resources.hp).toBe(Math.round(20 * 1.5));  // 30
    expect(brute.resources.maxHp).toBe(Math.round(20 * 1.5));
    expect(brute.resources.stamina).toBe(Math.round(8 * 1.0));  // unchanged

    const minion = createRoledEnemy(base, 'minion');
    expect(minion.resources.hp).toBe(Math.round(20 * 0.4));  // 8
    expect(minion.resources.stamina).toBe(Math.round(8 * 0.8));  // 6
  });

  it('createRoledEnemy adds role tag and engagement tags', () => {
    const base = makeEntity('archer', 'enemy', ['enemy']);
    const backliner = createRoledEnemy(base, 'backliner');

    expect(backliner.tags).toContain('role:backliner');
    expect(backliner.tags).toContain('ranged');  // backliner engagement tag
    expect(backliner.tags).toContain('enemy');  // keeps original tags

    const guard = createRoledEnemy(base, 'bodyguard');
    expect(guard.tags).toContain('role:bodyguard');
    expect(guard.tags).toContain('bodyguard');  // bodyguard engagement tag
  });
});

// ---------------------------------------------------------------------------
// Group 2: Encounter Composition
// ---------------------------------------------------------------------------

describe('combat-roles: encounters', () => {
  it('createEncounter builds valid definition', () => {
    const enc = createEncounter('test-enc', 'Test Encounter', 'patrol', [
      { entityId: 'guard-a' },
      { entityId: 'guard-b' },
    ]);

    expect(enc.id).toBe('test-enc');
    expect(enc.name).toBe('Test Encounter');
    expect(enc.composition).toBe('patrol');
    expect(enc.participants).toHaveLength(2);
  });

  it('validateEncounter warns on all-same-role', () => {
    const entities: Record<string, EntityState> = {
      'b1': makeEntity('b1', 'enemy', ['enemy', 'role:brute']),
      'b2': makeEntity('b2', 'enemy', ['enemy', 'role:brute']),
    };
    const enc = createEncounter('test', 'Test', 'patrol', [
      { entityId: 'b1', role: 'brute' },
      { entityId: 'b2', role: 'brute' },
    ]);

    const warnings = validateEncounter(enc, entities);
    expect(warnings.some(w => w.includes('same role'))).toBe(true);
  });

  it('validateEncounter warns on missing entity', () => {
    const entities: Record<string, EntityState> = {};
    const enc = createEncounter('test', 'Test', 'patrol', [
      { entityId: 'nonexistent' },
    ]);

    const warnings = validateEncounter(enc, entities);
    expect(warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('boss-fight composition warns without boss', () => {
    const entities: Record<string, EntityState> = {
      'e1': makeEntity('e1', 'enemy', ['enemy', 'role:brute']),
    };
    const enc = createEncounter('test', 'Test', 'boss-fight', [
      { entityId: 'e1', role: 'brute' },
    ]);

    const warnings = validateEncounter(enc, entities);
    expect(warnings.some(w => w.includes('no boss'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group 3: Danger Rating
// ---------------------------------------------------------------------------

describe('combat-roles: danger rating', () => {
  const player = makeEntity('player', 'player', ['player'], {
    stats: { vigor: 5, instinct: 4, will: 3 },
    resources: { hp: 20, maxHp: 20 },
  });

  it('single minion is trivial or routine', () => {
    const minion = createRoledEnemy(
      makeEntity('m1', 'enemy', ['enemy'], { stats: { vigor: 2 }, resources: { hp: 8, maxHp: 8, stamina: 4, maxStamina: 4 } }),
      'minion',
    );
    const rating = calculateDangerRating([minion], player);
    expect(['trivial', 'routine']).toContain(rating.level);
    expect(rating.score).toBeLessThanOrEqual(40);
  });

  it('boss + elites is deadly or overwhelming', () => {
    const boss = makeEntity('boss', 'enemy', ['enemy', 'role:boss'], {
      stats: { vigor: 8 },
      resources: { hp: 60, maxHp: 60 },
    });
    const elite = makeEntity('elite', 'enemy', ['enemy', 'role:elite'], {
      stats: { vigor: 6 },
      resources: { hp: 36, maxHp: 36 },
    });
    const rating = calculateDangerRating([boss, elite], player);
    expect(['deadly', 'overwhelming']).toContain(rating.level);
    expect(rating.score).toBeGreaterThan(60);
  });

  it('score scales with entity count', () => {
    const single = [makeEntity('e1', 'enemy', ['enemy'], { stats: { vigor: 4 }, resources: { hp: 15, maxHp: 15 } })];
    const triple = [
      ...single,
      makeEntity('e2', 'enemy', ['enemy'], { stats: { vigor: 4 }, resources: { hp: 15, maxHp: 15 } }),
      makeEntity('e3', 'enemy', ['enemy'], { stats: { vigor: 4 }, resources: { hp: 15, maxHp: 15 } }),
    ];

    const r1 = calculateDangerRating(single, player);
    const r3 = calculateDangerRating(triple, player);
    expect(r3.score).toBeGreaterThan(r1.score);
    expect(r3.factors.entityCount).toBe(3);
  });

  it('detects boss presence', () => {
    const boss = makeEntity('b', 'enemy', ['enemy', 'role:boss'], {
      stats: { vigor: 7 },
      resources: { hp: 50, maxHp: 50 },
    });
    const rating = calculateDangerRating([boss], player);
    expect(rating.factors.hasBoss).toBe(true);
  });

  it('formatDangerForNarrator produces readable output', () => {
    const rating = calculateDangerRating(
      [makeEntity('e', 'enemy', ['enemy'], { stats: { vigor: 5 }, resources: { hp: 20, maxHp: 20 } })],
      player,
    );
    const text = formatDangerForNarrator(rating);
    expect(text).toContain('Danger:');
    expect(text).toContain(rating.level);
  });
});

// ---------------------------------------------------------------------------
// Group 4: Boss Phases
// ---------------------------------------------------------------------------

describe('combat-roles: boss phases', () => {
  const bossDef: BossDefinition = {
    entityId: 'test-boss',
    phases: [
      { hpThreshold: 0.5, narrativeKey: 'enraged', addTags: ['enraged'] },
      { hpThreshold: 0.25, narrativeKey: 'desperate', addTags: ['desperate'], removeTags: ['enraged'] },
    ],
  };

  function buildBossEngine() {
    const boss = makeEntity('test-boss', 'enemy', ['enemy', 'role:boss'], {
      resources: { hp: 100, maxHp: 100, stamina: 10 },
      zoneId: 'zone-a',
    });
    const player = makeEntity('player', 'player', ['player'], { zoneId: 'zone-a' });
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCognitionCore(),
        createBossPhaseListener(bossDef),
      ],
      entities: [player, boss],
      zones,
    });
    return engine;
  }

  it('phase triggers at HP threshold', () => {
    const engine = buildBossEngine();
    const boss = engine.store.state.entities['test-boss'];

    // Simulate damage to 50% HP
    boss.resources.hp = 50;
    engine.store.state.eventLog = [];

    // Emit damage event
    engine.store.events.emit({
      id: 'evt-dmg-1',
      type: 'combat.damage.applied',
      tick: 1,
      actorId: 'player',
      payload: { attackerId: 'player', targetId: 'test-boss', damage: 50, previousHp: 100, currentHp: 50 },
    }, engine.store.state);

    expect(boss.tags).toContain('enraged');
  });

  it('phase adds and removes tags', () => {
    const engine = buildBossEngine();
    const boss = engine.store.state.entities['test-boss'];

    // Trigger phase 1
    boss.resources.hp = 50;
    engine.store.events.emit({
      id: 'evt-dmg-1',
      type: 'combat.damage.applied',
      tick: 1,
      actorId: 'player',
      payload: { attackerId: 'player', targetId: 'test-boss', damage: 50, previousHp: 100, currentHp: 50 },
    }, engine.store.state);
    expect(boss.tags).toContain('enraged');

    // Trigger phase 2
    boss.resources.hp = 20;
    engine.store.events.emit({
      id: 'evt-dmg-2',
      type: 'combat.damage.applied',
      tick: 2,
      actorId: 'player',
      payload: { attackerId: 'player', targetId: 'test-boss', damage: 30, previousHp: 50, currentHp: 20 },
    }, engine.store.state);
    expect(boss.tags).toContain('desperate');
    expect(boss.tags).not.toContain('enraged');
  });

  it('boss emits phase transition event', () => {
    const engine = buildBossEngine();
    const boss = engine.store.state.entities['test-boss'];
    const emitted: string[] = [];

    engine.store.events.on('boss.phase.transition', (event) => {
      emitted.push(event.payload.narrativeKey as string);
    });

    boss.resources.hp = 50;
    engine.store.events.emit({
      id: 'evt-dmg-1',
      type: 'combat.damage.applied',
      tick: 1,
      actorId: 'player',
      payload: { attackerId: 'player', targetId: 'test-boss', damage: 50, previousHp: 100, currentHp: 50 },
    }, engine.store.state);

    expect(emitted).toContain('enraged');
  });

  it('multiple phases trigger in order', () => {
    const engine = buildBossEngine();
    const boss = engine.store.state.entities['test-boss'];
    const phases: string[] = [];

    engine.store.events.on('boss.phase.transition', (event) => {
      phases.push(event.payload.narrativeKey as string);
    });

    // Single big hit from 100 to 20 should trigger both phases
    boss.resources.hp = 20;
    engine.store.events.emit({
      id: 'evt-dmg-1',
      type: 'combat.damage.applied',
      tick: 1,
      actorId: 'player',
      payload: { attackerId: 'player', targetId: 'test-boss', damage: 80, previousHp: 100, currentHp: 20 },
    }, engine.store.state);

    expect(phases).toContain('enraged');
    expect(phases).toContain('desperate');
  });
});

// ---------------------------------------------------------------------------
// Group 5: Role-Bias Integration
// ---------------------------------------------------------------------------

describe('combat-roles: role-bias integration', () => {
  it('entity with role:brute gets brute bias in combat intent', () => {
    const brute = makeEntity('brute-enemy', 'enemy', ['enemy', 'role:brute'], {
      stats: { vigor: 6, instinct: 3, will: 2 },
      zoneId: 'zone-a',
    });
    const player = makeEntity('player', 'player', ['player'], { zoneId: 'zone-a' });

    const engine = buildEngine([player, brute]);
    const cog = getCognition(engine.store.state, 'brute-enemy');
    cog.morale = 50;

    // No explicit packBiases passed — role tag should auto-resolve
    const bruteEntity = engine.store.state.entities['brute-enemy'];
    const decision = selectNpcCombatAction(bruteEntity, engine.store.state);

    // Brute bias: attack+5, so attack should be favored
    expect(decision.packBias).toBe('brute-aggression');
  });

  it('explicit packBias overrides role tag', () => {
    const entity = makeEntity('tagged', 'enemy', ['enemy', 'role:brute', 'beast'], {
      stats: { vigor: 5, instinct: 4, will: 3 },
      zoneId: 'zone-a',
    });
    const player = makeEntity('player', 'player', ['player'], { zoneId: 'zone-a' });

    const engine = buildEngine([player, entity]);
    const cog = getCognition(engine.store.state, 'tagged');
    cog.morale = 50;

    // Pass beast bias explicitly — should override role:brute
    const beastBiases = BUILTIN_PACK_BIASES.filter(b => b.tag === 'beast');
    const taggedEntity = engine.store.state.entities['tagged'];
    const decision = selectNpcCombatAction(taggedEntity, engine.store.state, { packBiases: beastBiases });

    expect(decision.packBias).toBe('beast-predator');
  });

  it('getRoleBiases collects from entity array', () => {
    const brute = makeEntity('b', 'enemy', ['enemy', 'role:brute']);
    const minion = makeEntity('m', 'enemy', ['enemy', 'role:minion']);
    const plain = makeEntity('p', 'enemy', ['enemy']);

    const biases = getRoleBiases([brute, minion, plain]);
    expect(biases).toHaveLength(2);
    expect(biases.map(b => b.name)).toContain('brute-aggression');
    expect(biases.map(b => b.name)).toContain('minion-swarm');
  });

  it('getEntityRole returns undefined for non-role entities', () => {
    const plain = makeEntity('p', 'enemy', ['enemy']);
    expect(getEntityRole(plain)).toBeUndefined();
    expect(getEntityRole(undefined)).toBeUndefined();
  });

  it('getEntityRole returns correct role from tag', () => {
    const elite = makeEntity('e', 'enemy', ['enemy', 'role:elite']);
    expect(getEntityRole(elite)).toBe('elite');
  });
});

// ---------------------------------------------------------------------------
// Group 6: Encounter Analysis
// ---------------------------------------------------------------------------

describe('combat-roles: encounter analysis', () => {
  it('analyzeEncounter produces complete analysis', () => {
    const entities: Record<string, EntityState> = {
      'boss': makeEntity('boss', 'enemy', ['enemy', 'role:boss'], {
        stats: { vigor: 8 }, resources: { hp: 50, maxHp: 50 },
      }),
      'minion': makeEntity('minion', 'enemy', ['enemy', 'role:minion'], {
        stats: { vigor: 2 }, resources: { hp: 8, maxHp: 8, stamina: 4, maxStamina: 4 },
      }),
    };
    const player = makeEntity('player', 'player', ['player']);
    const enc = createEncounter('test', 'Test Boss Fight', 'boss-fight', [
      { entityId: 'boss', role: 'boss' },
      { entityId: 'minion', role: 'minion' },
    ]);

    const analysis = analyzeEncounter(enc, entities, player);

    expect(analysis.dangerRating.factors.hasBoss).toBe(true);
    expect(analysis.participantPower).toHaveLength(2);
    expect(analysis.warnings).toHaveLength(0);
  });

  it('collectEncounterBiases returns role biases', () => {
    const entities: Record<string, EntityState> = {
      'b': makeEntity('b', 'enemy', ['enemy', 'role:brute']),
      'm': makeEntity('m', 'enemy', ['enemy', 'role:minion']),
    };
    const enc = createEncounter('test', 'Test', 'horde', [
      { entityId: 'b' },
      { entityId: 'm' },
    ]);

    const biases = collectEncounterBiases(enc, entities);
    expect(biases).toHaveLength(2);
  });
});
