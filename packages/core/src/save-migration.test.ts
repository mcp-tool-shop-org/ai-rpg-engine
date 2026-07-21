// Module-level save-migration seam — ENG-009 (wave-9 t2-seam).
//
// Engine-level save versioning already existed (SAVE_VERSION, the ordered
// SAVE_MIGRATIONS chain, structured rejections, convergence guard — all
// loop-tested in save-hardening.test.ts). What did NOT exist:
//
//  1. meta.moduleVersions — per-module save-format versions stamped at
//     registration so every serialize carries them. Absent map/entry marks a
//     PRE-versioning save: that module's persisted slice is treated as
//     authored at MODULE_PRE_VERSIONING_SENTINEL ('0.0.0', absent-means-
//     oldest).
//  2. EngineModule.migrateState?(slice, fromVersion) — invoked by
//     Engine.deserialize when a module's persisted version differs (string
//     inequality, both directions) from its registered version, on that
//     module's namespace slice only, BEFORE the restored world swaps in. A
//     throwing hook → structured SAVE_MODULE_MIGRATION_FAILED, never a raw
//     stack, never a silent misread.
//  3. Namespace-init guarantee — the restored store never ran
//     initializeNamespaces (the constructor ran it on the THROWAWAY store),
//     so modules registered after a save was written had to hand-roll lazy
//     defaults. Now: post-swap, ABSENT namespaces get registered defaults;
//     PRESENT namespaces are NEVER re-initialized (mutation-proof below).
//
// FIXTURE DISCIPLINE (the testing-os lesson): the three saves below were
// generated ONCE via the real serialize path and then FROZEN as literals.
// The tests never regenerate them — a fixture that regenerates itself cannot
// catch serializer drift. eng009-019 pins the fixtures' load-bearing bytes so
// a future "helpful" regeneration fails loudly instead of silently.
//
// Regeneration recipe (deliberate, manual — update eng009-019 pins with it):
//   manifest { id:'fixture-game', ruleset:'test', modules:['fx-mod'] },
//   seed 424242, hero entity + playerId 'hero',
//   setModuleState('fx-mod', <slice>), submitAction('poke'), serialize().
//   FIXTURE_CURRENT:  fx-mod v2.0.0, slice { format:'v2', tallies:{ total:5 } }
//   FIXTURE_V1_BEHIND: fx-mod v1.0.0, slice { format:'v1', tally:3 }
//   FIXTURE_PRE_SEAM: FIXTURE_V1_BEHIND with meta.moduleVersions deleted —
//     byte-what a pre-ENG-009 engine emitted (the key did not exist).

import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import {
  WorldStore,
  SaveLoadError,
  MODULE_PRE_VERSIONING_SENTINEL,
  migrateModuleStates,
} from './world.js';
import type { EngineModule, ActionIntent, ResolvedEvent, WorldState } from './types.js';

// --- Frozen fixtures (see header for the generation recipe) ---

const FIXTURE_CURRENT =
  '{"world":{"state":{"meta":{"worldId":"world_1","gameId":"fixture-game","saveVersion":"1.0.0","tick":1,"seed":424242,"activeRuleset":"test","activeModules":["fx-mod"],"moduleVersions":{"fx-mod":"2.0.0"},"idCounter":5},"playerId":"hero","locationId":"","entities":{"hero":{"id":"hero","blueprintId":"bp","type":"player","name":"Hero","tags":[],"stats":{},"resources":{},"statuses":[]}},"zones":{},"quests":{},"factions":{},"globals":{},"modules":{"fx-mod":{"format":"v2","tallies":{"total":5}}},"eventLog":[{"id":"evt_3","tick":0,"type":"action.declared","payload":{"verb":"poke","actorId":"hero"},"actorId":"hero"},{"id":"evt_4","tick":0,"type":"fx.poked","actorId":"hero","payload":{}},{"id":"evt_5","tick":0,"type":"action.resolved","payload":{"verb":"poke","actorId":"hero","eventCount":1},"actorId":"hero"}],"pending":[]},"rngState":424242},"actionLog":[{"id":"act_2","actorId":"hero","verb":"poke","source":"player","issuedAtTick":0}]}';

