// Loadout management — equip, unequip, compute effects, validate

import type {
  EquipmentSlot,
  ItemDefinition,
  ItemCatalog,
  Loadout,
  LoadoutEffect,
} from './types.js';
import { EQUIPMENT_SLOTS } from './types.js';

/** Create a fresh empty loadout. */
export function createEmptyLoadout(): Loadout {
  const equipped: Record<EquipmentSlot, string | null> = {
    weapon: null,
    armor: null,
    accessory: null,
    tool: null,
    trinket: null,
  };
  return { equipped, inventory: [] };
}

/** Look up an item in the catalog. */
function findItem(catalog: ItemCatalog, itemId: string): ItemDefinition | undefined {
  return catalog.items.find((i) => i.id === itemId);
}

/** Equip an item to a slot. Returns errors if invalid. */
export function equipItem(
  loadout: Loadout,
  itemId: string,
  catalog: ItemCatalog,
  characterTags: string[],
): { loadout: Loadout; errors: string[] } {
  const item = findItem(catalog, itemId);
  if (!item) return { loadout, errors: [`Unknown item: ${itemId}`] };

  // Check required tags
  if (item.requiredTags) {
    const missing = item.requiredTags.filter((t) => !characterTags.includes(t));
    if (missing.length > 0) {
      return { loadout, errors: [`Missing required tags to equip ${item.name}: ${missing.join(', ')}`] };
    }
  }

  const newLoadout = structuredClone(loadout);

  // If something is already in the slot, move it to inventory
  const currentInSlot = newLoadout.equipped[item.slot];
  if (currentInSlot) {
    newLoadout.inventory.push(currentInSlot);
  }

  // Remove from inventory if it was there
  const invIdx = newLoadout.inventory.indexOf(itemId);
  if (invIdx >= 0) {
    newLoadout.inventory.splice(invIdx, 1);
  }

  newLoadout.equipped[item.slot] = itemId;
  return { loadout: newLoadout, errors: [] };
}

/** Unequip an item from a slot. Moves it to inventory. */
export function unequipItem(
  loadout: Loadout,
  slot: EquipmentSlot,
): Loadout {
  const newLoadout = structuredClone(loadout);
  const itemId = newLoadout.equipped[slot];
  if (itemId) {
    newLoadout.inventory.push(itemId);
    newLoadout.equipped[slot] = null;
  }
  return newLoadout;
}

/** Add an item to inventory (not equipped). */
export function addToInventory(loadout: Loadout, itemId: string): Loadout {
  const newLoadout = structuredClone(loadout);
  newLoadout.inventory.push(itemId);
  return newLoadout;
}

/** Remove an item from inventory. Returns false if not found. */
export function removeFromInventory(loadout: Loadout, itemId: string): { loadout: Loadout; removed: boolean } {
  const newLoadout = structuredClone(loadout);
  const idx = newLoadout.inventory.indexOf(itemId);
  if (idx < 0) return { loadout, removed: false };
  newLoadout.inventory.splice(idx, 1);
  return { loadout: newLoadout, removed: true };
}

/** Compute aggregate effects from all equipped items. */
export function computeLoadoutEffects(loadout: Loadout, catalog: ItemCatalog): LoadoutEffect {
  const effect: LoadoutEffect = {
    statModifiers: {},
    resourceModifiers: {},
    grantedTags: [],
    grantedVerbs: [],
  };

  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = loadout.equipped[slot];
    if (!itemId) continue;

    const item = findItem(catalog, itemId);
    if (!item) continue;

    if (item.statModifiers) {
      for (const [stat, mod] of Object.entries(item.statModifiers)) {
        effect.statModifiers[stat] = (effect.statModifiers[stat] ?? 0) + mod;
      }
    }

    if (item.resourceModifiers) {
      for (const [res, mod] of Object.entries(item.resourceModifiers)) {
        effect.resourceModifiers[res] = (effect.resourceModifiers[res] ?? 0) + mod;
      }
    }

    if (item.grantedTags) {
      for (const tag of item.grantedTags) {
        if (!effect.grantedTags.includes(tag)) effect.grantedTags.push(tag);
      }
    }

    if (item.grantedVerbs) {
      for (const verb of item.grantedVerbs) {
        if (!effect.grantedVerbs.includes(verb)) effect.grantedVerbs.push(verb);
      }
    }
  }

  return effect;
}

/** Validate a loadout against the catalog and character tags. */
export function validateLoadout(
  loadout: Loadout,
  catalog: ItemCatalog,
  characterTags: string[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = loadout.equipped[slot];
    if (!itemId) continue;

    const item = findItem(catalog, itemId);
    if (!item) {
      errors.push(`Unknown item in ${slot} slot: ${itemId}`);
      continue;
    }

    if (item.slot !== slot) {
      errors.push(`${item.name} is a ${item.slot} item but equipped in ${slot} slot`);
    }

    if (item.requiredTags) {
      const missing = item.requiredTags.filter((t) => !characterTags.includes(t));
      if (missing.length > 0) {
        errors.push(`${item.name} requires tags: ${missing.join(', ')}`);
      }
    }
  }

  for (const itemId of loadout.inventory) {
    if (!findItem(catalog, itemId)) {
      errors.push(`Unknown item in inventory: ${itemId}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Get all items from a loadout (equipped + inventory). */
export function getAllItems(loadout: Loadout): string[] {
  const items: string[] = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const id = loadout.equipped[slot];
    if (id) items.push(id);
  }
  items.push(...loadout.inventory);
  return items;
}
