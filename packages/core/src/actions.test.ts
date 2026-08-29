// ActionDispatcher — verb registration uniqueness and handler-return isolation.
//
// F-daece5c6: dispatch wraps handler() in try/catch, then iterates the return
// with `for (const event of events)` OUTSIDE that try. A handler that returns
// undefined/null/a plain object (valid-looking module code that forgets
// `return [...]`) threw an uncaught TypeError, aborted the tick, and left
// eventLog as action.declared with no rejected/resolved.
//
// F-208d62e4: Array.isArray is not enough. Handler `[null]`/`[undefined]`, a
// validator returning undefined/null, and an effect applier returning `[null]`
// still threw TypeError outside try/catch (event.id / result.valid), aborting
// the tick with a declared-only eventLog. Wave 11 sibling: a non-null object
// with no string type (`[{ payload: {} }]`) still reached EventBus.emit
// type.indexOf and aborted the same way. Wave 13 sibling: a frozen event with
// a valid type still TypeError'd on `event.id =` (object is not extensible).
//
// F-b71bccf1: registerVerb was Map.set last-wins. Two modules registering the
// same verb constructed successfully and the first handler was silently
// dropped — the accidental-clobber class FormulaRegistry and ModuleManager
// already fail loud for.

import { describe, it, expect } from 'vitest';
import { ActionDispatcher, type ActionValidationResult } from './actions.js';
import { Engine } from './engine.js';
import { WorldStore } from './world.js';
import type {
  ActionIntent,
  EngineModule,
  ResolvedEvent,
  VerbHandler,
} from './types.js';

const testManifest = {
  id: 'actions-game',
  title: 'Actions',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [],
  contentPacks: [],
};

function withPlayer(engine: Engine, id = 'p1'): void {
  engine.store.addEntity({
    id,
    blueprintId: 'bp',
    type: 'player',
    name: 'P1',
    tags: [],
    stats: {},
    resources: {},
    statuses: [],
  });
  engine.store.state.playerId = id;
}

function moduleWithVerb(
  id: string,
  verb: string,
  handler: (action: ActionIntent) => ResolvedEvent[] | unknown,
): EngineModule {
  return {
    id,
    version: '0.1.0',
    register(ctx) {
      ctx.actions.registerVerb(verb, handler as VerbHandler);
    },
  };
}

describe('F-daece5c6 — non-array verb return is isolated (does not abort the tick)', () => {
  const cases: Array<{ name: string; returned: unknown; needle: string }> = [
    { name: 'undefined', returned: undefined, needle: 'undefined' },
    { name: 'null', returned: null, needle: 'null' },
    { name: 'plain object', returned: { type: 'looks.like.an.event', payload: {} }, needle: 'object' },
    // Strings are iterable, so a `for...of` without Array.isArray would walk
    // characters and either raw-throw later or record garbage events.
    { name: 'string', returned: 'not-an-array', needle: 'string' },
  ];

  for (const { name, returned, needle } of cases) {
    it(`handler returning ${name} yields action.rejected, advances the tick, and does not throw`, () => {
      const engine = new Engine({
        manifest: { ...testManifest, modules: ['bad'] },
        seed: 1,
        modules: [moduleWithVerb('bad', 'oops', () => returned)],
      });
      withPlayer(engine);

      expect(() => engine.submitAction('oops')).not.toThrow();

      const types = engine.world.eventLog.map((e) => e.type);
      expect(types).toContain('action.declared');
      expect(types).toContain('action.rejected');
      // Terminal event is rejected, matching the throw path — not a hanging
      // declared-without-rejected/resolved log, and not action.resolved as if
      // the handler succeeded.
      expect(types).not.toContain('action.resolved');

      const rejected = engine.world.eventLog.find((e) => e.type === 'action.rejected');
      expect(rejected).toBeDefined();
      expect(rejected!.payload.verb).toBe('oops');
      expect(String(rejected!.payload.reason)).toContain('oops');
      expect(String(rejected!.payload.reason).toLowerCase()).toContain('non-array');
      expect(String(rejected!.payload.reason).toLowerCase()).toContain(needle);

      // processAction's tick/pending lifecycle is intact.
      expect(engine.tick).toBe(1);
      expect(engine.getActionLog()).toHaveLength(1);
    });
  }

  it('a later well-behaved verb still dispatches after a non-array return on the same engine', () => {
    const engine = new Engine({
      manifest: { ...testManifest, modules: ['bad'] },
      seed: 1,
      modules: [
        {
          id: 'bad',
          version: '0.1.0',
          register(ctx) {
            ctx.actions.registerVerb('oops', () => undefined as unknown as ResolvedEvent[]);
            ctx.actions.registerVerb('wave', (action: ActionIntent): ResolvedEvent[] => [
              {
                id: '',
                tick: action.issuedAtTick,
                type: 'test.waved',
                actorId: action.actorId,
                payload: {},
              },
            ]);
          },
        },
      ],
    });
    withPlayer(engine);

    engine.submitAction('oops');
    const events = engine.submitAction('wave');
    expect(events.some((e) => e.type === 'test.waved')).toBe(true);
    expect(engine.tick).toBe(2);
    expect(engine.world.eventLog.some((e) => e.type === 'test.waved')).toBe(true);
  });

  it('direct dispatch isolates a non-array return the same way (no Engine wrapper)', () => {
    const dispatcher = new ActionDispatcher();
    dispatcher.registerVerb('oops', () => undefined as unknown as ResolvedEvent[]);
    const store = new WorldStore({ manifest: testManifest, seed: 1 });
    const action: ActionIntent = {
      id: 'a1',
      actorId: 'p1',
      verb: 'oops',
      source: 'player',
      issuedAtTick: 0,
    };

    expect(() => dispatcher.dispatch(action, store)).not.toThrow();
    const rejected = store.state.eventLog.find((e) => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.verb).toBe('oops');
    expect(store.state.eventLog.some((e) => e.type === 'action.resolved')).toBe(false);
  });
});

