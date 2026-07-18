// Save-load hardening — dogfood v2.5 findings PC-2, PC-3, PC-6.
//
// PC-2: `Engine.deserialize` asserted the save meta BEFORE the migration chain
// ran, while `WorldStore.deserialize` asserts AFTER — so the two public load
// paths disagreed, and the Engine path foreclosed exactly the legacy-backfill
// migrations the post-migration assert exists to allow. These tests pin that a
// migration may backfill a missing meta field and BOTH load paths accept the
// legacy save — without weakening the same-version guards.
//
// PC-3: `meta.seed`/`meta.tick` were never type-validated on deserialize (only
// rngState/gameId/activeRuleset/activeModules were). A non-numeric tick loads
// clean and then `advanceTick()`'s `tick++` yields NaN — which is sticky, so
// every subsequent event carries `tick: NaN` with zero signal. These pin the
// structured SAVE_MALFORMED rejection, mirroring the rngState guard (C3).
//
// PC-6: the `migrateSaveState` forward-walk loop (sequential apply, per-step
// saveVersion advance, 100-iteration convergence guard) had NO test running a
// SUCCESSFUL migration — only the two rejection branches were covered. The
// first real SAVE_MIGRATIONS entry would have run through a completely
// unexercised mechanism. Fixture migrations are injected per-test and removed
// in afterEach — nothing fake ships in production code.

import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from './engine.js';
import {
  WorldStore,
  SAVE_VERSION,
  SAVE_MIGRATIONS,
  SaveLoadError,
  migrateSaveState,
} from './world.js';
import type { EngineModule, ActionIntent, ResolvedEvent, WorldState } from './types.js';

const testManifest = {
  id: 'save-hardening-game',
  title: 'Save Hardening',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: ['echo'],
  contentPacks: [],
};

function echoModule(): EngineModule {
  return {
    id: 'echo',
    version: '0.1.0',
    register(ctx) {
      ctx.actions.registerVerb('echo', (action: ActionIntent): ResolvedEvent[] => [
        { id: '', tick: action.issuedAtTick, type: 'test.echo', actorId: action.actorId, payload: {} },
      ]);
    },
  };
}

function savedGame(seed: number): string {
  const engine = new Engine({ manifest: testManifest, seed, modules: [echoModule()] });
  engine.store.addEntity({
    id: 'hero', blueprintId: 'bp', type: 'player', name: 'Hero',
    tags: [], stats: {}, resources: {}, statuses: [],
  });
  engine.store.state.playerId = 'hero';
  engine.submitAction('echo');
  return engine.serialize();
}

// Fixture-migration bookkeeping: SAVE_MIGRATIONS is a mutable module-level
// registry, so every key a test injects is recorded and removed afterEach —
// a leaked fixture migration must never bleed into other tests (or ship).
const injectedVersions: string[] = [];
function injectMigration(fromVersion: string, migrate: (state: WorldState) => WorldState): void {
  SAVE_MIGRATIONS[fromVersion] = migrate;
  injectedVersions.push(fromVersion);
}
afterEach(() => {
  for (const v of injectedVersions.splice(0)) {
    delete SAVE_MIGRATIONS[v];
  }
});

describe('pc2 — both load paths assert meta AFTER migration (legacy backfill works)', () => {
  it('pc2-001: Engine.deserialize accepts a legacy save whose migration backfills a missing meta field', () => {
    const parsed = JSON.parse(savedGame(11));
    // A legacy save predating the activeModules field, at an older version.
    delete parsed.world.state.meta.activeModules;
    parsed.world.state.meta.saveVersion = '0.900.0';

    injectMigration('0.900.0', (state) => {
      state.meta.activeModules = state.meta.activeModules ?? ['echo'];
      state.meta.saveVersion = SAVE_VERSION;
      return state;
    });

    // At HEAD this threw SAVE_MALFORMED: the Engine path asserted the
    // PRE-migration meta, so the backfill migration never got the chance.
    const loaded = Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] });
    expect(loaded.world.meta.activeModules).toEqual(['echo']);
    expect(loaded.world.meta.saveVersion).toBe(SAVE_VERSION);

    // The loaded engine is fully wired: the backfilled save keeps playing.
    const events = loaded.submitAction('echo');
    expect(events.some((e) => e.type === 'test.echo')).toBe(true);
  });

  it('pc2-002: WorldStore.deserialize accepts the same legacy save (path parity)', () => {
    const parsed = JSON.parse(savedGame(11));
    delete parsed.world.state.meta.activeModules;
    parsed.world.state.meta.saveVersion = '0.900.0';

    injectMigration('0.900.0', (state) => {
      state.meta.activeModules = state.meta.activeModules ?? ['echo'];
      state.meta.saveVersion = SAVE_VERSION;
      return state;
    });

    const restored = WorldStore.deserialize(JSON.stringify(parsed.world));
    expect(restored.state.meta.activeModules).toEqual(['echo']);
    expect(restored.state.meta.saveVersion).toBe(SAVE_VERSION);
  });

  it('pc2-003: guard NOT weakened — a same-version save missing activeModules still fails both paths', () => {
    // No migration can run (already at SAVE_VERSION), so the post-migration
    // assert must still reject — deferring the assert is not disabling it.
    const engineSave = JSON.parse(savedGame(12));
    delete engineSave.world.state.meta.activeModules;
    try {
      Engine.deserialize(JSON.stringify(engineSave), { modules: [echoModule()] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('activeModules');
    }

    try {
      WorldStore.deserialize(JSON.stringify(engineSave.world));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('activeModules');
    }
  });
});

