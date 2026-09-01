import { describe, test, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import { createCognitionCore, getCognition, setBelief } from './cognition-core.js';
import { createPerceptionFilter } from './perception-filter.js';
import { createEnvironmentCore } from './environment-core.js';
import {
  createFactionCognition,
  getFactionCognition,
  getEntityFaction,
  getFactionMembers,
  resolveEntityFaction,
  registerFactionMembership,
  setFactionBelief,
  getFactionBelief,
  factionBelieves,
  getFactionBeliefsAbout,
} from './faction-cognition.js';

function makeGuard(id: string, zone: string) {
  return {
    id,
    blueprintId: id,
    type: 'npc',
    name: `Guard ${id}`,
    tags: ['enemy'],
    stats: { vigor: 5, instinct: 6, will: 4 },
    resources: { hp: 20, stamina: 10 },
    statuses: [],
    zoneId: zone,
    ai: { profileId: 'aggressive', goals: ['guard'], fears: [], alertLevel: 0, knowledge: {} },
  };
}

const player = {
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 7, instinct: 5, will: 5 },
  resources: { hp: 30, stamina: 15 },
  statuses: [],
  zoneId: 'courtyard',
};

const zones = [
  { id: 'courtyard', roomId: 'castle', name: 'Courtyard', tags: [], neighbors: ['gatehouse', 'hall'] },
  { id: 'gatehouse', roomId: 'castle', name: 'Gatehouse', tags: [], neighbors: ['courtyard'] },
  { id: 'hall', roomId: 'castle', name: 'Great Hall', tags: [], neighbors: ['courtyard'] },
];

