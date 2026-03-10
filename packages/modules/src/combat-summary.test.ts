import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { statusCore } from './status-core.js';
import { createCognitionCore } from './cognition-core.js';
import { createCombatIntent } from './combat-intent.js';
import { createEnvironmentCore } from './environment-core.js';
import { createDistrictCore } from './district-core.js';
import { createSimulationInspector } from './simulation-inspector.js';
import {
  BUILTIN_COMBAT_ROLES,
  COMBAT_ROLES,
  getEntityRole,
  getTacticalExpectation,
  validateBossDefinition,
  createEncounter,
} from './combat-roles.js';
import type { CombatRole, BossDefinition, EncounterDefinition } from './combat-roles.js';
import {
  findEncounters,
  getEncountersByZone,
  getEncountersByDistrict,
  getEncounterBosses,
  buildBossProfile,
  buildEncounterDetail,
  summarizeCombatContent,
  summarizeRegionCombat,
  auditEncounters,
  auditProjectCombat,
  formatEncounterDetailForDirector,
  formatEncounterDetailForNarrator,
  formatBossProfileForDirector,
  formatTacticalExpectation,
  formatCombatSummaryForDirector,
  formatCombatSummaryForNarrator,
  formatRegionCombatForDirector,
  formatAuditForDirector,
  formatCombatSummaryMarkdown,
  formatCombatSummaryJSON,
} from './combat-summary.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Arena Floor', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Back Hall', tags: [] as string[], neighbors: ['zone-a'] },
  { id: 'zone-c', roomId: 'test', name: 'Crypt', tags: [] as string[], neighbors: ['zone-a'] },
];

const districts = [
  { id: 'district-a', name: 'Arena District', zoneIds: ['zone-a', 'zone-b'], tags: [] as string[] },
  { id: 'district-b', name: 'Crypt District', zoneIds: ['zone-c'], tags: [] as string[] },
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

const player = makeEntity('player', 'player', ['player'], { stats: { vigor: 6, instinct: 5, will: 4 }, resources: { hp: 30, maxHp: 30, stamina: 10, maxStamina: 10 } });
const brute1 = makeEntity('brute-1', 'enemy', ['enemy', 'role:brute'], { resources: { hp: 30, maxHp: 30, stamina: 8, maxStamina: 8 } });
const minion1 = makeEntity('minion-1', 'enemy', ['enemy', 'role:minion'], { resources: { hp: 8, maxHp: 8, stamina: 6, maxStamina: 6 } });
const minion2 = makeEntity('minion-2', 'enemy', ['enemy', 'role:minion'], { resources: { hp: 8, maxHp: 8, stamina: 6, maxStamina: 6 } });
const boss1 = makeEntity('boss-1', 'enemy', ['enemy', 'role:boss'], { stats: { vigor: 8, instinct: 5, will: 7 }, resources: { hp: 60, maxHp: 60, stamina: 16, maxStamina: 16 } });
const elite1 = makeEntity('elite-1', 'enemy', ['enemy', 'role:elite'], { resources: { hp: 36, maxHp: 36, stamina: 12, maxStamina: 12 } });
const unroled = makeEntity('plain-enemy', 'enemy', ['enemy']);

const entities: Record<string, EntityState> = {
  player, 'brute-1': brute1, 'minion-1': minion1, 'minion-2': minion2,
  'boss-1': boss1, 'elite-1': elite1, 'plain-enemy': unroled,
};

const bossEncounter: EncounterDefinition = {
  id: 'enc-boss', name: 'Arena Boss Fight', participants: [
    { entityId: 'boss-1', role: 'boss' },
    { entityId: 'minion-1', role: 'minion' },
    { entityId: 'minion-2', role: 'minion' },
  ],
  composition: 'boss-fight',
  validZoneIds: ['zone-a'],
  narrativeHooks: { tone: 'desperate last stand', trigger: 'arena bell', stakes: 'freedom' },
};

const patrolEncounter: EncounterDefinition = {
  id: 'enc-patrol', name: 'Back Hall Patrol', participants: [
    { entityId: 'brute-1', role: 'brute' },
    { entityId: 'elite-1', role: 'elite' },
  ],
  composition: 'patrol',
  validZoneIds: ['zone-b'],
};

const cryptEncounter: EncounterDefinition = {
  id: 'enc-crypt', name: 'Crypt Ambush', participants: [
    { entityId: 'minion-1', role: 'minion' },
    { entityId: 'minion-2', role: 'minion' },
  ],
  composition: 'ambush',
  validZoneIds: ['zone-c'],
};

const unzonedEncounter: EncounterDefinition = {
  id: 'enc-unzoned', name: 'Random Encounter', participants: [
    { entityId: 'plain-enemy' },
  ],
  composition: 'solo',
};

const allEncounters = [bossEncounter, patrolEncounter, cryptEncounter, unzonedEncounter];

const bossDef: BossDefinition = {
  entityId: 'boss-1',
  phases: [
    { hpThreshold: 0.5, narrativeKey: 'enraged', addTags: ['enraged'] },
    { hpThreshold: 0.25, narrativeKey: 'desperate', addTags: ['desperate'], removeTags: ['enraged'], spawnEntityIds: ['minion-3'] },
  ],
  immovable: true,
};

// ---------------------------------------------------------------------------
// Group 1: Query Functions
// ---------------------------------------------------------------------------

describe('combat-summary: query', () => {
  it('findEncounters filters by name', () => {
    const result = findEncounters(allEncounters, { nameContains: 'boss' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('enc-boss');
  });

  it('findEncounters filters by role', () => {
    const result = findEncounters(allEncounters, { hasRole: 'brute' }, entities);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('enc-patrol');
  });

  it('findEncounters filters by boss-fight', () => {
    const result = findEncounters(allEncounters, { isBossFight: true }, entities);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('enc-boss');
  });

  it('getEncountersByZone groups correctly', () => {
    const byZone = getEncountersByZone(allEncounters);
    expect(byZone['zone-a']).toHaveLength(1);
    expect(byZone['zone-b']).toHaveLength(1);
    expect(byZone['zone-c']).toHaveLength(1);
    expect(byZone['_unzoned']).toHaveLength(1);
  });

  it('getEncountersByDistrict groups via district mapping', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore(), createEnvironmentCore(), createDistrictCore({ districts })],
      entities: Object.values(entities),
      zones,
    });
    const byDistrict = getEncountersByDistrict(allEncounters, engine.store.state);
    expect(byDistrict['district-a']).toHaveLength(2); // zone-a + zone-b
    expect(byDistrict['district-b']).toHaveLength(1); // zone-c
    expect(byDistrict['_unassigned']).toHaveLength(1); // unzoned
  });
});

