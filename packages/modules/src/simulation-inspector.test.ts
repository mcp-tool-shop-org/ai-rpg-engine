import { describe, test, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { createCognitionCore, getCognition, setBelief, addMemory } from './cognition-core.js';
import { createPerceptionFilter } from './perception-filter.js';
import { createEnvironmentCore, setZoneProperty } from './environment-core.js';
import { createFactionCognition, setFactionBelief, getFactionCognition } from './faction-cognition.js';
import { createRumorPropagation } from './rumor-propagation.js';
import { statusCore } from './status-core.js';
import { createAbilityCore } from './ability-core.js';
import {
  createSimulationInspector,
  inspectEntity,
  inspectAllEntities,
  inspectFaction,
  inspectAllFactions,
  inspectZone,
  inspectAllZones,
  createSnapshot,
  formatEntityInspection,
  formatFactionInspection,
} from './simulation-inspector.js';

const guard = {
  id: 'guard_1',
  blueprintId: 'guard',
  type: 'npc',
  name: 'Guard Captain',
  tags: ['enemy'],
  stats: { vigor: 5, instinct: 6, will: 4 },
  resources: { hp: 20 },
  statuses: [],
  zoneId: 'hall',
  ai: { profileId: 'aggressive', goals: ['guard'], fears: [], alertLevel: 0, knowledge: {} },
};

const player = {
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 7, instinct: 5, will: 5 },
  resources: { hp: 30 },
  statuses: [],
  zoneId: 'hall',
};

const zones = [
  { id: 'hall', roomId: 'castle', name: 'Great Hall', tags: [], neighbors: ['yard'] },
  { id: 'yard', roomId: 'castle', name: 'Courtyard', tags: [], neighbors: ['hall'] },
];

