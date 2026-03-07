import { describe, test, expect } from 'vitest';
import { createTestEngine } from '@signalfire/core';
import {
  createCognitionCore,
  getCognition,
  setBelief,
  getBelief,
  reinforceBelief,
  processBeliefDecay,
} from './cognition-core.js';
import { createEnvironmentCore, setZoneProperty } from './environment-core.js';

const guard = {
  id: 'guard_1',
  blueprintId: 'guard',
  type: 'npc',
  name: 'Guard',
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
  { id: 'hall', roomId: 'castle', name: 'Great Hall', tags: [], neighbors: [] },
];

describe('knowledge-decay', () => {
  function createEngine(decayConfig?: { baseRate?: number; pruneThreshold?: number; instabilityFactor?: number }) {
    return createTestEngine({
      modules: [
        createCognitionCore({ decay: decayConfig }),
        createEnvironmentCore(),
      ],
      entities: [player, { ...guard }],
      zones,
      playerId: 'player',
      startZone: 'hall',
    });
  }

  test('beliefs decay over time on cognition-tick', () => {
    const engine = createEngine({ baseRate: 0.1 });
    const cog = getCognition(engine.world, 'guard_1');
    setBelief(cog, 'player', 'hostile', true, 0.8, 'observed', 0);

    // Advance many ticks so decay accumulates
    for (let i = 0; i < 5; i++) {
      engine.store.advanceTick();
    }

    engine.submitAction('cognition-tick');

    const belief = getBelief(cog, 'player', 'hostile');
    expect(belief).toBeDefined();
    // confidence should have decayed: 0.8 - 0.1 * elapsed * modifier
    expect(belief!.confidence).toBeLessThan(0.8);
  });

  test('beliefs are pruned below threshold', () => {
    const engine = createEngine({ baseRate: 0.5, pruneThreshold: 0.1 });
    const cog = getCognition(engine.world, 'guard_1');
    setBelief(cog, 'player', 'hostile', true, 0.3, 'observed', 0);

    // Advance far enough for full decay
    for (let i = 0; i < 10; i++) {
      engine.store.advanceTick();
    }

    engine.submitAction('cognition-tick');

    const belief = getBelief(cog, 'player', 'hostile');
    expect(belief).toBeUndefined(); // Should have been pruned
  });

  test('reinforceBelief resets decay clock', () => {
    const engine = createEngine({ baseRate: 0.1 });
    const cog = getCognition(engine.world, 'guard_1');
    setBelief(cog, 'player', 'hostile', true, 0.8, 'observed', 0);

    // Advance 3 ticks
    for (let i = 0; i < 3; i++) {
      engine.store.advanceTick();
    }

    // Reinforce at current tick
    reinforceBelief(cog, 'player', 'hostile', engine.world.meta.tick);

    // Advance 1 more tick
    engine.store.advanceTick();

    engine.submitAction('cognition-tick');

    const belief = getBelief(cog, 'player', 'hostile');
    expect(belief).toBeDefined();
    // Only 1 tick elapsed since reinforcement, so minimal decay
    expect(belief!.confidence).toBeGreaterThan(0.7);
  });

  test('reinforceBelief can boost confidence', () => {
    const engine = createEngine();
    const cog = getCognition(engine.world, 'guard_1');
    setBelief(cog, 'player', 'hostile', true, 0.5, 'observed', 0);

    reinforceBelief(cog, 'player', 'hostile', 1, 0.2);

    const belief = getBelief(cog, 'player', 'hostile');
    expect(belief!.confidence).toBe(0.7);
  });

  test('environmental instability accelerates decay', () => {
    const engine = createEngine({ baseRate: 0.05, instabilityFactor: 2.0 });
    const cog = getCognition(engine.world, 'guard_1');
    setBelief(cog, 'player', 'hostile', true, 0.8, 'observed', 0);

    // Make the environment unstable (high noise, no stability set so defaults to 0)
    setZoneProperty(engine.world, 'hall', 'noise', 8);

    // Advance ticks
    for (let i = 0; i < 3; i++) {
      engine.store.advanceTick();
    }

    engine.submitAction('cognition-tick');

    const belief = getBelief(cog, 'player', 'hostile');
    // Should decay faster due to instability
    expect(belief).toBeDefined();
    expect(belief!.confidence).toBeLessThan(0.6);
  });

  test('recent beliefs do not decay', () => {
    const engine = createEngine({ baseRate: 0.1 });
    const cog = getCognition(engine.world, 'guard_1');

    // Set belief at current tick
    const currentTick = engine.world.meta.tick;
    setBelief(cog, 'player', 'hostile', true, 0.8, 'observed', currentTick);

    engine.submitAction('cognition-tick');

    const belief = getBelief(cog, 'player', 'hostile');
    // No elapsed ticks since belief was formed, so no decay
    expect(belief!.confidence).toBe(0.8);
  });

  test('suspicion also decays on cognition-tick', () => {
    const engine = createEngine();
    const cog = getCognition(engine.world, 'guard_1');
    cog.suspicion = 50;

    engine.submitAction('cognition-tick');

    expect(cog.suspicion).toBe(49);
  });

  test('processBeliefDecay can be called directly', () => {
    const engine = createEngine();
    const cog = getCognition(engine.world, 'guard_1');
    setBelief(cog, 'player', 'hostile', true, 0.8, 'observed', 0);

    // Advance ticks
    for (let i = 0; i < 5; i++) {
      engine.store.advanceTick();
    }

    processBeliefDecay(engine.world, { baseRate: 0.1, pruneThreshold: 0.05, instabilityFactor: 0.5 });

    const belief = getBelief(cog, 'player', 'hostile');
    expect(belief!.confidence).toBeLessThan(0.8);
  });
});
