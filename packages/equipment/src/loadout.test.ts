import { describe, it, expect } from 'vitest';
import type { ItemCatalog } from './types.js';
import {
  createEmptyLoadout,
  equipItem,
  unequipItem,
  addToInventory,
  removeFromInventory,
  computeLoadoutEffects,
  validateLoadout,
  getAllItems,
} from './loadout.js';

const testCatalog: ItemCatalog = {
  items: [
    {
      id: 'iron-sword',
      name: 'Iron Sword',
      description: 'A sturdy blade.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { str: 2 },
      grantedTags: ['armed'],
      grantedVerbs: ['slash'],
    },
    {
      id: 'leather-armor',
      name: 'Leather Armor',
      description: 'Basic protection.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { hp: 5 },
    },
    {
      id: 'lockpick',
      name: 'Lockpick Set',
      description: 'For opening locks.',
      slot: 'tool',
      rarity: 'common',
      grantedVerbs: ['pick-lock'],
      requiredTags: ['rogue'],
    },
    {
      id: 'signet-ring',
      name: 'Signet Ring',
      description: 'Mark of nobility.',
      slot: 'trinket',
      rarity: 'uncommon',
      grantedTags: ['noble-signet'],
    },
    {
      id: 'steel-sword',
      name: 'Steel Sword',
      description: 'A superior blade.',
      slot: 'weapon',
      rarity: 'uncommon',
      statModifiers: { str: 3, dex: 1 },
      grantedTags: ['armed'],
    },
  ],
};

describe('createEmptyLoadout', () => {
  it('creates a loadout with all slots null', () => {
    const loadout = createEmptyLoadout();
    expect(loadout.equipped.weapon).toBeNull();
    expect(loadout.equipped.armor).toBeNull();
    expect(loadout.equipped.accessory).toBeNull();
    expect(loadout.equipped.tool).toBeNull();
    expect(loadout.equipped.trinket).toBeNull();
    expect(loadout.inventory).toEqual([]);
  });
});

describe('equipItem', () => {
  it('equips an item to its slot', () => {
    const loadout = createEmptyLoadout();
    const result = equipItem(loadout, 'iron-sword', testCatalog, []);
    expect(result.errors).toEqual([]);
    expect(result.loadout.equipped.weapon).toBe('iron-sword');
  });

  it('moves replaced item to inventory', () => {
    let loadout = createEmptyLoadout();
    loadout = equipItem(loadout, 'iron-sword', testCatalog, []).loadout;
    const result = equipItem(loadout, 'steel-sword', testCatalog, []);
    expect(result.loadout.equipped.weapon).toBe('steel-sword');
    expect(result.loadout.inventory).toContain('iron-sword');
  });

  it('removes item from inventory when equipping', () => {
    let loadout = createEmptyLoadout();
    loadout = addToInventory(loadout, 'iron-sword');
    const result = equipItem(loadout, 'iron-sword', testCatalog, []);
    expect(result.loadout.equipped.weapon).toBe('iron-sword');
    expect(result.loadout.inventory).not.toContain('iron-sword');
  });

  it('rejects unknown item', () => {
    const loadout = createEmptyLoadout();
    const result = equipItem(loadout, 'unknown', testCatalog, []);
    expect(result.errors).toContain('Unknown item: unknown');
  });

  it('rejects item with missing required tags', () => {
    const loadout = createEmptyLoadout();
    const result = equipItem(loadout, 'lockpick', testCatalog, ['warrior']);
    expect(result.errors[0]).toContain('Missing required tags');
  });

  it('accepts item when required tags are met', () => {
    const loadout = createEmptyLoadout();
    const result = equipItem(loadout, 'lockpick', testCatalog, ['rogue']);
    expect(result.errors).toEqual([]);
    expect(result.loadout.equipped.tool).toBe('lockpick');
  });
});

describe('unequipItem', () => {
  it('moves item from slot to inventory', () => {
    let loadout = createEmptyLoadout();
    loadout = equipItem(loadout, 'iron-sword', testCatalog, []).loadout;
    loadout = unequipItem(loadout, 'weapon');
    expect(loadout.equipped.weapon).toBeNull();
    expect(loadout.inventory).toContain('iron-sword');
  });

  it('does nothing for empty slot', () => {
    const loadout = createEmptyLoadout();
    const result = unequipItem(loadout, 'weapon');
    expect(result.equipped.weapon).toBeNull();
    expect(result.inventory).toEqual([]);
  });
});