const FIXTURE_V1_BEHIND =
  '{"world":{"state":{"meta":{"worldId":"world_1","gameId":"fixture-game","saveVersion":"1.0.0","tick":1,"seed":424242,"activeRuleset":"test","activeModules":["fx-mod"],"moduleVersions":{"fx-mod":"1.0.0"},"idCounter":5},"playerId":"hero","locationId":"","entities":{"hero":{"id":"hero","blueprintId":"bp","type":"player","name":"Hero","tags":[],"stats":{},"resources":{},"statuses":[]}},"zones":{},"quests":{},"factions":{},"globals":{},"modules":{"fx-mod":{"format":"v1","tally":3}},"eventLog":[{"id":"evt_3","tick":0,"type":"action.declared","payload":{"verb":"poke","actorId":"hero"},"actorId":"hero"},{"id":"evt_4","tick":0,"type":"fx.poked","actorId":"hero","payload":{}},{"id":"evt_5","tick":0,"type":"action.resolved","payload":{"verb":"poke","actorId":"hero","eventCount":1},"actorId":"hero"}],"pending":[]},"rngState":424242},"actionLog":[{"id":"act_2","actorId":"hero","verb":"poke","source":"player","issuedAtTick":0}]}';

const FIXTURE_PRE_SEAM =
  '{"world":{"state":{"meta":{"worldId":"world_1","gameId":"fixture-game","saveVersion":"1.0.0","tick":1,"seed":424242,"activeRuleset":"test","activeModules":["fx-mod"],"idCounter":5},"playerId":"hero","locationId":"","entities":{"hero":{"id":"hero","blueprintId":"bp","type":"player","name":"Hero","tags":[],"stats":{},"resources":{},"statuses":[]}},"zones":{},"quests":{},"factions":{},"globals":{},"modules":{"fx-mod":{"format":"v1","tally":3}},"eventLog":[{"id":"evt_3","tick":0,"type":"action.declared","payload":{"verb":"poke","actorId":"hero"},"actorId":"hero"},{"id":"evt_4","tick":0,"type":"fx.poked","actorId":"hero","payload":{}},{"id":"evt_5","tick":0,"type":"action.resolved","payload":{"verb":"poke","actorId":"hero","eventCount":1},"actorId":"hero"}],"pending":[]},"rngState":424242},"actionLog":[{"id":"act_2","actorId":"hero","verb":"poke","source":"player","issuedAtTick":0}]}';

// --- Test modules (same ids/shapes the fixtures were generated with) ---

const fixtureManifest = {
  id: 'fixture-game',
  title: 'Fixture',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: ['fx-mod'],
  contentPacks: [],
};

function hero() {
  return {
    id: 'hero', blueprintId: 'bp', type: 'player', name: 'Hero',
    tags: [], stats: {}, resources: {}, statuses: [],
  };
}

type MigrateCall = { slice: unknown; fromVersion: string };

/** fx-mod at v1.0.0 — the version the behind/pre-seam fixtures were written by. */
function fxV1(options?: { onMigrate?: MigrateCall[] }): EngineModule {
  return {
    id: 'fx-mod',
    version: '1.0.0',
    register(ctx) {
      ctx.persistence.registerNamespace('fx-mod', { format: 'v1', tally: 0 });
      ctx.actions.registerVerb('poke', (action: ActionIntent): ResolvedEvent[] => [
        { id: '', tick: action.issuedAtTick, type: 'fx.poked', actorId: action.actorId, payload: {} },
      ]);
    },
    // Present as a SPY when requested: eng009-009 pins that it is never
    // invoked when persisted and registered versions match.
    ...(options?.onMigrate
      ? {
          migrateState(slice: unknown, fromVersion: string): unknown {
            options.onMigrate!.push({ slice: structuredClone(slice), fromVersion });
            return slice;
          },
        }
      : {}),
  };
}