// ---------------------------------------------------------------------------
// Group 2: Boss Helpers
// ---------------------------------------------------------------------------

describe('combat-summary: boss helpers', () => {
  it('validateBossDefinition catches empty phases', () => {
    const warnings = validateBossDefinition({ entityId: 'x', phases: [] });
    expect(warnings.some(w => w.includes('no phases'))).toBe(true);
  });

  it('validateBossDefinition catches out-of-range threshold', () => {
    const warnings = validateBossDefinition({
      entityId: 'x',
      phases: [{ hpThreshold: 1.5, narrativeKey: 'bad' }],
    });
    expect(warnings.some(w => w.includes('out of range'))).toBe(true);
  });

  it('buildBossProfile constructs timeline in descending order', () => {
    const profile = buildBossProfile(bossDef, boss1);
    expect(profile.phaseCount).toBe(2);
    expect(profile.phaseTimeline[0].hpThreshold).toBeGreaterThan(profile.phaseTimeline[1].hpThreshold);
    expect(profile.phaseTimeline[0].narrativeKey).toBe('enraged');
    expect(profile.phaseTimeline[1].narrativeKey).toBe('desperate');
    expect(profile.immovable).toBe(true);
    expect(profile.entityName).toBe('boss-1');
  });

  it('getEncounterBosses matches bossDefs to encounters', () => {
    const profiles = getEncounterBosses(allEncounters, [bossDef], entities);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].entityId).toBe('boss-1');
  });
});

// ---------------------------------------------------------------------------
// Group 3: Tactical Expectations
// ---------------------------------------------------------------------------

