// crafting-recipes — genre-aware recipe tables + crafting/repair/modify resolution
// v1.8: Items can be crafted from materials, repaired, and modified.
// Quality scales with district prosperity, stability, faction access, and black market.
// All recipes are lookup-table driven — no per-pack configuration.
// Pure functions, no side effects.

import type { EngineModule, ActionIntent, WorldState, ResolvedEvent, EntityState } from '@ai-rpg-engine/core';
import type { SupplyCategory, DistrictEconomy } from './economy-core.js';
import type { MaterialInventory, SalvageContext } from './crafting-core.js';
import {
  hasMaterials,
  getMaterialInventory,
  applyMaterialDeltas,
  salvageItem,
  inferItemSlot,
} from './crafting-core.js';
import {
  getSupplyLevel,
  isBlackMarketCondition,
  getDistrictEconomy,
  setDistrictEconomy,
  applyEconomyShift,
} from './economy-core.js';
import { getDistrictForZone, getDistrictState, getDistrictDefinition } from './district-core.js';
import { computeDistrictMood } from './district-mood.js';
import { HEAT_KEY } from './world-tick.js';
import { makeEvent } from './make-event.js';
import type {
  ItemDefinition,
  EquipmentSlot,
  ItemRarity,
  ItemProvenance,
  ItemProvenanceFlag,
} from '@ai-rpg-engine/equipment';

// --- Types ---

export type RecipeCategory = 'craft' | 'repair' | 'modify';

export type ModificationKind =
  | 'field-repair'
  | 'enhancement'
  | 'makeshift'
  | 'faction-mark'
  | 'black-market'
  | 'blessed'
  | 'cursed';

export type CraftingRecipe = {
  id: string;
  name: string;
  category: RecipeCategory;
  inputs: { category: SupplyCategory; quantity: number }[];
  /** For 'craft' recipes: what slot the output occupies */
  outputSlot?: EquipmentSlot;
  /** For 'craft' recipes: output rarity before quality bonus */
  outputRarity?: ItemRarity;
  /** For 'modify' recipes: what kind of modification */
  modificationKind?: ModificationKind;
  /** Stat changes applied (for modify/repair) */
  statDelta?: Record<string, number>;
  /** Tags required on the player or district to use this recipe */
  requiredTags?: string[];
  /** Only available in these genres (undefined = all genres) */
  genreFilter?: string[];
  /** Short description of what this recipe produces */
  description: string;
};

/** Context affecting crafting quality and side effects */
export type CraftingContext = {
  districtEconomy: DistrictEconomy;
  districtId: string;
  districtTags: string[];
  prosperity: number;
  stability: number;
  factionAccess?: string;
  playerHeat: number;
  isBlackMarket: boolean;
};

/** Side effect from crafting */
export type CraftEffect =
  | { type: 'economy-shift'; districtId: string; category: SupplyCategory; delta: number; cause: string }
  | { type: 'rumor'; claim: string; valence: string }
  | { type: 'heat'; delta: number }
  | { type: 'reputation'; factionId: string; delta: number }
  | { type: 'suspicion'; delta: number };

/** Result of crafting a new item */
export type CraftResult = {
  success: boolean;
  /** Partial item definition (product layer fills in remaining fields) */
  outputItem?: Partial<ItemDefinition>;
  materialsConsumed: { category: SupplyCategory; quantity: number }[];
  qualityBonus: number;
  sideEffects: CraftEffect[];
  chronicleDetail: string;
};

/** Result of modifying an existing item */
export type ModifyResult = {
  success: boolean;
  /** New provenance to set on the item */
  newProvenance: ItemProvenance;
  /** Stat changes to apply */
  statDelta: Record<string, number>;
  /** New tags to grant */
  newTags?: string[];
  /** Lore text to append */
  loreAppend: string;
  /** New provenance flags to add */
  addFlags: ItemProvenanceFlag[];
  sideEffects: CraftEffect[];
  chronicleDetail: string;
};

// --- Recipe Tables ---

const UNIVERSAL_RECIPES: CraftingRecipe[] = [
  {
    id: 'repair-weapon',
    name: 'Repair Weapon',
    category: 'repair',
    inputs: [{ category: 'components', quantity: 2 }],
    description: 'Restore a damaged weapon',
  },
  {
    id: 'repair-armor',
    name: 'Repair Armor',
    category: 'repair',
    inputs: [{ category: 'components', quantity: 2 }, { category: 'luxuries', quantity: 1 }],
    description: 'Restore damaged armor',
  },
  {
    id: 'craft-bandage',
    name: 'Craft Bandage',
    category: 'craft',
    inputs: [{ category: 'medicine', quantity: 2 }],
    outputSlot: 'tool',
    outputRarity: 'common',
    description: 'Simple medical supplies',
  },
  {
    id: 'craft-torch',
    name: 'Craft Torch',
    category: 'craft',
    inputs: [{ category: 'fuel', quantity: 1 }, { category: 'components', quantity: 1 }],
    outputSlot: 'tool',
    outputRarity: 'common',
    description: 'A light source',
  },
  {
    id: 'modify-sharpen',
    name: 'Sharpen Weapon',
    category: 'modify',
    inputs: [{ category: 'components', quantity: 1 }],
    modificationKind: 'enhancement',
    statDelta: { attack: 1 },
    description: 'Hone a blade for +1 attack',
  },
  {
    id: 'modify-reinforce',
    name: 'Reinforce Armor',
    category: 'modify',
    inputs: [{ category: 'components', quantity: 2 }],
    modificationKind: 'enhancement',
    statDelta: { defense: 1 },
    description: 'Strengthen armor for +1 defense',
  },
];

