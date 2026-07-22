import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { WorldState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import {
  spawnPlayerRumor,
  spawnReputationRumor,
  spawnIntentionalRumor,
  getPlayerRumorState,
  setPlayerRumorState,
  applyRumorManipulation,
  type MilestoneHint,
} from './player-rumor.js';

const profile = {
  build: { name: 'Hero', archetypeId: 'warrior' },
  progression: { level: 3 },
  injuries: [],
  custom: {},
} as unknown as CharacterProfile;

const milestone: MilestoneHint = {
  label: 'defeated the Bone Collector',
  description: 'a great deed',
  tags: ['combat', 'boss-kill'],
};

describe('player-rumor id determinism (MW-2)', () => {
  it('does not share a mutable global counter across independent runs', () => {
    // Old `rumorCounter` made spawn order leak across runs (run A → pr-1,
    // run B → pr-2). Identical spawns must now produce identical ids.
    const runA = spawnPlayerRumor(milestone, profile, 'order', 'keep', 5);
    const runB = spawnPlayerRumor(milestone, profile, 'order', 'keep', 5);
    expect(runA.id).toBe(runB.id);
  });

  it('distinguishes rumors across spawn fns and inputs without state', () => {
    const a = spawnPlayerRumor(milestone, profile, 'order', 'keep', 5);
    const b = spawnReputationRumor('order', -20, 'Order', profile, 'keep', 5);
    const c = spawnIntentionalRumor('a lie', 'fearsome', 'order', 'keep', 5);
    const d = spawnReputationRumor('order', -20, 'Order', profile, 'keep', 6);
    const ids = new Set([a.id, b.id, c.id, d.id]);
    expect(ids.size).toBe(4);
  });

  it('mints per-instance ids from WorldState without colliding across instances', () => {
    const engineA = createTestEngine({ modules: [], entities: [], zones: [] });
    const engineB = createTestEngine({ modules: [], entities: [], zones: [] });
    const worldA = engineA.world as WorldState;
    const worldB = engineB.world as WorldState;

    const a1 = spawnPlayerRumor(milestone, profile, 'order', 'keep', 5, worldA);
    const a2 = spawnReputationRumor('order', -20, 'Order', profile, 'keep', 5, worldA);
    expect(a1.id).not.toBe(a2.id); // counter advances within an instance

    // Fresh instance, same call sequence ⇒ byte-identical ids (no shared global).
    const b1 = spawnPlayerRumor(milestone, profile, 'order', 'keep', 5, worldB);
    expect(b1.id).toBe(a1.id);
    expect(a1.id.startsWith('pr_')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// player-rumor namespace accessors (F-19a23718)
// ---------------------------------------------------------------------------

describe('getPlayerRumorState / setPlayerRumorState', () => {
  it('defaults to an empty ledger when the namespace is absent', () => {
    const engine = createTestEngine({ modules: [], entities: [], zones: [] });
    const world = engine.world as WorldState;
    expect(getPlayerRumorState(world)).toEqual({ rumors: [] });
  });

  it('persists under the exact "player-rumor" key director.ts reads (director.test.ts:287 shape)', () => {
    const engine = createTestEngine({ modules: [], entities: [], zones: [] });
    const world = engine.world as WorldState;
    const rumor = spawnIntentionalRumor('a lie', 'fearsome', 'order', 'keep', 5);

    setPlayerRumorState(world, { rumors: [rumor] });

    expect(world.modules['player-rumor']).toEqual({ rumors: [rumor] });
    expect(getPlayerRumorState(world).rumors).toEqual([rumor]);
  });

  it('treats a malformed (non-object) namespace as absent, not an error', () => {
    const engine = createTestEngine({ modules: [], entities: [], zones: [] });
    const world = engine.world as WorldState;
    (world.modules as Record<string, unknown>)['player-rumor'] = 42;
    expect(getPlayerRumorState(world)).toEqual({ rumors: [] });
  });
});

describe('applyRumorManipulation: deny/bury by id (F-19a23718)', () => {
  it('deny reduces confidence of the matching rumor and persists the change', () => {
    const engine = createTestEngine({ modules: [], entities: [], zones: [] });
    const world = engine.world as WorldState;
    const rumor = spawnIntentionalRumor('a lie', 'fearsome', 'order', 'keep', 5, 0.8);
    setPlayerRumorState(world, { rumors: [rumor] });

    const updated = applyRumorManipulation(world, 'deny', rumor.id);

    expect(updated?.confidence).toBeCloseTo(0.5); // 0.8 - 0.3 (denyRumor)
    expect(getPlayerRumorState(world).rumors[0].confidence).toBeCloseTo(0.5);
  });

  it('bury-scandal accelerates distortion and persists the change', () => {
    const engine = createTestEngine({ modules: [], entities: [], zones: [] });
    const world = engine.world as WorldState;
    const rumor = spawnIntentionalRumor('a lie', 'fearsome', 'order', 'keep', 5, 0.8);
    setPlayerRumorState(world, { rumors: [rumor] });

    const updated = applyRumorManipulation(world, 'bury-scandal', rumor.id);

    expect(updated?.distortion).toBeCloseTo(0.2); // 0*2 + 0.2 (buryRumor)
    expect(getPlayerRumorState(world).rumors[0].distortion).toBeCloseTo(0.2);
  });

  it('an unknown rumor id is a quiet no-op — no throw, undefined result', () => {
    const engine = createTestEngine({ modules: [], entities: [], zones: [] });
    const world = engine.world as WorldState;
    setPlayerRumorState(world, { rumors: [] });

    expect(applyRumorManipulation(world, 'deny', 'nope')).toBeUndefined();
    expect(getPlayerRumorState(world).rumors).toEqual([]);
  });
});