describe('combat-summary: tactical expectations', () => {
  it('getTacticalExpectation returns valid data for all 8 roles', () => {
    for (const role of COMBAT_ROLES) {
      const exp = getTacticalExpectation(role);
      expect(exp.role).toBe(role);
      expect(exp.likelyBehavior.length).toBeGreaterThan(0);
      expect(exp.playerThreat.length).toBeGreaterThan(0);
      expect(exp.counterHint.length).toBeGreaterThan(0);
      expect(['frontline', 'backline', 'flanker', 'variable']).toContain(exp.positionTendency);
      expect(['stands-firm', 'breaks-early', 'never-flees', 'unpredictable']).toContain(exp.moraleProfile);
    }
  });

  it('formatTacticalExpectation produces readable text', () => {
    const exp = getTacticalExpectation('brute');
    const text = formatTacticalExpectation(exp);
    expect(text).toContain('brute');
    expect(text).toContain('Behavior:');
    expect(text).toContain('Threat:');
    expect(text).toContain('Counter:');
  });
});

// ---------------------------------------------------------------------------
// Group 4: Encounter Detail
// ---------------------------------------------------------------------------

describe('combat-summary: encounter detail', () => {
  it('buildEncounterDetail includes boss profiles', () => {
    const detail = buildEncounterDetail(bossEncounter, entities, player, { bossDefs: [bossDef] });
    expect(detail.bossProfiles).toHaveLength(1);
    expect(detail.bossProfiles[0].entityId).toBe('boss-1');
    expect(detail.analysis.dangerRating.level).toBeDefined();
    expect(detail.tacticalExpectations).toHaveLength(3);
  });

  it('buildEncounterDetail includes zone context when world provided', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore(), createEnvironmentCore(), createDistrictCore({ districts })],
      entities: Object.values(entities),
      zones,
    });
    const detail = buildEncounterDetail(bossEncounter, entities, player, {
      world: engine.store.state,
      bossDefs: [bossDef],
    });
    expect(detail.zoneContext).toBeDefined();
    expect(detail.zoneContext!.validZoneNames).toContain('Arena Floor');
    expect(detail.zoneContext!.districtId).toBe('district-a');
    expect(detail.zoneContext!.districtName).toBe('Arena District');
  });

  it('formatEncounterDetailForDirector produces readable output', () => {
    const detail = buildEncounterDetail(bossEncounter, entities, player, { bossDefs: [bossDef] });
    const text = formatEncounterDetailForDirector(detail);
    expect(text).toContain('Arena Boss Fight');
    expect(text).toContain('boss-fight');
    expect(text).toContain('boss-1');
    expect(text).toContain('desperate last stand');
  });
});

// ---------------------------------------------------------------------------
// Group 5: Summary Functions
// ---------------------------------------------------------------------------

describe('combat-summary: summary', () => {
  it('summarizeCombatContent counts encounters and roles', () => {
    const summary = summarizeCombatContent(allEncounters, entities, player, [bossDef]);
    expect(summary.encounterCount).toBe(4);
    expect(summary.roleDistribution['minion']).toBe(4); // 2 in boss + 2 in crypt
    expect(summary.roleDistribution['boss']).toBe(1);
    expect(summary.roleDistribution['brute']).toBe(1);
    expect(summary.roleDistribution['elite']).toBe(1);
    expect(summary.bossList).toHaveLength(1);
    expect(summary.bossList[0].entityId).toBe('boss-1');
    expect(summary.uniqueEntityCount).toBe(6);
  });

  it('summarizeCombatContent generates advisories for overused roles', () => {
    // 4 minions out of 7 role assignments = 57% > 50%
    const summary = summarizeCombatContent(allEncounters, entities, player);
    expect(summary.advisories.some(a => a.includes("'minion'"))).toBe(true);
  });

  it('summarizeRegionCombat filters by district', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore(), createEnvironmentCore(), createDistrictCore({ districts })],
      entities: Object.values(entities),
      zones,
    });
    const overview = summarizeRegionCombat('district-a', allEncounters, entities, engine.store.state, player);
    expect(overview.encounterCount).toBe(2); // zone-a + zone-b encounters
    expect(overview.districtName).toBe('Arena District');
  });

  it('formatCombatSummaryForDirector and ForNarrator produce output', () => {
    const summary = summarizeCombatContent(allEncounters, entities, player);
    const director = formatCombatSummaryForDirector(summary);
    expect(director).toContain('Combat Content Summary');
    expect(director).toContain('4');
    const narrator = formatCombatSummaryForNarrator(summary);
    expect(narrator).toContain('4 encounters');
  });
});

// ---------------------------------------------------------------------------
// Group 6: Audit Functions
// ---------------------------------------------------------------------------

