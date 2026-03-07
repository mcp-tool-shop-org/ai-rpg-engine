// @ai-rpg-engine/equipment — item definitions, slots, and loadout management

export type {
  EquipmentSlot,
  ItemRarity,
  ItemDefinition,
  ItemCatalog,
  Loadout,
  LoadoutEffect,
} from './types.js';

export { EQUIPMENT_SLOTS, ITEM_RARITIES } from './types.js';

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
