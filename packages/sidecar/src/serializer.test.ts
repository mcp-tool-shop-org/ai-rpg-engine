// serializer.test.ts — incremental eventLog must stay O(new events) on the wire.

import { describe, it, expect } from 'vitest';
import type { WorldState } from '@ai-rpg-engine/core';
import { applyPatches, diffState, snapshotDelta } from './serializer.js';

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