describe('F-208d62e4 — non-object array elements and validator returns are isolated', () => {
  const handlerHoles: Array<{ name: string; returned: unknown[]; needle: string }> = [
    { name: '[null]', returned: [null], needle: 'null' },
    { name: '[undefined]', returned: [undefined], needle: 'undefined' },
  ];

  for (const { name, returned, needle } of handlerHoles) {
    it(`handler returning ${name} yields action.rejected, advances the tick, and does not throw`, () => {
      const engine = new Engine({
        manifest: { ...testManifest, modules: ['bad'] },
        seed: 1,
        modules: [moduleWithVerb('bad', 'oops', () => returned)],
      });
      withPlayer(engine);

      expect(() => engine.submitAction('oops')).not.toThrow();

      const types = engine.world.eventLog.map((e) => e.type);
      expect(types).toContain('action.declared');
      expect(types).toContain('action.rejected');
      // Same terminal as the F-daece5c6 non-array path — not a hanging
      // declared-only log, and not action.resolved as if the handler succeeded.
      expect(types).not.toContain('action.resolved');

      const rejected = engine.world.eventLog.find((e) => e.type === 'action.rejected');
      expect(rejected).toBeDefined();
      expect(rejected!.payload.verb).toBe('oops');
      expect(String(rejected!.payload.reason)).toContain('oops');
      expect(String(rejected!.payload.reason).toLowerCase()).toContain('non-object');
      expect(String(rejected!.payload.reason)).toContain('index 0');
      expect(String(rejected!.payload.reason).toLowerCase()).toContain(needle);

      expect(engine.tick).toBe(1);
      expect(engine.getActionLog()).toHaveLength(1);
    });
  }

  const validatorHoles: Array<{ name: string; returned: unknown; needle: string }> = [
    { name: 'undefined', returned: undefined, needle: 'undefined' },
    { name: 'null', returned: null, needle: 'null' },
  ];

  for (const { name, returned, needle } of validatorHoles) {
    it(`validator returning ${name} yields action.rejected, advances the tick, and does not throw`, () => {
      const engine = new Engine({
        manifest: { ...testManifest, modules: ['ok'] },
        seed: 1,
        modules: [
          moduleWithVerb('ok', 'wave', (action: ActionIntent) => [
            { id: '', tick: action.issuedAtTick, type: 'test.waved', actorId: action.actorId, payload: {} },
          ]),
        ],
      });
      withPlayer(engine);
      engine.dispatcher.registerValidator(
        () => returned as ActionValidationResult,
      );

      expect(() => engine.submitAction('wave')).not.toThrow();

      const types = engine.world.eventLog.map((e) => e.type);
      expect(types).toContain('action.declared');
      expect(types).toContain('action.rejected');
      expect(types).not.toContain('action.resolved');
      expect(types).not.toContain('test.waved');

      const rejected = engine.world.eventLog.find((e) => e.type === 'action.rejected');
      expect(rejected).toBeDefined();
      expect(rejected!.payload.verb).toBe('wave');
      expect(String(rejected!.payload.reason)).toContain('wave');
      expect(String(rejected!.payload.reason).toLowerCase()).toContain('non-object');
      expect(String(rejected!.payload.reason).toLowerCase()).toContain(needle);

      expect(engine.tick).toBe(1);
      expect(engine.getActionLog()).toHaveLength(1);
    });
  }

  it('effect applier returning [null] yields rule.effect.failed, still resolves, advances the tick', () => {
    const engine = new Engine({
      manifest: { ...testManifest, modules: ['ok'] },
      seed: 1,
      modules: [
        moduleWithVerb('ok', 'wave', (action: ActionIntent) => [
          { id: '', tick: action.issuedAtTick, type: 'test.waved', actorId: action.actorId, payload: {} },
        ]),
      ],
    });
    withPlayer(engine);
    engine.dispatcher.registerEffectApplier(
      () => [null] as unknown as ResolvedEvent[],
    );

    expect(() => engine.submitAction('wave')).not.toThrow();

    const types = engine.world.eventLog.map((e) => e.type);
    expect(types).toContain('action.declared');
    expect(types).toContain('test.waved');
    expect(types).toContain('rule.effect.failed');
    expect(types).toContain('action.resolved');

    const failed = engine.world.eventLog.find((e) => e.type === 'rule.effect.failed');
    expect(failed).toBeDefined();
    expect(String(failed!.payload.reason).toLowerCase()).toContain('non-object');
    expect(String(failed!.payload.reason)).toContain('index 0');
    expect(String(failed!.payload.reason).toLowerCase()).toContain('null');

    expect(engine.tick).toBe(1);
    expect(engine.getActionLog()).toHaveLength(1);
  });

  it('handler returning [valid, null] rejects without recording the valid element', () => {
    const engine = new Engine({
      manifest: { ...testManifest, modules: ['bad'] },
      seed: 1,
      modules: [
        moduleWithVerb('bad', 'oops', (action: ActionIntent) => [
          { id: '', tick: action.issuedAtTick, type: 'test.should-not-land', actorId: action.actorId, payload: {} },
          null,
        ]),
      ],
    });
    withPlayer(engine);

    expect(() => engine.submitAction('oops')).not.toThrow();
    expect(engine.world.eventLog.some((e) => e.type === 'test.should-not-land')).toBe(false);
    const rejected = engine.world.eventLog.find((e) => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(String(rejected!.payload.reason)).toContain('index 1');
    expect(engine.world.eventLog.some((e) => e.type === 'action.resolved')).toBe(false);
    expect(engine.tick).toBe(1);
  });

  // Wave 11 sibling: isEventObject used to admit any non-null non-array object.
  // recordEvent then EventBus.emit does type.indexOf and TypeError-aborts the
  // tick declared-only. Reject before recordEvent; name the verb and index.
  const typelessHoles: Array<{ name: string; returned: unknown[] }> = [
    { name: '[{ payload: {} }] (no type)', returned: [{ payload: {} }] },
    { name: '[{ type: 42, payload: {} }]', returned: [{ type: 42, payload: {} }] },
    { name: '[{ type: "", payload: {} }]', returned: [{ type: '', payload: {} }] },
  ];

  for (const { name, returned } of typelessHoles) {
    it(`handler returning ${name} yields action.rejected, advances the tick, and does not throw`, () => {
      const engine = new Engine({
        manifest: { ...testManifest, modules: ['bad'] },
        seed: 1,
        modules: [moduleWithVerb('bad', 'oops', () => returned)],
      });
      withPlayer(engine);

      expect(() => engine.submitAction('oops')).not.toThrow();

      const types = engine.world.eventLog.map((e) => e.type);
      expect(types).toContain('action.declared');
      expect(types).toContain('action.rejected');
      expect(types).not.toContain('action.resolved');
      // The typeless object must not land in the log (recordEvent would stamp
      // it then emit would throw, leaving declared-without-resolved).
      expect(engine.world.eventLog.every((e) => typeof e.type === 'string' && e.type.length > 0)).toBe(true);

      const rejected = engine.world.eventLog.find((e) => e.type === 'action.rejected');
      expect(rejected).toBeDefined();
      expect(rejected!.payload.verb).toBe('oops');
      expect(String(rejected!.payload.reason)).toContain('oops');
      expect(String(rejected!.payload.reason)).toContain('index 0');
      expect(String(rejected!.payload.reason).toLowerCase()).toMatch(/type/);

      expect(engine.tick).toBe(1);
      expect(engine.getActionLog()).toHaveLength(1);
    });
  }

  it('effect applier returning [{ payload: {} }] yields rule.effect.failed, still resolves, advances the tick', () => {
    const engine = new Engine({
      manifest: { ...testManifest, modules: ['ok'] },
      seed: 1,
      modules: [
        moduleWithVerb('ok', 'wave', (action: ActionIntent) => [
          { id: '', tick: action.issuedAtTick, type: 'test.waved', actorId: action.actorId, payload: {} },
        ]),
      ],
    });
    withPlayer(engine);
    engine.dispatcher.registerEffectApplier(
      () => [{ payload: {} }] as unknown as ResolvedEvent[],
    );

    expect(() => engine.submitAction('wave')).not.toThrow();

    const types = engine.world.eventLog.map((e) => e.type);
    expect(types).toContain('action.declared');
    expect(types).toContain('test.waved');
    expect(types).toContain('rule.effect.failed');
    expect(types).toContain('action.resolved');
    expect(engine.world.eventLog.every((e) => typeof e.type === 'string' && e.type.length > 0)).toBe(true);

    const failed = engine.world.eventLog.find((e) => e.type === 'rule.effect.failed');
    expect(failed).toBeDefined();
    expect(String(failed!.payload.reason)).toContain('index 0');
    expect(String(failed!.payload.reason).toLowerCase()).toMatch(/type/);

    expect(engine.tick).toBe(1);
    expect(engine.getActionLog()).toHaveLength(1);
  });
});

// Wave 13 sibling: a frozen/sealed/non-extensible event with a valid type
// still passes isEventObject, then recordEvent's `event.id =` TypeError-aborts
// the tick declared-only. Copy at the choke point; do not reject.
describe('F-208d62e4 — frozen handler/effect events are copied, not mutated', () => {
  it("handler returning [Object.freeze({ type: 'test.ok', payload: {} })] records a stamped copy, advances the tick, and does not throw", () => {
    const frozen = Object.freeze({ type: 'test.ok', payload: {} });
    const engine = new Engine({
      manifest: { ...testManifest, modules: ['ok'] },
      seed: 1,
      modules: [moduleWithVerb('ok', 'wave', () => [frozen])],
    });
    withPlayer(engine);

    expect(() => engine.submitAction('wave')).not.toThrow();

    const types = engine.world.eventLog.map((e) => e.type);
    expect(types).toContain('action.declared');
    expect(types).toContain('test.ok');
    expect(types).toContain('action.resolved');
    expect(types).not.toContain('action.rejected');

    const logged = engine.world.eventLog.find((e) => e.type === 'test.ok');
    expect(logged).toBeDefined();
    expect(logged).not.toBe(frozen);
    expect(typeof logged!.id).toBe('string');
    expect(logged!.id.length).toBeGreaterThan(0);
    expect(Object.isExtensible(logged!)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(frozen, 'id')).toBe(false);

    expect(engine.tick).toBe(1);
    expect(engine.getActionLog()).toHaveLength(1);
  });

  it('effect applier returning a frozen event records a stamped copy, still resolves, advances the tick', () => {
    const frozen = Object.freeze({ type: 'test.effect.ok', payload: {} });
    const engine = new Engine({
      manifest: { ...testManifest, modules: ['ok'] },
      seed: 1,
      modules: [
        moduleWithVerb('ok', 'wave', (action: ActionIntent) => [
          { id: '', tick: action.issuedAtTick, type: 'test.waved', actorId: action.actorId, payload: {} },
        ]),
      ],
    });
    withPlayer(engine);
    engine.dispatcher.registerEffectApplier(() => [frozen] as unknown as ResolvedEvent[]);

    expect(() => engine.submitAction('wave')).not.toThrow();

    const types = engine.world.eventLog.map((e) => e.type);
    expect(types).toContain('action.declared');
    expect(types).toContain('test.waved');
    expect(types).toContain('test.effect.ok');
    expect(types).toContain('action.resolved');
    expect(types).not.toContain('rule.effect.failed');

    const logged = engine.world.eventLog.find((e) => e.type === 'test.effect.ok');
    expect(logged).toBeDefined();
    expect(logged).not.toBe(frozen);
    expect(typeof logged!.id).toBe('string');
    expect(logged!.id.length).toBeGreaterThan(0);

    expect(engine.tick).toBe(1);
    expect(engine.getActionLog()).toHaveLength(1);
  });
});

describe('F-b71bccf1 — registerVerb fails loud on duplicate verb id', () => {
  it('registerVerb throws on a duplicate verb instead of silently overwriting', () => {
    const taggedFirst = (): ResolvedEvent[] => [
      { id: 'from-first', tick: 0, type: 'greet.from-first', payload: {} },
    ];
    const taggedSecond = (): ResolvedEvent[] => [
      { id: 'from-second', tick: 0, type: 'greet.from-second', payload: {} },
    ];
    const dispatcher = new ActionDispatcher();
    dispatcher.registerVerb('greet', taggedFirst);

    expect(() => dispatcher.registerVerb('greet', taggedSecond)).toThrow(/greet/);
    expect(() => dispatcher.registerVerb('greet', taggedSecond)).toThrow(/already registered/);

    // The original registration must survive the failed re-registration.
    const store = new WorldStore({ manifest: testManifest, seed: 1 });
    dispatcher.dispatch(
      { id: 'a', actorId: 'p', verb: 'greet', source: 'player', issuedAtTick: 0 },
      store,
    );
    expect(store.state.eventLog.some((e) => e.type === 'greet.from-first')).toBe(true);
    expect(store.state.eventLog.some((e) => e.type === 'greet.from-second')).toBe(false);
  });

  it('two modules registering the same verb fail loud at construction (first handler is not dropped)', () => {
    const a: EngineModule = {
      id: 'mod-a',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('greet', (): ResolvedEvent[] => [
          { id: '', tick: 0, type: 'greet.from-a', payload: {} },
        ]);
      },
    };
    const b: EngineModule = {
      id: 'mod-b',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('greet', (): ResolvedEvent[] => [
          { id: '', tick: 0, type: 'greet.from-b', payload: {} },
        ]);
      },
    };

    expect(
      () =>
        new Engine({
          manifest: { ...testManifest, modules: ['mod-a', 'mod-b'] },
          seed: 1,
          modules: [a, b],
        }),
    ).toThrow(/greet/);
  });

  it('registerVerb with { override: true } intentionally replaces an existing handler', () => {
    const dispatcher = new ActionDispatcher();
    const first = (): ResolvedEvent[] => [
      { id: 'a', tick: 0, type: 'greet.from-first', payload: {} },
    ];
    const second = (): ResolvedEvent[] => [
      { id: 'b', tick: 0, type: 'greet.from-second', payload: {} },
    ];
    dispatcher.registerVerb('greet', first);
    expect(() => dispatcher.registerVerb('greet', second, { override: true })).not.toThrow();

    const store = new WorldStore({ manifest: testManifest, seed: 1 });
    dispatcher.dispatch(
      { id: 'a', actorId: 'p', verb: 'greet', source: 'player', issuedAtTick: 0 },
      store,
    );
    expect(store.state.eventLog.some((e) => e.type === 'greet.from-second')).toBe(true);
    expect(store.state.eventLog.some((e) => e.type === 'greet.from-first')).toBe(false);
  });

  it('a distinct verb still registers after a duplicate attempt was rejected', () => {
    const dispatcher = new ActionDispatcher();
    dispatcher.registerVerb('greet', () => []);
    expect(() => dispatcher.registerVerb('greet', () => [])).toThrow();
    dispatcher.registerVerb('wave', () => []);
    expect(dispatcher.hasVerb('wave')).toBe(true);
    expect(dispatcher.getRegisteredVerbs().sort()).toEqual(['greet', 'wave']);
  });
});
