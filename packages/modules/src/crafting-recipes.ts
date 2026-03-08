// crafting-recipes — genre-aware recipe tables + crafting/repair/modify resolution
// v1.8: Items can be crafted from materials, repaired, and modified.
// Quality scales with district prosperity, stability, faction access, and black market.
// All recipes are lookup-table driven — no per-pack configuration.
// Pure functions, no side effects.

import type { SupplyCategory, DistrictEconomy } from './economy-core.js';
import type { MaterialInventory } from './crafting-core.js';
import { hasMaterials } from './crafting-core.js';
import { getSupplyLevel, isBlackMarketCondition } from './economy-core.js';
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
  ],
};

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
