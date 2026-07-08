// Manifest validation — dogfood v2.5 finding C5 (MED).
//
// There was no manifest validator anywhere: `new Engine({ manifest })` with
// `manifest.modules === undefined` raw-threw
// `TypeError: options.manifest.modules is not iterable` from the WorldStore
// constructor spread — inconsistent with the structured-error discipline at
// the save boundary (SaveLoadError with code/message/hint). These tests pin
// the friendly ManifestError for construction, and pin that the *load* path
// (save-sourced meta feeding the same constructor) stays a SaveLoadError.

import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { WorldStore, SaveLoadError } from './world.js';
import type { GameManifest, EngineModule } from './types.js';

type StructuredErr = { code?: string; hint?: string };

const validManifest: GameManifest = {
  id: 'c5-game',
  title: 'C5',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [],
  contentPacks: [],
};

function expectManifestError(fn: () => unknown, mentions: string): void {
  try {
    fn();
    throw new Error('should have thrown');
  } catch (e) {
    expect((e as Error).name).toBe('ManifestError');
    expect((e as StructuredErr).code).toBe('MANIFEST_INVALID');
    expect((e as Error).message).toContain(mentions);
    expect((e as StructuredErr).hint).toBeTruthy();
  }
}

describe('C5 — game manifest validation (structured error, not raw TypeError)', () => {
  it('manifest.modules undefined → MANIFEST_INVALID naming "modules" (was: raw [...undefined] TypeError)', () => {
    const bad = { ...validManifest } as Partial<GameManifest>;
    delete bad.modules;
    expectManifestError(() => new Engine({ manifest: bad as GameManifest }), 'modules');
  });

  it('manifest.modules of the wrong type (string) → MANIFEST_INVALID', () => {
    const bad = { ...validManifest, modules: 'combat' } as unknown as GameManifest;
    expectManifestError(() => new Engine({ manifest: bad }), 'modules');
  });

  it('manifest.modules containing a non-string element → MANIFEST_INVALID', () => {
    const bad = { ...validManifest, modules: ['ok', 42] } as unknown as GameManifest;
    expectManifestError(() => new Engine({ manifest: bad }), 'modules');
  });

  it('manifest null / not an object → MANIFEST_INVALID', () => {
    expectManifestError(
      () => new Engine({ manifest: null as unknown as GameManifest }),
      'manifest',
    );
    expectManifestError(
      () => new Engine({ manifest: 'game' as unknown as GameManifest }),
      'manifest',
    );
  });

  it('manifest.id missing → MANIFEST_INVALID naming "id"', () => {
    const bad = { ...validManifest } as Partial<GameManifest>;
    delete bad.id;
    expectManifestError(() => new Engine({ manifest: bad as GameManifest }), 'id');
  });

  it('manifest.ruleset missing → MANIFEST_INVALID naming "ruleset"', () => {
    const bad = { ...validManifest } as Partial<GameManifest>;
    delete bad.ruleset;
    expectManifestError(() => new Engine({ manifest: bad as GameManifest }), 'ruleset');
  });

  it('WorldStore construction is guarded by the same validator', () => {
    const bad = { ...validManifest } as Partial<GameManifest>;
    delete bad.modules;
    expectManifestError(() => new WorldStore({ manifest: bad as GameManifest }), 'modules');
  });

  it('a valid manifest still constructs (control)', () => {
    const engine = new Engine({ manifest: validManifest, seed: 1 });
    expect(engine.world.meta.gameId).toBe('c5-game');
    expect(engine.world.meta.activeModules).toEqual([]);
  });

  it('validateGameManifest is exported for direct consumer use', async () => {
    const mod = await import('./index.js');
    expect(typeof (mod as { validateGameManifest?: unknown }).validateGameManifest).toBe('function');
    expect(typeof (mod as { ManifestError?: unknown }).ManifestError).toBe('function');
  });
});

describe('C5 family — save-sourced meta feeding the constructor stays a SaveLoadError', () => {
  function echoModule(): EngineModule {
    return {
      id: 'echo',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('echo', (action) => [
          { id: '', tick: action.issuedAtTick, type: 'test.echo', payload: {} },
        ]);
      },
    };
  }

  function savedGame(): string {
    const engine = new Engine({
      manifest: { ...validManifest, modules: ['echo'] },
      seed: 2,
      modules: [echoModule()],
    });
    engine.store.addEntity({
      id: 'hero', blueprintId: 'bp', type: 'player', name: 'Hero',
      tags: [], stats: {}, resources: {}, statuses: [],
    });
    engine.store.state.playerId = 'hero';
    engine.submitAction('echo');
    return engine.serialize();
  }

  it('Engine.deserialize with meta.activeModules missing → SAVE_MALFORMED (not TypeError, not ManifestError)', () => {
    const parsed = JSON.parse(savedGame());
    delete parsed.world.state.meta.activeModules;
    try {
      Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('activeModules');
    }
  });

  it('Engine.deserialize with meta.activeRuleset non-string → SAVE_MALFORMED', () => {
    const parsed = JSON.parse(savedGame());
    parsed.world.state.meta.activeRuleset = 7;
    expect(() => Engine.deserialize(JSON.stringify(parsed), { modules: [echoModule()] }))
      .toThrow(SaveLoadError);
  });

  it('WorldStore.deserialize with meta.activeModules non-array → SAVE_MALFORMED', () => {
    const store = new WorldStore({ manifest: validManifest, seed: 3 });
    const parsed = JSON.parse(store.serialize());
    parsed.state.meta.activeModules = 'combat';
    try {
      WorldStore.deserialize(JSON.stringify(parsed));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveLoadError);
      expect((e as SaveLoadError).code).toBe('SAVE_MALFORMED');
      expect((e as SaveLoadError).message).toContain('activeModules');
    }
  });

  it('WorldStore.deserialize with meta.gameId non-string → SAVE_MALFORMED', () => {
    const store = new WorldStore({ manifest: validManifest, seed: 3 });
    const parsed = JSON.parse(store.serialize());
    parsed.state.meta.gameId = 99;
    expect(() => WorldStore.deserialize(JSON.stringify(parsed))).toThrow(SaveLoadError);
  });
});
