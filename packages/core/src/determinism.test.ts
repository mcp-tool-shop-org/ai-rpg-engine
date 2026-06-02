// Determinism + save/load vertical — Wave A1.
//
// These tests pin the engine's headline promise: "same seed + same action
// sequence => byte-identical events/state", and the save/load invariants that
// make that promise survive a fresh process. They deliberately use NO manual
// id-counter reset — determinism must be genuine, not arranged by a test hook.

import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { WorldStore, SAVE_VERSION, SaveLoadError, migrateSaveState } from './world.js';
import { SeededRNG, RngError } from './rng.js';
import type { EngineModule, ActionIntent, WorldState, ResolvedEvent } from './types.js';

const testManifest = {
  id: 'determinism-game',
  title: 'Determinism Game',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: ['echo'],
  contentPacks: [],
};

// A module whose verb handler emits an event via the makeEvent path (id left
// empty, stamped by recordEvent). This exercises the real choke point that
// content packs and combat modules use.
function echoModule(): EngineModule {
  return {
    id: 'echo',
    version: '0.1.0',
    register(ctx) {
      ctx.actions.registerVerb('echo', (action: ActionIntent): ResolvedEvent[] => {
        return [
          {
            // Intentionally no id — recordEvent must assign a deterministic one.
            id: '',
            tick: action.issuedAtTick,
            type: 'test.echo',
            actorId: action.actorId,
            payload: { msg: 'echoed' },
          },
        ];
      });
    },
  };
}

function freshEngine(seed: number): Engine {
  const engine = new Engine({
    manifest: testManifest,
    seed,
    modules: [echoModule()],
  });
  engine.store.state.playerId = 'hero';
  return engine;
}

describe('core-001 — per-instance deterministic id counter', () => {
  it('genId draws from per-world meta.idCounter and serializes', () => {
    const store = new WorldStore({ manifest: testManifest, seed: 1 });
    // Constructor minted worldId from the same counter → idCounter is now 1.
    expect(store.state.meta.idCounter).toBe(1);
    expect(store.state.meta.worldId).toBe('world_1');
    expect(store.genId('evt')).toBe('evt_2');
    expect(store.state.meta.idCounter).toBe(2);
  });

  it('two fresh engines, same seed + same actions => byte-identical ids AND serialize()', () => {
    const a = freshEngine(42);
    const b = freshEngine(42);

    a.submitAction('echo');
    a.submitAction('echo');
    b.submitAction('echo');
    b.submitAction('echo');

    const idsA = a.world.eventLog.map((e) => e.id);
    const idsB = b.world.eventLog.map((e) => e.id);
    expect(idsA).toEqual(idsB);
    // No empty ids leaked through the choke point.
    expect(idsA.every((id) => id.length > 0)).toBe(true);

    // Full byte-identical engine serialization (the headline guarantee).
    expect(a.serialize()).toBe(b.serialize());
  });

  it('a second engine constructed AFTER the first does not share the first counter', () => {
    // The bug: a process-global counter means engine B continues A's sequence.
    const a = freshEngine(42);
    a.submitAction('echo');
    a.submitAction('echo');

    const b = freshEngine(42); // built after A already advanced its counter
    b.submitAction('echo');
    b.submitAction('echo');

    expect(a.serialize()).toBe(b.serialize());
  });

  it('event ids minted after deserialize do NOT collide with the loaded eventLog', () => {
    const a = freshEngine(7);
    a.submitAction('echo');
    a.submitAction('echo');
    const saved = a.serialize();
    const loadedIds = new Set(JSON.parse(saved).world.state.eventLog.map((e: ResolvedEvent) => e.id));

    const restored = Engine.deserialize(saved, { modules: [echoModule()] });
    restored.submitAction('echo'); // mints new ids from the restored counter

    const newIds = restored.world.eventLog.map((e) => e.id);
    // Every brand-new id beyond the loaded set must be unique vs the loaded log.
    const collisions = newIds.filter((id, i) => newIds.indexOf(id) !== i);
    expect(collisions).toEqual([]);
    // And the freshly emitted ids are not duplicates of pre-load ids by counter.
    const post = newIds.slice(loadedIds.size);
    for (const id of post) {
      // Only fail if an id appears MORE than once across the whole log.
      expect(newIds.filter((x) => x === id).length).toBe(1);
    }
  });

  it('recordEvent owns id assignment when an event arrives with an empty id', () => {
    // This is the makeEvent contract (make-event.ts sets id: '') exercised at
    // the core choke point without importing across packages.
    const store = new WorldStore({ manifest: testManifest, seed: 1 });
    const before = store.state.meta.idCounter;
    store.recordEvent({ id: '', tick: 0, type: 'test.raw', payload: {} });
    const recorded = store.state.eventLog[store.state.eventLog.length - 1];
    expect(recorded.id).toBe(`evt_${(before + 1).toString(36)}`);
    expect(store.state.meta.idCounter).toBe(before + 1);
  });

  it('action ids come from the per-instance counter (serialized actionLog is replayable)', () => {
    const a = freshEngine(99);
    const b = freshEngine(99);
    a.submitAction('echo');
    b.submitAction('echo');
    const logA = a.getActionLog().map((x) => x.id);
    const logB = b.getActionLog().map((x) => x.id);
    expect(logA).toEqual(logB);
    expect(logA[0].startsWith('act_')).toBe(true);
  });
});

