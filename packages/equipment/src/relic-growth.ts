// Relic growth — items that accumulate chronicle entries earn epithets and grow in notoriety.
// Pure functions for milestone evaluation, epithet generation, and tier progression.

import type { ItemDefinition, ItemChronicleEntry } from './types.js';

// --- Types ---

export type GrowthTrigger = 'kill-count' | 'age' | 'recognition-count' | 'faction-kills' | 'boss-kill';

export type GrowthMilestone = {
  trigger: GrowthTrigger;
  threshold: number;
  epithet: string;     // Pattern: "{name}" is replaced with item name
  statBonus?: Record<string, number>;
};

export type RelicState = {
  itemId: string;
  currentEpithet?: string;
  milestonesReached: string[];  // epithet strings
  tier: number;                 // 0=normal, 1=notable, 2=renowned, 3=legendary
};

// --- Default Milestones ---

export const DEFAULT_WEAPON_MILESTONES: GrowthMilestone[] = [
  { trigger: 'kill-count', threshold: 3, epithet: 'Bloodied {name}' },
  { trigger: 'kill-count', threshold: 10, epithet: '{name} the Reaper' },
  { trigger: 'kill-count', threshold: 25, epithet: '{name}, Drinker of Souls' },
  { trigger: 'age', threshold: 100, epithet: 'Old {name}' },
  { trigger: 'recognition-count', threshold: 3, epithet: 'Infamous {name}' },
  { trigger: 'recognition-count', threshold: 8, epithet: '{name} of Legend' },
];

export const DEFAULT_ARMOR_MILESTONES: GrowthMilestone[] = [
  { trigger: 'age', threshold: 100, epithet: 'Weathered {name}' },
  { trigger: 'recognition-count', threshold: 3, epithet: 'Notorious {name}' },
  { trigger: 'recognition-count', threshold: 8, epithet: '{name} of Renown' },
];

// --- Evaluation ---

function countByEvent(chronicle: ItemChronicleEntry[], event: string): number {
  return chronicle.filter((e) => e.event === event).length;
}

function getAge(chronicle: ItemChronicleEntry[], currentTick: number): number {
  const acquired = chronicle.find((e) => e.event === 'acquired');
  if (!acquired) return 0;
  return currentTick - acquired.tick;
}

function getTriggerValue(trigger: GrowthTrigger, chronicle: ItemChronicleEntry[], currentTick: number): number {
  switch (trigger) {
    case 'kill-count':
      return countByEvent(chronicle, 'used-in-kill');
    case 'age':
      return getAge(chronicle, currentTick);
    case 'recognition-count':
      return countByEvent(chronicle, 'recognized');
    case 'faction-kills':
      return 0;
    case 'boss-kill':
      return chronicle.filter((e) => e.event === 'used-in-kill' && e.detail.toLowerCase().includes('boss')).length;
  }
}

function resolveEpithet(pattern: string, itemName: string): string {
  return pattern.replace('{name}', itemName);
}

/**
 * Compute the tier from the number of milestones reached.
 * 0 = tier 0 (normal), 1 = tier 1 (notable), 2 = tier 2 (renowned), 3+ = tier 3 (legendary).
 */
function computeTier(milestonesReached: number): number {
  if (milestonesReached >= 3) return 3;
  if (milestonesReached >= 2) return 2;
  if (milestonesReached >= 1) return 1;
  return 0;
}

/**
 * Evaluate relic growth for an item based on its chronicle.
 * Returns the current relic state: tier, epithet, and reached milestones.
 */
export function evaluateRelicGrowth(
  item: ItemDefinition,
  chronicle: ItemChronicleEntry[],
  currentTick: number,
  milestones?: GrowthMilestone[],
): RelicState {
  const effectiveMilestones = milestones
    ?? (item.slot === 'weapon' ? DEFAULT_WEAPON_MILESTONES
      : item.slot === 'armor' ? DEFAULT_ARMOR_MILESTONES
      : DEFAULT_ARMOR_MILESTONES); // Non-weapon/armor items use armor milestones

  const reached: string[] = [];
  let highestEpithet: string | undefined;

  for (const milestone of effectiveMilestones) {
    const value = getTriggerValue(milestone.trigger, chronicle, currentTick);
    if (value >= milestone.threshold) {
      const epithet = resolveEpithet(milestone.epithet, item.name);
      reached.push(epithet);
      highestEpithet = epithet; // Last reached = highest tier
    }
  }

  return {
    itemId: item.id,
    currentEpithet: highestEpithet,
    milestonesReached: reached,
    tier: computeTier(reached.length),
  };
}

/**
 * Get the display name with relic epithet: "Gravedigger's Spade, the Reaper"
 */
export function getRelicEpithet(item: ItemDefinition, relicState: RelicState): string {
  if (!relicState.currentEpithet) return item.name;
  return relicState.currentEpithet;
}

/**
 * Get the current relic tier (0-3).
 */
export function getRelicTier(relicState: RelicState): number {
  return relicState.tier;
}

/** Tier labels for display. */
export const TIER_LABELS: Record<number, string> = {
  0: 'normal',
  1: 'notable',
  2: 'renowned',
  3: 'legendary',
};

/**
 * Compute aggregate stat bonuses from reached milestones.
 */
export function computeRelicBonuses(
  relicState: RelicState,
  milestones: GrowthMilestone[],
): Record<string, number> {
  const bonuses: Record<string, number> = {};

  // Match reached epithets back to milestones to get stat bonuses
  for (const milestone of milestones) {
    if (milestone.statBonus) {
      // Check if any reached milestone corresponds to this milestone's pattern
      const matchesAny = relicState.milestonesReached.some((epithet) => {
        // Simple check: does the reached epithet follow this milestone's pattern?
        const pattern = milestone.epithet;
        const prefix = pattern.split('{name}')[0];
        const suffix = pattern.split('{name}')[1] ?? '';
        return epithet.startsWith(prefix) && epithet.endsWith(suffix);
      });
      if (matchesAny) {
        for (const [stat, value] of Object.entries(milestone.statBonus)) {
          bonuses[stat] = (bonuses[stat] ?? 0) + value;
        }
      }
    }
  }

  return bonuses;
}
