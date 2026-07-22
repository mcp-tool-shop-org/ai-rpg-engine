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
  territorialProfile,
  calculatingProfile,
  BUILTIN_INTENT_PROFILES,
  resolveIntentProfile,
  selectActionForEntity,
} from './cognition-core.js';
import type { IntentProfile } from './cognition-core.js';
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
    addMemory(engine.world, cog, 'saw-entity', 1, { entityId: 'player', zoneId: 'a' }, 'player', 'a');
    addMemory(engine.world, cog, 'heard-noise', 3, { direction: 'north' });

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
    addMemory(engine.world, cog, 'old-event', 1, { x: 1 });
    addMemory(engine.world, cog, 'recent-event', 8, { x: 2 });
    addMemory(engine.world, cog, 'very-recent', 10, { x: 3 });

    const recent = getRecentMemories(cog, 3, 10);
    expect(recent).toHaveLength(2); // tick 8 and 10
    expect(recent.every((m) => m.tick >= 7)).toBe(true);
  });

  it('mints deterministic per-instance memory ids (nextId → genId)', () => {
    // Memory ids are serialized in cognition state, so they must come from the
    // per-instance counter (genId), not a process-global counter. Two same-seed
    // instances must produce byte-identical memory ids.
    const mk = () => {
      const engine = createTestEngine({
        modules: [createCognitionCore()],
        entities: [makePlayer('a'), makeAIEntity('guard', 'Guard', 'a')],
        zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
      });
      const cog = getCognition(engine.world, 'guard');
      addMemory(engine.world, cog, 'saw-entity', 1, { x: 1 });
      addMemory(engine.world, cog, 'heard-noise', 2, { x: 2 });
      return cog.memories.map((m) => m.id);
    };
    const idsA = mk();
    const idsB = mk();
    expect(idsA).toEqual(idsB);
    // Distinct within an instance, and stamped from the per-instance counter.
    expect(new Set(idsA).size).toBe(idsA.length);
    expect(idsA[0].startsWith('mem_')).toBe(true);
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
      // seed 0 = the legacy roll stream this scenario was authored against
      // (the probe attack must land; F-SEED made harness seed 1 a new stream).
      seed: 0,
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

  it('rout penalty spared by a living same-faction ally of a different type (PM-1 faction divergence)', () => {
    // The "has living allies" rout check must honor entity.faction like the
    // offensive layer: a cross-`type` companion sharing the faction keeps the
    // witness from routing. Under the old same-`type` heuristic the beast would
    // be invisible and the rout would fire.
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Guard', 'a', {
          faction: 'horde',
          stats: { will: 3 },
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
        makeAIEntity('npc2', 'Guard B', 'a', {
          faction: 'horde',
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
        // Different `type`, same faction, alive — a real ally for the rout check.
        makeAIEntity('wolf', 'Bound Wolf', 'a', { type: 'beast', faction: 'horde' }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: ['b'] }, { id: 'b', roomId: 'test', name: 'B', tags: [] as string[], neighbors: ['a'] }],
    });

    const cog = getCognition(engine.world, 'npc1');
    cog.morale = 25; // -12 ally defeat → 13 (≤ 20 rout window) — but wolf lives.

    const collected: ResolvedEvent[] = [];
    engine.store.events.on('combat.morale.rout', (e: ResolvedEvent) => collected.push(e));

    engine.world.entities.npc2.resources.hp = 0;
    emitDefeat(engine, 'npc2', 'player');

    expect(collected.length).toBe(0);
    expect(getCognition(engine.world, 'npc1').morale).toBe(13); // shift only, no -10 rout
  });

  it('rout penalty still fires when the cross-type survivor shares no faction (legacy heuristic pinned)', () => {
    // Without factions the same-`type` fallback applies: a 'beast' bystander is
    // NOT an ally of an 'enemy' witness, so the rout penalty fires. Pins the
    // factionless path so the divergence test above is provably faction-driven.
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makeAIEntity('npc1', 'Guard', 'a', {
          stats: { will: 3 },
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
        makeAIEntity('npc2', 'Guard B', 'a', {
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
        makeAIEntity('wolf', 'Stray Wolf', 'a', { type: 'beast' }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: ['b'] }, { id: 'b', roomId: 'test', name: 'B', tags: [] as string[], neighbors: ['a'] }],
    });

    const cog = getCognition(engine.world, 'npc1');
    cog.morale = 25;

    const collected: ResolvedEvent[] = [];
    engine.store.events.on('combat.morale.rout', (e: ResolvedEvent) => collected.push(e));

    engine.world.entities.npc2.resources.hp = 0;
    emitDefeat(engine, 'npc2', 'player');

    expect(collected.length).toBe(1);
    expect(collected[0].payload.entityId).toBe('npc1');
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

// ============================================================
// F1-mod-a — territorial & calculating intent profiles
// ============================================================

const zonesWithExit = [
  { id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: ['b'] },
  { id: 'b', roomId: 'test', name: 'B', tags: [] as string[], neighbors: ['a'] },
];

const makeWarden = (overrides?: Partial<EntityState>): EntityState => makeAIEntity('warden', 'Crypt Warden', 'a', {
  ai: { profileId: 'territorial', goals: ['protect-crypt'], fears: [], alertLevel: 0, knowledge: {} },
  ...overrides,
});

const makeSchemer = (overrides?: Partial<EntityState>): EntityState => makeAIEntity('schemer', 'Mastermind', 'a', {
  ai: { profileId: 'calculating', goals: ['eliminate-witnesses'], fears: [], alertLevel: 0, knowledge: {} },
  ...overrides,
});

describe('Territorial profile', () => {
  it('attacks an intruder in its zone on contact (no prior hostile belief needed)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [makePlayer('a'), makeWarden()],
      zones: zonesWithExit,
    });

    const cog = getCognition(engine.world, 'warden');
    const intent = selectIntent(engine.world.entities.warden, cog, engine.world, territorialProfile);
    expect(intent?.verb).toBe('attack');
    expect(intent?.targetIds).toContain('player');
  });

  it('does not pursue a fleeing target — holds the zone (aggressive would still attack)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [makePlayer('a'), makeWarden()],
      zones: zonesWithExit,
    });

    applyStatus(engine.world.entities.player, COMBAT_STATES.FLEEING, 1, { duration: 3 });

    const cog = getCognition(engine.world, 'warden');
    const intent = selectIntent(engine.world.entities.warden, cog, engine.world, territorialProfile);
    expect(intent?.verb).toBe('guard');
    expect(intent?.reason).toContain('hold zone');

    // Contrast: an aggressive profile on the same state still swings at the fleeing target.
    const aggIntent = selectIntent(engine.world.entities.warden, cog, engine.world, aggressiveProfile);
    expect(aggIntent?.verb).toBe('attack');
  });

  it('guards when no valid target is present (allies are not intruders)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makePlayer('b'), // out of the warden's zone
        makeWarden(),
        makeAIEntity('stalker', 'Crypt Stalker', 'a'), // same type => ally, not an intruder
      ],
      zones: zonesWithExit,
    });

    const cog = getCognition(engine.world, 'warden');
    const intent = selectIntent(engine.world.entities.warden, cog, engine.world, territorialProfile);
    expect(intent?.verb).toBe('guard');
    expect(intent?.reason).toContain('holding territory');
  });

  it('holds ground at low morale where aggressive would disengage', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [makePlayer('a'), makeWarden()],
      zones: zonesWithExit,
    });

    const cog = getCognition(engine.world, 'warden');
    cog.morale = 15;

    const territorialIntent = selectIntent(engine.world.entities.warden, cog, engine.world, territorialProfile);
    expect(territorialIntent?.verb).toBe('guard');
    expect(territorialIntent?.reason).toContain('holding ground');

    const aggIntent = selectIntent(engine.world.entities.warden, cog, engine.world, aggressiveProfile);
    expect(aggIntent?.verb).toBe('disengage');
  });

  it('fleeing territorial entity can only disengage', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [makePlayer('a'), makeWarden()],
      zones: zonesWithExit,
    });

    applyStatus(engine.world.entities.warden, COMBAT_STATES.FLEEING, 1, { duration: 3 });

    const cog = getCognition(engine.world, 'warden');
    const intent = selectIntent(engine.world.entities.warden, cog, engine.world, territorialProfile);
    expect(intent?.verb).toBe('disengage');
    expect(intent?.priority).toBe(100);
  });
});

