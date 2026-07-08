// Resource clamp + stat bounds — dogfood v2.5 finding C7 (LOW).
//
// `modifyResource` floored at 0 but had no upper clamp, and `getStat` ignored
// ruleset StatDefinition min/max entirely (returning a dead intermediate).
// The fix threads the Engine's ruleset into the WorldStore so declared bounds
// are honored, while preserving the legacy contract exactly for stores built
// without a ruleset (floor 0 / no upper clamp; raw stats).

import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { WorldStore } from './world.js';
import type { EntityState, GameManifest, RulesetDefinition } from './types.js';

const manifest: GameManifest = {
  id: 'c7-game',
  title: 'C7',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'bounded',
  modules: [],
  contentPacks: [],
};

const ruleset: RulesetDefinition = {
  id: 'bounded',
  name: 'Bounded',
  version: '0.1.0',
  stats: [
    { id: 'strength', name: 'Strength', min: 0, max: 10, default: 5 },
    { id: 'karma', name: 'Karma', min: -10, max: 10, default: 0 },
    { id: 'renown', name: 'Renown', default: 0 }, // declared, unbounded
  ],
  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 20, default: 20 },
    { id: 'morale', name: 'Morale', min: 5, max: 15, default: 10 },
    { id: 'gold', name: 'Gold', default: 0 }, // declared, unbounded
  ],
  verbs: [],
  formulas: [],
  defaultModules: [],
  progressionModels: [],
};

function unit(overrides?: Partial<EntityState>): EntityState {
  return {
    id: 'u1',
    blueprintId: 'bp',
    type: 'npc',
    name: 'Unit',
    tags: [],
    stats: {},
    resources: {},
    statuses: [],
    ...overrides,
  };
}

function boundedStore(entity: EntityState): WorldStore {
  const store = new WorldStore({ manifest, seed: 1, ruleset });
  store.addEntity(entity);
  return store;
}

describe('C7 — modifyResource honors ruleset bounds', () => {
  it('clamps to the declared max instead of overflowing', () => {
    const store = boundedStore(unit({ resources: { hp: 10 } }));
    expect(store.modifyResource('u1', 'hp', 999)).toBe(20);
    expect(store.getEntity('u1')!.resources.hp).toBe(20);
  });

  it('still floors at 0 for a resource with min 0', () => {
    const store = boundedStore(unit({ resources: { hp: 10 } }));
    expect(store.modifyResource('u1', 'hp', -999)).toBe(0);
  });

  it('honors an explicit non-zero declared min', () => {
    const store = boundedStore(unit({ resources: { morale: 10 } }));
    expect(store.modifyResource('u1', 'morale', -999)).toBe(5);
    expect(store.modifyResource('u1', 'morale', 999)).toBe(15);
  });

  it('a declared resource without max keeps the open ceiling (floor still 0)', () => {
    const store = boundedStore(unit({ resources: { gold: 1 } }));
    expect(store.modifyResource('u1', 'gold', 1_000_000)).toBe(1_000_001);
    expect(store.modifyResource('u1', 'gold', -9_999_999)).toBe(0);
  });

  it('without a ruleset the legacy contract is preserved: floor 0, no upper clamp (pin)', () => {
    const store = new WorldStore({ manifest, seed: 1 });
    store.addEntity(unit({ resources: { hp: 10 } }));
    expect(store.modifyResource('u1', 'hp', 999)).toBe(1009);
    expect(store.modifyResource('u1', 'hp', -99999)).toBe(0);
  });
});

describe('C7 — getStat honors ruleset bounds (and the dead base var is gone)', () => {
  it('clamps a stat above its declared max', () => {
    const store = boundedStore(unit({ stats: { strength: 999 } }));
    expect(store.getStat('u1', 'strength')).toBe(10);
  });

  it('clamps a stat below its declared min (negative min supported)', () => {
    const store = boundedStore(unit({ stats: { karma: -50 } }));
    expect(store.getStat('u1', 'karma')).toBe(-10);
  });

  it('an in-range stat passes through untouched', () => {
    const store = boundedStore(unit({ stats: { strength: 7 } }));
    expect(store.getStat('u1', 'strength')).toBe(7);
  });

  it('a stat the ruleset does not declare stays raw', () => {
    const store = boundedStore(unit({ stats: { luck: 999 } }));
    expect(store.getStat('u1', 'luck')).toBe(999);
  });

  it('a declared stat without min/max stays raw', () => {
    const store = boundedStore(unit({ stats: { renown: -12345 } }));
    expect(store.getStat('u1', 'renown')).toBe(-12345);
  });

  it('without a ruleset stats are returned raw (pin)', () => {
    const store = new WorldStore({ manifest, seed: 1 });
    store.addEntity(unit({ stats: { strength: 999 } }));
    expect(store.getStat('u1', 'strength')).toBe(999);
  });

  it('missing entity still returns 0 (pin)', () => {
    const store = boundedStore(unit());
    expect(store.getStat('nobody', 'strength')).toBe(0);
  });
});

describe('C7 — the Engine threads its ruleset into the store', () => {
  it('new Engine({ ruleset }) → store clamps stats and resources', () => {
    const engine = new Engine({ manifest, seed: 1, ruleset });
    engine.store.addEntity(unit({ stats: { strength: 999 }, resources: { hp: 10 } }));
    expect(engine.store.getStat('u1', 'strength')).toBe(10);
    expect(engine.store.modifyResource('u1', 'hp', 999)).toBe(20);
  });

  it('Engine.deserialize({ ruleset }) → restored store still clamps', () => {
    const engine = new Engine({ manifest, seed: 1, ruleset });
    engine.store.addEntity(unit({ stats: { strength: 999 }, resources: { hp: 10 } }));
    const restored = Engine.deserialize(engine.serialize(), { ruleset });
    expect(restored.store.getStat('u1', 'strength')).toBe(10);
    expect(restored.store.modifyResource('u1', 'hp', 999)).toBe(20);
  });
});
