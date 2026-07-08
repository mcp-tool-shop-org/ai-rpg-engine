// Runtime hardening — a misbehaving consumer (throwing listener, throwing
// handler, ghost actor, duplicate module id) must degrade into a structured,
// actionable signal instead of aborting the tick or leaking a raw stack.
//
// Findings: core-runtime-001..005.

import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { EventBus } from './events.js';
import { ActionDispatcher } from './actions.js';
import { WorldStore } from './world.js';
import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
} from './types.js';

const testManifest = {
  id: 'test-game',
  title: 'Test Game',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [],
  contentPacks: [],
};

// --- core-runtime-001: EventBus listener isolation ---
describe('core-runtime-001: EventBus listener isolation', () => {
  it('a throwing onAny listener does not prevent other listeners from firing', () => {
    const bus = new EventBus();
    const fired: string[] = [];

    bus.onAny(() => {
      throw new Error('boom from first onAny');
    });
    bus.onAny(() => {
      fired.push('second-onAny');
    });
    bus.on('test.event', () => {
      fired.push('specific');
    });

    const event: ResolvedEvent = {
      id: 'e1',
      tick: 0,
      type: 'test.event',
      payload: {},
    };
    const world = {} as WorldState;

    // Must not throw, and every other listener must still fire.
    expect(() => bus.emit(event, world)).not.toThrow();
    expect(fired).toContain('second-onAny');
    expect(fired).toContain('specific');
  });

  it('a throwing specific listener does not abort domain-wildcard or global listeners', () => {
    const bus = new EventBus();
    const fired: string[] = [];

    bus.on('combat.hit', () => {
      throw new Error('boom from specific');
    });
    bus.on('combat.*', () => {
      fired.push('domain-wildcard');
    });
    bus.onAny(() => {
      fired.push('global');
    });

    const event: ResolvedEvent = {
      id: 'e2',
      tick: 0,
      type: 'combat.hit',
      payload: {},
    };

    expect(() => bus.emit(event, {} as WorldState)).not.toThrow();
    expect(fired).toContain('domain-wildcard');
    expect(fired).toContain('global');
  });

  it('routes caught listener errors to onListenerError hook when constructed with one', () => {
    const seen: { err: unknown; eventType: string }[] = [];
    const bus = new EventBus({
      onListenerError: (err, event) => {
        seen.push({ err, eventType: event.type });
      },
    });

    bus.onAny(() => {
      throw new Error('boom');
    });

    const event: ResolvedEvent = {
      id: 'e3',
      tick: 0,
      type: 'test.event',
      payload: {},
    };
    expect(() => bus.emit(event, {} as WorldState)).not.toThrow();
    expect(seen.length).toBe(1);
    expect(seen[0].eventType).toBe('test.event');
    expect((seen[0].err as Error).message).toBe('boom');
  });

  it('a throwing consumer listener does not abort recordEvent (event still logged)', () => {
    const store = new WorldStore({ manifest: testManifest, seed: 1 });
    store.events.onAny(() => {
      throw new Error('consumer blew up');
    });

    expect(() =>
      store.emitEvent('test.event', { value: 1 }),
    ).not.toThrow();
    // The event must still be in the log despite the throwing listener.
    expect(store.state.eventLog.some((e) => e.type === 'test.event')).toBe(true);
  });

  it('threads onListenerError from the Engine constructor to the event bus (observability reachable)', () => {
    const seen: string[] = [];
    const engine = new Engine({
      manifest: testManifest,
      seed: 1,
      onListenerError: (err) => seen.push((err as Error).message),
    });
    engine.store.events.onAny(() => {
      throw new Error('listener-from-consumer');
    });
    // Hook must fire (proves WorldStore threads it through; RED if not wired).
    expect(() => engine.store.emitEvent('test.event', {})).not.toThrow();
    expect(seen).toContain('listener-from-consumer');
  });
});