/** fx-mod at v2.0.0 with a real shape migration: {tally} → {tallies:{total}}. */
function fxV2(calls?: MigrateCall[]): EngineModule {
  return {
    id: 'fx-mod',
    version: '2.0.0',
    register(ctx) {
      ctx.persistence.registerNamespace('fx-mod', { format: 'v2', tallies: { total: 0 } });
      ctx.actions.registerVerb('poke', (action: ActionIntent): ResolvedEvent[] => [
        { id: '', tick: action.issuedAtTick, type: 'fx.poked', actorId: action.actorId, payload: {} },
      ]);
    },
    migrateState(slice: unknown, fromVersion: string): unknown {
      calls?.push({ slice: structuredClone(slice), fromVersion });
      const old = slice as { tally?: number };
      return { format: 'v2', tallies: { total: old.tally ?? 0 }, migratedFrom: fromVersion };
    },
  };
}

describe('eng009 — meta.moduleVersions stamped at serialize', () => {
  it('eng009-001: a fresh engine stamps every registered module id → version into meta', () => {
    const other: EngineModule = { id: 'other-mod', version: '3.1.4', register() {} };
    const engine = new Engine({
      manifest: { ...fixtureManifest, modules: ['fx-mod', 'other-mod'] },
      seed: 1,
      modules: [fxV1(), other],
    });
    expect(engine.world.meta.moduleVersions).toEqual({ 'fx-mod': '1.0.0', 'other-mod': '3.1.4' });

    const parsed = JSON.parse(engine.serialize()) as { world: { state: WorldState } };
    expect(parsed.world.state.meta.moduleVersions).toEqual({ 'fx-mod': '1.0.0', 'other-mod': '3.1.4' });
  });

  it('eng009-002: an engine with no modules still carries the (empty) map — only PRE-seam saves lack the field', () => {
    const engine = new Engine({ manifest: { ...fixtureManifest, modules: [] }, seed: 2 });
    expect(engine.world.meta.moduleVersions).toEqual({});
    const parsed = JSON.parse(engine.serialize()) as { world: { state: WorldState } };
    expect('moduleVersions' in parsed.world.state.meta).toBe(true);
  });

  it('eng009-003: save → load → save round-trips byte-identically with the stamp in place', () => {
    const engine = new Engine({ manifest: fixtureManifest, seed: 3, modules: [fxV2()] });
    engine.store.addEntity(hero());
    engine.store.state.playerId = 'hero';
    engine.submitAction('poke');
    const saved = engine.serialize();

    const loaded = Engine.deserialize(saved, { modules: [fxV2()] });
    expect(loaded.world.meta.moduleVersions).toEqual({ 'fx-mod': '2.0.0' });
    // In-place re-stamp preserves meta key order — the byte pin would catch a
    // rebuilt map or an appended key.
    expect(loaded.serialize()).toBe(saved);
  });
});

