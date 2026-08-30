// Wave 21 Stage C humanization pins — structured host-visible signals
// for the sim-core findings (F-049ce861, F-0a03d557, F-1e3bdd0d,
// F-447f5abe, F-46bb43bc, F-580907ce, F-64f9ad98, F-a97d5916).

import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { EventBus } from './events.js';
import { WorldStore } from './world.js';
import type {
  ActionIntent,
  EngineModule,
  EntityState,
  GameManifest,
  ResolvedEvent,
  WorldState,
} from './types.js';

const manifest: GameManifest = {
  id: 'humanization-game',
  title: 'Humanization',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [],
  contentPacks: [],
};

function player(id = 'hero'): EntityState {
  return {
    id,
    blueprintId: 'bp',
    type: 'player',
    name: 'Hero',
    tags: [],
    stats: {},
    resources: {},
    statuses: [],
  };
}

function withPlayer(engine: Engine, id = 'hero'): void {
  engine.store.addEntity(player(id));
  engine.store.state.playerId = id;
}

function echoModule(id = 'echo'): EngineModule {
  return {
    id,
    version: '0.1.0',
    register(ctx) {
      ctx.actions.registerVerb('echo', (action: ActionIntent): ResolvedEvent[] => [
        {
          id: '',
          tick: action.issuedAtTick,
          type: 'test.echo',
          actorId: action.actorId,
          payload: { message: 'echoed' },
        },
      ]);
    },
  };
}

describe('F-049ce861 — FormulaRegistryAccess.register threads { override: true }', () => {
  it('a second module can replace a formula through ctx.formulas.register(..., { override: true })', () => {
    const m1: EngineModule = {
      id: 'm1',
      version: '0.1.0',
      register(ctx) {
        ctx.formulas.register('dmg', () => 1);
      },
    };
    const m2: EngineModule = {
      id: 'm2',
      version: '0.1.0',
      register(ctx) {
        ctx.formulas.register('dmg', () => 2, { override: true });
      },
    };
    const engine = new Engine({
      manifest: { ...manifest, modules: ['m1', 'm2'] },
      seed: 1,
      modules: [m1, m2],
    });
    expect(engine.formulas.get('dmg')()).toBe(2);
  });

  it('without override the module API still fails loud on a duplicate formula id', () => {
    const m1: EngineModule = {
      id: 'm1',
      version: '0.1.0',
      register(ctx) {
        ctx.formulas.register('dmg', () => 1);
      },
    };
    const m2: EngineModule = {
      id: 'm2',
      version: '0.1.0',
      register(ctx) {
        ctx.formulas.register('dmg', () => 2);
      },
    };
    expect(
      () =>
        new Engine({
          manifest: { ...manifest, modules: ['m1', 'm2'] },
          seed: 1,
          modules: [m1, m2],
        }),
    ).toThrow(/dmg/);
  });
});