// --- core-runtime-002: dispatch wraps validator + handler ---
describe('core-runtime-002: dispatch isolates throwing validator/handler', () => {
  it('a verb handler that throws yields action.rejected, not an uncaught throw', () => {
    const boomModule: EngineModule = {
      id: 'boom',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('boom', (): ResolvedEvent[] => {
          throw new Error('handler exploded');
        });
      },
    };

    const engine = new Engine({
      manifest: { ...testManifest, modules: ['boom'] },
      seed: 1,
      modules: [boomModule],
    });
    engine.store.addEntity({
      id: 'p1',
      blueprintId: 'bp',
      type: 'player',
      name: 'P1',
      tags: [],
      stats: {},
      resources: {},
      statuses: [],
    });
    engine.store.state.playerId = 'p1';

    expect(() => engine.submitAction('boom')).not.toThrow();
    const rejected = engine.world.eventLog.find(
      (e) => e.type === 'action.rejected',
    );
    expect(rejected).toBeDefined();
    expect(rejected!.payload.verb).toBe('boom');
    expect(String(rejected!.payload.reason)).toContain('boom');
  });

  it('a validator that throws yields action.rejected naming the verb', () => {
    const dispatcher = new ActionDispatcher();
    dispatcher.registerVerb('walk', () => []);
    dispatcher.registerValidator(() => {
      throw new Error('validator exploded');
    });

    const store = new WorldStore({ manifest: testManifest, seed: 1 });
    const action: ActionIntent = {
      id: 'a1',
      actorId: 'p1',
      verb: 'walk',
      source: 'player',
      issuedAtTick: 0,
    };

    expect(() => dispatcher.dispatch(action, store)).not.toThrow();
    const rejected = store.state.eventLog.find(
      (e) => e.type === 'action.rejected',
    );
    expect(rejected).toBeDefined();
    expect(rejected!.payload.verb).toBe('walk');
  });
});

// --- core-runtime-003: duplicate module id throws ---
describe('core-runtime-003: duplicate module id is a config error', () => {
  it('registering two modules with the same id throws a clear error naming the id', () => {
    const modA: EngineModule = {
      id: 'dup',
      version: '0.1.0',
      register() {},
    };
    const modB: EngineModule = {
      id: 'dup',
      version: '0.2.0',
      register() {},
    };

    expect(
      () =>
        new Engine({
          manifest: { ...testManifest, modules: ['dup'] },
          seed: 1,
          modules: [modA, modB],
        }),
    ).toThrowError(/dup/);
  });
});

// --- core-runtime-004: ghost actor short-circuits ---
describe('core-runtime-004: submitActionAs rejects unknown actor', () => {
  it('an entity not in state.entities yields action.rejected (unknown actor)', () => {
    const walkModule: EngineModule = {
      id: 'walk',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('walk', (action: ActionIntent): ResolvedEvent[] => [
          {
            id: 'w',
            tick: action.issuedAtTick,
            type: 'test.walked',
            actorId: action.actorId,
            payload: {},
          },
        ]);
      },
    };

    const engine = new Engine({
      manifest: { ...testManifest, modules: ['walk'] },
      seed: 1,
      modules: [walkModule],
    });
    engine.store.state.playerId = 'p1';

    const events = engine.submitActionAs('ghost-entity', 'walk');
    // Handler must not have run for a ghost actor.
    expect(events.length).toBe(0);
    expect(engine.world.eventLog.some((e) => e.type === 'test.walked')).toBe(false);
    const rejected = engine.world.eventLog.find(
      (e) => e.type === 'action.rejected',
    );
    expect(rejected).toBeDefined();
    expect(String(rejected!.payload.reason).toLowerCase()).toContain('actor');
    expect(rejected!.payload.actorId).toBe('ghost-entity');
  });

  it('submitActionAs still works for a real entity', () => {
    const walkModule: EngineModule = {
      id: 'walk',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('walk', (action: ActionIntent): ResolvedEvent[] => [
          {
            id: 'w',
            tick: action.issuedAtTick,
            type: 'test.walked',
            actorId: action.actorId,
            payload: {},
          },
        ]);
      },
    };

    const engine = new Engine({
      manifest: { ...testManifest, modules: ['walk'] },
      seed: 1,
      modules: [walkModule],
    });
    engine.store.addEntity({
      id: 'ally-1',
      blueprintId: 'bp',
      type: 'npc',
      name: 'Ally',
      tags: [],
      stats: {},
      resources: {},
      statuses: [],
    });

    const events = engine.submitActionAs('ally-1', 'walk');
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('test.walked');
  });
});

