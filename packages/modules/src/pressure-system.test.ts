import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { WorldState } from '@ai-rpg-engine/core';
import { makePressure } from './pressure-system.js';

const baseOpts = {
  kind: 'bounty-issued' as const,
  sourceFactionId: 'order',
  description: 'a bounty',
  triggeredBy: 'test',
  urgency: 0.7,
  visibility: 'rumored' as const,
  turnsRemaining: 10,
  potentialOutcomes: ['x'],
  tags: ['hostile'],
  currentTick: 5,
};

describe('pressure id determinism (MW-1)', () => {
  it('does not share a mutable global counter across independent runs', () => {
    // Two independent "runs" minting identically-specified pressures must produce
    // identical ids. With the old module-global `pressureCounter`, the first run
    // bled into the second (run A → wp-1, run B → wp-2) — order-dependent and
    // non-reproducible. Now ids are derived per-instance / from content.
    const runA = makePressure({ ...baseOpts });
    const runB = makePressure({ ...baseOpts });
    expect(runA.id).toBe(runB.id);
  });

  it('distinguishes pressures by kind/faction/tick when no state is supplied', () => {
    const a = makePressure({ ...baseOpts, kind: 'bounty-issued' });
    const b = makePressure({ ...baseOpts, kind: 'investigation-opened' });
    const c = makePressure({ ...baseOpts, sourceFactionId: 'guild' });
    const d = makePressure({ ...baseOpts, currentTick: 6 });
    const ids = new Set([a.id, b.id, c.id, d.id]);
    expect(ids.size).toBe(4);
  });

  it('mints per-instance ids from WorldState without colliding across instances', () => {
    const engineA = createTestEngine({ modules: [], entities: [], zones: [] });
    const engineB = createTestEngine({ modules: [], entities: [], zones: [] });
    const worldA = engineA.world as WorldState;
    const worldB = engineB.world as WorldState;

    const a1 = makePressure({ ...baseOpts }, worldA);
    const a2 = makePressure({ ...baseOpts }, worldA);
    // Within one instance, the per-instance counter advances → distinct ids.
    expect(a1.id).not.toBe(a2.id);

    // A fresh instance starts its own counter — same seed/actions ⇒ same id
    // sequence as instance A (byte-identical), proving no shared global.
    const b1 = makePressure({ ...baseOpts }, worldB);
    expect(b1.id).toBe(a1.id);
    expect(a1.id.startsWith('wp_')).toBe(true);
  });
});
