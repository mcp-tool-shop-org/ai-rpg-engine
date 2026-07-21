// WorldStore ingestion detachment — root cause of the F-71ec5dcd cross-instance
// bleed class.
//
// addEntity/addZone used to store the caller's reference, so module-level
// content constants fed to multiple stores aliased nested state (resources/
// stats/statuses/neighbors): damage in engine A mutated the constant and a
// later engine booted with a dead enemy. v2.6 patched the SYMPTOM with
// structuredClone at ~63 starter call sites; the store now detaches at
// ingestion, making the contract hold for every caller.

import { describe, it, expect } from 'vitest';
import { WorldStore } from './world.js';
import type { EntityState, GameManifest, ZoneState } from './types.js';

const manifest: GameManifest = {
  id: 'ingest-game',
  title: 'Ingest',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'none',
  modules: [],
  contentPacks: [],
};

function makeStore(): WorldStore {
  return new WorldStore({ manifest, seed: 1 });
}

function makeEntity(): EntityState {
  return {
    id: 'e1',
    blueprintId: 'bp',
    type: 'npc',
    name: 'Unit',
    tags: ['undead'],
    stats: { vigor: 3 },
    resources: { hp: 10 },
    statuses: [],
  };
}

function makeZone(): ZoneState {
  return {
    id: 'z1',
    roomId: 'r1',
    name: 'Crypt',
    tags: ['dark'],
    neighbors: ['z2'],
    hazards: ['unstable floor'],
  };
}

// A shared "content constant" like the starters' module-level exports.
const SHARED_ENTITY: EntityState = makeEntity();

describe('WorldStore detaches entities/zones at ingestion (F-71ec5dcd)', () => {
  it('mutating the input entity after addEntity does not reach the store', () => {
    const store = makeStore();
    const input = makeEntity();
    store.addEntity(input);

    input.resources.hp = 0;
    input.statuses.push({ statusId: 'poisoned', stacks: 1, appliedTick: 0 });

    expect(store.getEntity('e1')!.resources.hp).toBe(10);
    expect(store.getEntity('e1')!.statuses).toHaveLength(0);
  });

  it('mutating store entity state does not reach the caller object', () => {
    const store = makeStore();
    const input = makeEntity();
    store.addEntity(input);

    store.getEntity('e1')!.resources.hp = 0;
    store.getEntity('e1')!.tags.push('dead');

    expect(input.resources.hp).toBe(10);
    expect(input.tags).toEqual(['undead']);
  });

  it('mutating the input zone after addZone does not reach the store', () => {
    const store = makeStore();
    const input = makeZone();
    store.addZone(input);

    input.neighbors.push('z9');
    input.hazards!.pop();

    expect(store.getZone('z1')!.neighbors).toEqual(['z2']);
    expect(store.getZone('z1')!.hazards).toEqual(['unstable floor']);
  });

  it('mutating store zone state does not reach the caller object', () => {
    const store = makeStore();
    const input = makeZone();
    store.addZone(input);

    store.getZone('z1')!.neighbors.push('z9');
    store.getZone('z1')!.tags.push('collapsed');

    expect(input.neighbors).toEqual(['z2']);
    expect(input.tags).toEqual(['dark']);
  });

  it('two stores fed the same module-level constant do not share nested state', () => {
    const a = makeStore();
    const b = makeStore();
    a.addEntity(SHARED_ENTITY);
    b.addEntity(SHARED_ENTITY);

    a.getEntity('e1')!.resources.hp = 0;

    expect(b.getEntity('e1')!.resources.hp).toBe(10);
    expect(SHARED_ENTITY.resources.hp).toBe(10);
    expect(b.getEntity('e1')!.resources).not.toBe(a.getEntity('e1')!.resources);
  });
});
