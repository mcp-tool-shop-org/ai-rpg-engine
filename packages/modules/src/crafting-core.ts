// crafting-core — material tracking + salvage system
// v1.8: Items can be broken down into category-level materials.
// Materials map to the existing 8 supply categories.
// Player material inventory stored in profile.custom as `materials.{category}`.
// Pure functions, no side effects.

import type { SupplyCategory, EconomyShift, DistrictEconomy } from './economy-core.js';
import type { ItemDefinition, EquipmentSlot, ItemRarity, ItemProvenanceFlag } from '@ai-rpg-engine/equipment';

// --- Types ---

/** Quality tier derived from source item rarity */
export type MaterialQuality = 'poor' | 'standard' | 'fine';

/** A single material yield from salvage */
export type MaterialYield = {
  category: SupplyCategory;
  quantity: number;
  quality: MaterialQuality;
};

/** Full result of salvaging an item */
export type SalvageResult = {
  yields: MaterialYield[];
  /** Special byproducts from provenance flags (e.g. 'occult-residue') */
  byproducts: string[];
  /** Economy shifts applied to the district (player adds materials to local supply) */
  economyShifts: EconomyShift[];
  /** Chronicle detail string for the salvage event */
  chronicleDetail: string;
};

/** Context affecting salvage output */
export type SalvageContext = {
  districtEconomy: DistrictEconomy;
  districtId: string;
  districtTags: string[];
  /** District stability — affects yield quality */
  stability: number;
};

/** Player material inventory — one number per supply category */
export type MaterialInventory = Record<SupplyCategory, number>;

// --- Constants ---

const ALL_CATEGORIES: SupplyCategory[] = [
  'medicine', 'weapons', 'ammunition', 'food',
  'fuel', 'luxuries', 'components', 'contraband',
];

const MAX_MATERIALS = 50;

/** Salvage yield table: slot × rarity → yields */
const SALVAGE_YIELDS: Record<EquipmentSlot, Record<ItemRarity, { category: SupplyCategory; quantity: number }[]>> = {
  weapon: {
    common:    [{ category: 'components', quantity: 1 }],
    uncommon:  [{ category: 'components', quantity: 2 }, { category: 'weapons', quantity: 1 }],
    rare:      [{ category: 'components', quantity: 3 }, { category: 'weapons', quantity: 2 }],
    legendary: [{ category: 'components', quantity: 4 }, { category: 'weapons', quantity: 3 }],
  },
  armor: {
    common:    [{ category: 'components', quantity: 1 }],
    uncommon:  [{ category: 'components', quantity: 2 }, { category: 'luxuries', quantity: 1 }],
    rare:      [{ category: 'components', quantity: 3 }, { category: 'luxuries', quantity: 2 }],
    legendary: [{ category: 'components', quantity: 4 }, { category: 'luxuries', quantity: 3 }],
  },
  tool: {
    common:    [{ category: 'components', quantity: 2 }],
    uncommon:  [{ category: 'components', quantity: 3 }],
    rare:      [{ category: 'components', quantity: 4 }, { category: 'fuel', quantity: 1 }],
    legendary: [{ category: 'components', quantity: 5 }, { category: 'fuel', quantity: 2 }],
  },
  accessory: {
    common:    [{ category: 'luxuries', quantity: 1 }],
    uncommon:  [{ category: 'luxuries', quantity: 2 }],
    rare:      [{ category: 'luxuries', quantity: 2 }, { category: 'components', quantity: 1 }],
    legendary: [{ category: 'luxuries', quantity: 3 }, { category: 'components', quantity: 2 }],
  },
  trinket: {
    common:    [{ category: 'components', quantity: 1 }],
    uncommon:  [{ category: 'components', quantity: 1 }, { category: 'luxuries', quantity: 1 }],
    rare:      [{ category: 'luxuries', quantity: 2 }, { category: 'contraband', quantity: 1 }],
    legendary: [{ category: 'luxuries', quantity: 3 }, { category: 'contraband', quantity: 2 }],
  },
};

/** Map rarity to material quality */
const RARITY_QUALITY: Record<ItemRarity, MaterialQuality> = {
  common: 'poor',
  uncommon: 'standard',
  rare: 'fine',
  legendary: 'fine',
};

/** Byproduct mappings from provenance flags */
const FLAG_BYPRODUCTS: Partial<Record<ItemProvenanceFlag, string>> = {
  cursed: 'occult-residue',
  blessed: 'sanctified-essence',
  contraband: 'contraband-parts',
};

// --- Material Inventory ---

function clamp(v: number, min = 0, max = MAX_MATERIALS): number {
  return Math.max(min, Math.min(max, v));
}

/** Read player material inventory from profile.custom */
export function getMaterialInventory(
  custom: Record<string, string | number | boolean>,
): MaterialInventory {
  const inv = {} as MaterialInventory;
  for (const cat of ALL_CATEGORIES) {
    const key = `materials.${cat}`;
    const value = custom[key];
    inv[cat] = typeof value === 'number' ? value : 0;
  }
  return inv;
}

/** Adjust a single material category, clamped 0-50. Returns new custom. */
export function adjustMaterial(
  custom: Record<string, string | number | boolean>,
  category: SupplyCategory,
  delta: number,
): Record<string, string | number | boolean> {
  const key = `materials.${category}`;
  const current = typeof custom[key] === 'number' ? (custom[key] as number) : 0;
  const next = clamp(current + delta);
  return { ...custom, [key]: next };
}

