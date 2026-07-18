import { describe, it, expect } from 'vitest';
import {
  evaluateRelicGrowth,
  getRelicEpithet,
  getRelicTier,
  computeRelicBonuses,
  DEFAULT_WEAPON_MILESTONES,
  TIER_LABELS,
} from './relic-growth.js';
import type { ItemDefinition, ItemChronicleEntry } from './types.js';
import type { GrowthMilestone } from './relic-growth.js';

const baseWeapon: ItemDefinition = {
  id: 'test-sword',
  name: 'Test Sword',
  description: 'A test sword.',
  slot: 'weapon',
  rarity: 'common',
};

const baseArmor: ItemDefinition = {
  id: 'test-armor',
  name: 'Test Armor',
  description: 'A test armor.',
  slot: 'armor',
  rarity: 'common',
};

function makeKills(count: number, startTick = 10): ItemChronicleEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    event: 'used-in-kill' as const,
    tick: startTick + i,
    detail: `Kill ${i + 1}`,
  }));
}

function makeRecognitions(count: number, startTick = 10): ItemChronicleEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    event: 'recognized' as const,
    tick: startTick + i,
    detail: `Recognized ${i + 1}`,
  }));
}

describe('evaluateRelicGrowth', () => {
  it('returns tier 0 for items with no chronicle', () => {
    const state = evaluateRelicGrowth(baseWeapon, [], 0);
    expect(state.tier).toBe(0);
    expect(state.currentEpithet).toBeUndefined();
    expect(state.milestonesReached).toEqual([]);
  });

  it('reaches tier 1 at 3 kills (Bloodied)', () => {
    const chronicle: ItemChronicleEntry[] = [
      { event: 'acquired', tick: 1, detail: 'Found' },
      ...makeKills(3),
    ];
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50);
    expect(state.tier).toBe(1);
    expect(state.currentEpithet).toBe('Bloodied Test Sword');
    expect(state.milestonesReached).toContain('Bloodied Test Sword');
  });

  it('reaches tier 2 at 10 kills (the Reaper)', () => {
    const chronicle: ItemChronicleEntry[] = [
      { event: 'acquired', tick: 1, detail: 'Found' },
      ...makeKills(10),
    ];
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50);
    expect(state.tier).toBeGreaterThanOrEqual(2);
    expect(state.currentEpithet).toBe('Test Sword the Reaper');
  });

  it('reaches tier 3 at 25 kills (Drinker of Souls)', () => {
    const chronicle: ItemChronicleEntry[] = [
      { event: 'acquired', tick: 1, detail: 'Found' },
      ...makeKills(25),
    ];
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50);
    expect(state.tier).toBe(3);
    expect(state.currentEpithet).toBe('Test Sword, Drinker of Souls');
  });

  it('recognizes age milestones', () => {
    const chronicle: ItemChronicleEntry[] = [
      { event: 'acquired', tick: 1, detail: 'Found' },
    ];
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 200);
    expect(state.tier).toBe(1);
    expect(state.milestonesReached).toContain('Old Test Sword');
  });

  it('recognizes recognition milestones', () => {
    const chronicle: ItemChronicleEntry[] = [
      { event: 'acquired', tick: 1, detail: 'Found' },
      ...makeRecognitions(3),
    ];
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50);
    expect(state.tier).toBe(1);
    expect(state.milestonesReached).toContain('Infamous Test Sword');
  });

  it('uses armor milestones for armor items', () => {
    const chronicle: ItemChronicleEntry[] = [
      { event: 'acquired', tick: 1, detail: 'Found' },
      ...makeRecognitions(3),
    ];
    const state = evaluateRelicGrowth(baseArmor, chronicle, 50);
    expect(state.tier).toBe(1);
    expect(state.milestonesReached).toContain('Notorious Test Armor');
  });

  it('accepts custom milestones', () => {
    const custom: GrowthMilestone[] = [
      { trigger: 'kill-count', threshold: 1, epithet: 'First Blood {name}' },
    ];
    const chronicle = makeKills(1);
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50, custom);
    expect(state.milestonesReached).toContain('First Blood Test Sword');
  });

  // CP-06: currentEpithet must be the highest-tier reached milestone, selected by
  // threshold — NOT merely the last one in array order. With an out-of-order list,
  // the previous code picked whichever epithet happened to be last.
  it('picks the highest-threshold epithet even when milestones are out of order', () => {
    const outOfOrder: GrowthMilestone[] = [
      { trigger: 'kill-count', threshold: 25, epithet: '{name}, Drinker of Souls' },
      { trigger: 'kill-count', threshold: 3, epithet: 'Bloodied {name}' },
      { trigger: 'kill-count', threshold: 10, epithet: '{name} the Reaper' },
    ];
    const chronicle = makeKills(25); // satisfies all three thresholds
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50, outOfOrder);
    // Highest threshold reached is 25 → Drinker of Souls, regardless of array order.
    expect(state.currentEpithet).toBe('Test Sword, Drinker of Souls');
    // All three are still recorded as reached.
    expect(state.milestonesReached).toHaveLength(3);
  });

  it('picks the highest-threshold epithet when the top milestone is listed first', () => {
    const topFirst: GrowthMilestone[] = [
      { trigger: 'kill-count', threshold: 10, epithet: '{name} the Reaper' },
      { trigger: 'kill-count', threshold: 3, epithet: 'Bloodied {name}' },
    ];
    const chronicle = makeKills(10);
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50, topFirst);
    expect(state.currentEpithet).toBe('Test Sword the Reaper');
  });
});

