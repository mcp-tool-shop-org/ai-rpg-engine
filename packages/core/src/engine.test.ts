import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { SeededRNG } from './rng.js';
import { WorldStore } from './world.js';
import type { EngineModule, ActionIntent, WorldState, ResolvedEvent } from './types.js';

const testManifest = {
  id: 'test-game',
  title: 'Test Game',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [],
  contentPacks: [],
};

describe('Engine', () => {
  it('creates a world with correct metadata', () => {
    const engine = new Engine({ manifest: testManifest, seed: 42 });
    expect(engine.world.meta.gameId).toBe('test-game');
    expect(engine.world.meta.seed).toBe(42);
    expect(engine.tick).toBe(0);
  });

  it('rejects actions with unknown verbs', () => {
    const engine = new Engine({ manifest: testManifest, seed: 42 });
    engine.store.state.playerId = 'player-1';
    const events = engine.submitAction('nonexistent');
    // Should have action.declared + action.rejected + action.resolved won't happen
    const rejected = engine.world.eventLog.find(e => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.reason).toContain('unknown verb');
  });

  it('advances tick after each action', () => {
    const engine = new Engine({ manifest: testManifest, seed: 42 });
    engine.store.state.playerId = 'player-1';
    expect(engine.tick).toBe(0);
    engine.submitAction('test');
    expect(engine.tick).toBe(1);
    engine.submitAction('test');
    expect(engine.tick).toBe(2);
  });

  it('registers and dispatches module verbs', () => {
    const echoModule: EngineModule = {
      id: 'echo',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('echo', (action: ActionIntent, _world: WorldState): ResolvedEvent[] => {
          return [{
            id: 'echo-evt',
            tick: action.issuedAtTick,
            type: 'test.echo',
            actorId: action.actorId,
            payload: { message: 'echoed' },
          }];
        });
      },
    };

    const engine = new Engine({
      manifest: { ...testManifest, modules: ['echo'] },
      seed: 42,
      modules: [echoModule],
    });
    engine.store.state.playerId = 'player-1';

    const events = engine.submitAction('echo');
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('test.echo');
    expect(events[0].payload.message).toBe('echoed');
  });

  it('emits events to listeners', () => {
    const engine = new Engine({ manifest: testManifest, seed: 42 });
    const captured: ResolvedEvent[] = [];
    engine.store.events.onAny((event) => {
      captured.push(event);
    });

    engine.store.emitEvent('test.event', { value: 1 });
    expect(captured.length).toBe(1);
    expect(captured[0].type).toBe('test.event');
  });

  it('records action log for replay', () => {
    const echoModule: EngineModule = {
      id: 'echo',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('echo', (action: ActionIntent): ResolvedEvent[] => [{
          id: 'e',
          tick: action.issuedAtTick,
          type: 'test.echo',
          payload: {},
        }]);
      },
    };

    const engine = new Engine({
      manifest: testManifest,
      seed: 42,
      modules: [echoModule],
    });
    engine.store.state.playerId = 'p1';

    engine.submitAction('echo');
    engine.submitAction('echo');
    expect(engine.getActionLog().length).toBe(2);
  });
});

describe('SeededRNG', () => {
  it('produces deterministic results', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(42);

    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());

    expect(results1).toEqual(results2);
  });

  it('save/restore state works', () => {
    const rng = new SeededRNG(42);
    rng.next(); rng.next(); rng.next();
    const saved = rng.getState();

    const rng2 = new SeededRNG(0);
    rng2.setState(saved);

    expect(rng.next()).toBe(rng2.next());
  });
});

describe('WorldStore', () => {
  it('serializes and deserializes correctly', () => {
    const store = new WorldStore({ manifest: testManifest, seed: 42 });
    store.state.playerId = 'player-1';
    store.setGlobal('flag', true);
    store.addEntity({
      id: 'entity-1',
      blueprintId: 'bp-1',
      type: 'npc',
      name: 'Test NPC',
      tags: ['friendly'],
      stats: { vigor: 5 },
      resources: { hp: 10 },
      statuses: [],
      zoneId: 'zone-1',
    });

    const json = store.serialize();
    const restored = WorldStore.deserialize(json);

    expect(restored.state.playerId).toBe('player-1');
    expect(restored.getGlobal('flag')).toBe(true);
    expect(restored.getEntity('entity-1')?.name).toBe('Test NPC');
  });
});
