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
    const state = evaluateRelicGrowth(baseWeapon, makeKills(3), 50);
    const bonuses = computeRelicBonuses(state, DEFAULT_WEAPON_MILESTONES);
    expect(bonuses).toEqual({});
  });

  it('computes stat bonuses from custom milestones', () => {
    const custom: GrowthMilestone[] = [
      { trigger: 'kill-count', threshold: 1, epithet: 'Sharp {name}', statBonus: { attack: 1 } },
      { trigger: 'kill-count', threshold: 3, epithet: 'Deadly {name}', statBonus: { attack: 2 } },
    ];
    const chronicle = makeKills(3);
    const state = evaluateRelicGrowth(baseWeapon, chronicle, 50, custom);
    const bonuses = computeRelicBonuses(state, custom);
    expect(bonuses.attack).toBe(3); // 1 + 2
  });
});