describe('getRelicEpithet', () => {
  it('returns item name when no epithet', () => {
    const state = evaluateRelicGrowth(baseWeapon, [], 0);
    expect(getRelicEpithet(baseWeapon, state)).toBe('Test Sword');
  });

  it('returns current epithet', () => {
    const chronicle = [
      { event: 'acquired' as const, tick: 1, detail: 'Found' },
      ...makeKills(3),
    ];
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50);
    expect(getRelicEpithet(baseWeapon, state)).toBe('Bloodied Test Sword');
  });
});

describe('getRelicTier', () => {
  it('returns 0 for no milestones', () => {
    const state = evaluateRelicGrowth(baseWeapon, [], 0);
    expect(getRelicTier(state)).toBe(0);
  });
});

describe('TIER_LABELS', () => {
  it('has labels for all tiers', () => {
    expect(TIER_LABELS[0]).toBe('normal');
    expect(TIER_LABELS[1]).toBe('notable');
    expect(TIER_LABELS[2]).toBe('renowned');
    expect(TIER_LABELS[3]).toBe('legendary');
  });
});

describe('computeRelicBonuses', () => {
  it('returns empty for no stat bonuses', () => {
    // F-9b3e21fa: this call site was left on the OLD 2-arg signature after
    // F-c2ac7705 added the required `itemName` param — a live TS2554 that no
    // gate caught (build excludes tests, vitest/esbuild doesn't typecheck,
    // root `tsc --noEmit` resolves zero files). The test still passed only by
    // accident (no DEFAULT_WEAPON_MILESTONES entry declares a statBonus, so
    // the loop consuming itemName never ran). Typechecked by
    // tsconfig.test.json now: `npx tsc -p packages/equipment/tsconfig.test.json`.
    const state = evaluateRelicGrowth(baseWeapon, makeKills(3), 50);
    const bonuses = computeRelicBonuses(state, DEFAULT_WEAPON_MILESTONES, baseWeapon.name);
    expect(bonuses).toEqual({});
  });

  it('computes stat bonuses from custom milestones', () => {
    const custom: GrowthMilestone[] = [
      { trigger: 'kill-count', threshold: 1, epithet: 'Sharp {name}', statBonus: { attack: 1 } },
      { trigger: 'kill-count', threshold: 3, epithet: 'Deadly {name}', statBonus: { attack: 2 } },
    ];
    const chronicle = makeKills(3);
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50, custom);
    const bonuses = computeRelicBonuses(state, custom, baseWeapon.name);
    expect(bonuses.attack).toBe(3); // 1 + 2
  });

  // F-c2ac7705: the old match logic derived prefix/suffix from the pattern and
  // tested `epithet.startsWith(prefix) && epithet.endsWith(suffix)` — unsound
  // whenever the item's OWN NAME textually overlaps with a DIFFERENT
  // milestone's fixed prefix/suffix text. An item named "Old Rusty Blade"
  // that reaches ONLY the kill-count milestone ("{name} the Reaper") produces
  // the epithet "Old Rusty Blade the Reaper" — which also happens to start
  // with "Old " (only because the item's own name does) and trivially ends
  // with "" — so it false-matched the UNRELATED age milestone ("Old {name}")
  // and credited its stat bonus even though age was never reached.
  it('does not credit an unrelated milestone whose fixed prefix happens to match the item name', () => {
    const milestones: GrowthMilestone[] = [
      { trigger: 'kill-count', threshold: 10, epithet: '{name} the Reaper', statBonus: { attack: 5 } },
      { trigger: 'age', threshold: 100, epithet: 'Old {name}', statBonus: { defense: 3 } },
    ];
    const oldRustyBlade: ItemDefinition = {
      id: 'old-rusty-blade',
      name: 'Old Rusty Blade',
      description: 'A well-worn weapon.',
      slot: 'weapon',
      rarity: 'common',
    };
    const chronicle: ItemChronicleEntry[] = [
      { event: 'acquired', tick: 40, detail: 'Found' }, // age at tick 50 is only 10, well under threshold 100
      ...makeKills(10, 40),
    ];
    const state = evaluateRelicGrowth(oldRustyBlade, chronicle, 50, milestones);

    // Precondition: only the kill-count milestone was actually reached.
    expect(state.milestonesReached).toEqual(['Old Rusty Blade the Reaper']);

    const bonuses = computeRelicBonuses(state, milestones, oldRustyBlade.name);
    expect(bonuses.attack).toBe(5); // legitimately earned
    expect(bonuses.defense).toBeUndefined(); // never earned — age milestone was not reached
  });

  // Guards against the fix over-correcting into false NEGATIVES: when
  // multiple milestones are ALL genuinely reached, every one of their
  // bonuses must still be credited via the exact-match rewrite.
  it('still credits every genuinely reached milestone (no false negatives from the exact-match rewrite)', () => {
    const milestones: GrowthMilestone[] = [
      { trigger: 'kill-count', threshold: 3, epithet: 'Bloodied {name}', statBonus: { attack: 1 } },
      { trigger: 'kill-count', threshold: 10, epithet: '{name} the Reaper', statBonus: { attack: 5 } },
    ];
    const chronicle = makeKills(10); // satisfies both thresholds
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50, milestones);
    expect(state.milestonesReached).toHaveLength(2);

    const bonuses = computeRelicBonuses(state, milestones, baseWeapon.name);
    expect(bonuses.attack).toBe(6); // 1 + 5, both genuinely earned
  });
});
