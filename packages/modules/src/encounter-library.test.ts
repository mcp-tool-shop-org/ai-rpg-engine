import { describe, it, expect } from 'vitest';
import {
  createPatrolEncounter,
  createAmbushEncounter,
  createBossFightEncounter,
  createHordeEncounter,
  createDuelEncounter,
  createEscalatingBoss,
  createSummonerBoss,
  createPhaseShiftBoss,
  auditPackCoverage,
} from './encounter-library.js';
import { validateBossDefinition } from './combat-roles.js';

// ---------------------------------------------------------------------------
// Patrol Archetype
// ---------------------------------------------------------------------------
describe('createPatrolEncounter', () => {
  it('creates encounter with patrol composition', () => {
    const enc = createPatrolEncounter(
      { id: 'test-patrol', name: 'Test Patrol' },
      [{ entityId: 'guard-a', role: 'brute' }, { entityId: 'guard-b', role: 'skirmisher' }],
    );
    expect(enc.composition).toBe('patrol');
    expect(enc.participants).toHaveLength(2);
    expect(enc.id).toBe('test-patrol');
  });

  it('binds to valid zone IDs', () => {
    const enc = createPatrolEncounter(
      { id: 'zone-patrol', name: 'Zone Patrol', validZoneIds: ['zone-a', 'zone-b'] },
      [{ entityId: 'guard', role: 'brute' }],
    );
    expect(enc.validZoneIds).toEqual(['zone-a', 'zone-b']);
  });

  it('includes narrative hooks', () => {
    const enc = createPatrolEncounter(
      { id: 'story-patrol', name: 'Story Patrol', narrativeHooks: { tone: 'tense', trigger: 'footsteps', stakes: 'high' } },
      [{ entityId: 'guard', role: 'brute' }],
    );
    expect(enc.narrativeHooks?.tone).toBe('tense');
    expect(enc.narrativeHooks?.stakes).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Ambush Archetype
// ---------------------------------------------------------------------------
describe('createAmbushEncounter', () => {
  it('creates encounter with ambush composition', () => {
    const enc = createAmbushEncounter(
      { id: 'test-ambush', name: 'Test Ambush' },
      [{ entityId: 'assassin', role: 'skirmisher' }],
    );
    expect(enc.composition).toBe('ambush');
    expect(enc.participants).toHaveLength(1);
  });

  it('preserves all participants', () => {
    const enc = createAmbushEncounter(
      { id: 'multi-ambush', name: 'Multi Ambush' },
      [
        { entityId: 'a', role: 'skirmisher' },
        { entityId: 'b', role: 'skirmisher' },
        { entityId: 'c', role: 'minion' },
      ],
    );
    expect(enc.participants).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Boss-Fight Archetype
// ---------------------------------------------------------------------------
describe('createBossFightEncounter', () => {
  it('places boss first in participants', () => {
    const enc = createBossFightEncounter(
      { id: 'boss-test', name: 'Boss Test' },
      { entityId: 'big-boss', role: 'boss' },
      [{ entityId: 'minion-a', role: 'minion' }],
    );
    expect(enc.composition).toBe('boss-fight');
    expect(enc.participants[0].entityId).toBe('big-boss');
    expect(enc.participants).toHaveLength(2);
  });

  it('works with no support participants', () => {
    const enc = createBossFightEncounter(
      { id: 'solo-boss', name: 'Solo Boss' },
      { entityId: 'big-boss', role: 'boss' },
      [],
    );
    expect(enc.participants).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Horde Archetype
// ---------------------------------------------------------------------------
describe('createHordeEncounter', () => {
  it('creates horde with minions only', () => {
    const minions = [
      { entityId: 'm1', role: 'minion' as const },
      { entityId: 'm2', role: 'minion' as const },
      { entityId: 'm3', role: 'minion' as const },
    ];
    const enc = createHordeEncounter({ id: 'horde-test', name: 'Horde' }, minions);
    expect(enc.composition).toBe('horde');
    expect(enc.participants).toHaveLength(3);
  });

  it('places leader first when provided', () => {
    const minions = [{ entityId: 'm1', role: 'minion' as const }];
    const leader = { entityId: 'leader', role: 'elite' as const };
    const enc = createHordeEncounter({ id: 'led-horde', name: 'Led Horde' }, minions, leader);
    expect(enc.participants[0].entityId).toBe('leader');
    expect(enc.participants).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Duel Archetype
// ---------------------------------------------------------------------------
describe('createDuelEncounter', () => {
  it('creates duel composition', () => {
    const enc = createDuelEncounter(
      { id: 'duel-test', name: 'Duel' },
      [{ entityId: 'rival', role: 'elite' }],
    );
    expect(enc.composition).toBe('duel');
    expect(enc.participants).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Escalating Boss Template
// ---------------------------------------------------------------------------
describe('createEscalatingBoss', () => {
  it('creates 2 phases at descending thresholds', () => {
    const boss = createEscalatingBoss({ entityId: 'big-bad' });
    expect(boss.phases).toHaveLength(2);
    expect(boss.phases[0].hpThreshold).toBe(0.5);
    expect(boss.phases[1].hpThreshold).toBe(0.25);
    expect(boss.phases[0].addTags).toContain('enraged');
    expect(boss.phases[1].addTags).toContain('desperate');
  });

  it('passes validateBossDefinition', () => {
    const boss = createEscalatingBoss({ entityId: 'valid-boss' });
    const warnings = validateBossDefinition(boss);
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Summoner Boss Template
// ---------------------------------------------------------------------------
describe('createSummonerBoss', () => {
  it('creates 3 phases with spawn entity IDs', () => {
    const boss = createSummonerBoss(
      { entityId: 'summoner' },
      { phase1Spawns: ['minion-a'], phase2Spawns: ['minion-b'], phase3Spawns: ['minion-c'] },
    );
    expect(boss.phases).toHaveLength(3);
    expect(boss.phases[0].spawnEntityIds).toEqual(['minion-a']);
    expect(boss.phases[2].spawnEntityIds).toEqual(['minion-c']);
  });

  it('passes validateBossDefinition', () => {
    const boss = createSummonerBoss({ entityId: 'valid-summoner' }, {});
    const warnings = validateBossDefinition(boss);
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Phase-Shift Boss Template
// ---------------------------------------------------------------------------
describe('createPhaseShiftBoss', () => {
  it('creates custom phases with tag swaps', () => {
    const boss = createPhaseShiftBoss({ entityId: 'shifter' }, [
      { hpThreshold: 0.7, narrativeKey: 'phase-1', addTags: ['charging'] },
      { hpThreshold: 0.3, narrativeKey: 'phase-2', addTags: ['overloaded'], removeTags: ['charging'] },
    ]);
    expect(boss.phases).toHaveLength(2);
    expect(boss.phases[0].addTags).toContain('charging');
    expect(boss.phases[1].removeTags).toContain('charging');
  });

  it('respects immovable flag', () => {
    const boss = createPhaseShiftBoss({ entityId: 'rooted', immovable: true }, [
      { hpThreshold: 0.5, narrativeKey: 'p1' },
    ]);
    expect(boss.immovable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pack Coverage Audit
// ---------------------------------------------------------------------------
describe('auditPackCoverage', () => {
  const makeEnemy = (id: string, roles: string[]) => ({
    id,
    tags: ['enemy', ...roles.map(r => `role:${r}`)],
  });

  it('flags packs below minimum bar', () => {
    const result = auditPackCoverage(
      'test-pack',
      [makeEnemy('e1', ['brute'])],
      [],
      [],
      ['zone-a'],
    );
    expect(result.missingMinimumBar.length).toBeGreaterThan(0);
    expect(result.missingMinimumBar.some(m => m.includes('3+ enemies'))).toBe(true);
    expect(result.missingMinimumBar.some(m => m.includes('3+ encounters'))).toBe(true);
  });

  it('passes when meeting minimum bar', () => {
    const enemies = [
      makeEnemy('e1', ['brute']),
      makeEnemy('e2', ['skirmisher']),
      makeEnemy('e3', ['boss']),
    ];
    const encounters = [
      createPatrolEncounter({ id: 'enc-1', name: 'P', validZoneIds: ['z1'] }, [{ entityId: 'e1' }]),
      createAmbushEncounter({ id: 'enc-2', name: 'A', validZoneIds: ['z2'] }, [{ entityId: 'e2' }]),
      createBossFightEncounter({ id: 'enc-3', name: 'BF', validZoneIds: ['z1'] }, { entityId: 'e3' }, []),
    ];
    const bossDefs = [createEscalatingBoss({ entityId: 'e3' })];
    const result = auditPackCoverage('good-pack', enemies, encounters, bossDefs, ['z1', 'z2']);
    expect(result.missingMinimumBar).toHaveLength(0);
    expect(result.enemyCount).toBe(3);
    expect(result.encounterCount).toBe(3);
    expect(result.bossDefinitionCount).toBe(1);
  });

  it('extracts roles used', () => {
    const enemies = [
      makeEnemy('e1', ['brute']),
      makeEnemy('e2', ['skirmisher']),
      makeEnemy('e3', ['boss']),
    ];
    const result = auditPackCoverage('roles-pack', enemies, [], [], []);
    expect(result.rolesUsed).toContain('brute');
    expect(result.rolesUsed).toContain('skirmisher');
    expect(result.rolesUsed).toContain('boss');
  });

  it('counts zones with encounters', () => {
    const enemies = [
      makeEnemy('e1', ['brute']),
      makeEnemy('e2', ['skirmisher']),
      makeEnemy('e3', ['boss']),
    ];
    const encounters = [
      createPatrolEncounter({ id: 'enc-1', name: 'P', validZoneIds: ['z1', 'z2'] }, [{ entityId: 'e1' }]),
      createBossFightEncounter({ id: 'enc-2', name: 'BF', validZoneIds: ['z3'] }, { entityId: 'e3' }, []),
      createAmbushEncounter({ id: 'enc-3', name: 'A', validZoneIds: ['z1'] }, [{ entityId: 'e2' }]),
    ];
    const result = auditPackCoverage('zones-pack', enemies, encounters, [], ['z1', 'z2', 'z3', 'z4']);
    expect(result.zonesWithEncounters).toBe(3);
    expect(result.totalZones).toBe(4);
  });
});