describe('combat-summary: audit', () => {
  it('auditEncounters warns on all-same-role', () => {
    const sameRoleEnc: EncounterDefinition = {
      id: 'enc-same', name: 'Same Role Fight', participants: [
        { entityId: 'minion-1', role: 'minion' },
        { entityId: 'minion-2', role: 'minion' },
        { entityId: 'plain-enemy', role: 'minion' },
      ],
      composition: 'horde',
    };
    const results = auditEncounters([sameRoleEnc], entities);
    const warnings = results[0].warnings;
    expect(warnings.some(w => w.category === 'role-diversity')).toBe(true);
  });

  it('auditEncounters warns on boss without support', () => {
    const bossAlone: EncounterDefinition = {
      id: 'enc-boss-alone', name: 'Boss Alone', participants: [
        { entityId: 'boss-1', role: 'boss' },
        { entityId: 'elite-1', role: 'elite' },
      ],
      composition: 'boss-fight',
    };
    const results = auditEncounters([bossAlone], entities, [bossDef]);
    const warnings = results[0].warnings;
    expect(warnings.some(w =>
      w.category === 'boss-structure' && w.message.includes('no minion or bodyguard'),
    )).toBe(true);
  });

  it('auditProjectCombat detects overused roles', () => {
    const audit = auditProjectCombat(allEncounters, entities, undefined, [bossDef], player);
    expect(audit.projectAdvisories.some(w =>
      w.category === 'role-diversity' && w.message.includes("'minion'"),
    )).toBe(true);
  });

  it('formatAuditForDirector produces output with advisory tone', () => {
    const audit = auditProjectCombat(allEncounters, entities, undefined, [bossDef], player);
    const text = formatAuditForDirector(audit);
    expect(text).toContain('Combat Audit');
    expect(text).toContain('encounters');
    // Should not contain "Error" — advisory tone
    expect(text).not.toContain('Error');
  });
});

// ---------------------------------------------------------------------------
// Group 7: Export Functions
// ---------------------------------------------------------------------------

describe('combat-summary: export', () => {
  it('formatCombatSummaryMarkdown produces valid markdown', () => {
    const summary = summarizeCombatContent(allEncounters, entities, player, [bossDef]);
    const md = formatCombatSummaryMarkdown(summary);
    expect(md).toContain('# Combat Content Summary');
    expect(md).toContain('| Tier | Count |');
    expect(md).toContain('| Role | Count |');
    expect(md).toContain('**boss-1**');
  });

  it('formatCombatSummaryJSON returns JSON-serializable object', () => {
    const summary = summarizeCombatContent(allEncounters, entities, player, [bossDef]);
    const json = formatCombatSummaryJSON(summary);
    const str = JSON.stringify(json);
    expect(str).toBeTruthy();
    const parsed = JSON.parse(str);
    expect(parsed.encounterCount).toBe(4);
  });

  it('formatCombatSummaryJSON round-trips cleanly', () => {
    const summary = summarizeCombatContent(allEncounters, entities, player, [bossDef]);
    const json = formatCombatSummaryJSON(summary);
    const roundTripped = JSON.parse(JSON.stringify(json));
    expect(roundTripped.encounterCount).toBe(json.encounterCount);
    expect(roundTripped.bossList).toEqual((json as any).bossList);
  });
});

// ---------------------------------------------------------------------------
// Group 8: Inspector Integration
// ---------------------------------------------------------------------------

describe('combat-summary: inspectors', () => {
  it('entity-role-summary inspector reports role distribution', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore(), createCombatIntent(), createSimulationInspector()],
      entities: Object.values(entities),
      zones,
    });
    const inspectors = engine.moduleManager.getInspectors();
    const roleSummary = inspectors.find(i => i.id === 'entity-role-summary');
    expect(roleSummary).toBeDefined();
    const result = roleSummary!.inspect(engine.store.state) as any;
    expect(result.totalEnemies).toBe(6);
    expect(result.bossCount).toBe(1);
    expect(result.unroled).toBe(1);
  });

  it('boss-phases inspector shows boss HP ratios', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore(), createCombatIntent(), createSimulationInspector()],
      entities: Object.values(entities),
      zones,
    });
    const inspectors = engine.moduleManager.getInspectors();
    const bossPhases = inspectors.find(i => i.id === 'boss-phases');
    expect(bossPhases).toBeDefined();
    const result = bossPhases!.inspect(engine.store.state) as any;
    expect(result['boss-1']).toBeDefined();
    expect(result['boss-1'].hpRatio).toBe(1); // full HP
  });
});