const GENRE_RECIPES: Record<string, CraftingRecipe[]> = {
  fantasy: [
    {
      id: 'craft-potion',
      name: 'Brew Potion',
      category: 'craft',
      inputs: [{ category: 'medicine', quantity: 3 }],
      outputSlot: 'tool',
      outputRarity: 'uncommon',
      description: 'A restorative draught',
      genreFilter: ['fantasy'],
    },
    {
      id: 'modify-enchant',
      name: 'Enchant Item',
      category: 'modify',
      inputs: [{ category: 'components', quantity: 3 }, { category: 'luxuries', quantity: 1 }],
      modificationKind: 'enhancement',
      statDelta: { attack: 2 },
      description: 'Imbue with magical energy',
      genreFilter: ['fantasy'],
    },
    {
      id: 'modify-bless',
      name: 'Bless Item',
      category: 'modify',
      inputs: [{ category: 'medicine', quantity: 1 }],
      modificationKind: 'blessed',
      requiredTags: ['sacred'],
      description: 'Consecrate at a sacred site',
      genreFilter: ['fantasy'],
    },
    {
      id: 'repair-rune-mend',
      name: 'Rune-Mend Weapon',
      category: 'repair',
      inputs: [{ category: 'components', quantity: 2 }, { category: 'medicine', quantity: 1 }],
      statDelta: { attack: 1 },
      description: 'A hedge-mage anoints a blade with rune-oil, restoring its edge and a whisper of old magic',
      genreFilter: ['fantasy'],
    },
  ],
  zombie: [
    {
      id: 'craft-improvised-weapon',
      name: 'Improvised Weapon',
      category: 'craft',
      inputs: [{ category: 'weapons', quantity: 1 }, { category: 'components', quantity: 2 }],
      outputSlot: 'weapon',
      outputRarity: 'common',
      description: 'Makeshift melee weapon',
      genreFilter: ['zombie'],
    },
    {
      id: 'craft-medkit',
      name: 'Assemble Medkit',
      category: 'craft',
      inputs: [{ category: 'medicine', quantity: 3 }, { category: 'components', quantity: 1 }],
      outputSlot: 'tool',
      outputRarity: 'uncommon',
      description: 'Field medical supplies',
      genreFilter: ['zombie'],
    },
    {
      id: 'craft-barricade-kit',
      name: 'Barricade Kit',
      category: 'craft',
      inputs: [{ category: 'components', quantity: 3 }],
      outputSlot: 'tool',
      outputRarity: 'common',
      description: 'Fortification materials',
      genreFilter: ['zombie'],
    },
    {
      id: 'repair-scrap-splint',
      name: 'Scrap-Splint Repair',
      category: 'repair',
      inputs: [{ category: 'components', quantity: 3 }],
      statDelta: { attack: 1 },
      description: 'Splint a cracked weapon with scavenged scrap — ugly, but it holds through one more swing',
      genreFilter: ['zombie'],
    },
  ],
  cyberpunk: [
    {
      id: 'craft-stim',
      name: 'Synthesize Stim',
      category: 'craft',
      inputs: [{ category: 'medicine', quantity: 2 }, { category: 'components', quantity: 1 }],
      outputSlot: 'tool',
      outputRarity: 'uncommon',
      description: 'Chemical performance enhancer',
      genreFilter: ['cyberpunk'],
    },
    {
      id: 'modify-overclock',
      name: 'Overclock',
      category: 'modify',
      inputs: [{ category: 'components', quantity: 3 }, { category: 'fuel', quantity: 1 }],
      modificationKind: 'enhancement',
      statDelta: { attack: 2, defense: -1 },
      description: 'Push hardware past safety limits',
      genreFilter: ['cyberpunk'],
    },
    {
      id: 'modify-black-market-tune',
      name: 'Black Market Tune',
      category: 'modify',
      inputs: [{ category: 'contraband', quantity: 2 }],
      modificationKind: 'black-market',
      statDelta: { attack: 3 },
      requiredTags: ['black-market'],
      description: 'Illegal performance modification',
      genreFilter: ['cyberpunk'],
    },
    {
      id: 'repair-nanite-weld',
      name: 'Nanite Weld',
      category: 'repair',
      inputs: [{ category: 'components', quantity: 2 }, { category: 'fuel', quantity: 1 }],
      statDelta: { defense: 1 },
      description: 'A self-assembling nanite swarm welds hairline fractures shut from the inside out',
      genreFilter: ['cyberpunk'],
    },
  ],
  pirate: [
    {
      id: 'craft-grappling-hook',
      name: 'Craft Grappling Hook',
      category: 'craft',
      inputs: [{ category: 'components', quantity: 2 }, { category: 'weapons', quantity: 1 }],
      outputSlot: 'tool',
      outputRarity: 'uncommon',
      description: 'Boarding equipment',
      genreFilter: ['pirate'],
    },
    {
      id: 'modify-faction-mark',
      name: 'Faction Mark',
      category: 'modify',
      inputs: [{ category: 'luxuries', quantity: 1 }],
      modificationKind: 'faction-mark',
      description: 'Brand with faction insignia',
      genreFilter: ['pirate'],
    },
    {
      id: 'craft-rum-ration',
      name: 'Distill Rum',
      category: 'craft',
      inputs: [{ category: 'food', quantity: 2 }, { category: 'fuel', quantity: 1 }],
      outputSlot: 'tool',
      outputRarity: 'common',
      description: 'Morale-boosting spirits',
      genreFilter: ['pirate'],
    },
    {
      id: 'repair-shipwrights-patch',
      name: "Shipwright's Patch",
      category: 'repair',
      inputs: [{ category: 'components', quantity: 2 }, { category: 'weapons', quantity: 1 }],
      statDelta: { attack: 1 },
      description: "A ship's carpenter straightens a bent blade with salvaged cutlass parts and pitch",
      genreFilter: ['pirate'],
    },
  ],
  detective: [
    {
      id: 'craft-disguise-kit',
      name: 'Assemble Disguise',
      category: 'craft',
      inputs: [{ category: 'luxuries', quantity: 2 }, { category: 'components', quantity: 1 }],
      outputSlot: 'accessory',
      outputRarity: 'uncommon',
      description: 'Identity concealment tools',
      genreFilter: ['detective'],
    },
    {
      id: 'modify-conceal',
      name: 'Conceal Weapon',
      category: 'modify',
      inputs: [{ category: 'components', quantity: 2 }],
      modificationKind: 'enhancement',
      statDelta: { stealth: 2 },
      description: 'Hide a weapon from inspection',
      genreFilter: ['detective'],
    },
    {
      id: 'repair-quiet-fix',
      name: 'Quiet Fix',
      category: 'repair',
      inputs: [{ category: 'components', quantity: 2 }, { category: 'luxuries', quantity: 1 }],
      statDelta: { stealth: 1 },
      description: 'A favor and a bribe get a piece repaired off the books — no report filed',
      genreFilter: ['detective'],
    },
  ],
  colony: [
    {
      id: 'craft-survival-kit',
      name: 'Survival Kit',
      category: 'craft',
      inputs: [{ category: 'components', quantity: 2 }, { category: 'food', quantity: 1 }],
      outputSlot: 'tool',
      outputRarity: 'common',
      description: 'Essential survival supplies',
      genreFilter: ['colony'],
    },
    {
      id: 'modify-field-repair',
      name: 'Field Repair',
      category: 'modify',
      inputs: [{ category: 'components', quantity: 1 }],
      modificationKind: 'field-repair',
      statDelta: { durability: 1 },
      description: 'Rough-and-ready patch job',
      genreFilter: ['colony'],
    },
    {
      id: 'repair-scrap-patch',
      name: 'Scrap-Patch Repair',
      category: 'repair',
      inputs: [{ category: 'components', quantity: 2 }, { category: 'food', quantity: 1 }],
      statDelta: { durability: 1 },
      description: "Trade field rations for a settler-mechanic's time patching failing gear",
      genreFilter: ['colony'],
    },
  ],
  'weird-west': [
    {
      id: 'craft-silver-bullets',
      name: 'Cast Silver Rounds',
      category: 'craft',
      inputs: [{ category: 'ammunition', quantity: 2 }, { category: 'luxuries', quantity: 1 }],
      outputSlot: 'tool',
      outputRarity: 'uncommon',
      description: 'Ammunition for unnatural threats',
      genreFilter: ['weird-west'],
    },
    {
      id: 'modify-curse',
      name: 'Hex Item',
      category: 'modify',
      inputs: [{ category: 'contraband', quantity: 1 }, { category: 'medicine', quantity: 1 }],
      modificationKind: 'cursed',
      statDelta: { attack: 2 },
      description: 'Bind dark power to an item',
      genreFilter: ['weird-west'],
    },
    {
      id: 'repair-frontier-forge',
      name: 'Frontier Forge Repair',
      category: 'repair',
      inputs: [{ category: 'components', quantity: 2 }, { category: 'ammunition', quantity: 1 }],
      statDelta: { attack: 1 },
      description: 'A traveling gunsmith reforges a piece at the frontier anvil, a pinch of silver dust worked into the weld',
      genreFilter: ['weird-west'],
    },
  ],
};

