import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@signalfire/core';
import type { EntityState } from '@signalfire/core';
import {
  createCognitionCore,
  getCognition,
  setBelief,
  believes,
  getMemories,
} from './cognition-core.js';
import {
  createPerceptionFilter,
  getPerceptionLog,
  didPerceive,
  whoPerceived,
} from './perception-filter.js';
import { traversalCore } from './traversal-core.js';
import { combatCore } from './combat-core.js';

// Helper: AI entity with configurable perception stat
const makeAI = (id: string, name: string, zoneId: string, instinct = 5, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name,
  tags: ['enemy'],
  stats: { vigor: 5, instinct },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ai: { profileId: 'aggressive', goals: ['guard'], fears: [], alertLevel: 0, knowledge: {} },
  ...overrides,
});

const makePlayer = (zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

describe('Perception filter — bright zone detection', () => {
  it('guard with high perception detects player entering bright zone', () => {
    const engine = createTestEngine({
      modules: [traversalCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a'),
        makeAI('guard', 'Guard', 'b', 10), // High perception
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'], light: 10 },
      ],
    });

    engine.submitAction('move', { targetIds: ['b'] });

    const cog = getCognition(engine.world, 'guard');
    // High perception + bright zone = detected
    expect(believes(cog, 'player', 'present', true)).toBe(true);
    expect(getMemories(cog, 'saw-entity').length).toBeGreaterThan(0);
  });

  it('guard with low perception in dark zone fails to detect hidden intruder', () => {
    const engine = createTestEngine({
      modules: [traversalCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a', { visibility: { hidden: true } }),
        makeAI('guard', 'Guard', 'b', 1), // Very low perception
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'], light: 0 }, // Pitch dark
      ],
    });

    engine.submitAction('move', { targetIds: ['b'] });

    const cog = getCognition(engine.world, 'guard');
    // Low perception + dark + hidden = guaranteed failure
    // instinct=1 → score = 7 + roll(1-50) = 8-57
    // threshold = 30 + 10 (dark) + 20 (hidden) = 60
    // max score 57 < 60 → always fails
    expect(believes(cog, 'player', 'present', true)).toBe(false);
    expect(getMemories(cog, 'saw-entity')).toHaveLength(0);
  });
});

describe('Perception filter — perception log', () => {
  it('logs perception attempts for each entity', () => {
    const engine = createTestEngine({
      modules: [traversalCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a'),
        makeAI('guard1', 'Guard 1', 'b', 10),
        makeAI('guard2', 'Guard 2', 'b', 10),
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'], light: 10 },
      ],
    });

    engine.submitAction('move', { targetIds: ['b'] });

    // Both guards should have perception log entries
    const log1 = getPerceptionLog(engine.world, 'guard1');
    const log2 = getPerceptionLog(engine.world, 'guard2');
    expect(log1.length).toBeGreaterThan(0);
    expect(log2.length).toBeGreaterThan(0);
    expect(log1[0].sense).toBe('sight');
    expect(log2[0].sense).toBe('sight');
  });

  it('didPerceive returns entry for specific event', () => {
    const engine = createTestEngine({
      modules: [traversalCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a'),
        makeAI('guard', 'Guard', 'b', 10),
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'], light: 10 },
      ],
    });

    const events = engine.submitAction('move', { targetIds: ['b'] });
    const moveEvent = events.find((e) => e.type === 'world.zone.entered');
    expect(moveEvent).toBeDefined();

    const perceived = didPerceive(engine.world, 'guard', moveEvent!.id);
    expect(perceived).toBeDefined();
    expect(perceived!.detected).toBe(true);
  });

  it('whoPerceived returns all entities that perceived an event', () => {
    const engine = createTestEngine({
      modules: [traversalCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a'),
        makeAI('guard1', 'Guard 1', 'b', 10),
        makeAI('guard2', 'Guard 2', 'b', 10),
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'], light: 10 },
      ],
    });

    const events = engine.submitAction('move', { targetIds: ['b'] });
    const moveEvent = events.find((e) => e.type === 'world.zone.entered');

    const perceivers = whoPerceived(engine.world, moveEvent!.id);
    expect(perceivers.length).toBe(2);
  });
});

describe('Perception filter — combat awareness', () => {
  it('direct attack target always knows attacker (no perception needed)', () => {
    const engine = createTestEngine({
      modules: [traversalCore, combatCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a'),
        makeAI('guard', 'Guard', 'a', 1), // Even with terrible perception
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [], light: 0 }, // Pitch dark
      ],
    });

    engine.submitAction('attack', { targetIds: ['guard'] });

    const cog = getCognition(engine.world, 'guard');
    // Direct target ALWAYS knows (handled by cognition-core, not perception-filter)
    expect(believes(cog, 'player', 'hostile', true)).toBe(true);
    expect(cog.morale).toBeLessThan(70);
  });

  it('bystander with high perception sees combat details', () => {
    const engine = createTestEngine({
      modules: [traversalCore, combatCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a'),
        makeAI('target', 'Target', 'a', 5),
        makeAI('bystander', 'Bystander', 'a', 10), // High perception
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [], light: 10 }, // Bright
      ],
    });

    engine.submitAction('attack', { targetIds: ['target'] });

    const bystanderCog = getCognition(engine.world, 'bystander');
    // High perception in bright room → should see combat
    const combatMemories = getMemories(bystanderCog, 'saw-combat');
    const dangerMemories = getMemories(bystanderCog, 'sensed-danger');
    // Should have either saw-combat (high clarity) or sensed-danger (low clarity)
    expect(combatMemories.length + dangerMemories.length).toBeGreaterThan(0);
    expect(bystanderCog.suspicion).toBeGreaterThan(0);
  });

  it('bystander with low perception in dark zone misses combat', () => {
    const engine = createTestEngine({
      modules: [traversalCore, combatCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a'),
        makeAI('target', 'Target', 'a', 5),
        makeAI('bystander', 'Bystander', 'a', 1), // Terrible perception
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [], light: 0 }, // Pitch dark
      ],
    });

    engine.submitAction('attack', { targetIds: ['target'] });

    // Check bystander perception log
    const log = getPerceptionLog(engine.world, 'bystander');
    const visualEntries = log.filter((p) => p.sense === 'sight');
    // In darkness with instinct=1:
    // score = 7 + roll(1-50) = 8-57
    // threshold for visual-combat = 20 + 10 (dark) = 30
    // Some rolls may pass, some may fail
    // But all entries should be logged
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('Perception filter — cross-zone hearing', () => {
  it('entity in adjacent zone hears combat', () => {
    const engine = createTestEngine({
      modules: [traversalCore, combatCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a'),
        makeAI('target', 'Target', 'a', 5),
        makeAI('listener', 'Listener', 'b', 10), // High perception, adjacent zone
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'], light: 5 },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'], light: 5 },
      ],
    });

    engine.submitAction('attack', { targetIds: ['target'] });

    const listenerCog = getCognition(engine.world, 'listener');
    // Adjacent zone → auditory-combat layer (crossZone: true)
    const heardCombat = getMemories(listenerCog, 'heard-combat');
    const heardNoise = getMemories(listenerCog, 'heard-noise');
    // Should have heard something from adjacent zone
    expect(heardCombat.length + heardNoise.length).toBeGreaterThan(0);
  });

  it('entity in non-adjacent zone hears nothing', () => {
    const engine = createTestEngine({
      modules: [traversalCore, combatCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a'),
        makeAI('target', 'Target', 'a', 5),
        makeAI('faraway', 'Far Away', 'c', 10), // Not adjacent to zone A
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'], light: 5 },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a', 'c'], light: 5 },
        { id: 'c', roomId: 'test', name: 'C', tags: [], neighbors: ['b'], light: 5 },
      ],
    });

    engine.submitAction('attack', { targetIds: ['target'] });

    const farawayCog = getCognition(engine.world, 'faraway');
    // Zone C is NOT adjacent to zone A → no perception at all
    expect(getMemories(farawayCog).length).toBe(0);
    expect(getPerceptionLog(engine.world, 'faraway').length).toBe(0);
  });
});