describe('pc3 — meta.seed / meta.tick are type-validated on deserialize', () => {
  it('pc3-001: WorldStore.deserialize rejects a non-numeric meta.tick (string) with SAVE_MALFORMED naming the field', () => {
    const parsed = JSON.parse(savedGame(13));
    parsed.world.state.meta.tick = 'abc';
    try {
      WorldStore.deserialize(JSON.stringify(parsed.world));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('tick');
      expect((e as SaveLoadError).hint).toBeTruthy();
    }
  });

  it('pc3-002: Engine.deserialize rejects a non-numeric meta.tick (the sticky-NaN path)', () => {
    const parsed = JSON.parse(savedGame(13));
    parsed.world.state.meta.tick = 'abc';
    expect(() => Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] }))
      .toThrow(SaveLoadError);
  });

  it('pc3-003: WorldStore.deserialize rejects a null meta.tick', () => {
    const parsed = JSON.parse(savedGame(13));
    parsed.world.state.meta.tick = null;
    expect(() => WorldStore.deserialize(JSON.stringify(parsed.world))).toThrow(SaveLoadError);
  });

  it('pc3-004: WorldStore.deserialize rejects a non-numeric meta.seed (object) with SAVE_MALFORMED naming the field', () => {
    const parsed = JSON.parse(savedGame(13));
    parsed.world.state.meta.seed = {};
    try {
      WorldStore.deserialize(JSON.stringify(parsed.world));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('seed');
    }
  });

  it('pc3-005: Engine.deserialize rejects a non-numeric meta.seed (string)', () => {
    const parsed = JSON.parse(savedGame(13));
    parsed.world.state.meta.seed = 'not-a-seed';
    expect(() => Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] }))
      .toThrow(SaveLoadError);
  });

  it('pc3-006: control — a valid engine-produced save still round-trips byte-identically', () => {
    const saved = savedGame(14);
    const loaded = Engine.deserialize(saved, { modules: [echoModule()] });
    expect(loaded.serialize()).toBe(saved);
  });
});

describe('pc6 — migrateSaveState success path (the loop itself, not just its rejections)', () => {
  it('pc6-001: a registered forward migration runs and upgrades the state through WorldStore.deserialize', () => {
    const store = new WorldStore({ manifest: testManifest, seed: 5 });
    store.setGlobal('progress', 3);
    const parsed = JSON.parse(store.serialize());
    parsed.state.meta.saveVersion = '0.901.0';

    injectMigration('0.901.0', (state) => {
      // A realistic shape migration: rename a global.
      state.globals.progressPoints = state.globals.progress ?? 0;
      delete state.globals.progress;
      state.meta.saveVersion = SAVE_VERSION;
      return state;
    });

    const restored = WorldStore.deserialize(JSON.stringify(parsed));
    expect(restored.getGlobal('progressPoints')).toBe(3);
    expect(restored.getGlobal('progress')).toBeUndefined();
    expect(restored.state.meta.saveVersion).toBe(SAVE_VERSION);
  });

  it('pc6-002: a multi-step chain applies migrations in order, advancing saveVersion step by step', () => {
    const store = new WorldStore({ manifest: testManifest, seed: 6 });
    store.state.meta.saveVersion = '0.902.0';

    // Each fixture records the version it OBSERVED on entry, proving the loop
    // hands each migration a state at exactly the version its key names.
    const observed: string[] = [];
    injectMigration('0.902.0', (state) => {
      observed.push(state.meta.saveVersion);
      state.meta.saveVersion = '0.903.0';
      return state;
    });
    injectMigration('0.903.0', (state) => {
      observed.push(state.meta.saveVersion);
      state.meta.saveVersion = SAVE_VERSION;
      return state;
    });

    const migrated = migrateSaveState(store.state);
    expect(observed).toEqual(['0.902.0', '0.903.0']);
    expect(migrated.meta.saveVersion).toBe(SAVE_VERSION);
  });

  it('pc6-003: the convergence guard fires with a structured error when a migration fails to advance saveVersion', () => {
    const store = new WorldStore({ manifest: testManifest, seed: 7 });
    store.state.meta.saveVersion = '0.904.0';

    // A buggy migration that never advances meta.saveVersion — the loop must
    // halt via the 100-iteration guard, not spin forever.
    injectMigration('0.904.0', (state) => state);

    try {
      migrateSaveState(store.state);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_VERSION_UNSUPPORTED');
      expect((e as SaveLoadError).message).toContain('did not converge');
      expect((e as SaveLoadError).message).toContain('0.904.0');
      expect((e as SaveLoadError).hint).toBeTruthy();
    }
  });

  it('pc6-004: no fixture migration leaks — SAVE_MIGRATIONS is empty between tests', () => {
    // Meta-test for the fixture discipline itself: afterEach must have removed
    // every injected key, so production SAVE_MIGRATIONS stays exactly as
    // shipped (empty at v1.0.0).
    expect(Object.keys(SAVE_MIGRATIONS)).toEqual([]);
  });
});