describe('faction-cognition', () => {
  function createEngine() {
    return createTestEngine({
      modules: [
        createCognitionCore(),
        createPerceptionFilter(),
        createEnvironmentCore(),
        createFactionCognition({
          factions: [
            { factionId: 'castle-guard', entityIds: ['guard_1', 'guard_2'], cohesion: 0.9 },
          ],
        }),
      ],
      entities: [player, makeGuard('guard_1', 'courtyard'), makeGuard('guard_2', 'gatehouse')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });
  }

  test('initializes faction cognition state', () => {
    const engine = createEngine();
    const factionCog = getFactionCognition(engine.world, 'castle-guard');
    expect(factionCog).toBeDefined();
    expect(factionCog.beliefs).toEqual([]);
    expect(factionCog.alertLevel).toBe(0);
    expect(factionCog.cohesion).toBe(0.9);
  });

  test('tracks entity-faction membership', () => {
    const engine = createEngine();
    expect(getEntityFaction(engine.world, 'guard_1')).toBe('castle-guard');
    expect(getEntityFaction(engine.world, 'guard_2')).toBe('castle-guard');
    expect(getEntityFaction(engine.world, 'player')).toBeUndefined();
  });

  test('returns faction members', () => {
    const engine = createEngine();
    const members = getFactionMembers(engine.world, 'castle-guard');
    expect(members).toContain('guard_1');
    expect(members).toContain('guard_2');
    expect(members).toHaveLength(2);
  });

  test('sets and queries faction beliefs', () => {
    const engine = createEngine();
    const factionCog = getFactionCognition(engine.world, 'castle-guard');

    setFactionBelief(factionCog, 'player', 'hostile', true, 0.7, 'guard_1', 5);

    expect(factionBelieves(factionCog, 'player', 'hostile', true)).toBe(true);
    const belief = getFactionBelief(factionCog, 'player', 'hostile');
    expect(belief?.confidence).toBe(0.7);
    expect(belief?.sourceEntities).toEqual(['guard_1']);
  });

  test('corroborating sources boost confidence', () => {
    const engine = createEngine();
    const factionCog = getFactionCognition(engine.world, 'castle-guard');

    setFactionBelief(factionCog, 'player', 'hostile', true, 0.6, 'guard_1', 5);
    setFactionBelief(factionCog, 'player', 'hostile', true, 0.5, 'guard_2', 6);

    const belief = getFactionBelief(factionCog, 'player', 'hostile');
    expect(belief?.sourceEntities).toContain('guard_1');
    expect(belief?.sourceEntities).toContain('guard_2');
    // Corroboration should boost confidence
    expect(belief!.confidence).toBeGreaterThan(0.6);
  });

  test('higher confidence updates override lower', () => {
    const engine = createEngine();
    const factionCog = getFactionCognition(engine.world, 'castle-guard');

    setFactionBelief(factionCog, 'player', 'location', 'courtyard', 0.5, 'guard_1', 5);
    setFactionBelief(factionCog, 'player', 'location', 'hall', 0.8, 'guard_2', 6);

    const belief = getFactionBelief(factionCog, 'player', 'location');
    expect(belief?.value).toBe('hall');
    expect(belief?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  test('getFactionBeliefsAbout returns all beliefs about a subject', () => {
    const engine = createEngine();
    const factionCog = getFactionCognition(engine.world, 'castle-guard');

    setFactionBelief(factionCog, 'player', 'hostile', true, 0.7, 'guard_1', 5);
    setFactionBelief(factionCog, 'player', 'location', 'courtyard', 0.6, 'guard_1', 5);

    const beliefs = getFactionBeliefsAbout(factionCog, 'player');
    expect(beliefs).toHaveLength(2);
  });

  test('rumor.belief.propagated event updates faction beliefs', () => {
    const engine = createEngine();
    engine.drainEvents();

    // Simulate a rumor event arriving
    engine.store.emitEvent('rumor.belief.propagated', {
      factionId: 'castle-guard',
      subject: 'player',
      key: 'hostile',
      value: true,
      confidence: 0.8,
      sourceEntityId: 'guard_1',
      distortion: 0.05,
      originTick: 0,
      hops: 1,
    });

    const factionCog = getFactionCognition(engine.world, 'castle-guard');
    expect(factionBelieves(factionCog, 'player', 'hostile', true)).toBe(true);
    // Confidence scaled by cohesion (0.8 * 0.9 = 0.72)
    const belief = getFactionBelief(factionCog, 'player', 'hostile');
    expect(belief!.confidence).toBeCloseTo(0.72, 1);
  });

  test('hostile rumor raises faction alert level', () => {
    const engine = createEngine();
    engine.drainEvents();

    engine.store.emitEvent('rumor.belief.propagated', {
      factionId: 'castle-guard',
      subject: 'player',
      key: 'hostile',
      value: true,
      confidence: 0.9,
      sourceEntityId: 'guard_1',
      distortion: 0.02,
      originTick: 0,
      hops: 1,
    });

    const factionCog = getFactionCognition(engine.world, 'castle-guard');
    expect(factionCog.alertLevel).toBeGreaterThan(0);
  });

  test('faction-tick decays alert level', () => {
    const engine = createEngine();
    const factionCog = getFactionCognition(engine.world, 'castle-guard');
    factionCog.alertLevel = 20;

    engine.submitAction('faction-tick');

    expect(factionCog.alertLevel).toBe(18);
  });

  test('unknown faction returns fresh state', () => {
    const engine = createEngine();
    const factionCog = getFactionCognition(engine.world, 'bandits');
    expect(factionCog.beliefs).toEqual([]);
    expect(factionCog.alertLevel).toBe(0);
  });
});

describe('faction-cognition hydrate FROM entity.faction INTO the registry (F-7911928d, R3)', () => {
  function makeNpc(id: string, faction?: string) {
    return {
      ...makeGuard(id, 'courtyard'),
      ...(faction ? { faction } : {}),
    };
  }

  test('(A) entity.faction only, empty config → getEntityFaction and getFactionMembers contain them', () => {
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createFactionCognition({ factions: [] }),
      ],
      entities: [player, makeNpc('guard_1', 'castle-guard')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });

    expect(getEntityFaction(engine.world, 'guard_1')).toBe('castle-guard');
    expect(getFactionMembers(engine.world, 'castle-guard')).toEqual(['guard_1']);
    expect(getEntityFaction(engine.world, 'guard_1')).toBe(resolveEntityFaction(engine.world, 'guard_1'));
    const cog = getFactionCognition(engine.world, 'castle-guard');
    expect(cog.cohesion).toBe(0.8);
  });

  test('(B) explicit entityIds with no entity.faction → extra lands', () => {
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createFactionCognition({
          factions: [{ factionId: 'inner-circle', entityIds: ['spy'] }],
        }),
      ],
      entities: [player, makeNpc('spy')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });

    expect(engine.world.entities.spy.faction).toBeUndefined();
    expect(getEntityFaction(engine.world, 'spy')).toBe('inner-circle');
    expect(getFactionMembers(engine.world, 'inner-circle')).toContain('spy');
  });

  test('(C) empty config + no entity.faction → membership {} / factionMembers {}', () => {
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createFactionCognition({ factions: [] }),
      ],
      entities: [player, makeNpc('stranger')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });

    expect(getEntityFaction(engine.world, 'player')).toBeUndefined();
    expect(getEntityFaction(engine.world, 'stranger')).toBeUndefined();
    const ns = engine.world.modules['faction-cognition'] as {
      membership: Record<string, string>;
      factionMembers: Record<string, string[]>;
    };
    expect(ns.membership).toEqual({});
    expect(ns.factionMembers).toEqual({});
  });

  test('(D) explicit inner-circle beats authored castle-guard (registry-wins)', () => {
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createFactionCognition({
          factions: [{ factionId: 'inner-circle', entityIds: ['guard_1'] }],
        }),
      ],
      entities: [player, makeNpc('guard_1', 'castle-guard')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });

    expect(getEntityFaction(engine.world, 'guard_1')).toBe('inner-circle');
    expect(resolveEntityFaction(engine.world, 'guard_1')).toBe('inner-circle');
    expect(getFactionMembers(engine.world, 'inner-circle')).toContain('guard_1');
    expect(getFactionMembers(engine.world, 'castle-guard')).not.toContain('guard_1');
  });

  test('registerFactionMembership adds a post-init extra that is not on any entity field', () => {
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createFactionCognition({ factions: [] }),
      ],
      entities: [player, makeNpc('spy')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });

    registerFactionMembership(engine.world, 'inner-circle', 'spy');

    expect(engine.world.entities.spy.faction).toBeUndefined();
    expect(getEntityFaction(engine.world, 'spy')).toBe('inner-circle');
    expect(getFactionMembers(engine.world, 'inner-circle')).toEqual(['spy']);
  });
});
