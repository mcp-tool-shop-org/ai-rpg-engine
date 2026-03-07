import { describe, it, expect } from 'vitest';
import { Engine } from '@signalfire/core';
import type { GameManifest, ZoneState, EntityState } from '@signalfire/core';
import {
  traversalCore,
  combatCore,
  createCognitionCore,
  createPerceptionFilter,
  createEnvironmentCore,
  createFactionCognition,
  createRumorPropagation,
  createDistrictCore,
  getDistrictState,
  getDistrictForZone,
  getDistrictMetric,
  modifyDistrictMetric,
  isDistrictOnAlert,
  getDistrictThreatLevel,
  getAllDistrictIds,
} from './index.js';
import type { DistrictDefinition } from './index.js';

const manifest: GameManifest = {
  id: 'district-test', title: '', version: '0.1.0',
  engineVersion: '0.1.0', ruleset: 'test', modules: [], contentPacks: [],
};

const zones: ZoneState[] = [
  { id: 'zone-a', roomId: 'r1', name: 'Zone A', tags: [], neighbors: ['zone-b'], stability: 5 },
  { id: 'zone-b', roomId: 'r1', name: 'Zone B', tags: [], neighbors: ['zone-a', 'zone-c'], stability: 3 },
  { id: 'zone-c', roomId: 'r2', name: 'Zone C', tags: [], neighbors: ['zone-b'] },
];

const districts: DistrictDefinition[] = [
  {
    id: 'district-alpha',
    name: 'Alpha District',
    zoneIds: ['zone-a', 'zone-b'],
    tags: ['patrolled'],
    controllingFaction: 'guards',
  },
  {
    id: 'district-beta',
    name: 'Beta District',
    zoneIds: ['zone-c'],
    tags: ['neutral'],
  },
];

const player: EntityState = {
  id: 'player', blueprintId: 'player', type: 'player', name: 'Player',
  tags: ['player'], stats: { vigor: 5, instinct: 5 }, resources: { hp: 20, stamina: 8 },
  statuses: [], zoneId: 'zone-a',
};

const guard: EntityState = {
  id: 'guard', blueprintId: 'guard', type: 'enemy', name: 'Guard',
  tags: ['enemy'], stats: { vigor: 4, instinct: 4 }, resources: { hp: 15, stamina: 4 },
  statuses: [], zoneId: 'zone-b',
  ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
};

function createTestEngine(): Engine {
  const engine = new Engine({
    manifest,
    seed: 42,
    modules: [
      traversalCore,
      combatCore,
      createCognitionCore(),
      createPerceptionFilter(),
      createEnvironmentCore(),
      createFactionCognition({
        factions: [{ factionId: 'guards', entityIds: ['guard'], cohesion: 0.8 }],
      }),
      createRumorPropagation(),
      createDistrictCore({ districts }),
    ],
  });

  for (const zone of zones) engine.store.addZone(zone);
  engine.store.addEntity({ ...player });
  engine.store.addEntity({ ...guard });
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'zone-a';

  return engine;
}