describe('addToInventory / removeFromInventory', () => {
  it('adds items to inventory', () => {
    let loadout = createEmptyLoadout();
    loadout = addToInventory(loadout, 'iron-sword');
    loadout = addToInventory(loadout, 'leather-armor');
    expect(loadout.inventory).toEqual(['iron-sword', 'leather-armor']);
  });

  it('removes item from inventory', () => {
    let loadout = createEmptyLoadout();
    loadout = addToInventory(loadout, 'iron-sword');
    const result = removeFromInventory(loadout, 'iron-sword');
    expect(result.removed).toBe(true);
    expect(result.loadout.inventory).toEqual([]);
  });

  it('returns false when removing missing item', () => {
    const loadout = createEmptyLoadout();
    const result = removeFromInventory(loadout, 'nonexistent');
    expect(result.removed).toBe(false);
  });
});

describe('computeLoadoutEffects', () => {
  it('sums stat modifiers from all equipped items', () => {
    let loadout = createEmptyLoadout();
    loadout = equipItem(loadout, 'iron-sword', testCatalog, []).loadout;
    loadout = equipItem(loadout, 'steel-sword', testCatalog, []).loadout;
    // steel-sword replaced iron-sword, so only steel-sword is equipped
    const effects = computeLoadoutEffects(loadout, testCatalog);
    expect(effects.statModifiers.str).toBe(3);
    expect(effects.statModifiers.dex).toBe(1);
  });

  it('sums resource modifiers', () => {
    let loadout = createEmptyLoadout();
    loadout = equipItem(loadout, 'leather-armor', testCatalog, []).loadout;
    const effects = computeLoadoutEffects(loadout, testCatalog);
    expect(effects.resourceModifiers.hp).toBe(5);
  });

  it('collects granted tags', () => {
    let loadout = createEmptyLoadout();
    loadout = equipItem(loadout, 'iron-sword', testCatalog, []).loadout;
    loadout = equipItem(loadout, 'signet-ring', testCatalog, []).loadout;
    const effects = computeLoadoutEffects(loadout, testCatalog);
    expect(effects.grantedTags).toContain('armed');
    expect(effects.grantedTags).toContain('noble-signet');
  });

  it('collects granted verbs', () => {
    let loadout = createEmptyLoadout();
    loadout = equipItem(loadout, 'iron-sword', testCatalog, []).loadout;
    const effects = computeLoadoutEffects(loadout, testCatalog);
    expect(effects.grantedVerbs).toContain('slash');
  });

  it('returns empty effects for empty loadout', () => {
    const loadout = createEmptyLoadout();
    const effects = computeLoadoutEffects(loadout, testCatalog);
    expect(effects.statModifiers).toEqual({});
    expect(effects.resourceModifiers).toEqual({});
    expect(effects.grantedTags).toEqual([]);
    expect(effects.grantedVerbs).toEqual([]);
  });
});

describe('validateLoadout', () => {
  it('passes for valid loadout', () => {
    let loadout = createEmptyLoadout();
    loadout = equipItem(loadout, 'iron-sword', testCatalog, []).loadout;
    const result = validateLoadout(loadout, testCatalog, []);
    expect(result.ok).toBe(true);
  });

  it('rejects unknown equipped item', () => {
    const loadout = createEmptyLoadout();
    loadout.equipped.weapon = 'ghost-blade';
    const result = validateLoadout(loadout, testCatalog, []);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('Unknown item');
  });

  it('rejects item in wrong slot', () => {
    const loadout = createEmptyLoadout();
    loadout.equipped.armor = 'iron-sword'; // sword in armor slot
    const result = validateLoadout(loadout, testCatalog, []);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('weapon item but equipped in armor');
  });

  it('rejects item with missing required tags', () => {
    const loadout = createEmptyLoadout();
    loadout.equipped.tool = 'lockpick';
    const result = validateLoadout(loadout, testCatalog, ['warrior']);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('requires tags');
  });
});

describe('getAllItems', () => {
  it('returns all equipped and inventory items', () => {
    let loadout = createEmptyLoadout();
    loadout = equipItem(loadout, 'iron-sword', testCatalog, []).loadout;
    loadout = addToInventory(loadout, 'signet-ring');
    const all = getAllItems(loadout);
    expect(all).toContain('iron-sword');
    expect(all).toContain('signet-ring');
    expect(all).toHaveLength(2);
  });
});
