// Item provenance — structured origin, faction association, behavioral flags
// Pure functions for normalization, notoriety computation, and formatting.

import type { ItemDefinition, ItemProvenance, ItemProvenanceFlag, ItemChronicleEntry } from './types.js';

// --- Normalization ---

/** Normalize raw provenance (string or structured) to ItemProvenance. */
export function normalizeProvenance(
  raw: string | ItemProvenance | undefined,
): ItemProvenance | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === 'string') return { lore: raw };
  return raw;
}

/** Get normalized provenance from an item definition. */
export function getItemProvenance(item: ItemDefinition): ItemProvenance | undefined {
  return normalizeProvenance(item.provenance);
}

// --- Flag Queries ---

/** Check if an item has a specific provenance flag. */
export function hasProvenanceFlag(item: ItemDefinition, flag: ItemProvenanceFlag): boolean {
  const prov = getItemProvenance(item);
  return prov?.flags?.includes(flag) ?? false;
}

/** Check if an item is associated with a faction. */
export function isFactionalItem(item: ItemDefinition): boolean {
  return getItemFaction(item) !== undefined;
}

/** Get the faction ID associated with an item, if any. */
export function getItemFaction(item: ItemDefinition): string | undefined {
  return getItemProvenance(item)?.factionId;
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

/**
 * Compute item notoriety (0-1) based on rarity, provenance flags, and chronicle length.
 * Higher notoriety = more likely to be recognized by NPCs.
 */
export function computeItemNotoriety(
  item: ItemDefinition,
  chronicle: ItemChronicleEntry[],
): number {
  let score = RARITY_NOTORIETY[item.rarity] ?? 0;

  const prov = getItemProvenance(item);
  if (prov?.flags) {
    for (const flag of prov.flags) {
      score += FLAG_NOTORIETY[flag] ?? 0;
    }
  }

  if (prov?.factionId) score += 0.1;

  // Chronicle events contribute to notoriety
  const killCount = chronicle.filter((e) => e.event === 'used-in-kill').length;
  score += Math.min(killCount * 0.05, 0.25);

  const recognitionCount = chronicle.filter((e) => e.event === 'recognized').length;
  score += Math.min(recognitionCount * 0.05, 0.15);

  return Math.min(1, score);
}

// --- Formatting ---

/** Format provenance for narrator context (compact). */
export function formatProvenanceForNarrator(
  item: ItemDefinition,
  chronicle?: ItemChronicleEntry[],
): string {
  const prov = getItemProvenance(item);
  const parts: string[] = [item.name];

  if (prov?.flags && prov.flags.length > 0) {
    parts.push(`(${prov.flags.join(', ')})`);
  }

  if (chronicle && chronicle.length > 0) {
    const killCount = chronicle.filter((e) => e.event === 'used-in-kill').length;
    if (killCount > 0) parts.push(`${killCount} kills`);
  }

  return parts.join(' ');
}

/** Format provenance for director view (detailed). */
export function formatProvenanceForDirector(
  item: ItemDefinition,
  chronicle?: ItemChronicleEntry[],
): string {
  const prov = getItemProvenance(item);
  const lines: string[] = [];

  lines.push(`${item.name} (${item.slot}, ${item.rarity})`);

  if (prov) {
    if (prov.origin) lines.push(`  Origin: ${prov.origin}`);
    if (prov.factionId) lines.push(`  Faction: ${prov.factionId}`);
    if (prov.flags && prov.flags.length > 0) lines.push(`  Flags: ${prov.flags.join(', ')}`);
    if (prov.lore) lines.push(`  Lore: ${prov.lore}`);
  }

  if (chronicle && chronicle.length > 0) {
    const killCount = chronicle.filter((e) => e.event === 'used-in-kill').length;
    const recognitions = chronicle.filter((e) => e.event === 'recognized').length;
    lines.push(`  Chronicle: ${chronicle.length} events, ${killCount} kills, ${recognitions} recognitions`);
  }

  return lines.join('\n');
}