/** Apply multiple material deltas. Returns new custom. */
export function applyMaterialDeltas(
  custom: Record<string, string | number | boolean>,
  deltas: Partial<Record<SupplyCategory, number>>,
): Record<string, string | number | boolean> {
  let result = custom;
  for (const [cat, delta] of Object.entries(deltas)) {
    if (delta !== undefined && delta !== 0) {
      result = adjustMaterial(result, cat as SupplyCategory, delta);
    }
  }
  return result;
}

/** Check if player has enough materials for a set of requirements */
export function hasMaterials(
  inventory: MaterialInventory,
  requirements: { category: SupplyCategory; quantity: number }[],
): boolean {
  // Aggregate requirements per category
  const needed: Partial<Record<SupplyCategory, number>> = {};
  for (const req of requirements) {
    needed[req.category] = (needed[req.category] ?? 0) + req.quantity;
  }
  for (const [cat, qty] of Object.entries(needed)) {
    if ((inventory[cat as SupplyCategory] ?? 0) < qty) return false;
  }
  return true;
}

/** Get total material count across all categories */
export function getTotalMaterials(inventory: MaterialInventory): number {
  let total = 0;
  for (const cat of ALL_CATEGORIES) {
    total += inventory[cat];
  }
  return total;
}

/** Get categories with non-zero materials, sorted by quantity descending */
export function getNonZeroMaterials(
  inventory: MaterialInventory,
): { category: SupplyCategory; quantity: number }[] {
  return ALL_CATEGORIES
    .filter((cat) => inventory[cat] > 0)
    .map((cat) => ({ category: cat, quantity: inventory[cat] }))
    .sort((a, b) => b.quantity - a.quantity);
}

// --- Salvage ---

/** Compute raw salvage yields for an item (without context modifiers) */
export function computeSalvageYield(
  item: ItemDefinition,
): MaterialYield[] {
  const baseYields = SALVAGE_YIELDS[item.slot]?.[item.rarity];
  if (!baseYields) return [];
  const quality = RARITY_QUALITY[item.rarity];
  return baseYields.map((y) => ({ category: y.category, quantity: y.quantity, quality }));
}

/** Full salvage resolution: yields + byproducts + economy shifts + chronicle detail */
export function salvageItem(
  item: ItemDefinition,
  context?: SalvageContext,
): SalvageResult {
  const yields = computeSalvageYield(item);
  const byproducts: string[] = [];
  const economyShifts: EconomyShift[] = [];

  // Byproducts from provenance flags
  const flags = item.provenance?.flags ?? [];
  for (const flag of flags) {
    const byproduct = FLAG_BYPRODUCTS[flag];
    if (byproduct) byproducts.push(byproduct);
  }

  // Economy shifts: player adds materials to local supply
  if (context) {
    for (const y of yields) {
      economyShifts.push({
        districtId: context.districtId,
        category: y.category,
        delta: 1, // +1 per yield unit to district supply
        cause: 'player-salvage',
      });
    }
  }

  // Build chronicle detail
  const yieldSummary = yields.map((y) => `${y.quantity} ${y.category}`).join(', ');
  const chronicleDetail = `Salvaged ${item.name} → ${yieldSummary}`;

  return { yields, byproducts, economyShifts, chronicleDetail };
}

/** Check if salvaging this item would generate suspicion */
export function wouldGenerateSuspicion(
  item: ItemDefinition,
  districtFactionIds: string[],
): boolean {
  const flags = item.provenance?.flags ?? [];
  if (!flags.includes('stolen')) return false;
  const itemFaction = item.provenance?.factionId;
  if (!itemFaction) return false;
  return districtFactionIds.includes(itemFaction);
}

/** Generate a rumor claim string for salvaging a notable item */
export function getSalvageRumorClaim(
  item: ItemDefinition,
  relicTier: number,
): string | undefined {
  if (relicTier > 0) {
    return `destroyed the ${relicTier >= 3 ? 'legendary' : relicTier >= 2 ? 'renowned' : 'notable'} ${item.name} for parts`;
  }
  if (item.rarity === 'legendary') {
    return `broke down the legendary ${item.name}`;
  }
  return undefined;
}

// --- Formatting ---

/** Director-facing detailed material view */
export function formatMaterialsForDirector(
  inventory: MaterialInventory,
): string {
  const divider = '─'.repeat(40);
  const lines: string[] = [divider, '  MATERIALS', divider];

  for (const cat of ALL_CATEGORIES) {
    const qty = inventory[cat];
    if (qty > 0) {
      const bar = '[' + '#'.repeat(Math.min(qty, 20)) + '.'.repeat(Math.max(0, 20 - qty)) + ']';
      lines.push(`  ${padRight(cat, 12)} ${bar} ${qty}`);
    }
  }

  const total = getTotalMaterials(inventory);
  if (total === 0) {
    lines.push('  (none)');
  }
  lines.push(divider);
  return lines.join('\n');
}

/** Compact one-line material summary for status display */
export function formatMaterialsCompact(
  inventory: MaterialInventory,
): string {
  const nonZero = getNonZeroMaterials(inventory);
  if (nonZero.length === 0) return '';
  const parts = nonZero.slice(0, 3).map((m) => `${m.quantity} ${m.category}`);
  return `Materials: ${parts.join(', ')}`;
}

/** Director-facing salvage preview */
export function formatSalvagePreview(
  item: ItemDefinition,
  result: SalvageResult,
): string {
  const lines: string[] = [
    `  Salvage: ${item.name} (${item.slot}, ${item.rarity})`,
    `  Yields: ${result.yields.map((y) => `${y.quantity} ${y.category} (${y.quality})`).join(', ')}`,
  ];
  if (result.byproducts.length > 0) {
    lines.push(`  Byproducts: ${result.byproducts.join(', ')}`);
  }
  return lines.join('\n');
}

// --- Internal helpers ---

function padRight(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - s.length));
}