describe('eng009 — pre-seam saves (frozen fixture without meta.moduleVersions)', () => {
  it('eng009-004: loads with a hookless module — slice as-is, versions stamped on the way in', () => {
    const loaded = Engine.deserialize(FIXTURE_PRE_SEAM, { modules: [fxV1()] });
    // Hookless drift ('0.0.0' → '1.0.0') loads the slice unchanged...
    expect(loaded.store.getModuleState('fx-mod')).toEqual({ format: 'v1', tally: 3 });
    // ...and the restored world now records the registered version, so the
    // NEXT save is post-seam.
    expect(loaded.world.meta.moduleVersions).toEqual({ 'fx-mod': '1.0.0' });
    // Still fully playable.
    const events = loaded.submitAction('poke');
    expect(events.some((e) => e.type === 'fx.poked')).toBe(true);
  });

  it('eng009-005: a v2 module migrates the pre-seam slice from the \'0.0.0\' sentinel (absent-means-oldest)', () => {
    const calls: MigrateCall[] = [];
    const loaded = Engine.deserialize(FIXTURE_PRE_SEAM, { modules: [fxV2(calls)] });

    expect(calls).toEqual([
      { slice: { format: 'v1', tally: 3 }, fromVersion: MODULE_PRE_VERSIONING_SENTINEL },
    ]);
    expect(calls[0].fromVersion).toBe('0.0.0');
    expect(loaded.store.getModuleState('fx-mod')).toEqual({
      format: 'v2', tallies: { total: 3 }, migratedFrom: '0.0.0',
    });
    expect(loaded.world.meta.moduleVersions).toEqual({ 'fx-mod': '2.0.0' });
  });

  it('eng009-006: the bare WorldStore path never stamps — module migration is the ENGINE\'s restore concern', () => {
    const worldJson = JSON.stringify((JSON.parse(FIXTURE_PRE_SEAM) as { world: unknown }).world);
    const store = WorldStore.deserialize(worldJson);
    // No module knowledge at the store level: the field stays absent and the
    // slice stays exactly as persisted.
    expect('moduleVersions' in store.state.meta).toBe(false);
    expect(store.getModuleState('fx-mod')).toEqual({ format: 'v1', tally: 3 });
  });
});

describe('eng009 — migrateState fires on version drift (frozen v1-behind fixture)', () => {
  it('eng009-007: called once with the module\'s own slice + persisted fromVersion; migrated shape lands and survives namespace init', () => {
    const calls: MigrateCall[] = [];
    const loaded = Engine.deserialize(FIXTURE_V1_BEHIND, { modules: [fxV2(calls)] });

    expect(calls).toEqual([{ slice: { format: 'v1', tally: 3 }, fromVersion: '1.0.0' }]);
    // The migrated shape landed — and was NOT clobbered back to the v2
    // defaults ({ tallies: { total: 0 } }) by the post-swap namespace init.
    expect(loaded.store.getModuleState('fx-mod')).toEqual({
      format: 'v2', tallies: { total: 3 }, migratedFrom: '1.0.0',
    });
    expect(loaded.world.meta.moduleVersions).toEqual({ 'fx-mod': '2.0.0' });
  });

  it('eng009-008: migration does not re-run — a re-saved migrated world loads with zero migrate calls', () => {
    const first = Engine.deserialize(FIXTURE_V1_BEHIND, { modules: [fxV2()] });
    const resaved = first.serialize();

    const calls: MigrateCall[] = [];
    const second = Engine.deserialize(resaved, { modules: [fxV2(calls)] });
    expect(calls).toEqual([]);
    expect(second.store.getModuleState('fx-mod')).toEqual({
      format: 'v2', tallies: { total: 3 }, migratedFrom: '1.0.0',
    });
  });

  it('eng009-009: migrate NOT called when persisted and registered versions match', () => {
    const spy: MigrateCall[] = [];
    const loaded = Engine.deserialize(FIXTURE_V1_BEHIND, { modules: [fxV1({ onMigrate: spy })] });
    expect(spy).toEqual([]);
    expect(loaded.store.getModuleState('fx-mod')).toEqual({ format: 'v1', tally: 3 });
  });

  it('eng009-010: current-shape fixture loads with zero migrate calls (versions in sync)', () => {
    const calls: MigrateCall[] = [];
    const loaded = Engine.deserialize(FIXTURE_CURRENT, { modules: [fxV2(calls)] });
    expect(calls).toEqual([]);
    expect(loaded.store.getModuleState('fx-mod')).toEqual({ format: 'v2', tallies: { total: 5 } });
  });

  it('eng009-011: drift is inequality, not ordering — a NEWER persisted module version also fires the hook', () => {
    // FIXTURE_CURRENT persisted fx-mod at 2.0.0; registering v1 offers the
    // module its own downgrade decision (the engine-level SAVE_VERSION gate
    // only protects the WORLD format). fxV1's spy hook accepts by returning
    // the slice unchanged.
    const spy: MigrateCall[] = [];
    const loaded = Engine.deserialize(FIXTURE_CURRENT, { modules: [fxV1({ onMigrate: spy })] });
    expect(spy).toEqual([{ slice: { format: 'v2', tallies: { total: 5 } }, fromVersion: '2.0.0' }]);
    // Re-stamped to the REGISTERED version after the hook accepted.
    expect(loaded.world.meta.moduleVersions).toEqual({ 'fx-mod': '1.0.0' });
  });
});

