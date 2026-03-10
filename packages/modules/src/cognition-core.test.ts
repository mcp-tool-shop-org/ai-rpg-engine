import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import {
  createCognitionCore,
  getCognition,
  setBelief,
  getBelief,
  getBeliefValue,
  believes,
  addMemory,
  getMemories,
  getRecentMemories,
  checkPerception,
  selectIntent,
  aggressiveProfile,
  cautiousProfile,
} from './cognition-core.js';
import { traversalCore } from './traversal-core.js';
import { combatCore } from './combat-core.js';

const makeAIEntity = (id: string, name: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name,
  tags: ['enemy'],
  stats: { vigor: 5, instinct: 5 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ai: { profileId: 'aggressive', goals: ['guard'], fears: ['fire'], alertLevel: 0, knowledge: {} },
  ...overrides,
});

const makePlayer = (zoneId: string): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
});

describe('Belief system', () => {
  it('sets and gets beliefs', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const cog = getCognition(engine.world, 'guard');
    setBelief(cog, 'player', 'hostile', true, 0.8, 'observed', 1);

    expect(getBelief(cog, 'player', 'hostile')).toBeDefined();
    expect(getBeliefValue(cog, 'player', 'hostile')).toBe(true);
    expect(believes(cog, 'player', 'hostile', true)).toBe(true);
    expect(believes(cog, 'player', 'hostile', false)).toBe(false);
    expect(believes(cog, 'player', 'nonexistent')).toBe(false);
  });

  it('updates belief with higher confidence', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const cog = getCognition(engine.world, 'guard');
    setBelief(cog, 'player', 'alignment', 'neutral', 0.5, 'assumed', 0);
    setBelief(cog, 'player', 'alignment', 'hostile', 0.9, 'observed', 1);

    expect(getBeliefValue(cog, 'player', 'alignment')).toBe('hostile');
  });

  it('does not downgrade belief with lower confidence at same tick', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const cog = getCognition(engine.world, 'guard');
    setBelief(cog, 'player', 'alignment', 'hostile', 0.9, 'observed', 1);
    setBelief(cog, 'player', 'alignment', 'friendly', 0.3, 'told', 1);

    expect(getBeliefValue(cog, 'player', 'alignment')).toBe('hostile');
  });
});

describe('Memory system', () => {
  it('records and retrieves memories', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const cog = getCognition(engine.world, 'guard');
    addMemory(cog, 'saw-entity', 1, { entityId: 'player', zoneId: 'a' }, 'player', 'a');
    addMemory(cog, 'heard-noise', 3, { direction: 'north' });

    expect(getMemories(cog)).toHaveLength(2);
    expect(getMemories(cog, 'saw-entity')).toHaveLength(1);
    expect(getMemories(cog, 'heard-noise')).toHaveLength(1);
    expect(getMemories(cog, 'nonexistent')).toHaveLength(0);
  });

  it('filters recent memories by tick window', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const cog = getCognition(engine.world, 'guard');
    addMemory(cog, 'old-event', 1, { x: 1 });
    addMemory(cog, 'recent-event', 8, { x: 2 });
    addMemory(cog, 'very-recent', 10, { x: 3 });

    const recent = getRecentMemories(cog, 3, 10);
    expect(recent).toHaveLength(2); // tick 8 and 10
    expect(recent.every((m) => m.tick >= 7)).toBe(true);
  });
});

describe('Perception', () => {
  it('detects visible entity in well-lit zone', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [], light: 8 }],
    });

    const guard = engine.entity('guard');
    const player = engine.player();
    const result = checkPerception(guard, player, engine.world, 'instinct', 30);

    // Well-lit, visible player, should be detected
    expect(result.observerId).toBe('guard');
    expect(result.targetId).toBe('player');
    expect(typeof result.detected).toBe('boolean');
    expect(typeof result.roll).toBe('number');
  });

  it('hidden targets are harder to detect', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [
        makePlayer('a'),
        makeAIEntity('guard', 'Guard', 'a'),
        {
          ...makeAIEntity('spy', 'Spy', 'a'),
          visibility: { hidden: true },
        },
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [], light: 3 }],
    });

    const guard = engine.entity('guard');
    const spy = engine.entity('spy');
    const result = checkPerception(guard, spy, engine.world, 'instinct', 30);

    // Hidden target in dark zone = higher threshold
    expect(result.threshold).toBeGreaterThan(30);
  });
});

describe('Intent selection', () => {
  it('aggressive profile attacks nearby hostiles', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
              { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] }],
    });

    const guard = engine.entity('guard');
    const cog = getCognition(engine.world, 'guard');
    // Guard knows player is hostile
    setBelief(cog, 'player', 'hostile', true, 1.0, 'observed', 0);

    const intent = selectIntent(guard, cog, engine.world, aggressiveProfile);
    expect(intent).toBeDefined();
    expect(intent!.verb).toBe('attack');
    expect(intent!.targetIds).toContain('player');
  });

  it('aggressive profile disengages when morale is low', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
              { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] }],
    });

    const guard = engine.entity('guard');
    const cog = getCognition(engine.world, 'guard');
    cog.morale = 10; // Very low morale
    setBelief(cog, 'player', 'hostile', true, 1.0, 'observed', 0);

    const intent = selectIntent(guard, cog, engine.world, aggressiveProfile);
    expect(intent).toBeDefined();
    expect(intent!.verb).toBe('disengage');
    expect(intent!.reason).toContain('disengage');
  });

  it('cautious profile inspects when suspicious but unsure', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const guard = engine.entity('guard');
    const cog = getCognition(engine.world, 'guard');
    cog.suspicion = 60;
    // Only low-confidence hostile belief
    setBelief(cog, 'player', 'hostile', true, 0.3, 'assumed', 0);

    const intent = selectIntent(guard, cog, engine.world, cautiousProfile);
    expect(intent).toBeDefined();
    expect(intent!.verb).toBe('inspect');
    expect(intent!.reason).toContain('suspicious');
  });
});

describe('Event-driven cognition updates', () => {
  it('AI entities learn when player enters their zone', () => {
    const engine = createTestEngine({
      modules: [traversalCore, createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'b')],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    // Player moves to guard's zone
    engine.submitAction('move', { targetIds: ['b'] });

    const cog = getCognition(engine.world, 'guard');
    expect(believes(cog, 'player', 'present', true)).toBe(true);
    expect(getBeliefValue(cog, 'player', 'location')).toBe('b');
    expect(getMemories(cog, 'saw-entity').length).toBeGreaterThan(0);
  });

  it('combat updates target beliefs and morale', () => {
    const engine = createTestEngine({
      modules: [traversalCore, combatCore, createCognitionCore()],
      entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('attack', { targetIds: ['guard'] });

    const cog = getCognition(engine.world, 'guard');
    // Guard should now know player is hostile
    expect(believes(cog, 'player', 'hostile', true)).toBe(true);
    // Guard's morale should have dropped
    expect(cog.morale).toBeLessThan(70);
  });
});