describe('Calculating profile', () => {
  it('observes instead of attacking when it has no advantage', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        { ...makePlayer('a'), resources: { hp: 30, maxHp: 30, stamina: 5 } }, // healthy
        makeSchemer(),
      ],
      zones: zonesWithExit,
    });

    const cog = getCognition(engine.world, 'schemer');
    const intent = selectIntent(engine.world.entities.schemer, cog, engine.world, calculatingProfile);
    expect(intent?.verb).toBe('inspect');
    expect(intent?.reason).toContain('waiting for an advantage');
  });

  it('strikes when the target is weakened', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        { ...makePlayer('a'), resources: { hp: 10, maxHp: 30, stamina: 5 } }, // below half
        makeSchemer(),
      ],
      zones: zonesWithExit,
    });

    const cog = getCognition(engine.world, 'schemer');
    const intent = selectIntent(engine.world.entities.schemer, cog, engine.world, calculatingProfile);
    expect(intent?.verb).toBe('attack');
    expect(intent?.targetIds).toContain('player');
    expect(intent?.reason).toContain('weakened');
  });

  it('strikes when numbers favor it', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        { ...makePlayer('a'), resources: { hp: 30, maxHp: 30, stamina: 5 } }, // healthy
        makeSchemer(),
        makeAIEntity('henchman', 'Henchman', 'a'), // same type => ally: 2 vs 1
      ],
      zones: zonesWithExit,
    });

    const cog = getCognition(engine.world, 'schemer');
    const intent = selectIntent(engine.world.entities.schemer, cog, engine.world, calculatingProfile);
    expect(intent?.verb).toBe('attack');
    expect(intent?.reason).toContain('numbers');
  });

  it('avoids the low-percentage attack on a guarded, healthy target even with numbers', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        { ...makePlayer('a'), resources: { hp: 30, maxHp: 30, stamina: 5 } },
        makeSchemer(),
        makeAIEntity('henchman', 'Henchman', 'a'),
      ],
      zones: zonesWithExit,
    });

    applyStatus(engine.world.entities.player, COMBAT_STATES.GUARDED, 1, { duration: 3 });

    const cog = getCognition(engine.world, 'schemer');
    const intent = selectIntent(engine.world.entities.schemer, cog, engine.world, calculatingProfile);
    expect(intent?.verb).not.toBe('attack');
    expect(['guard', 'inspect']).toContain(intent?.verb);
  });

  it('keeps its guard up when hurt and holding no advantage', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        { ...makePlayer('a'), resources: { hp: 30, maxHp: 30, stamina: 5 } },
        makeSchemer({ resources: { hp: 8, maxHp: 30, stamina: 5 } }),
      ],
      zones: zonesWithExit,
    });

    const cog = getCognition(engine.world, 'schemer');
    const intent = selectIntent(engine.world.entities.schemer, cog, engine.world, calculatingProfile);
    expect(intent?.verb).toBe('guard');
    expect(intent?.reason).toContain('defensive');
  });

  it('disengages decisively when morale collapses', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        { ...makePlayer('a'), resources: { hp: 10, maxHp: 30, stamina: 5 } }, // even an advantaged fight
        makeSchemer(),
      ],
      zones: zonesWithExit,
    });

    const cog = getCognition(engine.world, 'schemer');
    cog.morale = 20;
    const intent = selectIntent(engine.world.entities.schemer, cog, engine.world, calculatingProfile);
    expect(intent?.verb).toBe('disengage');
  });

  it('fleeing calculating entity can only disengage', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [makePlayer('a'), makeSchemer()],
      zones: zonesWithExit,
    });

    applyStatus(engine.world.entities.schemer, COMBAT_STATES.FLEEING, 1, { duration: 3 });

    const cog = getCognition(engine.world, 'schemer');
    const intent = selectIntent(engine.world.entities.schemer, cog, engine.world, calculatingProfile);
    expect(intent?.verb).toBe('disengage');
    expect(intent?.priority).toBe(100);
  });
});

