// Equipment system types — items, slots, loadouts, and effects

/** Equipment slot categories. */
export type EquipmentSlot = 'weapon' | 'armor' | 'accessory' | 'tool' | 'trinket';

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'accessory', 'tool', 'trinket'];

/** Item rarity tiers. */
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export const ITEM_RARITIES: ItemRarity[] = ['common', 'uncommon', 'rare', 'legendary'];

/** Full item definition. */
export type ItemDefinition = {
  id: string;
  name: string;
  description: string;
  slot: EquipmentSlot;
  rarity: ItemRarity;
  /** Stat modifiers when equipped. */
  statModifiers?: Record<string, number>;
  /** Resource modifiers when equipped (e.g. +5 max HP). */
  resourceModifiers?: Record<string, number>;
  /** Tags granted while equipped. */
  grantedTags?: string[];
  /** Verbs unlocked while equipped. */
  grantedVerbs?: string[];
  /** Tags required to equip this item. */
  requiredTags?: string[];
  /** Origin story — where the item came from. */
  provenance?: string;
};

/** An item catalog — collection of items available in a pack or context. */
export type ItemCatalog = {
  items: ItemDefinition[];
};

/** Current equipment state — what's equipped and what's carried. */
export type Loadout = {
  /** Equipped items by slot. Null means empty slot. */
  equipped: Record<EquipmentSlot, string | null>;
  /** Carried but unequipped item IDs. */
  inventory: string[];
};

/** Aggregate effects from all equipped items. */
export type LoadoutEffect = {
  statModifiers: Record<string, number>;
  resourceModifiers: Record<string, number>;
  grantedTags: string[];
  grantedVerbs: string[];
};