describe('eng009 — a throwing migrateState is a structured rejection, never a silent misread', () => {
  function throwingModule(err: unknown): EngineModule {
    return {
      id: 'fx-mod',
      version: '2.0.0',
      register(ctx) {
        ctx.persistence.registerNamespace('fx-mod', { format: 'v2', tallies: { total: 0 } });
      },
      migrateState(): unknown {
        throw err;
      },
    };
  }

  it('eng009-012: SAVE_MODULE_MIGRATION_FAILED with module id + both versions in the message, hint naming the module', () => {
    try {
      Engine.deserialize(FIXTURE_V1_BEHIND, { modules: [throwingModule(new Error('boom: v1 tally is cursed'))] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      const err = e as SaveLoadError;
      expect(err.code).toBe('SAVE_MODULE_MIGRATION_FAILED');
      // Pinned strings — the structured-error contract of this seam.
      expect(err.message).toBe(
        'Module "fx-mod" failed to migrate its saved state from version 1.0.0 to 2.0.0: boom: v1 tally is cursed',
      );
      expect(err.hint).toBe(
        'The "fx-mod" module\'s migrateState hook threw while upgrading this save. Update the module to handle saves from version 1.0.0, or restore from a backup made with a compatible module version.',
      );
      expect(err.name).toBe('SaveLoadError');
    }
  });

  it('eng009-013: a non-Error throw is stringified into the message (no raw rethrow, no "[object Object]" Error leak)', () => {
    try {
      Engine.deserialize(FIXTURE_V1_BEHIND, { modules: [throwingModule('plain-string-reason')] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MODULE_MIGRATION_FAILED');
      expect((e as SaveLoadError).message).toContain('plain-string-reason');
    }
  });

  it('eng009-014: migrate returning undefined discards the slice — namespace re-defaults instead of persisting garbage', () => {
    const discard: EngineModule = {
      id: 'fx-mod',
      version: '2.0.0',
      register(ctx) {
        ctx.persistence.registerNamespace('fx-mod', { format: 'v2', tallies: { total: 0 } });
      },
      // The documented escape hatch for unsalvageable state.
      migrateState(): unknown {
        return undefined;
      },
    };
    const loaded = Engine.deserialize(FIXTURE_V1_BEHIND, { modules: [discard] });
    expect(loaded.store.getModuleState('fx-mod')).toEqual({ format: 'v2', tallies: { total: 0 } });
    expect(loaded.world.meta.moduleVersions).toEqual({ 'fx-mod': '2.0.0' });
  });
});

describe('eng009 — namespace-init guarantee after Engine.deserialize', () => {
  it('eng009-015: a module registered AFTER the save was written gets its defaults (cloned, not aliased)', () => {
    const lateDefaults = { greeting: 'hello', n: 1 };
    const lateMod: EngineModule = {
      id: 'late-mod',
      version: '1.0.0',
      register(ctx) {
        ctx.persistence.registerNamespace('late-mod', lateDefaults);
      },
    };
    const loaded = Engine.deserialize(FIXTURE_CURRENT, { modules: [fxV2(), lateMod] });

    const state = loaded.store.getModuleState<typeof lateDefaults>('late-mod');
    expect(state).toEqual({ greeting: 'hello', n: 1 });
    // Cloned in — mutating world state must never reach the module's shared
    // defaults object (the F-71ec5dcd bleed class).
    expect(state).not.toBe(lateDefaults);
    state!.n = 99;
    expect(lateDefaults.n).toBe(1);
  });

  it('eng009-016: a PRESENT namespace is never re-initialized — the marker survives load (mutation-proof)', () => {
    // The fixture slice carries tally 3 — a marker distinct from fxV1's
    // registered defaults ({ format: 'v1', tally: 0 }). If deserialize
    // re-initialized present namespaces, the marker would reset to 0.
    const loaded = Engine.deserialize(FIXTURE_V1_BEHIND, { modules: [fxV1()] });
    expect(loaded.store.getModuleState('fx-mod')).toEqual({ format: 'v1', tally: 3 });

    // Belt-and-braces: mark, save, reload — the mark survives a full cycle.
    loaded.store.setModuleState('fx-mod', { format: 'v1', tally: 41 });
    const reloaded = Engine.deserialize(loaded.serialize(), { modules: [fxV1()] });
    expect(reloaded.store.getModuleState('fx-mod')).toEqual({ format: 'v1', tally: 41 });
  });
});

describe('eng009 — migrateModuleStates unit seams + malformed-save guards', () => {
  it('eng009-017: entries for modules NOT registered this run are preserved on re-stamp (slices stay too)', () => {
    const parsed = JSON.parse(FIXTURE_CURRENT) as {
      world: { state: WorldState };
    };
    const state = parsed.world.state;
    state.meta.moduleVersions!['ghost-mod'] = '9.9.9';
    state.modules['ghost-mod'] = { orphaned: true };

    migrateModuleStates(state, [fxV2()]);

    // Registered module re-stamped; unregistered module's version record AND
    // slice both survive, so a later re-registration still knows what version
    // that state was written at.
    expect(state.meta.moduleVersions).toEqual({ 'fx-mod': '2.0.0', 'ghost-mod': '9.9.9' });
    expect(state.modules['ghost-mod']).toEqual({ orphaned: true });
  });

  it('eng009-018: a malformed meta.moduleVersions (non-object / non-string entry) is SAVE_MALFORMED on both load paths', () => {
    // Non-object map.
    const bad1 = JSON.parse(FIXTURE_CURRENT);
    bad1.world.state.meta.moduleVersions = 5;
    for (const load of [
      () => Engine.deserialize(JSON.stringify(bad1), { modules: [fxV2()] }),
      () => WorldStore.deserialize(JSON.stringify(bad1.world)),
    ]) {
      try {
        load();
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SaveLoadError);
        expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
        expect((e as SaveLoadError).message).toContain('moduleVersions');
      }
    }

    // Non-string entry value — names the offending module id.
    const bad2 = JSON.parse(FIXTURE_CURRENT);
    bad2.world.state.meta.moduleVersions = { 'fx-mod': 7 };
    try {
      Engine.deserialize(JSON.stringify(bad2), { modules: [fxV2()] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('moduleVersions["fx-mod"]');
    }
  });

  it('eng009-019: fixture integrity — the frozen saves still carry their load-bearing bytes', () => {
    // The testing-os lesson: these are FROZEN literals, not regenerated
    // snapshots. If someone "refreshes" them through a changed serializer,
    // these pins fail instead of the drift sailing through.
    expect(FIXTURE_CURRENT).toContain('"moduleVersions":{"fx-mod":"2.0.0"}');
    expect(FIXTURE_CURRENT).toContain('"modules":{"fx-mod":{"format":"v2","tallies":{"total":5}}}');
    expect(FIXTURE_V1_BEHIND).toContain('"moduleVersions":{"fx-mod":"1.0.0"}');
    expect(FIXTURE_V1_BEHIND).toContain('"modules":{"fx-mod":{"format":"v1","tally":3}}');
    // The pre-seam fixture must NOT contain the field at all — that absence
    // IS the fixture.
    expect(FIXTURE_PRE_SEAM).not.toContain('moduleVersions');
    expect(FIXTURE_PRE_SEAM).toContain('"saveVersion":"1.0.0"');
    // All three describe the same world otherwise.
    expect(FIXTURE_PRE_SEAM).toContain('"modules":{"fx-mod":{"format":"v1","tally":3}}');
  });
});
