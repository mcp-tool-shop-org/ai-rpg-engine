// serializer.test.ts — incremental eventLog must stay O(new events) on the wire.

import { describe, it, expect } from 'vitest';
import type { WorldState } from '@ai-rpg-engine/core';
import {
  applyPatches,
  canonicalJson,
  canonicalStateHash,
  diffState,
  projectState,
  snapshotDelta,
  stateHash,
} from './serializer.js';

function logOf(n: number): { id: string; tick: number; type: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i}`, tick: i, type: 'probe' }));
}

describe('F-8b1563f6 — eventLog incremental patches are O(new events)', () => {
  it('after N append-only events, the incremental delta is O(k), not O(N)', () => {
    const n = 80;
    const k = 3;
    const before = { tick: n, eventLog: logOf(n) };
    const after = { tick: n, eventLog: [...logOf(n), ...logOf(k).map((e, i) => ({ ...e, id: `n${i}` }))] };
    const delta = diffState(before, after);
    const eventLogPatches = delta.filter((p) => p.path[0] === 'eventLog');
    expect(eventLogPatches).toHaveLength(k);
    for (let i = 0; i < k; i++) {
      expect(eventLogPatches[i]).toMatchObject({ op: 'set', path: ['eventLog', n + i] });
    }
    expect(JSON.stringify(eventLogPatches).length).toBeLessThan(JSON.stringify(after.eventLog).length / 4);

    const mirrored = applyPatches(structuredClone(before), delta);
    expect(mirrored).toEqual(after);
  });

  it('CONTROL: a snapshot from empty still carries the full log (one SET)', () => {
    const state = { tick: 4, eventLog: logOf(12) } as unknown as WorldState;
    const snap = snapshotDelta(state);
    const eventLogPatch = snap.find((p) => p.path.length === 1 && p.path[0] === 'eventLog');
    expect(eventLogPatch).toMatchObject({ op: 'set', path: ['eventLog'] });
    expect((eventLogPatch as { value: unknown[] }).value).toHaveLength(12);
  });
});

describe('F-3f53c837 — canonicalStateHash is Godot-stable and not a JS-hash replacement', () => {
  it('the same WorldState hashes identically from a fixture that mimics Godot key-order + 5.0', () => {
    // Node insertion order vs Godot JSON.stringify alphabetizing. Integers stay
    // integers (`5`, never `5.0`) so a GDScript encoder can match.
    const jsInsertionOrder = { tick: 5, flag: true, z: 1, a: 2 };
    const godotAlphaOrder = { a: 2, flag: true, tick: 5, z: 1 };
    expect(canonicalJson(jsInsertionOrder)).toBe('{"a":2,"flag":true,"tick":5,"z":1}');
    expect(canonicalJson(godotAlphaOrder)).toBe(canonicalJson(jsInsertionOrder));
    expect(canonicalStateHash(jsInsertionOrder)).toBe(canonicalStateHash(godotAlphaOrder));
    expect(canonicalJson({ n: 5 })).toBe('{"n":5}');
    expect(canonicalJson({ n: 5 })).not.toContain('5.0');
  });

  it('CONTROL: stateHash is left as the JS hasher (not replaced)', () => {
    const state = { tick: 5, flag: true } as unknown as WorldState;
    expect(stateHash(state)).toMatch(/^[0-9a-f]{32}$/);
    expect(canonicalStateHash(state)).toMatch(/^[0-9a-f]{32}$/);
    // Two functions, two contracts — they may or may not coincide for a given
    // object, but canonicalJson is what a non-JS host implements.
    expect(canonicalJson(state)).toContain('"tick":5');
  });
});

describe('F-decfe897 — projectState omits eventLog / windows collections', () => {
  it('omitEventLog drops the log so snapshotDelta does not SET it', () => {
    const state = { tick: 4, entities: { hero: { id: 'hero' } }, eventLog: logOf(12) };
    const projected = projectState(state, { omitEventLog: true });
    expect((projected as { eventLog?: unknown }).eventLog).toBeUndefined();
    const snap = snapshotDelta(projected);
    expect(snap.some((p) => p.path[0] === 'eventLog')).toBe(false);
    expect(snap.some((p) => p.path[0] === 'entities')).toBe(true);
  });

  it('collections windows the same serializer to named top-level keys', () => {
    const state = { tick: 1, entities: { hero: {} }, zones: { room: {} }, eventLog: logOf(3) };
    const projected = projectState(state, { collections: ['entities', 'zones'] });
    expect(Object.keys(projected as object).sort()).toEqual(['entities', 'zones']);
    const snap = snapshotDelta(projected);
    expect(snap.every((p) => p.path[0] === 'entities' || p.path[0] === 'zones')).toBe(true);
  });
});