/**
 * NOTE: statDelta on repair recipes (e.g. repair-rune-mend, repair-scrap-splint)
 * is AUTHORED BUT INTENTIONALLY NOT YET APPLIED. resolveRepair does not read it
 * today (only resolveModify does); repair-as-upgrade is DEFERRED to v3.2/v3.3.
 */

// --- Recipe Access ---

/** Get all available recipes for a genre, filtered by player/district tags */
export function getAvailableRecipes(
  genre: string,
  playerTags?: string[],
  districtTags?: string[],
): CraftingRecipe[] {
  const allRecipes = [
    ...UNIVERSAL_RECIPES,
    ...(GENRE_RECIPES[genre] ?? []),
  ];

  return allRecipes.filter((recipe) => {
    if (recipe.requiredTags && recipe.requiredTags.length > 0) {
      const available = [...(playerTags ?? []), ...(districtTags ?? [])];
      return recipe.requiredTags.every((tag) => available.includes(tag));
    }
    return true;
  });
}

/** Get a recipe by ID */
export function getRecipeById(genre: string, recipeId: string): CraftingRecipe | undefined {
  const allRecipes = [...UNIVERSAL_RECIPES, ...(GENRE_RECIPES[genre] ?? [])];
  return allRecipes.find((r) => r.id === recipeId);
}

/** Check if a recipe can be crafted with available materials and context */
export function canCraft(
  recipe: CraftingRecipe,
  materials: MaterialInventory,
  context?: CraftingContext,
): { affordable: boolean; meetsRequirements: boolean; reason?: string } {
  const affordable = hasMaterials(materials, recipe.inputs);
  if (!affordable) {
    return { affordable: false, meetsRequirements: true, reason: 'insufficient materials' };
  }

  // Black market recipes require black market
  if (recipe.modificationKind === 'black-market' && context && !context.isBlackMarket) {
    return { affordable: true, meetsRequirements: false, reason: 'requires black market' };
  }

  return { affordable: true, meetsRequirements: true };
}