// dogfood/v2.6 core-spine amend, F-e53d5e91: Engine.deserialize read
// `data.actionLog` with an `as`-cast and no runtime check, then did
// `engine.actionLog = data.actionLog ? [...data.actionLog] : [];`. Every
// OTHER field this method reads from a save is validated with a structured
// SaveLoadError before use (assertSaveMetaShape, the rngState guard); this
// pins the same treatment for actionLog: a non-iterable truthy value
// (number/boolean/plain object) must raise SAVE_MALFORMED instead of a raw
// TypeError, and a JSON STRING must be rejected instead of silently spreading
// into an array of single characters.
describe('core-spine — Engine.deserialize validates actionLog shape (F-e53d5e91)', () => {
  it('rejects a non-array actionLog (plain object) with SAVE_MALFORMED naming the field', () => {
    const parsed = JSON.parse(savedGame(21));
    parsed.actionLog = { not: 'an array' };
    try {
      Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('actionLog');
      expect((e as SaveLoadError).hint).toBeTruthy();
    }
  });

  it('rejects a non-array actionLog (number) instead of raw-throwing a TypeError out of the spread', () => {
    const parsed = JSON.parse(savedGame(21));
    parsed.actionLog = 42;
    expect(() => Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] }))
      .toThrow(SaveLoadError);
  });

  it('rejects a non-array actionLog (boolean)', () => {
    const parsed = JSON.parse(savedGame(21));
    parsed.actionLog = true;
    expect(() => Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] }))
      .toThrow(SaveLoadError);
  });

  it('rejects a STRING actionLog instead of silently spreading into an array of single characters', () => {
    const parsed = JSON.parse(savedGame(21));
    parsed.actionLog = 'not-an-array-but-iterable';
    try {
      Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
    }
  });

  it('accepts a missing actionLog (defaults to [])', () => {
    const parsed = JSON.parse(savedGame(21));
    delete parsed.actionLog;
    const loaded = Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] });
    expect(loaded.getActionLog()).toEqual([]);
  });

  it('accepts a null actionLog (defaults to [])', () => {
    const parsed = JSON.parse(savedGame(21));
    parsed.actionLog = null;
    const loaded = Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] });
    expect(loaded.getActionLog()).toEqual([]);
  });

  it('control — a valid actionLog array still round-trips through deserialize', () => {
    const saved = savedGame(22);
    const parsed = JSON.parse(saved);
    expect(Array.isArray(parsed.actionLog)).toBe(true);
    expect(parsed.actionLog.length).toBeGreaterThan(0);
    const loaded = Engine.deserialize(saved, { modules: [echoModule()] });
    expect(loaded.getActionLog()).toEqual(parsed.actionLog);
  });
});