// --- core-runtime-006: submitAction/processAction ghost-actor guard (C2) ---
// submitActionAs already short-circuits a ghost actor to a structured
// action.rejected; the v2.5 audit found submitAction and processAction were
// asymmetric — the default playerId is '' and a verb handler would run for a
// nonexistent actor. These tests pin the symmetric guard.
describe('core-runtime-006: submitAction/processAction ghost-actor guard', () => {
  function walkModule(): EngineModule {
    return {
      id: 'walk',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('walk', (action: ActionIntent): ResolvedEvent[] => [
          {
            id: '',
            tick: action.issuedAtTick,
            type: 'test.walked',
            actorId: action.actorId,
            payload: {},
          },
        ]);
      },
    };
  }

  function buildEngine(): Engine {
    return new Engine({
      manifest: { ...testManifest, modules: ['walk'] },
      seed: 1,
      modules: [walkModule()],
    });
  }

  it('submitAction with the default empty playerId is rejected, not dispatched', () => {
    const engine = buildEngine(); // playerId stays ''

    const events = engine.submitAction('walk');

    expect(events.length).toBe(0);
    expect(engine.world.eventLog.some((e) => e.type === 'test.walked')).toBe(false);
    const rejected = engine.world.eventLog.find((e) => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(String(rejected!.payload.reason).toLowerCase()).toContain('actor');
    // Same lifecycle as any rejected action: the tick still advances…
    expect(engine.tick).toBe(1);
    // …and, like submitActionAs's guard, the ghost attempt never enters the
    // replay log.
    expect(engine.getActionLog().length).toBe(0);
  });

  it('submitAction with a playerId that has no entity is rejected symmetrically with submitActionAs', () => {
    const engine = buildEngine();
    engine.store.state.playerId = 'vanished-hero';

    const events = engine.submitAction('walk');

    expect(events.length).toBe(0);
    expect(engine.world.eventLog.some((e) => e.type === 'test.walked')).toBe(false);
    const rejected = engine.world.eventLog.find((e) => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.actorId).toBe('vanished-hero');
    expect(String(rejected!.payload.reason)).toContain('vanished-hero');
  });

  it('processAction with a ghost actorId is rejected and the handler does not run', () => {
    const engine = buildEngine();

    const action = engine.dispatcher.createAction('walk', 'ghost-actor', engine.tick, { source: 'ai' }, 'a-ghost');
    const events = engine.processAction(action);

    expect(events.length).toBe(0);
    expect(engine.world.eventLog.some((e) => e.type === 'test.walked')).toBe(false);
    const rejected = engine.world.eventLog.find((e) => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.actorId).toBe('ghost-actor');
    expect(engine.getActionLog().length).toBe(0);
  });

  it('submitAction still dispatches for a real player entity (control)', () => {
    const engine = buildEngine();
    engine.store.addEntity({
      id: 'p1',
      blueprintId: 'bp',
      type: 'player',
      name: 'P1',
      tags: [],
      stats: {},
      resources: {},
      statuses: [],
    });
    engine.store.state.playerId = 'p1';

    const events = engine.submitAction('walk');
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('test.walked');
    expect(engine.getActionLog().length).toBe(1);
  });
});

// --- core-runtime-005: engine pass-throughs ---
describe('core-runtime-005: engine pass-throughs for inspectors/panels/shutdown', () => {
  it('a registered inspector is reachable via Engine.getInspectors()', () => {
    const inspectModule: EngineModule = {
      id: 'inspect',
      version: '0.1.0',
      register(ctx) {
        ctx.debug.registerInspector({
          id: 'my-inspector',
          label: 'My Inspector',
          inspect: () => ({ ok: true }),
        });
      },
    };

    const engine = new Engine({
      manifest: { ...testManifest, modules: ['inspect'] },
      seed: 1,
      modules: [inspectModule],
    });

    const inspectors = engine.getInspectors();
    expect(inspectors.some((i) => i.id === 'my-inspector')).toBe(true);
  });

  it('a registered panel is reachable via Engine.getPanels()', () => {
    const panelModule: EngineModule = {
      id: 'panel',
      version: '0.1.0',
      register(ctx) {
        ctx.ui.registerPanel({
          id: 'my-panel',
          label: 'My Panel',
          render: () => 'rendered',
        });
      },
    };

    const engine = new Engine({
      manifest: { ...testManifest, modules: ['panel'] },
      seed: 1,
      modules: [panelModule],
    });

    expect(engine.getPanels().some((p) => p.id === 'my-panel')).toBe(true);
  });

  it('Engine.shutdown() calls teardown on registered modules', () => {
    let toreDown = false;
    const teardownModule: EngineModule = {
      id: 'teardown',
      version: '0.1.0',
      register() {},
      teardown() {
        toreDown = true;
      },
    };

    const engine = new Engine({
      manifest: { ...testManifest, modules: ['teardown'] },
      seed: 1,
      modules: [teardownModule],
    });

    engine.shutdown();
    expect(toreDown).toBe(true);
  });
});
