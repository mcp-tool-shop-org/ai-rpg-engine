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
import type { EntityState, GameManifest, ResolvedEvent, ZoneState } from './types.js';

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
    input.statuses.push({ id: 'st-poisoned', statusId: 'poisoned', stacks: 1, appliedAtTick: 0 });

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

// F-4bcdd095 sibling: recordEvent was the one ingestion seam that still stored
// the caller's reference. Filters (present) and EventBus listeners both received
// that live object and could write through to eventLog — the same alias class
// addEntity/addZone already detach for.
describe('WorldStore.recordEvent aliases the event at ingestion (narration seam)', () => {
  it('mutating the input after recordEvent writes the log — enrichment needs this alias', () => {
    const store = makeStore();
    const input = { id: 'e-in', tick: 0, type: 'secret.revealed', payload: { secret: 'the-truth' } };
    store.recordEvent(input);

    input.payload.secret = '???';

    const logged = store.state.eventLog.find((e) => e.id === 'e-in');
    expect(logged).toBeDefined();
    expect(logged!.payload.secret).toBe('???');
    expect(logged).toBe(input);
  });

  it('an EventBus listener that mutates the event argument enriches the log entry', () => {
    // Enrichment (combat/defeat narration) patches description onto the same
    // object recordEvent ingested. Presentation filters, not the bus, clone.
    const store = makeStore();
    store.events.onAny((event) => {
      event.payload.secret = 'narrated';
    });

    store.emitEvent('secret.revealed', { secret: 'the-truth' });

    const logged = store.state.eventLog.find((e) => e.type === 'secret.revealed');
    expect(logged).toBeDefined();
    expect(logged!.payload.secret).toBe('narrated');
  });
});

// F-208d62e4 sibling: a frozen/sealed/non-extensible event with a valid type
// still TypeError'd on `event.id =` ("object is not extensible"). Copy to a
// plain object at ingestion; do not mutate the caller's value. Extensible
// events still alias (block above).
describe('WorldStore.recordEvent copies frozen/non-extensible events (F-208d62e4)', () => {
  it('Object.freeze event is copied, stamped, and does not throw', () => {
    const store = makeStore();
    const frozen = Object.freeze({ type: 'test.ok', payload: {} });
    let recorded: ResolvedEvent | undefined;
    expect(() => {
      recorded = store.recordEvent(frozen as unknown as ResolvedEvent);
    }).not.toThrow();

    expect(recorded).toBeDefined();
    expect(recorded).not.toBe(frozen);
    expect(recorded!.type).toBe('test.ok');
    expect(typeof recorded!.id).toBe('string');
    expect(recorded!.id.length).toBeGreaterThan(0);
    expect(Object.isExtensible(recorded!)).toBe(true);
    expect(store.state.eventLog[store.state.eventLog.length - 1]).toBe(recorded);
    expect(Object.prototype.hasOwnProperty.call(frozen, 'id')).toBe(false);
  });

  it('Object.seal event without id is copied rather than TypeError', () => {
    const store = makeStore();
    const sealed = Object.seal({ type: 'test.sealed', payload: {} });
    let recorded: ResolvedEvent | undefined;
    expect(() => {
      recorded = store.recordEvent(sealed as unknown as ResolvedEvent);
    }).not.toThrow();

    expect(recorded).not.toBe(sealed);
    expect(recorded!.id.length).toBeGreaterThan(0);
    expect(Object.prototype.hasOwnProperty.call(sealed, 'id')).toBe(false);
  });

  it('Object.preventExtensions event without id is copied rather than TypeError', () => {
    const store = makeStore();
    const locked = Object.preventExtensions({ type: 'test.locked', payload: {} });
    let recorded: ResolvedEvent | undefined;
    expect(() => {
      recorded = store.recordEvent(locked as unknown as ResolvedEvent);
    }).not.toThrow();

    expect(recorded).not.toBe(locked);
    expect(recorded!.id.length).toBeGreaterThan(0);
    expect(Object.prototype.hasOwnProperty.call(locked, 'id')).toBe(false);
  });

  it('an EventBus listener can enrich the logged copy of a frozen event', () => {
    const store = makeStore();
    store.events.onAny((event) => {
      event.payload.secret = 'narrated';
    });
    const frozen = Object.freeze({
      id: '',
      tick: 0,
      type: 'secret.revealed',
      payload: { secret: 'the-truth' },
    });

    expect(() => store.recordEvent(frozen as unknown as ResolvedEvent)).not.toThrow();

    const logged = store.state.eventLog.find((e) => e.type === 'secret.revealed');
    expect(logged).toBeDefined();
    expect(logged).not.toBe(frozen);
    expect(logged!.payload.secret).toBe('narrated');
    expect(logged!.id.length).toBeGreaterThan(0);
    expect(frozen.id).toBe('');
  });
});

