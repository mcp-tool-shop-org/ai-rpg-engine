import { describe, test, expect } from 'vitest';
import { createTestEngine } from '@signalfire/core';
import { createCognitionCore, getCognition, setBelief, addMemory } from './cognition-core.js';
import { createPerceptionFilter } from './perception-filter.js';
import { createEnvironmentCore, setZoneProperty } from './environment-core.js';
import { createFactionCognition, setFactionBelief, getFactionCognition } from './faction-cognition.js';
import { createRumorPropagation } from './rumor-propagation.js';
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
    addMemory(cog, 'saw-combat', 0, { attackerId: 'player' });

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
});
