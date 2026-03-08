// Item recognition — NPCs react to equipped items with provenance
// Pure functions for evaluating whether NPCs notice and react to player equipment.

import type { ItemDefinition, ItemProvenanceFlag, ItemChronicleEntry } from '@ai-rpg-engine/equipment';

// --- Types ---

export type ItemRecognitionType =
  | 'faction-item'
  | 'stolen-item'
  | 'cursed-item'
  | 'trophy-item'
  | 'notorious-item';

export type ItemRecognitionResult = {
  itemId: string;
  itemName: string;
  recognitionType: ItemRecognitionType;
  /** NPC stance shift from recognition. */
  stanceDelta: number;
  /** For narration: "eyes widen at the Iron Wardens sigil" */
  narratorHint: string;
  /** For rumor spawning: "carries the Iron Wardens' seal" */
  rumorClaim?: string;
};

// --- Recognition Hints ---

const FACTION_HINTS_POSITIVE = [
  'nods at the familiar insignia',
  'recognizes the faction markings',
  'eyes the emblem with approval',
];

const FACTION_HINTS_NEGATIVE = [
  'stiffens at the faction insignia',
  'eyes narrow at the stolen emblem',
  'jaw tightens seeing the faction seal',
];

const STOLEN_HINTS = [
  'eyes the item suspiciously',
  'recognizes something about that gear',
  'glances at the item with distrust',
];

const CURSED_HINTS = [
  'recoils slightly',
  'instinctively steps back',
  'senses something wrong about the item',
];

const TROPHY_HINTS = [
  'stares at the trophy with wide eyes',
  'notices the mark of conquest',
  'recognizes a trophy of battle',
];

const NOTORIOUS_HINTS = [
  'whispers about the legendary item',
  'cannot look away from the weapon',
  'has heard stories about that blade',
];

function pickHint(hints: string[], seed: number): string {
  return hints[seed % hints.length];
}

// --- Notoriety ---

const RARITY_NOTORIETY: Record<string, number> = {
  common: 0.0,
  uncommon: 0.1,
  rare: 0.3,
  legendary: 0.6,
};

const FLAG_NOTORIETY: Record<string, number> = {
  stolen: 0.1,
  cursed: 0.2,
  blessed: 0.1,
  heirloom: 0.1,
  contraband: 0.15,
  trophy: 0.15,
};

function computeNotoriety(item: ItemDefinition, chronicle: ItemChronicleEntry[]): number {
  let score = RARITY_NOTORIETY[item.rarity] ?? 0;

  const prov = item.provenance;
  if (prov?.flags) {
    for (const flag of prov.flags) {
      score += FLAG_NOTORIETY[flag] ?? 0;
    }
  }
  if (prov?.factionId) score += 0.1;

  const killCount = chronicle.filter((e) => e.event === 'used-in-kill').length;
  score += Math.min(killCount * 0.05, 0.25);

  const recognitions = chronicle.filter((e) => e.event === 'recognized').length;
  score += Math.min(recognitions * 0.05, 0.15);

  return Math.min(1, score);
}

// --- Core Evaluation ---

/**
 * Check whether an NPC should recognize an item based on perception clarity and item notoriety.
 * Higher clarity + higher notoriety = more likely to be noticed.
 */
export function shouldRecognize(
  npcPerceptionClarity: number,
  itemNotoriety: number,
): boolean {
  const probability = 0.3 + (npcPerceptionClarity * 0.3) + (itemNotoriety * 0.4);
  return Math.random() < probability;
}

/**
 * Deterministic variant for testing — returns the probability instead of rolling.
 */
export function recognitionProbability(
  npcPerceptionClarity: number,
  itemNotoriety: number,
): number {
  return Math.min(1, 0.3 + (npcPerceptionClarity * 0.3) + (itemNotoriety * 0.4));
}

/**
 * Evaluate item recognition for all equipped items against an NPC's faction context.
 * Returns recognition results for items that would trigger a reaction.
 */
export function evaluateItemRecognition(
  equippedItems: ItemDefinition[],
  npcFactionId: string | undefined,
  itemChronicle: Record<string, ItemChronicleEntry[]>,
  tick: number,
): ItemRecognitionResult[] {
  const results: ItemRecognitionResult[] = [];
  const seed = tick;

  for (const item of equippedItems) {
    const prov = item.provenance;
    if (!prov) continue;

    const chronicle = itemChronicle[item.id] ?? [];
    const notoriety = computeNotoriety(item, chronicle);

    // Faction recognition
    if (prov.factionId && npcFactionId && prov.factionId === npcFactionId) {
      // NPC recognizes their own faction's item
      const isSuspicious = prov.flags?.includes('stolen') || prov.flags?.includes('contraband');
      if (isSuspicious) {
        results.push({
          itemId: item.id,
          itemName: item.name,
          recognitionType: 'faction-item',
          stanceDelta: -10,
          narratorHint: pickHint(FACTION_HINTS_NEGATIVE, seed + item.id.length),
          rumorClaim: `carries ${npcFactionId} property under suspicious circumstances`,
        });
      } else {
        results.push({
          itemId: item.id,
          itemName: item.name,
          recognitionType: 'faction-item',
          stanceDelta: 5,
          narratorHint: pickHint(FACTION_HINTS_POSITIVE, seed + item.id.length),
          // Positive faction recognition doesn't spawn rumors
        });
      }
      continue; // Don't double-count faction items
    }

    // Flag-based recognition
    if (prov.flags) {
      for (const flag of prov.flags) {
        const recognition = evaluateFlagRecognition(item, flag, seed);
        if (recognition) {
          results.push(recognition);
          break; // One recognition per item
        }
      }
      if (results.some((r) => r.itemId === item.id)) continue;
    }

    // Notoriety-based recognition (for items without specific flags)
    if (notoriety > 0.7) {
      results.push({
        itemId: item.id,
        itemName: item.name,
        recognitionType: 'notorious-item',
        stanceDelta: 0, // Varies — neutral until context determines reaction
        narratorHint: pickHint(NOTORIOUS_HINTS, seed + item.id.length),
        rumorClaim: `carries the legendary ${item.name}`,
      });
    }
  }

  return results;
}

function evaluateFlagRecognition(
  item: ItemDefinition,
  flag: ItemProvenanceFlag,
  seed: number,
): ItemRecognitionResult | undefined {
  switch (flag) {
    case 'stolen':
      return {
        itemId: item.id,
        itemName: item.name,
        recognitionType: 'stolen-item',
        stanceDelta: -5,
        narratorHint: pickHint(STOLEN_HINTS, seed + item.id.length),
        rumorClaim: `carries stolen goods`,
      };
    case 'cursed':
      return {
        itemId: item.id,
        itemName: item.name,
        recognitionType: 'cursed-item',
        stanceDelta: -3,
        narratorHint: pickHint(CURSED_HINTS, seed + item.id.length),
        rumorClaim: `wields something dark and cursed`,
      };
    case 'trophy':
      return {
        itemId: item.id,
        itemName: item.name,
        recognitionType: 'trophy-item',
        stanceDelta: 3,
        narratorHint: pickHint(TROPHY_HINTS, seed + item.id.length),
        rumorClaim: `carries a trophy of conquest`,
      };
    case 'contraband':
      return {
        itemId: item.id,
        itemName: item.name,
        recognitionType: 'stolen-item',
        stanceDelta: -5,
        narratorHint: pickHint(STOLEN_HINTS, seed + item.id.length),
        rumorClaim: `carries contraband goods`,
      };
    // blessed, heirloom — not negative, no rumor
    default:
      return undefined;
  }
}