// dogfood/v2.6 core-spine amend, F-71a4c9de: WorldStore.deserialize validated
// rngState, saveVersion, and every reconstruction-critical meta field with a
// structured SaveLoadError — then adopted the ACTUAL game-state payload
// (entities/zones/quests/factions/globals/modules/eventLog/pending/playerId/
// locationId) via a blind `Object.assign(store.state, migratedState)` with
// ZERO shape validation. Reproduced failure classes:
//   (1) `playerId: 99` (number) loads clean, and `entities[99]` silently
//       reads `entities["99"]` (JS object keys are strings) — a WRONG-entity
//       identity corruption with no signal.
//   (2) `entities: null` loads clean, then getEntity() raw-throws a
//       TypeError far downstream; `eventLog: "some string"` loads clean, then
//       recordEvent() raw-throws `push is not a function`.
// These pin the same structured SAVE_MALFORMED treatment every sibling field
// already gets: fail loud + named-field at the load boundary.
describe('core-spine — WorldStore.deserialize validates bulk state shape (F-71a4c9de)', () => {
  it('rejects a numeric playerId instead of silently resolving a WRONG entity', () => {
    const parsed = JSON.parse(savedGame(31));
    // An unrelated entity whose id happens to be the string "99" — the exact
    // silent-misresolution target from the finding.
    parsed.world.state.entities['99'] = {
      ...parsed.world.state.entities.hero, id: '99', name: 'Impostor',
    };
    parsed.world.state.playerId = 99;
    try {
      WorldStore.deserialize(JSON.stringify(parsed.world));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('playerId');
      expect((e as SaveLoadError).hint).toBeTruthy();
    }
  });

  it('rejects a playerId that does not resolve to any entity in the save', () => {
    const parsed = JSON.parse(savedGame(31));
    parsed.world.state.playerId = 'ghost-of-a-renamed-entity';
    try {
      WorldStore.deserialize(JSON.stringify(parsed.world));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('playerId');
    }
  });

  it('accepts the empty-string playerId of a pre-player save (constructor default)', () => {
    // A fresh store serialized before any player entity exists carries
    // playerId '' and entities {} — that is a legitimate engine-produced
    // save (the pc6 fixtures rely on it) and must keep loading.
    const store = new WorldStore({ manifest: testManifest, seed: 41 });
    const restored = WorldStore.deserialize(store.serialize());
    expect(restored.state.playerId).toBe('');
  });

  it('rejects entities: null (previously loaded clean, then getEntity raw-threw downstream)', () => {
    const parsed = JSON.parse(savedGame(32));
    parsed.world.state.entities = null;
    try {
      WorldStore.deserialize(JSON.stringify(parsed.world));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('entities');
      expect((e as SaveLoadError).hint).toBeTruthy();
    }
  });

  it('rejects entities as an array (typeof [] === "object" must not slip through)', () => {
    const parsed = JSON.parse(savedGame(32));
    parsed.world.state.entities = [{ id: 'hero' }];
    expect(() => WorldStore.deserialize(JSON.stringify(parsed.world))).toThrow(SaveLoadError);
  });

  it('rejects a string eventLog (previously loaded clean, then recordEvent raw-threw "push is not a function")', () => {
    const parsed = JSON.parse(savedGame(32));
    parsed.world.state.eventLog = 'some string';
    try {
      WorldStore.deserialize(JSON.stringify(parsed.world));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('eventLog');
    }
  });

  it('rejects a non-array pending', () => {
    const parsed = JSON.parse(savedGame(32));
    parsed.world.state.pending = { sneaky: true };
    expect(() => WorldStore.deserialize(JSON.stringify(parsed.world))).toThrow(SaveLoadError);
  });

  it('rejects null/array/scalar for every remaining bulk container, naming the field', () => {
    const corruptions: Array<[string, unknown]> = [
      ['zones', null],
      ['quests', 42],
      ['factions', 'nope'],
      ['globals', []],
      ['modules', true],
    ];
    for (const [field, bad] of corruptions) {
      const parsed = JSON.parse(savedGame(33));
      parsed.world.state[field] = bad;
      try {
        WorldStore.deserialize(JSON.stringify(parsed.world));
        throw new Error(`should have thrown for ${field}`);
      } catch (e) {
        expect(e, field).toBeInstanceOf(SaveLoadError);
        expect((e as SaveLoadError).code, field).toBe('SAVE_MALFORMED');
        expect((e as SaveLoadError).message, field).toContain(field);
      }
    }
  });

  it('rejects a non-string locationId', () => {
    const parsed = JSON.parse(savedGame(33));
    parsed.world.state.locationId = 7;
    try {
      WorldStore.deserialize(JSON.stringify(parsed.world));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).message).toContain('locationId');
    }
  });

  it('Engine.deserialize rejects the same corruption (single load authority)', () => {
    const parsed = JSON.parse(savedGame(34));
    parsed.world.state.entities = null;
    expect(() => Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] }))
      .toThrow(SaveLoadError);
  });

  it('control — a valid engine-produced save still round-trips byte-identically', () => {
    const saved = savedGame(35);
    const loaded = Engine.deserialize(saved, { modules: [echoModule()] });
    expect(loaded.serialize()).toBe(saved);
  });
});