describe('District Core', () => {
  it('initializes districts with correct zone mapping', () => {
    const engine = createTestEngine();
    expect(getDistrictForZone(engine.world, 'zone-a')).toBe('district-alpha');
    expect(getDistrictForZone(engine.world, 'zone-b')).toBe('district-alpha');
    expect(getDistrictForZone(engine.world, 'zone-c')).toBe('district-beta');
  });

  it('initializes district state with default metrics', () => {
    const engine = createTestEngine();
    const state = getDistrictState(engine.world, 'district-alpha');
    expect(state).toBeDefined();
    expect(state!.alertPressure).toBe(0);
    expect(state!.rumorDensity).toBe(0);
    expect(state!.intruderLikelihood).toBe(0);
    expect(state!.surveillance).toBe(0);
  });

  it('returns all district IDs', () => {
    const engine = createTestEngine();
    const ids = getAllDistrictIds(engine.world);
    expect(ids).toContain('district-alpha');
    expect(ids).toContain('district-beta');
    expect(ids.length).toBe(2);
  });

  it('raises alert pressure on combat events', () => {
    const engine = createTestEngine();
    engine.store.state.entities['player'].zoneId = 'zone-b';
    engine.store.state.locationId = 'zone-b';

    engine.submitAction('attack', { targetIds: ['guard'] });

    const state = getDistrictState(engine.world, 'district-alpha');
    expect(state!.alertPressure).toBeGreaterThan(0);
    expect(state!.eventCount).toBeGreaterThan(0);
  });

  it('raises intruder likelihood when non-faction entity enters', () => {
    const engine = createTestEngine();
    // Player (not in guards faction) moves into the faction-controlled district
    engine.submitAction('move', { targetIds: ['zone-b'] });

    const state = getDistrictState(engine.world, 'district-alpha');
    expect(state!.intruderLikelihood).toBe(10);
  });

  it('does not raise intruder likelihood for factionless districts', () => {
    const engine = createTestEngine();
    engine.store.state.entities['player'].zoneId = 'zone-b';
    engine.store.state.locationId = 'zone-b';

    engine.submitAction('move', { targetIds: ['zone-c'] });

    const state = getDistrictState(engine.world, 'district-beta');
    expect(state!.intruderLikelihood).toBe(0);
  });

  it('decays metrics on district-tick', () => {
    const engine = createTestEngine();

    // Set up some pressure
    modifyDistrictMetric(engine.world, 'district-alpha', 'alertPressure', 20);

    engine.submitAction('district-tick');
    const state = getDistrictState(engine.world, 'district-alpha');
    expect(state!.alertPressure).toBe(19); // decayed by 1
  });

  it('modifyDistrictMetric clamps to 0-100', () => {
    const engine = createTestEngine();
    modifyDistrictMetric(engine.world, 'district-alpha', 'alertPressure', -50);
    expect(getDistrictMetric(engine.world, 'district-alpha', 'alertPressure')).toBe(0);

    modifyDistrictMetric(engine.world, 'district-alpha', 'alertPressure', 150);
    expect(getDistrictMetric(engine.world, 'district-alpha', 'alertPressure')).toBe(100);
  });

  it('isDistrictOnAlert returns true when alertPressure > 30', () => {
    const engine = createTestEngine();
    expect(isDistrictOnAlert(engine.world, 'district-alpha')).toBe(false);

    modifyDistrictMetric(engine.world, 'district-alpha', 'alertPressure', 35);
    expect(isDistrictOnAlert(engine.world, 'district-alpha')).toBe(true);
  });

  it('getDistrictThreatLevel combines metrics', () => {
    const engine = createTestEngine();
    modifyDistrictMetric(engine.world, 'district-alpha', 'alertPressure', 50);
    modifyDistrictMetric(engine.world, 'district-alpha', 'intruderLikelihood', 40);
    modifyDistrictMetric(engine.world, 'district-alpha', 'rumorDensity', 30);

    const threat = getDistrictThreatLevel(engine.world, 'district-alpha');
    // 50*0.4 + 40*0.35 + 30*0.25 = 20 + 14 + 7.5 = 41.5 → 42
    expect(threat).toBe(42);
  });

  it('updates surveillance based on faction member presence', () => {
    const engine = createTestEngine();
    // Guard is in zone-b which is in district-alpha

    engine.submitAction('district-tick');
    const state = getDistrictState(engine.world, 'district-alpha');
    // Guard is the only faction member, surveillance = 1 * 15 = 15
    expect(state!.surveillance).toBe(15);
  });

  it('syncs stability from constituent zones', () => {
    const engine = createTestEngine();
    engine.submitAction('district-tick');

    const state = getDistrictState(engine.world, 'district-alpha');
    // zone-a stability=5, zone-b stability=3, average = 4
    expect(state!.stability).toBe(4);
  });
});