describe('Built-in intent profile resolution', () => {
  it('exposes all four built-ins with stable ids', () => {
    expect(BUILTIN_INTENT_PROFILES.map((p) => p.id)).toEqual([
      'aggressive', 'cautious', 'territorial', 'calculating',
    ]);
  });

  it('resolveIntentProfile finds every built-in by id', () => {
    expect(resolveIntentProfile('aggressive')).toBe(aggressiveProfile);
    expect(resolveIntentProfile('cautious')).toBe(cautiousProfile);
    expect(resolveIntentProfile('territorial')).toBe(territorialProfile);
    expect(resolveIntentProfile('calculating')).toBe(calculatingProfile);
    expect(resolveIntentProfile('no-such-profile')).toBeUndefined();
  });

  it('caller-supplied profiles override built-ins by id', () => {
    const custom: IntentProfile = {
      id: 'territorial',
      evaluate: () => [{ verb: 'sing', priority: 1, reason: 'custom' }],
    };
    expect(resolveIntentProfile('territorial', [custom])).toBe(custom);
  });
});

describe('selectActionForEntity (turn-driver helper)', () => {
  it('resolves the entity profile by id and returns the chosen action in one call', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [makePlayer('a'), makeWarden()],
      zones: zonesWithExit,
    });

    const sel = selectActionForEntity(engine.world, 'warden');
    expect(sel).not.toBeNull();
    expect(sel!.requestedProfileId).toBe('territorial');
    expect(sel!.profileId).toBe('territorial');
    expect(sel!.usedFallback).toBe(false);
    expect(sel!.verb).toBe('attack');
    expect(sel!.targetIds).toContain('player');
    // options are the full evaluated list, highest priority first, chosen = options[0]
    expect(sel!.options[0].verb).toBe(sel!.verb);
    for (let i = 1; i < sel!.options.length; i++) {
      expect(sel!.options[i - 1].priority).toBeGreaterThanOrEqual(sel!.options[i].priority);
    }
  });

  it('resolves the calculating profile id shipped in starter content', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        { ...makePlayer('a'), resources: { hp: 30, maxHp: 30, stamina: 5 } },
        makeSchemer(),
      ],
      zones: zonesWithExit,
    });

    const sel = selectActionForEntity(engine.world, 'schemer');
    expect(sel).not.toBeNull();
    expect(sel!.profileId).toBe('calculating');
    expect(sel!.usedFallback).toBe(false);
    expect(sel!.verb).toBe('inspect'); // no advantage yet — observes
  });

  it('falls back to aggressive for an unknown profile id instead of doing nothing', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [
        makePlayer('a'),
        makeAIEntity('brute', 'Brute', 'a', {
          ai: { profileId: 'brooding-menace', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: zonesWithExit,
    });

    const sel = selectActionForEntity(engine.world, 'brute');
    expect(sel).not.toBeNull();
    expect(sel!.requestedProfileId).toBe('brooding-menace');
    expect(sel!.profileId).toBe('aggressive');
    expect(sel!.usedFallback).toBe(true);
    expect(sel!.verb).toBe('attack'); // still acts — the original bug was "falls back to nothing"
  });

  it('returns null for missing, non-AI, and downed entities', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [makePlayer('a'), makeWarden()],
      zones: zonesWithExit,
    });

    expect(selectActionForEntity(engine.world, 'ghost')).toBeNull();
    expect(selectActionForEntity(engine.world, 'player')).toBeNull(); // player has no ai state

    engine.world.entities.warden.resources.hp = 0;
    expect(selectActionForEntity(engine.world, 'warden')).toBeNull();
  });

  it('caller-supplied profiles take precedence over built-ins', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore()],
      entities: [makePlayer('a'), makeWarden()],
      zones: zonesWithExit,
    });

    const custom: IntentProfile = {
      id: 'territorial',
      evaluate: () => [{ verb: 'taunt', priority: 99, reason: 'custom override' }],
    };
    const sel = selectActionForEntity(engine.world, 'warden', { profiles: [custom] });
    expect(sel!.verb).toBe('taunt');
    expect(sel!.profileId).toBe('territorial');
  });
});
