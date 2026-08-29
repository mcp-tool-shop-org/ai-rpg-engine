// Module registration — duplicate persistence-namespace guard (F-b71bccf1 sibling).
//
// registerNamespace was Map.set last-wins: two modules claiming `shared`
// constructed successfully and only the second defaults survived. Verbs,
// formulas, and module ids already fail loud on accidental clobber; namespace
// keys are the same uniqueness class (they are world.modules keys).

import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import type { EngineModule } from './types.js';

const testManifest = {
  id: 'ns-game',
  title: 'Namespaces',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [],
  contentPacks: [],
};

describe('F-b71bccf1 — registerNamespace fails loud on duplicate key', () => {
  it('two modules registering the same namespace key throw instead of last-wins', () => {
    const m1: EngineModule = {
      id: 'm1',
      version: '0.1.0',
      register(ctx) {
        ctx.persistence.registerNamespace('shared', { from: 'm1' });
      },
    };
    const m2: EngineModule = {
      id: 'm2',
      version: '0.1.0',
      register(ctx) {
        ctx.persistence.registerNamespace('shared', { from: 'm2' });
      },
    };

    expect(
      () =>
        new Engine({
          manifest: { ...testManifest, modules: ['m1', 'm2'] },
          seed: 1,
          modules: [m1, m2],
        }),
    ).toThrow(/shared/);
  });

  it('the first module\'s namespace survives when the second registration is rejected', () => {
    const m1: EngineModule = {
      id: 'm1',
      version: '0.1.0',
      register(ctx) {
        ctx.persistence.registerNamespace('shared', { from: 'm1' });
      },
    };
    const m2: EngineModule = {
      id: 'm2',
      version: '0.1.0',
      register(ctx) {
        ctx.persistence.registerNamespace('shared', { from: 'm2' });
      },
    };

    let engine: Engine | undefined;
    try {
      engine = new Engine({
        manifest: { ...testManifest, modules: ['m1', 'm2'] },
        seed: 1,
        modules: [m1, m2],
      });
    } catch {
      // Construction must throw; if a partial engine existed it is discarded.
    }
    expect(engine).toBeUndefined();

    // A world that only loaded m1 keeps m1's defaults — proving last-wins
    // is not how a successful construction behaves either.
    const onlyFirst = new Engine({
      manifest: { ...testManifest, modules: ['m1'] },
      seed: 1,
      modules: [m1],
    });
    expect(onlyFirst.world.modules['shared']).toEqual({ from: 'm1' });
  });

  it('distinct namespace keys on two modules still initialize both', () => {
    const m1: EngineModule = {
      id: 'm1',
      version: '0.1.0',
      register(ctx) {
        ctx.persistence.registerNamespace('alpha', { from: 'm1' });
      },
    };
    const m2: EngineModule = {
      id: 'm2',
      version: '0.1.0',
      register(ctx) {
        ctx.persistence.registerNamespace('beta', { from: 'm2' });
      },
    };
    const engine = new Engine({
      manifest: { ...testManifest, modules: ['m1', 'm2'] },
      seed: 1,
      modules: [m1, m2],
    });
    expect(engine.world.modules['alpha']).toEqual({ from: 'm1' });
    expect(engine.world.modules['beta']).toEqual({ from: 'm2' });
  });

  it('registerNamespace with { override: true } intentionally replaces defaults', () => {
    const m1: EngineModule = {
      id: 'm1',
      version: '0.1.0',
      register(ctx) {
        ctx.persistence.registerNamespace('shared', { from: 'm1' });
      },
    };
    const m2: EngineModule = {
      id: 'm2',
      version: '0.1.0',
      register(ctx) {
        ctx.persistence.registerNamespace('shared', { from: 'm2' }, { override: true });
      },
    };
    const engine = new Engine({
      manifest: { ...testManifest, modules: ['m1', 'm2'] },
      seed: 1,
      modules: [m1, m2],
    });
    expect(engine.world.modules['shared']).toEqual({ from: 'm2' });
  });
});