describe('core-002 — Engine.deserialize restores saved state', () => {
  it('restored engine deep-equals the saved world state', () => {
    const a = freshEngine(123);
    a.submitAction('echo');
    a.submitAction('echo');
    const saved = a.serialize();

    const restored = Engine.deserialize(saved, { modules: [echoModule()] });

    const savedState = JSON.parse(saved).world.state as WorldState;
    expect(restored.world.entities).toEqual(savedState.entities);
    expect(restored.world.eventLog).toEqual(savedState.eventLog);
    expect(restored.world.globals).toEqual(savedState.globals);
    expect(restored.world.pending).toEqual(savedState.pending);
    expect(restored.world.meta.idCounter).toBe(savedState.meta.idCounter);
    expect(restored.world.meta.tick).toBe(savedState.meta.tick);
    // rngState round-trips: re-serializing yields the same bytes.
    expect(restored.serialize()).toBe(saved);
  });

  it('continuing to act after deserialize stays deterministic vs an un-saved twin', () => {
    // Engine A: act, save, load, act more.
    const a = freshEngine(55);
    a.submitAction('echo');
    const saved = a.serialize();
    const loaded = Engine.deserialize(saved, { modules: [echoModule()] });
    loaded.submitAction('echo');

    // Engine B: act twice straight through (no save/load).
    const b = freshEngine(55);
    b.submitAction('echo');
    b.submitAction('echo');

    expect(loaded.serialize()).toBe(b.serialize());
  });

  it('throws a structured error on malformed engine save', () => {
    expect(() => Engine.deserialize('not json')).toThrow(SaveLoadError);
    try {
      Engine.deserialize('{"nope":true}');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).hint).toBeTruthy();
    }
  });
});

describe('core-003 — save version check + migration', () => {
  it('stamps the current SAVE_VERSION on new saves', () => {
    const store = new WorldStore({ manifest: testManifest, seed: 1 });
    expect(store.state.meta.saveVersion).toBe(SAVE_VERSION);
  });

  it('same-version round-trip works', () => {
    const a = freshEngine(3);
    a.submitAction('echo');
    const restored = Engine.deserialize(a.serialize(), { modules: [echoModule()] });
    expect(restored.world.meta.saveVersion).toBe(SAVE_VERSION);
  });

  it('rejects a newer-than-supported save with a structured error', () => {
    const a = freshEngine(3);
    a.submitAction('echo');
    const parsed = JSON.parse(a.serialize());
    parsed.world.state.meta.saveVersion = '999.0.0';
    expect(() => Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] }))
      .toThrow(SaveLoadError);
    try {
      Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] });
    } catch (e) {
      expect((e as SaveLoadError).code).toBe('SAVE_VERSION_UNSUPPORTED');
      expect((e as SaveLoadError).message).toContain('999.0.0');
    }
  });

  it('rejects an older save with no migration path (structured error, no silent assign)', () => {
    const store = new WorldStore({ manifest: testManifest, seed: 1 });
    store.state.meta.saveVersion = '0.0.1'; // older than SAVE_VERSION, no migration registered
    expect(() => migrateSaveState(store.state)).toThrow(SaveLoadError);
  });
});

describe('core-004 — deserialize preserves live EventBus subscriptions', () => {
  it('a deserialized engine still delivers events to module subscribers', () => {
    const received: string[] = [];
    const listenerModule: EngineModule = {
      id: 'listener',
      version: '0.1.0',
      register(ctx) {
        ctx.events.on('test.echo', (event) => {
          received.push(event.id);
        });
      },
    };

    const a = freshEngine(8);
    a.submitAction('echo');
    const saved = a.serialize();

    // Build with BOTH modules so 'echo' verb + 'listener' subscription exist.
    const restored = Engine.deserialize(saved, { modules: [echoModule(), listenerModule] });
    received.length = 0; // ignore anything from construction
    restored.submitAction('echo');

    // The listener (subscribed on the live bus that deserialize threaded in)
    // must have fired for the post-load echo event.
    expect(received.length).toBeGreaterThan(0);
  });
});

describe('core-005 — SeededRNG range guards', () => {
  it('int(min,max) with min > max throws a structured RngError (no silent below-min)', () => {
    const rng = new SeededRNG(1);
    expect(() => rng.int(5, 3)).toThrow(RngError);
    try {
      rng.int(5, 3);
    } catch (e) {
      expect((e as RngError).code).toBe('RNG_RANGE_INVALID');
      expect((e as RngError).hint).toBeTruthy();
    }
  });

  it('int with non-finite bounds throws', () => {
    const rng = new SeededRNG(1);
    expect(() => rng.int(NaN, 5)).toThrow(RngError);
  });

  it('int(min,max) with min === max returns min and is valid', () => {
    const rng = new SeededRNG(1);
    expect(rng.int(4, 4)).toBe(4);
  });

  it('pick on an empty array throws a structured RngError', () => {
    const rng = new SeededRNG(1);
    expect(() => rng.pick([])).toThrow(RngError);
    try {
      rng.pick([]);
    } catch (e) {
      expect((e as RngError).code).toBe('RNG_EMPTY_INPUT');
    }
  });

  it('pick on a non-empty array still works deterministically', () => {
    const r1 = new SeededRNG(42);
    const r2 = new SeededRNG(42);
    const arr = ['a', 'b', 'c', 'd'] as const;
    expect(r1.pick(arr)).toBe(r2.pick(arr));
  });
});