// --- Crafting Resolution ---

const RARITY_ORDER: ItemRarity[] = ['common', 'uncommon', 'rare', 'legendary'];

function upgradeRarity(rarity: ItemRarity): ItemRarity {
  const idx = RARITY_ORDER.indexOf(rarity);
  if (idx < RARITY_ORDER.length - 1) return RARITY_ORDER[idx + 1];
  return rarity;
}

/** Compute quality bonus from crafting context */
export function computeQualityBonus(context: CraftingContext): number {
  let bonus = 0;
  if (context.prosperity > 60) bonus += 1;
  if (context.stability > 50) bonus += 0; // stability affects rarity upgrade, not bonus
  return bonus;
}

/** Should the output rarity be upgraded? (stability-based) */
function shouldUpgradeRarity(context: CraftingContext): boolean {
  if (context.stability <= 50) return false;
  // Deterministic: hash district + prosperity for reproducibility
  const hash = simpleHash(context.districtId + context.prosperity);
  return (hash % 5) === 0; // ~20% chance
}

/** Resolve a craft recipe — produces a new item */
export function resolveCraft(
  recipe: CraftingRecipe,
  context: CraftingContext,
): CraftResult {
  if (recipe.category !== 'craft' || !recipe.outputSlot || !recipe.outputRarity) {
    return {
      success: false,
      materialsConsumed: [],
      qualityBonus: 0,
      sideEffects: [],
      chronicleDetail: `Failed to craft: ${recipe.name} is not a craft recipe`,
    };
  }

  const qualityBonus = computeQualityBonus(context);
  let outputRarity = recipe.outputRarity;
  if (shouldUpgradeRarity(context)) {
    outputRarity = upgradeRarity(outputRarity);
  }

  // Build provenance
  const provenance: ItemProvenance = {
    origin: context.factionAccess
      ? `Commissioned by ${context.factionAccess}`
      : `Crafted in ${context.districtId}`,
  };

  const flags: ItemProvenanceFlag[] = [];
  if (context.isBlackMarket && recipe.modificationKind === 'black-market') {
    flags.push('contraband');
  }
  if (recipe.modificationKind === 'makeshift') {
    // No special flags for makeshift — it's desperate crafting
  }
  if (context.factionAccess) {
    provenance.factionId = context.factionAccess;
  }
  if (flags.length > 0) provenance.flags = flags;

  // Build output item fragment
  const statModifiers: Record<string, number> = {};
  if (recipe.statDelta) {
    for (const [stat, value] of Object.entries(recipe.statDelta)) {
      statModifiers[stat] = value;
    }
  }
  // Quality bonus adds to highest stat
  if (qualityBonus > 0 && Object.keys(statModifiers).length > 0) {
    const highest = Object.entries(statModifiers).sort((a, b) => b[1] - a[1])[0];
    if (highest) statModifiers[highest[0]] += qualityBonus;
  }

  const outputItem: Partial<ItemDefinition> = {
    slot: recipe.outputSlot,
    rarity: outputRarity,
    provenance,
    statModifiers: Object.keys(statModifiers).length > 0 ? statModifiers : undefined,
  };

  // Side effects
  const sideEffects: CraftEffect[] = [];

  // Crafting rare+ items generates a rumor
  const rarityIdx = RARITY_ORDER.indexOf(outputRarity);
  if (rarityIdx >= 2) {
    sideEffects.push({
      type: 'rumor',
      claim: `forged a ${outputRarity} ${recipe.outputSlot}`,
      valence: 'heroic',
    });
  }

  // Economy shift: crafting consumes from district supply slightly
  for (const input of recipe.inputs) {
    const supplyLevel = getSupplyLevel(context.districtEconomy, input.category);
    if (supplyLevel > 10) {
      sideEffects.push({
        type: 'economy-shift',
        districtId: context.districtId,
        category: input.category,
        delta: -1,
        cause: 'player-crafting',
      });
    }
  }

  return {
    success: true,
    outputItem,
    materialsConsumed: recipe.inputs,
    qualityBonus,
    sideEffects,
    chronicleDetail: `Crafted ${recipe.name} (${outputRarity} ${recipe.outputSlot})`,
  };
}

/** Resolve a repair — restores item stat modifiers */
export function resolveRepair(
  item: ItemDefinition,
  recipe: CraftingRecipe,
  context: CraftingContext,
): CraftResult {
  const sideEffects: CraftEffect[] = [];

  // Economy shift from material consumption
  for (const input of recipe.inputs) {
    sideEffects.push({
      type: 'economy-shift',
      districtId: context.districtId,
      category: input.category,
      delta: -1,
      cause: 'player-repair',
    });
  }

  return {
    success: true,
    materialsConsumed: recipe.inputs,
    qualityBonus: 0,
    sideEffects,
    chronicleDetail: `Repaired ${item.name}`,
  };
}

