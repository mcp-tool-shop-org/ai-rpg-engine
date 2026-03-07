import { describe, test, expect } from 'vitest';
import { createTestEngine } from '@signalfire/core';
import { createCognitionCore, getCognition, setBelief } from './cognition-core.js';
import { createPerceptionFilter } from './perception-filter.js';
import { createEnvironmentCore } from './environment-core.js';
import {
  createFactionCognition,
  getFactionCognition,
  factionBelieves,
  getFactionBelief,
} from './faction-cognition.js';
import {
  createRumorPropagation,
  getRumorLog,
  getRumorsFrom,
  getRumorsToFaction,
} from './rumor-propagation.js';

function makeGuard(id: string, zone: string) {
  return {
    id,
    blueprintId: id,
    type: 'npc',
    name: `Guard ${id}`,
    tags: ['enemy'],
    stats: { vigor: 5, instinct: 8, will: 4 },
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
  { id: 'courtyard', roomId: 'castle', name: 'Courtyard', tags: [], neighbors: ['gatehouse'] },
  { id: 'gatehouse', roomId: 'castle', name: 'Gatehouse', tags: [], neighbors: ['courtyard'] },
];

describe('rumor-propagation', () => {
  function createEngine(rumorConfig?: Parameters<typeof createRumorPropagation>[0]) {
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
        createRumorPropagation(rumorConfig),
      ],
      entities: [player, makeGuard('guard_1', 'courtyard'), makeGuard('guard_2', 'gatehouse')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });
  }

  test('combat event schedules rumor propagation', () => {
    const engine = createEngine({ propagationDelay: 2 });
    engine.drainEvents();

    // Simulate combat — guard_1 is in the courtyard with the player
    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'guard_1',
      damage: 5,
    }, { actorId: 'player', targetIds: ['guard_1'] });

    // Guard_1 now believes player is hostile (direct experience via cognition-core)
    const guard1Cog = getCognition(engine.world, 'guard_1');
    expect(guard1Cog.beliefs.some(b => b.subject === 'player' && b.key === 'hostile')).toBe(true);

    // Rumor should be logged
    const rumors = getRumorLog(engine.world);
    expect(rumors.length).toBeGreaterThan(0);
    expect(rumors[0].sourceEntityId).toBe('guard_1');
    expect(rumors[0].targetFactionId).toBe('castle-guard');
  });

  test('rumor arrives at faction after propagation delay', () => {
    const engine = createEngine({ propagationDelay: 1 });
    engine.drainEvents();

    // Combat event at tick 0
    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'guard_1',
      damage: 5,
    }, { actorId: 'player', targetIds: ['guard_1'] });

    // Faction should NOT have the belief yet (pending, not delivered)
    const factionCogBefore = getFactionCognition(engine.world, 'castle-guard');
    expect(factionBelieves(factionCogBefore, 'player', 'hostile')).toBe(false);

    // First action at tick 0: processPending finds nothing due (needs ≤0), advances to tick 1
    engine.submitAction('faction-tick');
    // Second action at tick 1: processPending finds pending at tick 1 → fires rumor
    engine.submitAction('faction-tick');

    // Now the faction should have received the rumor
    const factionCogAfter = getFactionCognition(engine.world, 'castle-guard');
    expect(factionBelieves(factionCogAfter, 'player', 'hostile', true)).toBe(true);
  });

  test('rumor confidence is reduced by distortion', () => {
    const engine = createEngine({ propagationDelay: 1, distortionPerHop: 0.1 });
    engine.drainEvents();

    // Set a high-confidence belief on guard_1
    const guard1Cog = getCognition(engine.world, 'guard_1');
    setBelief(guard1Cog, 'player', 'hostile', true, 1.0, 'observed', 0);

    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'guard_1',
      damage: 5,
    }, { actorId: 'player', targetIds: ['guard_1'] });

    // Advance past delay to deliver the rumor
    engine.submitAction('faction-tick');
    engine.submitAction('faction-tick');

    const factionCog = getFactionCognition(engine.world, 'castle-guard');
    const belief = getFactionBelief(factionCog, 'player', 'hostile');
    // Confidence should be less than original (distortion + cohesion scaling)
    expect(belief).toBeDefined();
    expect(belief!.confidence).toBeLessThan(1.0);
  });

  test('getRumorsFrom filters by source entity', () => {
    const engine = createEngine({ propagationDelay: 1 });
    engine.drainEvents();

    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'guard_1',
      damage: 5,
    }, { actorId: 'player', targetIds: ['guard_1'] });

    const fromGuard1 = getRumorsFrom(engine.world, 'guard_1');
    const fromGuard2 = getRumorsFrom(engine.world, 'guard_2');

    expect(fromGuard1.length).toBeGreaterThan(0);
    expect(fromGuard2.length).toBe(0);
  });

  test('getRumorsToFaction filters by faction', () => {
    const engine = createEngine({ propagationDelay: 1 });
    engine.drainEvents();

    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'guard_1',
      damage: 5,
    }, { actorId: 'player', targetIds: ['guard_1'] });

    const toCastleGuard = getRumorsToFaction(engine.world, 'castle-guard');
    const toBandits = getRumorsToFaction(engine.world, 'bandits');

    expect(toCastleGuard.length).toBeGreaterThan(0);
    expect(toBandits.length).toBe(0);
  });

  test('low confidence beliefs are not propagated', () => {
    const engine = createEngine({ propagationDelay: 1, confidenceThreshold: 0.5 });
    engine.drainEvents();

    // Give guard_1 a low-confidence belief
    const guard1Cog = getCognition(engine.world, 'guard_1');
    setBelief(guard1Cog, 'intruder', 'present', true, 0.2, 'assumed', 0);

    // Fire an event that triggers rumor check — but the belief confidence is below threshold
    engine.store.emitEvent('world.zone.entered', {
      zoneId: 'courtyard',
    }, { actorId: 'player' });

    // The low-confidence belief about 'intruder' shouldn't propagate
    const rumors = getRumorLog(engine.world);
    const intruderRumors = rumors.filter(r => r.subject === 'intruder');
    expect(intruderRumors.length).toBe(0);
  });

  test('dedup prevents redundant rumor propagation', () => {
    const engine = createEngine({ propagationDelay: 2 });
    engine.drainEvents();

    // Two combat events in quick succession
    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'guard_1',
      damage: 5,
    }, { actorId: 'player', targetIds: ['guard_1'] });

    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'guard_1',
      damage: 3,
    }, { actorId: 'player', targetIds: ['guard_1'] });

    // Should only have one rumor per entity per belief (dedup)
    const rumors = getRumorsFrom(engine.world, 'guard_1');
    const hostileRumors = rumors.filter(r => r.key === 'hostile');
    expect(hostileRumors.length).toBe(1);
  });
});