describe('F-0a03d557 — processPending skips holes and addPending guards writes', () => {
  it('a null pending entry emits pending.skipped, is dropped, and does not abort submitAction', () => {
    const engine = new Engine({
      manifest: { ...manifest, modules: ['echo'] },
      seed: 1,
      modules: [echoModule()],
    });
    withPlayer(engine);
    engine.store.state.pending.push(null as unknown as never);

    expect(() => engine.submitAction('echo')).not.toThrow();
    expect(engine.tick).toBe(1);
    expect(engine.world.eventLog.some((e) => e.type === 'test.echo')).toBe(true);
    const skipped = engine.world.eventLog.find((e) => e.type === 'pending.skipped');
    expect(skipped).toBeDefined();
    expect(String(skipped!.payload.reason)).toMatch(/not an object/);
    expect(engine.store.state.pending).toEqual([]);
  });

  it('executeAtTick undefined is dropped with pending.skipped rather than silently vanishing', () => {
    const store = new WorldStore({ manifest, seed: 1 });
    store.state.pending.push({ id: 'pend_x', type: 'fx.later', payload: {} } as never);
    expect(() => store.processPending()).not.toThrow();
    expect(store.state.pending).toEqual([]);
    const skipped = store.state.eventLog.find((e) => e.type === 'pending.skipped');
    expect(skipped).toBeDefined();
    expect(String(skipped!.payload.reason)).toMatch(/executeAtTick/);
  });

  it('addPending rejects a non-finite executeAtTick and a non-string type', () => {
    const store = new WorldStore({ manifest, seed: 1 });
    expect(() =>
      store.addPending({ type: 'fx.later', executeAtTick: Number.NaN, payload: {} }),
    ).toThrow(/executeAtTick/);
    expect(() =>
      store.addPending({ type: '', executeAtTick: 1, payload: {} }),
    ).toThrow(/type/);
    expect(store.state.pending).toHaveLength(0);
  });

  it('highestIdCounter skips null eventLog/pending elements instead of TypeError', () => {
    const store = new WorldStore({ manifest, seed: 1 });
    store.addEntity(player());
    store.state.playerId = 'hero';
    const parsed = JSON.parse(store.serialize()) as {
      state: { meta: { idCounter: number }; eventLog: unknown[]; pending: unknown[] };
      rngState: number;
    };
    parsed.state.eventLog.push(null);
    parsed.state.pending.push(null);
    const worldJson = JSON.stringify(parsed).replace(/"idCounter":\d+/, '"idCounter":1e400');
    expect(() => WorldStore.deserialize(worldJson)).not.toThrow();
    const restored = WorldStore.deserialize(worldJson);
    expect(Number.isFinite(restored.state.meta.idCounter)).toBe(true);
  });
});