/** Resolve a modification — applies stat deltas, provenance, and lore to an item */
export function resolveModify(
  item: ItemDefinition,
  recipe: CraftingRecipe,
  context: CraftingContext,
): ModifyResult {
  const kind = recipe.modificationKind ?? 'enhancement';
  const statDelta = recipe.statDelta ?? {};
  const addFlags: ItemProvenanceFlag[] = [];
  const sideEffects: CraftEffect[] = [];
  let loreAppend = '';

  // Apply modification-specific effects
  switch (kind) {
    case 'field-repair':
      loreAppend = 'Patched in the field with rough materials.';
      break;
    case 'enhancement':
      loreAppend = `Enhanced: ${recipe.name}.`;
      break;
    case 'makeshift':
      loreAppend = 'Cobbled together from scavenged parts.';
      break;
    case 'faction-mark':
      if (context.factionAccess) {
        loreAppend = `Marked with the insignia of ${context.factionAccess}.`;
        sideEffects.push({ type: 'reputation', factionId: context.factionAccess, delta: 5 });
      } else {
        loreAppend = 'Marked with a faction brand.';
      }
      break;
    case 'black-market':
      addFlags.push('contraband');
      loreAppend = 'Modified through illegal channels.';
      sideEffects.push({ type: 'heat', delta: 10 });
      break;
    case 'blessed':
      addFlags.push('blessed');
      loreAppend = 'Consecrated and blessed.';
      if (context.stability < 50) {
        sideEffects.push({ type: 'rumor', claim: `blessed a ${item.slot} at a sacred site`, valence: 'mysterious' });
      }
      break;
    case 'cursed':
      addFlags.push('cursed');
      loreAppend = 'Bound with dark power.';
      sideEffects.push({ type: 'rumor', claim: `hexed their ${item.slot} with dark magic`, valence: 'fearsome' });
      break;
  }

  // Economy shift from material consumption
  for (const input of recipe.inputs) {
    sideEffects.push({
      type: 'economy-shift',
      districtId: context.districtId,
      category: input.category,
      delta: -1,
      cause: 'player-modification',
    });
  }

  // Build new provenance by merging
  const existingFlags = item.provenance?.flags ?? [];
  const mergedFlags = [...new Set([...existingFlags, ...addFlags])];
  const existingLore = item.provenance?.lore ?? '';
  const newLore = existingLore ? `${existingLore} ${loreAppend}` : loreAppend;

  const newProvenance: ItemProvenance = {
    ...item.provenance,
    flags: mergedFlags.length > 0 ? mergedFlags as ItemProvenanceFlag[] : undefined,
    lore: newLore || undefined,
  };

  // If faction mark and faction access, add faction
  if (kind === 'faction-mark' && context.factionAccess) {
    newProvenance.factionId = context.factionAccess;
  }

  return {
    success: true,
    newProvenance,
    statDelta,
    addFlags,
    loreAppend,
    sideEffects,
    chronicleDetail: `Modified ${item.name}: ${recipe.name}`,
  };
}

// --- Formatting ---

/** Format a single recipe for director view */
export function formatRecipeForDirector(
  recipe: CraftingRecipe,
  materials: MaterialInventory,
): string {
  const canDo = hasMaterials(materials, recipe.inputs);
  const status = canDo ? 'CAN CRAFT' : 'missing materials';
  const cost = recipe.inputs.map((i) => `${i.quantity} ${i.category}`).join(' + ');
  return `  ${recipe.name} [${recipe.category}] — ${cost} → ${recipe.description} (${status})`;
}

/** Format all available recipes for director view */
export function formatAvailableRecipesForDirector(
  recipes: CraftingRecipe[],
  materials: MaterialInventory,
): string {
  const divider = '─'.repeat(60);
  const lines: string[] = [divider, '  RECIPES', divider];

  const crafts = recipes.filter((r) => r.category === 'craft');
  const repairs = recipes.filter((r) => r.category === 'repair');
  const mods = recipes.filter((r) => r.category === 'modify');

  if (crafts.length > 0) {
    lines.push('  Craft:');
    for (const r of crafts) lines.push('  ' + formatRecipeForDirector(r, materials));
  }
  if (repairs.length > 0) {
    lines.push('  Repair:');
    for (const r of repairs) lines.push('  ' + formatRecipeForDirector(r, materials));
  }
  if (mods.length > 0) {
    lines.push('  Modify:');
    for (const r of mods) lines.push('  ' + formatRecipeForDirector(r, materials));
  }

  if (recipes.length === 0) {
    lines.push('  (no recipes available)');
  }

  lines.push(divider);
  return lines.join('\n');
}