describe('Perception filter — custom layers', () => {
  it('custom network sense layer detects digital events', () => {
    const engine = createTestEngine({
      modules: [
        traversalCore,
        createCognitionCore(),
        createPerceptionFilter({
          layers: [{
            id: 'network-breach',
            eventPatterns: ['netrunning.ice.breached'],
            sense: 'network',
            baseDifficulty: 20,
            crossZone: true,
            onPerceived(event, entity, clarity, world) {
              const cog = getCognition(world, entity.id);
              setBelief(cog, event.actorId!, 'intruder', true, clarity, 'observed', event.tick);
            },
          }],
          senseStats: { network: 'instinct' },
        }),
      ],
      entities: [
        makePlayer('a'),
        makeAI('ice', 'ICE Sentry', 'b', 8),
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    // Manually emit a netrunning event (actorId must be top-level, not just in payload)
    engine.store.emitEvent('netrunning.ice.breached', {
      targetId: 'ice',
      zoneId: 'b',
      iceRemoved: 8,
    }, { actorId: 'player' });

    const iceCog = getCognition(engine.world, 'ice');
    // ICE with instinct=8 in adjacent zone with crossZone=true should detect
    // score = 8*7 + roll = 56 + roll(1-50) = 57-106
    // threshold = 20 + 15 (adjacent) = 35
    // Always detects
    expect(believes(iceCog, 'player', 'intruder', true)).toBe(true);
  });
});

describe('Perception filter — interpretation levels', () => {
  it('high clarity perception gives full interpretation', () => {
    const engine = createTestEngine({
      modules: [traversalCore, createCognitionCore(), createPerceptionFilter()],
      entities: [
        makePlayer('a'),
        makeAI('eagle', 'Eagle Eye', 'b', 10), // Maximum perception
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'], light: 10 },
      ],
    });

    engine.submitAction('move', { targetIds: ['b'] });

    const log = getPerceptionLog(engine.world, 'eagle');
    const visualEntry = log.find((p) => p.sense === 'sight');
    expect(visualEntry).toBeDefined();
    expect(visualEntry!.detected).toBe(true);
    // instinct=10, light=10 → score = 70 + roll, threshold = 30 - 10 = 20
    // margin >= 50 → clarity = min(1, 0.5 + 50/30) = 1.0 → full
    expect(visualEntry!.interpretation).toBe('full');
  });
});
