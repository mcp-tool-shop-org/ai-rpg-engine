import { describe, it, expect } from 'vitest';
import { createTestEngine, nextId } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent } from '@ai-rpg-engine/core';
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
import { combatCore, COMBAT_STATES } from './combat-core.js';
import { statusCore, hasStatus, applyStatus } from './status-core.js';

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

// ---------------------------------------------------------------------------
// Defeat morale cascade (P5)
// ---------------------------------------------------------------------------

describe('Defeat morale cascade', () => {
  function emitDefeat(engine: ReturnType<typeof createTestEngine>, defeatedId: string, defeatedBy: string) {
    engine.store.recordEvent({
      id: nextId('evt'),
      tick: engine.store.tick,
      type: 'combat.entity.defeated',
      actorId: defeatedBy,
      payload: { entityId: defeatedId, entityName: defeatedId, defeatedBy },
    });
  }

  it('will 3 entity gets full -12 ally defeat morale loss', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Guard A', 'a', { stats: { will: 3 }, ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc2', 'Guard B', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: [] as string[] }],
    });

    const cog = getCognition(engine.world, 'npc1');
    const before = cog.morale;
    emitDefeat(engine, 'npc2', 'player');
    expect(cog.morale).toBe(before - 12);
  });

  it('will 7 entity gets mitigated ally defeat morale loss', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Guard A', 'a', { stats: { will: 7 }, ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc2', 'Guard B', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: [] as string[] }],
    });

    const cog = getCognition(engine.world, 'npc1');
    const before = cog.morale;
    emitDefeat(engine, 'npc2', 'player');
    // Will 7: mitigation = max(0.3, 1 - (7-3)*0.1) = 0.6; -12 * 0.6 = -7.2 → -7
    expect(cog.morale).toBe(before - 7);
  });

  it('will 10 entity gets maximum mitigation on ally defeat', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Guard A', 'a', { stats: { will: 10 }, ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc2', 'Guard B', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: [] as string[] }],
    });

    const cog = getCognition(engine.world, 'npc1');
    const before = cog.morale;
    emitDefeat(engine, 'npc2', 'player');
    // Will 10: mitigation = max(0.3, 1 - (10-3)*0.1) = 0.3; -12 * 0.3 = -3.6 → -4
    expect(cog.morale).toBe(before - 4);
  });

  it('three simultaneous ally defeats cap at -20 morale per tick', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Guard A', 'a', { stats: { will: 3 }, ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc2', 'Guard B', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc3', 'Guard C', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc4', 'Guard D', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: [] as string[] }],
    });

    const cog = getCognition(engine.world, 'npc1');
    const before = cog.morale;

    // Defeat 3 allies at once — would be -36 without cap
    engine.world.entities.npc2.resources.hp = 0;
    emitDefeat(engine, 'npc2', 'player');
    engine.world.entities.npc3.resources.hp = 0;
    emitDefeat(engine, 'npc3', 'player');
    engine.world.entities.npc4.resources.hp = 0;
    emitDefeat(engine, 'npc4', 'player');

    // Cap: -20 max per tick
    expect(cog.morale).toBe(before - 20);
  });
});

// ---------------------------------------------------------------------------
// Morale-triggered FLEEING (P5)
// ---------------------------------------------------------------------------