// --- Internal helpers ---

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Module (v1.8 write-wire, F-6631dd57) — the crafting verbs
// ---------------------------------------------------------------------------
//
// salvageItem/resolveCraft/resolveRepair/resolveModify (above, and crafting-
// core.ts's material-inventory API — getMaterialInventory/adjustMaterial/
// applyMaterialDeltas/hasMaterials) were fully authored and unit-tested with
// ZERO production callers: no played session ever invoked 'salvage'/'craft'/
// 'repair'/'modify', so director.ts's MATERIALS section (F-ENG005) has read a
// permanently-empty getMaterialInventory({}) since it was written.
// createCraftingCore is the write-wire: four thin verb wrappers over the
// functions above, following trade-core.ts's own shape exactly — verb(s)
// only, NO persistence namespace (material state already lives on
// actor.custom, the SAME address getMaterialInventory/adjustMaterial already
// target; there is nothing new to seed or migrate).
//
// SALVAGE FIRST (this wave's priority slice): consumes one carried item,
// writes materials via applyMaterialDeltas, and — when the actor is standing
// in a district — applies salvageItem's own EconomyShift back into that
// district's live economy. Mirrors trade-core.ts's sellHandler exactly:
// resolve the district from actor.zoneId via getDistrictForZone, read/write
// its economy through getDistrictEconomy/setDistrictEconomy, no separate
// "market" namespace. Unlike sell, salvage does NOT reject when no district
// resolves — breaking an item down for parts needs no market, only the
// economy-shift half of the result is skipped (salvageItem's context
// parameter is already optional for exactly this case).
//
// craft/repair/modify all resolve a CraftingRecipe by id (recipeRefOf) and
// require a district (CraftingContext's fields — prosperity, stability,
// isBlackMarket — have no meaningful reading outside one, so these three
// reject with 'nowhere to craft/repair/modify here', the same posture
// trade-core's sell takes for its own required district). prosperity comes
// from district-mood.ts's computeDistrictMood (its own module-header
// documents craftingEfficiency as authored FOR this consumer); stability is
// district-core's own ~0-10 metric ×10, the identical scaling world-tick.ts's
// tickDistrictEconomies already established for economy-core's stability
// parameter — an unconfigured district lands on the same neutral baseline on
// both call sites.
//
// Honest ceiling (mirrors trade-core.ts's own documented ceiling): the plain
// inventory these verbs read/write (EntityState.inventory: string[]) carries
// no catalog metadata — no ItemDefinition, no rarity, no provenance.
// @ai-rpg-engine/modules cannot value-import @ai-rpg-engine/equipment's
// runtime API (minimal-install-proof.test.ts pins this package's dependency
// surface), so there is no catalog to resolve a carried item id against.
// inferItemSlot (crafting-core.ts) infers a slot from the item id's own
// text — the same hint-matching idiom inferSupplyCategory already uses — and
// every repair/modify target is treated as 'common' rarity with no
// provenance. Materials produced by 'craft' are identified by the recipe's
// OWN id (crafting-recipes.ts has no separate item catalog to mint a
// distinct id from): a 'craft-potion' recipe produces a 'craft-potion' item
// in the actor's inventory. modify's mechanical output (statDelta,
// newProvenance, loreAppend) has nowhere to persist against a bare inventory
// string — it rides the emitted event's payload only, the same restraint
// director.ts's own EQUIPMENT/Chronicle section documents for a real gap
// rather than papering over it.
//
// Side effects: only the 'economy-shift' CraftEffect variant is applied to
// persisted state (folded into the district economy, same as salvage).
// 'rumor'/'heat'/'reputation'/'suspicion' effects are surfaced in the
// emitted event's payload but not written — those targets (world.globals
// player_heat, world.factions[id].reputation) are single-writer state owned
// by world-tick.ts elsewhere in this package; writing them directly here
// would contest that ownership. Exactly trade-core.ts's own restraint (its
// sellHandler applies economy-shift only, leaving TradeEffect's other
// variants declared but unconsumed).

export type CraftingCoreConfig = {
  /**
   * Recipe genre — a GENRE_RECIPES key (e.g. 'fantasy', 'cyberpunk'). Omit
   * for UNIVERSAL_RECIPES only: craft/repair/modify still work with zero
   * config, genre-flavored recipes are additive.
   */
  genre?: string;
};

function craftingReject(action: ActionIntent, reason: string): ResolvedEvent[] {
  return [makeEvent(action, 'action.rejected', { verb: action.verb, reason })];
}

/** The carried item a salvage action targets — mirrors trade-core.ts's sellHandler item lookup exactly. */
function salvageItemRefOf(action: ActionIntent): string | undefined {
  if (typeof action.toolId === 'string' && action.toolId.length > 0) return action.toolId;
  return action.targetIds?.[0];
}

/** The recipe a craft/repair/modify action selects. */
function recipeRefOf(action: ActionIntent): string | undefined {
  const fromParams = action.parameters?.recipeId;
  if (typeof fromParams === 'string' && fromParams.length > 0) return fromParams;
  if (typeof action.toolId === 'string' && action.toolId.length > 0) return action.toolId;
  return undefined;
}

/** Build a synthesized ItemDefinition from a bare carried item id — see the module header's honest ceiling. */
function inferredItem(itemId: string): ItemDefinition {
  return { id: itemId, name: itemId, description: '', slot: inferItemSlot(itemId), rarity: 'common' };
}

