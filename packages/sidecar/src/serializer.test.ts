// serializer.test.ts — incremental eventLog must stay O(new events) on the wire.

import { describe, it, expect } from 'vitest';
import type { WorldState } from '@ai-rpg-engine/core';
import {
  applyPatches,
  canonicalJson,
  canonicalStateHash,
  diffState,
  projectState,
  quantize,
  snapshotDelta,
  StateDigestError,
  stateHash,
  validateDigestState,
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

// Cross-language canonicalJson / canonicalStateHash parity is verified against
// real GDScript using fixtures/state_digest_vectors.jsonl (see state-digest-vectors.test.ts
// and fixtures/verify_state_digest_vectors.gd). The earlier JS-mimicry test was retired.
describe('canonicalStateHash — digest formatting, validation, and JS stateHash separation', () => {
  it('retains null keys, skips undefined, scales by 1e6 half-away-from-zero, and normalizes -0', () => {
    expect(canonicalJson({ a: null, b: undefined, c: 5, d: -0 })).toBe('{"a":null,"c":5000000,"d":0}');
    expect(canonicalJson([undefined, null, -0.0000005, 0.0078125, -0.0078125])).toBe(
      '[null,null,-1,7813,-7813]',
    );
    expect(canonicalJson(() => 1)).toBe('null');
    expect(() => validateDigestState({ nested: [1, { keep: 'ok', skip: undefined }] })).not.toThrow();
    expect(canonicalJson({ ctrl: '\u0000\u0001\b\t\n\u000b\f\r\x7f' })).toBe(
      '{"ctrl":"\\u0000\\u0001\\b\\t\\n\\u000b\\f\\r\x7f"}',
    );
    expect(quantize(-0.0000005)).toBe(-0.000001);
    expect(quantize(-0)).toBe(0);
    expect(Object.is(quantize(-0), -0)).toBe(false);
  });

  it('validateDigestState and canonicalJson refuse non-finite numbers with StateDigestError', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => validateDigestState({ hp: bad })).toThrowError(StateDigestError);
      try {
        canonicalJson({ hp: bad });
      } catch (err) {
        expect(err).toBeInstanceOf(StateDigestError);
        const e = err as StateDigestError;
        expect(e.code).toBe('NON_FINITE_NUMBER');
        expect(e.path).toBe('$.hp');
        expect(e.toJSON()).toMatchObject({ code: 'NON_FINITE_NUMBER', path: '$.hp' });
      }
    }
  });

  it('validateDigestState and canonicalJson refuse scaled values beyond 2^53 - 1 in magnitude', () => {
    expect(() => validateDigestState({ big: 9007199254.74099 })).not.toThrow();
    for (const tooBig of [9007199254.740992, -9007199254.740992, 9007199255, Number.MAX_SAFE_INTEGER]) {
      try {
        canonicalJson({ edge: tooBig });
        expect.unreachable('expected UNSAFE_SCALED_INTEGER');
      } catch (err) {
        expect(err).toBeInstanceOf(StateDigestError);
        const e = err as StateDigestError;
        expect(e.code).toBe('UNSAFE_SCALED_INTEGER');
        expect(e.path).toBe('$.edge');
      }
    }
  });

  it('validateDigestState and canonicalJson refuse non-ASCII object keys', () => {
    expect(() => validateDigestState({ ascii_only: 'café' })).not.toThrow();
    for (const bad of [{ café: 1 }, { nested: { '\u03bb': 2 } }]) {
      try {
        canonicalJson(bad);
        expect.unreachable('expected NON_ASCII_KEY');
      } catch (err) {
        expect(err).toBeInstanceOf(StateDigestError);
        const e = err as StateDigestError;
        expect(e.code).toBe('NON_ASCII_KEY');
      }
    }
  });

  it('CONTROL: stateHash is left as the JS hasher (not replaced)', () => {
    const state = { tick: 5, flag: true } as unknown as WorldState;
    expect(stateHash(state)).toMatch(/^[0-9a-f]{32}$/);
    expect(canonicalStateHash(state)).toMatch(/^[0-9a-f]{32}$/);
    expect(canonicalJson(state)).toContain('"tick":5000000');
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

describe('applyPatches treats the patch path as untrusted', () => {
  const fresh = () => ({}) as Record<string, unknown>;

  it('does not walk through __proto__ into Object.prototype', () => {
    applyPatches({}, [{ op: 'set', path: ['__proto__', 'polluted'], value: 'yes' }]);
    expect(fresh().polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('does not walk through constructor.prototype into Object.prototype', () => {
    const root = applyPatches({}, [{ op: 'set', path: ['constructor', 'prototype', 'polluted'], value: 'yes' }]);
    expect(fresh().polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
    // the value lands on plain own objects of the target instead
    expect((root as { constructor: { prototype: { polluted: string } } }).constructor.prototype.polluted).toBe('yes');
  });

  it('ignores a patch whose last key is __proto__, for set and for remove', () => {
    const root = applyPatches({ a: { b: 1 } }, [
      { op: 'set', path: ['a', '__proto__'], value: { injected: true } },
      { op: 'remove', path: ['a', '__proto__'] },
    ]) as { a: Record<string, unknown> };
    expect(Object.getPrototypeOf(root.a)).toBe(Object.prototype);
    expect(root.a.injected).toBeUndefined();
    expect(root.a.b).toBe(1);
  });

  it('still creates, sets and removes ordinary nested paths', () => {
    const root = applyPatches({}, [
      { op: 'set', path: ['entities', 'hero', 'hp'], value: 10 },
      { op: 'set', path: ['list', 0], value: 'a' },
      { op: 'set', path: ['list', 1], value: 'b' },
      { op: 'set', path: ['entities', 'hero', 'name'], value: 'Ada' },
      { op: 'remove', path: ['entities', 'hero', 'hp'] },
    ]);
    expect(root).toEqual({ entities: { hero: { name: 'Ada' } }, list: ['a', 'b'] });
  });
});
