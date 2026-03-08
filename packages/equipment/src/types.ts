// Equipment system types — items, slots, loadouts, and effects

/** Equipment slot categories. */
export type EquipmentSlot = 'weapon' | 'armor' | 'accessory' | 'tool' | 'trinket';

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'accessory', 'tool', 'trinket'];

/** Item rarity tiers. */
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export const ITEM_RARITIES: ItemRarity[] = ['common', 'uncommon', 'rare', 'legendary'];

/** Provenance flags that trigger recognition, rumors, and reactions. */
export type ItemProvenanceFlag = 'stolen' | 'cursed' | 'blessed' | 'heirloom' | 'contraband' | 'trophy';

export const ITEM_PROVENANCE_FLAGS: ItemProvenanceFlag[] = [
  'stolen', 'cursed', 'blessed', 'heirloom', 'contraband', 'trophy',
];

/** Structured item provenance — origin, faction association, behavioral flags. */
export type ItemProvenance = {
  /** Who made or owned it: "Chapel groundskeeper", "Faction: Iron Wardens" */
  origin?: string;
  /** Faction association — NPCs from this faction recognize it. */
  factionId?: string;
  /** Behavioral flags that trigger recognition, rumors, reactions. */
  flags?: ItemProvenanceFlag[];
  /** Free-text lore (replaces old string provenance). */
  lore?: string;
};

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
  /** Structured provenance — origin, faction, flags, lore. */
  provenance?: ItemProvenance;
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

// --- Item Chronicle ---

/** Events that can happen to an item during play. */
export type ItemChronicleEvent = 'acquired' | 'lost' | 'used-in-kill' | 'recognized' | 'transformed' | 'cursed' | 'blessed';

/** A single entry in an item's runtime chronicle. */
export type ItemChronicleEntry = {
  /** What happened to the item. */
  event: ItemChronicleEvent;
  /** Engine tick when it happened. */
  tick: number;
  /** Context: "Looted from Bone Collector", "Recognized by Iron Wardens guard" */
  detail: string;
  /** Zone where it happened. */
  zoneId?: string;
};

// --- Loadout ---

/** Aggregate effects from all equipped items. */
export type LoadoutEffect = {
  statModifiers: Record<string, number>;
  resourceModifiers: Record<string, number>;
  grantedTags: string[];
  grantedVerbs: string[];
};