describe('simulation-inspector', () => {
  function createEngine() {
    return createTestEngine({
      modules: [
        createCognitionCore(),
        createPerceptionFilter(),
        createEnvironmentCore(),
        createFactionCognition({
          factions: [{ factionId: 'castle-guard', entityIds: ['guard_1'] }],
        }),
        createRumorPropagation(),
        createSimulationInspector(),
      ],
      entities: [player, { ...guard }],
      zones,
      playerId: 'player',
      startZone: 'hall',
    });
  }

  test('inspectEntity returns cognition state', () => {
    const engine = createEngine();
    const cog = getCognition(engine.world, 'guard_1');
    setBelief(cog, 'player', 'hostile', true, 0.8, 'observed', 0);
    addMemory(engine.world, cog, 'saw-combat', 0, { attackerId: 'player' });

    const inspection = inspectEntity(engine.world, 'guard_1');
    expect(inspection).not.toBeNull();
    expect(inspection!.name).toBe('Guard Captain');
    expect(inspection!.zone).toBe('hall');
    expect(inspection!.faction).toBe('castle-guard');
    expect(inspection!.cognition.beliefs).toHaveLength(1);
    expect(inspection!.cognition.recentMemories).toHaveLength(1);
  });

  test('inspectEntity returns null for unknown entity', () => {
    const engine = createEngine();
    expect(inspectEntity(engine.world, 'nobody')).toBeNull();
  });

  test('inspectAllEntities returns only AI entities', () => {
    const engine = createEngine();
    const all = inspectAllEntities(engine.world);
    expect(Object.keys(all)).toContain('guard_1');
    expect(Object.keys(all)).not.toContain('player'); // player has no ai field
  });

  test('inspectFaction returns faction beliefs and members', () => {
    const engine = createEngine();
    const factionCog = getFactionCognition(engine.world, 'castle-guard');
    setFactionBelief(factionCog, 'player', 'hostile', true, 0.7, 'guard_1', 0);

    const inspection = inspectFaction(engine.world, 'castle-guard');
    expect(inspection).not.toBeNull();
    expect(inspection!.members).toContain('guard_1');
    expect(inspection!.beliefs).toHaveLength(1);
    expect(inspection!.alertLevel).toBe(0);
    expect(inspection!.cohesion).toBe(0.8); // default cohesion
  });

  test('inspectAllFactions returns all faction data', () => {
    const engine = createEngine();
    const all = inspectAllFactions(engine.world);
    expect(Object.keys(all)).toContain('castle-guard');
  });

  test('inspectZone returns dynamic properties and entities', () => {
    const engine = createEngine();
    setZoneProperty(engine.world, 'hall', 'noise', 5);

    const inspection = inspectZone(engine.world, 'hall');
    expect(inspection).not.toBeNull();
    expect(inspection!.name).toBe('Great Hall');
    expect(inspection!.dynamicProperties.noise).toBe(5);
    expect(inspection!.entities).toContain('guard_1');
    expect(inspection!.entities).toContain('player');
  });

  test('inspectAllZones returns all zones', () => {
    const engine = createEngine();
    const all = inspectAllZones(engine.world);
    expect(Object.keys(all)).toContain('hall');
    expect(Object.keys(all)).toContain('yard');
  });

  test('createSnapshot returns full simulation state', () => {
    const engine = createEngine();
    const snapshot = createSnapshot(engine.world);
    expect(snapshot.tick).toBe(engine.world.meta.tick);
    expect(snapshot.entities).toBeDefined();
    expect(snapshot.factions).toBeDefined();
    expect(snapshot.zones).toBeDefined();
    expect(typeof snapshot.rumorCount).toBe('number');
    expect(typeof snapshot.eventLogSize).toBe('number');
  });

  test('formatEntityInspection produces readable text', () => {
    const engine = createEngine();
    const cog = getCognition(engine.world, 'guard_1');
    setBelief(cog, 'player', 'hostile', true, 0.8, 'observed', 0);

    const inspection = inspectEntity(engine.world, 'guard_1')!;
    const text = formatEntityInspection(inspection);
    expect(text).toContain('Guard Captain');
    expect(text).toContain('guard_1');
    expect(text).toContain('hostile');
    expect(text).toContain('castle-guard');
  });

  test('formatFactionInspection produces readable text', () => {
    const engine = createEngine();
    const factionCog = getFactionCognition(engine.world, 'castle-guard');
    setFactionBelief(factionCog, 'player', 'hostile', true, 0.7, 'guard_1', 0);

    const inspection = inspectFaction(engine.world, 'castle-guard')!;
    const text = formatFactionInspection(inspection);
    expect(text).toContain('castle-guard');
    expect(text).toContain('guard_1');
    expect(text).toContain('hostile');
  });

  test('debug inspectors are registered', () => {
    const engine = createEngine();
    const inspectors = engine.moduleManager.getInspectors();
    const ids = inspectors.map(i => i.id);
    expect(ids).toContain('entity-cognition');
    expect(ids).toContain('faction-state');
    expect(ids).toContain('environment-state');
    expect(ids).toContain('rumor-trace');
    expect(ids).toContain('simulation-snapshot');
  });

  // -------------------------------------------------------------------------
  // abilityState.availableAbilities (F-dd1faf2a)
  // -------------------------------------------------------------------------
  //
  // availableAbilities used to be derived ONLY from AbilityModuleState's
  // cooldowns/useCounts, both populated ONLY once an ability has been used at
  // least once. Any ability an entity has NEVER used — the common case for
  // most of a kit, most of the time — was silently omitted even when fully
  // ready, because this inspector never called ability-core.ts's actually-
  // correct isAbilityReady/getAvailableAbilities (it lacked the
  // AbilityDefinition[] list needed to). inspectEntity/inspectAllEntities/
  // createSimulationInspector now accept an OPTIONAL abilities list; when
  // supplied, availability is computed correctly; omitted, the old
  // (under-reporting, but no worse than before) cooldown/use-count fallback
  // still applies for back-compat.

  describe('abilityState.availableAbilities', () => {
    const fireball: AbilityDefinition = {
      id: 'fireball', name: 'Fireball', verb: 'cast', tags: [],
      target: { type: 'single', filter: ['enemy'] }, checks: [], effects: [],
    };
    const drainingRitual: AbilityDefinition = {
      id: 'draining-ritual', name: 'Draining Ritual', verb: 'cast', tags: [],
      costs: [{ resourceId: 'mana', amount: 100 }], // guard_1 has no mana → never affordable
      target: { type: 'self' }, checks: [], effects: [],
    };

    function createEngineWithAbilities() {
      return createTestEngine({
        modules: [
          statusCore,
          createCognitionCore(),
          createPerceptionFilter(),
          createEnvironmentCore(),
          createFactionCognition({
            factions: [{ factionId: 'castle-guard', entityIds: ['guard_1'] }],
          }),
          createRumorPropagation(),
          createAbilityCore({ abilities: [fireball, drainingRitual] }),
          createSimulationInspector({ abilities: [fireball, drainingRitual] }),
        ],
        entities: [player, { ...guard }],
        zones,
        playerId: 'player',
        startZone: 'hall',
      });
    }

    test('an ability the entity has NEVER used still shows as available when it is actually ready', () => {
      const engine = createEngineWithAbilities();
      const inspection = inspectEntity(engine.world, 'guard_1', [fireball, drainingRitual]);
      expect(inspection).not.toBeNull();
      expect(inspection!.abilityState.availableAbilities).toContain('fireball');
    });

    test('an ability the entity has never used but genuinely CANNOT afford is correctly excluded (proves this reads real readiness, not just presence)', () => {
      const engine = createEngineWithAbilities();
      const inspection = inspectEntity(engine.world, 'guard_1', [fireball, drainingRitual]);
      expect(inspection!.abilityState.availableAbilities).not.toContain('draining-ritual');
    });

    test('inspectAllEntities threads the abilities list through to every entity', () => {
      const engine = createEngineWithAbilities();
      const all = inspectAllEntities(engine.world, [fireball, drainingRitual]);
      expect(all['guard_1'].abilityState.availableAbilities).toContain('fireball');
    });

    test('without an abilities list (back-compat), a never-used ability is not reported', () => {
      const engine = createEngineWithAbilities();
      const inspection = inspectEntity(engine.world, 'guard_1');
      expect(inspection!.abilityState.availableAbilities).not.toContain('fireball');
    });

    test('createSimulationInspector threads its configured abilities into the entity-cognition debug inspector', () => {
      const engine = createEngineWithAbilities();
      const entityCognitionInspector = engine.moduleManager
        .getInspectors()
        .find(i => i.id === 'entity-cognition')!;
      const result = entityCognitionInspector.inspect(engine.world) as Record<string, {
        abilityState: { availableAbilities: string[] };
      }>;
      expect(result['guard_1'].abilityState.availableAbilities).toContain('fireball');
    });
  });
});