function numGlobal(world: WorldState, key: string): number {
  const value = world.globals[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** The actor's current district: economy, tags, mood-derived prosperity, and scaled stability — or undefined outside any district. */
type ResolvedDistrict = {
  districtId: string;
  economy: DistrictEconomy;
  tags: string[];
  prosperity: number;
  stability: number;
  controllingFaction?: string;
};

function resolveDistrict(world: WorldState, actor: EntityState): ResolvedDistrict | undefined {
  const zoneId = actor.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  const economy = districtId ? getDistrictEconomy(world, districtId) : undefined;
  if (!districtId || !economy) return undefined;

  const def = getDistrictDefinition(world, districtId);
  const state = getDistrictState(world, districtId);
  const mood = state ? computeDistrictMood(state, def?.tags ?? []) : undefined;

  return {
    districtId,
    economy,
    tags: def?.tags ?? [],
    prosperity: mood?.prosperity ?? 50,
    // ×10: district-core's raw metric is a ~0-10 zone-property average;
    // CraftingContext's own stability thresholds (computeQualityBonus,
    // shouldUpgradeRarity — both `> 50` checks) assume the 0-100 scale
    // world-tick.ts's tickDistrictEconomies already established for
    // economy-core's stability parameter.
    stability: (state?.stability ?? 5) * 10,
    ...(def?.controllingFaction ? { controllingFaction: def.controllingFaction } : {}),
  };
}

/** Reputation-gated faction access — the same reputation_<id> global + world.factions merge trade-core.ts's sellHandler uses. */
function resolveFactionAccess(world: WorldState, district: ResolvedDistrict): string | undefined {
  if (!district.controllingFaction) return undefined;
  const reputation =
    (world.factions?.[district.controllingFaction]?.reputation ?? 0) +
    numGlobal(world, `reputation_${district.controllingFaction}`);
  return reputation > 0 ? district.controllingFaction : undefined;
}

function buildCraftingContext(world: WorldState, district: ResolvedDistrict): CraftingContext {
  const factionAccess = resolveFactionAccess(world, district);
  return {
    districtEconomy: district.economy,
    districtId: district.districtId,
    districtTags: district.tags,
    prosperity: district.prosperity,
    stability: district.stability,
    ...(factionAccess ? { factionAccess } : {}),
    playerHeat: numGlobal(world, HEAT_KEY),
    isBlackMarket: isBlackMarketCondition(district.economy),
  };
}

/** Consume recipe.inputs from actor.custom (negative deltas) — the same address salvage writes materials TO. */
function consumeMaterials(
  custom: Record<string, string | number | boolean>,
  inputs: { category: SupplyCategory; quantity: number }[],
): Record<string, string | number | boolean> {
  const deltas: Partial<Record<SupplyCategory, number>> = {};
  for (const input of inputs) deltas[input.category] = (deltas[input.category] ?? 0) - input.quantity;
  return applyMaterialDeltas(custom, deltas);
}

/** Fold every 'economy-shift' CraftEffect into the district economy (persisting the result); returns the remaining, non-economy effects for payload-only surfacing (see module header). */
function applyCraftEconomyShifts(
  world: WorldState,
  districtId: string,
  startingEconomy: DistrictEconomy,
  effects: CraftEffect[],
): CraftEffect[] {
  let economy = startingEconomy;
  let touched = false;
  const rest: CraftEffect[] = [];
  for (const effect of effects) {
    if (effect.type === 'economy-shift') {
      economy = applyEconomyShift(economy, {
        districtId: effect.districtId,
        category: effect.category,
        delta: effect.delta,
        cause: effect.cause,
      });
      touched = true;
    } else {
      rest.push(effect);
    }
  }
  if (touched) setDistrictEconomy(world, districtId, economy);
  return rest;
}

function salvageHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return craftingReject(action, 'actor not found');

  const itemId = salvageItemRefOf(action);
  if (!itemId) return craftingReject(action, 'no item specified');

  const inventory = actor.inventory ?? [];
  const itemIndex = inventory.indexOf(itemId);
  if (itemIndex === -1) return craftingReject(action, `you don't have ${itemId}`);

  const item = inferredItem(itemId);
  const district = resolveDistrict(world, actor);
  const context: SalvageContext | undefined = district
    ? { districtEconomy: district.economy, districtId: district.districtId, districtTags: district.tags, stability: district.stability }
    : undefined;

  const result = salvageItem(item, context);

  // Consume the item (salvage destroys it) — same splice inventory-core's
  // 'use' verb and trade-core's sellHandler perform.
  inventory.splice(itemIndex, 1);
  actor.inventory = inventory;

  // Write materials — the SAME actor.custom address getMaterialInventory/
  // adjustMaterial already target (F-6631dd57: no new namespace).
  const deltas: Partial<Record<SupplyCategory, number>> = {};
  for (const y of result.yields) deltas[y.category] = (deltas[y.category] ?? 0) + y.quantity;
  actor.custom = applyMaterialDeltas(actor.custom ?? {}, deltas);

  // Apply the district economy shift(s) salvageItem already computed — no
  // rejection when there is no district (see module header); the shift is
  // simply skipped, materials still write.
  if (district && result.economyShifts.length > 0) {
    let economy = district.economy;
    for (const shift of result.economyShifts) economy = applyEconomyShift(economy, shift);
    setDistrictEconomy(world, district.districtId, economy);
  }

  return [
    makeEvent(action, 'item.salvaged', {
      entityId: actor.id,
      itemId,
      materials: result.yields,
      byproducts: result.byproducts,
      ...(district ? { districtId: district.districtId } : {}),
      chronicleDetail: result.chronicleDetail,
    }, {
      targetIds: [actor.id],
      tags: ['crafting'],
      presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
    }),
  ];
}

function craftHandler(action: ActionIntent, world: WorldState, genre: string): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return craftingReject(action, 'actor not found');

  const recipeId = recipeRefOf(action);
  if (!recipeId) return craftingReject(action, 'no recipe specified');
  const recipe = getRecipeById(genre, recipeId);
  if (!recipe) return craftingReject(action, `unknown recipe: ${recipeId}`);
  if (recipe.category !== 'craft') return craftingReject(action, `'${recipe.name}' is not a craft recipe`);

  const district = resolveDistrict(world, actor);
  if (!district) return craftingReject(action, 'nowhere to craft here');

  const materials = getMaterialInventory(actor.custom ?? {});
  const context = buildCraftingContext(world, district);

  const afford = canCraft(recipe, materials, context);
  if (!afford.affordable || !afford.meetsRequirements) {
    return craftingReject(action, afford.reason ?? 'cannot craft this recipe');
  }

  const result = resolveCraft(recipe, context);
  if (!result.success) return craftingReject(action, result.chronicleDetail);

  actor.custom = consumeMaterials(actor.custom ?? {}, result.materialsConsumed);

  // Produce the item: the recipe IS the item's identity (see module header).
  actor.inventory = [...(actor.inventory ?? []), recipe.id];

  const otherEffects = applyCraftEconomyShifts(world, district.districtId, district.economy, result.sideEffects);

  return [
    makeEvent(action, 'item.crafted', {
      entityId: actor.id,
      recipeId: recipe.id,
      recipeName: recipe.name,
      itemId: recipe.id,
      outputItem: result.outputItem,
      qualityBonus: result.qualityBonus,
      materialsConsumed: result.materialsConsumed,
      districtId: district.districtId,
      chronicleDetail: result.chronicleDetail,
      ...(otherEffects.length > 0 ? { sideEffects: otherEffects } : {}),
    }, {
      targetIds: [actor.id],
      tags: ['crafting'],
      presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
    }),
  ];
}

