import { describe, it, expect, vi } from 'vitest';
import { createTestEngine } from './test-harness.js';
import type { EngineModule } from './types.js';

// A minimal test module
function createTestModule(): EngineModule & { initCalled: boolean; teardownCalled: boolean } {
  const mod: EngineModule & { initCalled: boolean; teardownCalled: boolean } = {
    id: 'test-mod',
    version: '0.1.0',
    initCalled: false,
    teardownCalled: false,

    register(ctx) {
      ctx.actions.registerVerb('ping', (action, world) => [{
        id: 'evt-ping',
        tick: action.issuedAtTick,
        type: 'test.ping',
        actorId: action.actorId,
        payload: { message: 'pong' },
      }]);
    },

    init(_ctx) {
      mod.initCalled = true;
    },

    teardown() {
      mod.teardownCalled = true;
    },
  };
  return mod;
}

describe('createTestEngine', () => {
  it('creates a minimal engine with a module', () => {
    const engine = createTestEngine({
      modules: [createTestModule()],
      entities: [
        { id: 'player', blueprintId: 'player', type: 'player', name: 'Hero', tags: ['player'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'room-a' },
      ],
      zones: [
        { id: 'room-a', roomId: 'test', name: 'Room A', tags: [], neighbors: [] },
      ],
    });

    expect(engine.player().name).toBe('Hero');
    expect(engine.currentZone().name).toBe('Room A');
  });

  it('submitAction + drainEvents works', () => {
    const engine = createTestEngine({
      modules: [createTestModule()],
      entities: [
        { id: 'player', blueprintId: 'player', type: 'player', name: 'Hero', tags: [], stats: {}, resources: {}, statuses: [], zoneId: 'room-a' },
      ],
      zones: [
        { id: 'room-a', roomId: 'test', name: 'Room A', tags: [], neighbors: [] },
      ],
    });

    // Drain initial events
    engine.drainEvents();

    const events = engine.submitAction('ping');
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'test.ping')).toBe(true);

    const allEvents = engine.drainEvents();
    expect(allEvents.some((e) => e.type === 'test.ping')).toBe(true);
  });

  it('calls module init after registration', () => {
    const mod = createTestModule();
    createTestEngine({
      modules: [mod],
      entities: [
        { id: 'player', blueprintId: 'player', type: 'player', name: 'Hero', tags: [], stats: {}, resources: {}, statuses: [] },
      ],
    });

    expect(mod.initCalled).toBe(true);
  });

  it('calls module teardown', () => {
    const mod = createTestModule();
    const engine = createTestEngine({
      modules: [mod],
      entities: [
        { id: 'player', blueprintId: 'player', type: 'player', name: 'Hero', tags: [], stats: {}, resources: {}, statuses: [] },
      ],
    });

    expect(mod.teardownCalled).toBe(false);
    engine.moduleManager.teardownAll();
    expect(mod.teardownCalled).toBe(true);
  });

  it('sets globals from options', () => {
    const engine = createTestEngine({
      modules: [],
      entities: [
        { id: 'player', blueprintId: 'player', type: 'player', name: 'Hero', tags: [], stats: {}, resources: {}, statuses: [] },
      ],
      globals: { difficulty: 'hard', level: 5 },
    });

    expect(engine.world.globals.difficulty).toBe('hard');
    expect(engine.world.globals.level).toBe(5);
  });
});
