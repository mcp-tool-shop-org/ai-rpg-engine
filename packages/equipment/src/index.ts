// @ai-rpg-engine/equipment — item definitions, slots, and loadout management

export type {
  EquipmentSlot,
  ItemRarity,
  ItemDefinition,
  ItemCatalog,
  Loadout,
  LoadoutEffect,
  ItemProvenanceFlag,
  ItemProvenance,
  ItemChronicleEvent,
  ItemChronicleEntry,
} from './types.js';

export { EQUIPMENT_SLOTS, ITEM_RARITIES, ITEM_PROVENANCE_FLAGS } from './types.js';

export {
  createEmptyLoadout,
  equipItem,
  unequipItem,
  addToInventory,
  removeFromInventory,
  computeLoadoutEffects,
  validateLoadout,
  getAllItems,
} from './loadout.js';

export {
  normalizeProvenance,
  getItemProvenance,
  hasProvenanceFlag,
  isFactionalItem,
  getItemFaction,
  computeItemNotoriety,
  formatProvenanceForNarrator,
  formatProvenanceForDirector,
} from './provenance.js';

export {
  recordItemEvent,
  getItemHistory,
  getItemKillCount,
  getItemAge,
  hasItemEvent,
} from './item-chronicle.js';

export type {
  GrowthTrigger,
  GrowthMilestone,
  RelicState,
} from './relic-growth.js';

export {
  evaluateRelicGrowth,
  getRelicEpithet,
  getRelicTier,
  computeRelicBonuses,
  DEFAULT_WEAPON_MILESTONES,
  DEFAULT_ARMOR_MILESTONES,
  TIER_LABELS,
} from './relic-growth.js';

// Runtime consumer loop (F-ENG008): equip/unequip EngineModule over this
// package's Loadout model. Status machinery is injected by the pack (see
// EquipmentStatusOps) so this package keeps zero runtime dependencies.
export {
  createEquipmentCore,
  buildEquipmentStatusDefinitions,
  getEquipmentState,
  getEntityLoadout,
  equipStatusId,
  EQUIPMENT_CATALOG_FORMULA,
  EQUIPMENT_STATE_KEY,
} from './equipment-core.js';
export type {
  EquipmentCoreConfig,
  EquipmentModuleState,
  EquipmentStatusOps,
  EquipmentStatusDefinition,
} from './equipment-core.js';