function repairHandler(action: ActionIntent, world: WorldState, genre: string): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return craftingReject(action, 'actor not found');

  const recipeId = recipeRefOf(action);
  if (!recipeId) return craftingReject(action, 'no recipe specified');
  const recipe = getRecipeById(genre, recipeId);
  if (!recipe) return craftingReject(action, `unknown recipe: ${recipeId}`);
  if (recipe.category !== 'repair') return craftingReject(action, `'${recipe.name}' is not a repair recipe`);

  const itemId = action.targetIds?.[0];
  if (!itemId) return craftingReject(action, 'no item specified');
  const inventory = actor.inventory ?? [];
  if (!inventory.includes(itemId)) return craftingReject(action, `you don't have ${itemId}`);

  const district = resolveDistrict(world, actor);
  if (!district) return craftingReject(action, 'nowhere to repair here');

  const materials = getMaterialInventory(actor.custom ?? {});
  const context = buildCraftingContext(world, district);

  const afford = canCraft(recipe, materials, context);
  if (!afford.affordable || !afford.meetsRequirements) {
    return craftingReject(action, afford.reason ?? 'cannot repair with this recipe');
  }

  const item = inferredItem(itemId);
  const result = resolveRepair(item, recipe, context);

  actor.custom = consumeMaterials(actor.custom ?? {}, result.materialsConsumed);
  const otherEffects = applyCraftEconomyShifts(world, district.districtId, district.economy, result.sideEffects);

  return [
    makeEvent(action, 'item.repaired', {
      entityId: actor.id,
      itemId,
      recipeId: recipe.id,
      materialsConsumed: result.materialsConsumed,
      districtId: district.districtId,
      chronicleDetail: result.chronicleDetail,
      ...(otherEffects.length > 0 ? { sideEffects: otherEffects } : {}),
    }, {
      targetIds: [actor.id],
      tags: ['crafting'],
      presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
    }),
  ];
}

function modifyHandler(action: ActionIntent, world: WorldState, genre: string): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return craftingReject(action, 'actor not found');

  const recipeId = recipeRefOf(action);
  if (!recipeId) return craftingReject(action, 'no recipe specified');
  const recipe = getRecipeById(genre, recipeId);
  if (!recipe) return craftingReject(action, `unknown recipe: ${recipeId}`);
  if (recipe.category !== 'modify') return craftingReject(action, `'${recipe.name}' is not a modification recipe`);

  const itemId = action.targetIds?.[0];
  if (!itemId) return craftingReject(action, 'no item specified');
  const inventory = actor.inventory ?? [];
  if (!inventory.includes(itemId)) return craftingReject(action, `you don't have ${itemId}`);

  const district = resolveDistrict(world, actor);
  if (!district) return craftingReject(action, 'nowhere to work here');

  const materials = getMaterialInventory(actor.custom ?? {});
  const context = buildCraftingContext(world, district);

  const afford = canCraft(recipe, materials, context);
  if (!afford.affordable || !afford.meetsRequirements) {
    return craftingReject(action, afford.reason ?? 'cannot modify with this recipe');
  }

  const item = inferredItem(itemId);
  const result = resolveModify(item, recipe, context);

  actor.custom = consumeMaterials(actor.custom ?? {}, recipe.inputs);
  const otherEffects = applyCraftEconomyShifts(world, district.districtId, district.economy, result.sideEffects);

  return [
    makeEvent(action, 'item.modified', {
      entityId: actor.id,
      itemId,
      recipeId: recipe.id,
      // Honest ceiling: a bare inventory string has no per-item metadata slot
      // to persist these into (see module header) — surfaced for a future
      // catalog-aware consumer.
      statDelta: result.statDelta,
      newProvenance: result.newProvenance,
      loreAppend: result.loreAppend,
      districtId: district.districtId,
      chronicleDetail: result.chronicleDetail,
      ...(otherEffects.length > 0 ? { sideEffects: otherEffects } : {}),
    }, {
      targetIds: [actor.id],
      tags: ['crafting'],
      presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
    }),
  ];
}

/**
 * The crafting-core module: registers 'salvage', 'craft', 'repair', and
 * 'modify'. No persistence namespace (F-6631dd57 — material state already
 * lives on actor.custom). Always included in buildWorldStack (world-stack.ts),
 * the same always-on contract economy-core/trade-core/companion-core have.
 */
export function createCraftingCore(config: CraftingCoreConfig = {}): EngineModule {
  const genre = config.genre ?? '';
  return {
    id: 'crafting-core',
    version: '1.0.0',

    register(ctx) {
      ctx.actions.registerVerb('salvage', (action, world) => salvageHandler(action, world));
      ctx.actions.registerVerb('craft', (action, world) => craftHandler(action, world, genre));
      ctx.actions.registerVerb('repair', (action, world) => repairHandler(action, world, genre));
      ctx.actions.registerVerb('modify', (action, world) => modifyHandler(action, world, genre));
    },
  };
}

export const craftingCore: EngineModule = createCraftingCore();