describe('F-1e3bdd0d — Engine.shutdown refuses later actions and exposes events.off', () => {
  it('submitAction after shutdown emits action.rejected naming shutdown and does not dispatch', () => {
    const engine = new Engine({
      manifest: { ...manifest, modules: ['echo'] },
      seed: 1,
      modules: [echoModule()],
    });
    withPlayer(engine);
    engine.shutdown();
    const tick = engine.tick;
    const events = engine.submitAction('echo');
    expect(events).toEqual([]);
    expect(engine.tick).toBe(tick);
    expect(engine.world.eventLog.some((e) => e.type === 'test.echo')).toBe(false);
    const rejected = engine.world.eventLog.find((e) => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(String(rejected!.payload.reason)).toMatch(/shut down/i);
    expect(engine.getAvailableActions()).toEqual([]);
  });

  it('submitActionAs and processAction also refuse after shutdown', () => {
    const engine = new Engine({
      manifest: { ...manifest, modules: ['echo'] },
      seed: 1,
      modules: [echoModule()],
    });
    withPlayer(engine);
    engine.shutdown();
    engine.submitActionAs('hero', 'echo');
    const asRejected = engine.world.eventLog.filter((e) => e.type === 'action.rejected');
    expect(asRejected.length).toBeGreaterThanOrEqual(1);
    expect(String(asRejected[0]!.payload.reason)).toMatch(/shut down/i);

    const action: ActionIntent = {
      id: 'act_x',
      actorId: 'hero',
      verb: 'echo',
      source: 'player',
      issuedAtTick: 0,
    };
    engine.processAction(action);
    expect(engine.getActionLog()).toHaveLength(0);
    expect(engine.world.eventLog.some((e) => e.type === 'test.echo')).toBe(false);
  });

  it('ctx.events.off unsubscribes a mid-game listener', () => {
    let hits = 0;
    let unsub: (() => void) | undefined;
    const mod: EngineModule = {
      id: 'off-mod',
      version: '0.1.0',
      register(ctx) {
        const handler = (): void => {
          hits += 1;
        };
        ctx.events.on('test.echo', handler);
        unsub = () => ctx.events.off('test.echo', handler);
        ctx.actions.registerVerb('echo', (action: ActionIntent): ResolvedEvent[] => [
          { id: '', tick: action.issuedAtTick, type: 'test.echo', actorId: action.actorId, payload: {} },
        ]);
      },
    };
    const engine = new Engine({
      manifest: { ...manifest, modules: ['off-mod'] },
      seed: 1,
      modules: [mod],
    });
    withPlayer(engine);
    engine.submitAction('echo');
    expect(hits).toBe(1);
    unsub!();
    engine.submitAction('echo');
    expect(hits).toBe(1);
  });
});

describe('F-447f5abe — partial-entity accessors do not TypeError', () => {
  it('getResource/getStat/entitiesByTag treat missing nested containers as empty', () => {
    const store = new WorldStore({ manifest, seed: 1 });
    store.state.entities['partial'] = { id: 'partial', name: 'Hole' } as EntityState;
    expect(store.getResource('partial', 'hp')).toBe(0);
    expect(store.getStat('partial', 'str')).toBe(0);
    expect(() => store.entitiesByTag('undead')).not.toThrow();
    expect(store.entitiesByTag('undead')).toEqual([]);
  });

  it('modifyResource on a missing entity returns 0 and emits resource.modify.missed', () => {
    const store = new WorldStore({ manifest, seed: 1 });
    expect(store.modifyResource('ghost', 'hp', 5)).toBe(0);
    const missed = store.state.eventLog.find((e) => e.type === 'resource.modify.missed');
    expect(missed).toBeDefined();
    expect(missed!.payload.entityId).toBe('ghost');
    expect(String(missed!.payload.reason)).toMatch(/ghost/);
  });

  it('modifyResource initializes a missing resources object rather than throwing', () => {
    const store = new WorldStore({ manifest, seed: 1 });
    store.state.entities['nores'] = {
      id: 'nores',
      blueprintId: 'bp',
      type: 'npc',
      name: 'Bare',
      tags: [],
      stats: {},
      resources: {},
      statuses: [],
    } as EntityState;
    expect(() => store.modifyResource('nores', 'hp', 5)).not.toThrow();
    expect(store.getResource('nores', 'hp')).toBe(5);
  });
});

describe('F-46bb43bc — dependsOn succeeds for peers later in the constructor list', () => {
  it('modules: [child, parent] constructs when child.dependsOn includes parent', () => {
    const parent: EngineModule = { id: 'parent', version: '0.1.0', register() {} };
    const child: EngineModule = {
      id: 'child',
      version: '0.1.0',
      dependsOn: ['parent'],
      register() {},
    };
    expect(
      () =>
        new Engine({
          manifest: { ...manifest, modules: ['child', 'parent'] },
          seed: 1,
          modules: [child, parent],
        }),
    ).not.toThrow();
  });

  it('still throws when the dependency is not in the provided set', () => {
    const child: EngineModule = {
      id: 'child',
      version: '0.1.0',
      dependsOn: ['parent'],
      register() {},
    };
    expect(
      () =>
        new Engine({
          manifest: { ...manifest, modules: ['child'] },
          seed: 1,
          modules: [child],
        }),
    ).toThrow(/parent/);
  });
});

describe('F-580907ce — Engine.deserialize threads onListenerError', () => {
  it('a throwing module listener is observed by the deserialize hook after load', () => {
    const boom: EngineModule = {
      id: 'boom-listen',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('echo', (action: ActionIntent): ResolvedEvent[] => [
          { id: '', tick: action.issuedAtTick, type: 'test.echo', actorId: action.actorId, payload: {} },
        ]);
        ctx.events.on('*', () => {
          throw new Error('module-listener');
        });
      },
    };
    const before: string[] = [];
    const engine = new Engine({
      manifest: { ...manifest, modules: ['boom-listen'] },
      seed: 1,
      modules: [boom],
      onListenerError: (err) => before.push((err as Error).message),
    });
    withPlayer(engine);
    engine.submitAction('echo');
    expect(before).toContain('module-listener');

    const after: string[] = [];
    const restored = Engine.deserialize(engine.serialize(), {
      modules: [boom],
      onListenerError: (err) => after.push((err as Error).message),
    });
    expect(() => restored.submitAction('echo')).not.toThrow();
    expect(after).toContain('module-listener');
  });
});