describe('Morale-triggered FLEEING', () => {
  function emitDefeat(engine: ReturnType<typeof createTestEngine>, defeatedId: string, defeatedBy: string) {
    engine.store.recordEvent({
      id: nextId('evt'),
      tick: engine.store.tick,
      type: 'combat.entity.defeated',
      actorId: defeatedBy,
      payload: { entityId: defeatedId, entityName: defeatedId, defeatedBy },
    });
  }

  it('auto-applies FLEEING when morale drops below threshold', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Guard', 'a', { stats: { will: 3 }, ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc2', 'Guard B', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: ['b'] }, { id: 'b', roomId: 'test', name: 'B', tags: [] as string[], neighbors: ['a'] }],
    });

    // Set morale just above threshold (15)
    const cog = getCognition(engine.world, 'npc1');
    cog.morale = 20;

    // Ally defeat: -12 → morale 8, below default threshold 15
    engine.world.entities.npc2.resources.hp = 0;
    emitDefeat(engine, 'npc2', 'player');

    expect(hasStatus(engine.world.entities.npc1, COMBAT_STATES.FLEEING)).toBe(true);
  });

  it('zombie (threshold 0) never gets morale-triggered FLEEING', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore({ moraleFleeThresholds: { zombie: 0 } })],
      entities: [
        makeAIEntity('npc1', 'Zombie', 'a', { tags: ['enemy', 'zombie'], stats: { will: 3 }, ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc2', 'Zombie B', 'a', { tags: ['enemy', 'zombie'], ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: ['b'] }, { id: 'b', roomId: 'test', name: 'B', tags: [] as string[], neighbors: ['a'] }],
    });

    const cog = getCognition(engine.world, 'npc1');
    cog.morale = 5;
    engine.world.entities.npc2.resources.hp = 0;
    emitDefeat(engine, 'npc2', 'player');

    // Morale should drop but no FLEEING because threshold is 0
    expect(hasStatus(engine.world.entities.npc1, COMBAT_STATES.FLEEING)).toBe(false);
  });

  it('already-FLEEING entity does not get duplicate application', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Guard', 'a', { stats: { will: 3 }, ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc2', 'Guard B', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc3', 'Guard C', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: ['b'] }, { id: 'b', roomId: 'test', name: 'B', tags: [] as string[], neighbors: ['a'] }],
    });

    const cog = getCognition(engine.world, 'npc1');
    cog.morale = 20;

    // First defeat triggers FLEEING
    engine.world.entities.npc2.resources.hp = 0;
    emitDefeat(engine, 'npc2', 'player');
    expect(hasStatus(engine.world.entities.npc1, COMBAT_STATES.FLEEING)).toBe(true);

    const fleeingCount = engine.world.entities.npc1.statuses.filter(
      s => s.statusId === COMBAT_STATES.FLEEING,
    ).length;

    // Second defeat should not add another FLEEING
    engine.world.entities.npc3.resources.hp = 0;
    emitDefeat(engine, 'npc3', 'player');

    const newCount = engine.world.entities.npc1.statuses.filter(
      s => s.statusId === COMBAT_STATES.FLEEING,
    ).length;
    expect(newCount).toBe(fleeingCount);
  });

  it('rout penalty fires when alone after ally defeat', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Guard', 'a', { stats: { will: 3 }, ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc2', 'Guard B', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: ['b'] }, { id: 'b', roomId: 'test', name: 'B', tags: [] as string[], neighbors: ['a'] }],
    });

    const cog = getCognition(engine.world, 'npc1');
    cog.morale = 25; // After -12 ally defeat → 13, then rout -10 → 3

    const collected: ResolvedEvent[] = [];
    engine.store.events.on('combat.morale.rout', (e: ResolvedEvent) => collected.push(e));

    engine.world.entities.npc2.resources.hp = 0;
    emitDefeat(engine, 'npc2', 'player');

    expect(collected.length).toBe(1);
    expect(collected[0].payload.entityId).toBe('npc1');
    expect((collected[0].payload.delta as number)).toBeLessThan(0);
  });

  it('will 7 entity adjusted threshold allows higher morale', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Veteran', 'a', { stats: { will: 7 }, ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc2', 'Guard B', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: ['b'] }, { id: 'b', roomId: 'test', name: 'B', tags: [] as string[], neighbors: ['a'] }],
    });

    // Will 7: willShift = min(10, max(0, (7-3)*3)) = 12 → capped at 10
    // Wait, (7-3)*3 = 12, min(10,12) = 10. Threshold = max(0, 15-10) = 5
    const cog = getCognition(engine.world, 'npc1');
    cog.morale = 10;

    engine.world.entities.npc2.resources.hp = 0;
    emitDefeat(engine, 'npc2', 'player');

    // Morale after -7 (will-mitigated from -12): 3, below adjusted threshold 5
    expect(hasStatus(engine.world.entities.npc1, COMBAT_STATES.FLEEING)).toBe(true);
  });

  it('defeat during FLEEING does not add duplicate FLEEING', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Guard', 'a', { stats: { will: 3 }, ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc2', 'Guard B', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makeAIEntity('npc3', 'Guard C', 'a', { ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: ['b'] }, { id: 'b', roomId: 'test', name: 'B', tags: [] as string[], neighbors: ['a'] }],
    });

    const cog = getCognition(engine.world, 'npc1');
    cog.morale = 20;

    // Pre-apply FLEEING from a previous source
    applyStatus(engine.world.entities.npc1, COMBAT_STATES.FLEEING, 0, { duration: 2, sourceId: 'disengage' });
    expect(hasStatus(engine.world.entities.npc1, COMBAT_STATES.FLEEING)).toBe(true);
    const countBefore = engine.world.entities.npc1.statuses.filter(s => s.statusId === COMBAT_STATES.FLEEING).length;

    // Ally defeat triggers morale drop but should not add another FLEEING
    engine.world.entities.npc2.resources.hp = 0;
    emitDefeat(engine, 'npc2', 'player');

    const countAfter = engine.world.entities.npc1.statuses.filter(s => s.statusId === COMBAT_STATES.FLEEING).length;
    expect(countAfter).toBe(countBefore);
  });
});