describe('F-64f9ad98 — init/teardown isolate-and-continue', () => {
  it('a throwing teardown does not prevent later modules from tearing down or abort shutdown', () => {
    const order: string[] = [];
    const hook: { phase?: string; id?: string } = {};
    const ta: EngineModule = {
      id: 'ta',
      version: '0.1.0',
      register() {},
      teardown() {
        order.push('a');
        throw new Error('teardown-a');
      },
    };
    const tb: EngineModule = {
      id: 'tb',
      version: '0.1.0',
      register() {},
      teardown() {
        order.push('b');
      },
    };
    const engine = new Engine({
      manifest: { ...manifest, modules: ['ta', 'tb'] },
      seed: 1,
      modules: [ta, tb],
      onModuleError: (_err, phase, moduleId) => {
        hook.phase = phase;
        hook.id = moduleId;
      },
    });
    expect(() => engine.shutdown()).not.toThrow();
    expect(order).toEqual(['a', 'b']);
    expect(hook).toEqual({ phase: 'teardown', id: 'ta' });
    const failed = engine.world.eventLog.find((e) => e.type === 'module.teardown.failed');
    expect(failed).toBeDefined();
    expect(String(failed!.payload.reason)).toMatch(/teardown-a/);
  });

  it('a throwing init still runs later inits, teardowns already-inited modules, then rethrows', () => {
    const order: string[] = [];
    const ia: EngineModule = {
      id: 'ia',
      version: '0.1.0',
      register() {},
      init() {
        order.push('init-a');
      },
      teardown() {
        order.push('teardown-a');
      },
    };
    const ib: EngineModule = {
      id: 'ib',
      version: '0.1.0',
      register() {},
      init() {
        order.push('init-b');
        throw new Error('init-b');
      },
      teardown() {
        order.push('teardown-b');
      },
    };
    const ic: EngineModule = {
      id: 'ic',
      version: '0.1.0',
      register() {},
      init() {
        order.push('init-c');
      },
      teardown() {
        order.push('teardown-c');
      },
    };
    expect(
      () =>
        new Engine({
          manifest: { ...manifest, modules: ['ia', 'ib', 'ic'] },
          seed: 1,
          modules: [ia, ib, ic],
        }),
    ).toThrow('init-b');
    expect(order).toContain('init-a');
    expect(order).toContain('init-b');
    expect(order).toContain('init-c');
    expect(order).toContain('teardown-a');
    expect(order).toContain('teardown-c');
  });
});

describe('F-a97d5916 — EventBus snapshots type before listener loops', () => {
  it('a specific listener rewriting type to a non-string does not abort domain or onAny', () => {
    const bus = new EventBus();
    const fired: string[] = [];
    bus.on('combat.hit', (event) => {
      (event as { type: unknown }).type = 1;
      fired.push('specific');
    });
    bus.on('combat.*', () => {
      fired.push('domain');
    });
    bus.onAny(() => {
      fired.push('any');
    });
    const event: ResolvedEvent = {
      id: 'e1',
      tick: 0,
      type: 'combat.hit',
      payload: {},
    };
    expect(() => bus.emit(event, {} as WorldState)).not.toThrow();
    expect(fired).toEqual(['specific', 'domain', 'any']);
  });

  it('does not clone — a narration patch on the event writes the same object', () => {
    const bus = new EventBus();
    bus.on('combat.hit', (event) => {
      (event as ResolvedEvent & { description?: string }).description = 'narrated';
    });
    const event: ResolvedEvent & { description?: string } = {
      id: 'e2',
      tick: 0,
      type: 'combat.hit',
      payload: {},
    };
    bus.emit(event, {} as WorldState);
    expect(event.description).toBe('narrated');
  });
});
