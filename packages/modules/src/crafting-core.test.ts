import { describe, it, expect } from 'vitest';
import {
  getMaterialInventory,
  adjustMaterial,
  applyMaterialDeltas,
  hasMaterials,
  getTotalMaterials,
  getNonZeroMaterials,
  computeSalvageYield,
  salvageItem,
  wouldGenerateSuspicion,
  getSalvageRumorClaim,
  formatMaterialsForDirector,
  formatMaterialsCompact,
  formatSalvagePreview,
} from './crafting-core.js';
import type { ItemDefinition } from '@ai-rpg-engine/equipment';
import { createDistrictEconomy } from './economy-core.js';

function makeItem(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id: 'test-sword',
    name: 'Iron Sword',
    description: 'A sturdy blade',
    slot: 'weapon',
    rarity: 'common',
    ...overrides,
  };
}

describe('crafting-core', () => {
  describe('material inventory', () => {
    it('reads materials from profile.custom', () => {
      const custom = { 'materials.medicine': 5, 'materials.components': 3 };
      const inv = getMaterialInventory(custom);
      expect(inv.medicine).toBe(5);
      expect(inv.components).toBe(3);
      expect(inv.weapons).toBe(0);
    });

    it('returns zero for missing categories', () => {
      const inv = getMaterialInventory({});
      expect(inv.food).toBe(0);
      expect(getTotalMaterials(inv)).toBe(0);
    });

    it('adjusts a single material category', () => {
      const custom = { 'materials.medicine': 5 };
      const result = adjustMaterial(custom, 'medicine', 3);
      expect(result['materials.medicine']).toBe(8);
    });

    it('clamps material at 0 and 50', () => {
      const custom = { 'materials.fuel': 2 };
      expect(adjustMaterial(custom, 'fuel', -10)['materials.fuel']).toBe(0);
      expect(adjustMaterial(custom, 'fuel', 100)['materials.fuel']).toBe(50);
    });

    it('applies multiple deltas', () => {
      const custom = { 'materials.weapons': 3, 'materials.food': 10 };
      const result = applyMaterialDeltas(custom, { weapons: 2, food: -5, medicine: 4 });
      expect(result['materials.weapons']).toBe(5);
      expect(result['materials.food']).toBe(5);
      expect(result['materials.medicine']).toBe(4);
    });

    it('checks material sufficiency', () => {
      const inv = getMaterialInventory({ 'materials.components': 5, 'materials.medicine': 2 });
      expect(hasMaterials(inv, [{ category: 'components', quantity: 3 }])).toBe(true);
      expect(hasMaterials(inv, [{ category: 'components', quantity: 6 }])).toBe(false);
      expect(hasMaterials(inv, [
        { category: 'components', quantity: 3 },
        { category: 'medicine', quantity: 2 },
      ])).toBe(true);
    });

    it('gets non-zero materials sorted by quantity', () => {
      const inv = getMaterialInventory({ 'materials.fuel': 10, 'materials.medicine': 3 });
      const nonZero = getNonZeroMaterials(inv);
      expect(nonZero).toHaveLength(2);
      expect(nonZero[0].category).toBe('fuel');
      expect(nonZero[1].category).toBe('medicine');
    });
  });

  describe('salvage yields', () => {
    it('computes yields for common weapon', () => {
      const yields = computeSalvageYield(makeItem({ rarity: 'common', slot: 'weapon' }));
      expect(yields).toHaveLength(1);
      expect(yields[0]).toEqual({ category: 'components', quantity: 1, quality: 'poor' });
    });

    it('computes yields for rare weapon', () => {
      const yields = computeSalvageYield(makeItem({ rarity: 'rare', slot: 'weapon' }));
      expect(yields).toHaveLength(2);
      expect(yields[0]).toEqual({ category: 'components', quantity: 3, quality: 'fine' });
      expect(yields[1]).toEqual({ category: 'weapons', quantity: 2, quality: 'fine' });
    });

    it('computes yields for legendary armor', () => {
      const yields = computeSalvageYield(makeItem({ rarity: 'legendary', slot: 'armor' }));
      expect(yields).toHaveLength(2);
      expect(yields[0].category).toBe('components');
      expect(yields[0].quantity).toBe(4);
      expect(yields[1].category).toBe('luxuries');
      expect(yields[1].quantity).toBe(3);
    });

    it('computes yields for uncommon trinket', () => {
      const yields = computeSalvageYield(makeItem({ rarity: 'uncommon', slot: 'trinket' }));
      expect(yields).toHaveLength(2);
      expect(yields[0].category).toBe('components');
      expect(yields[1].category).toBe('luxuries');
    });

    it('computes yields for rare tool', () => {
      const yields = computeSalvageYield(makeItem({ rarity: 'rare', slot: 'tool' }));
      expect(yields).toHaveLength(2);
      expect(yields[0]).toEqual({ category: 'components', quantity: 4, quality: 'fine' });
      expect(yields[1]).toEqual({ category: 'fuel', quantity: 1, quality: 'fine' });
    });
  });

  describe('salvage with context', () => {
    it('generates economy shifts', () => {
      const economy = createDistrictEconomy('fantasy');
      const context = { districtEconomy: economy, districtId: 'market', districtTags: ['market'], stability: 7 };
      const result = salvageItem(makeItem({ rarity: 'uncommon', slot: 'weapon' }), context);
      expect(result.economyShifts).toHaveLength(2); // components + weapons
      expect(result.economyShifts[0].districtId).toBe('market');
      expect(result.economyShifts[0].cause).toBe('player-salvage');
    });

    it('generates byproducts from cursed items', () => {
      const item = makeItem({ provenance: { flags: ['cursed'] } });
      const result = salvageItem(item);
      expect(result.byproducts).toContain('occult-residue');
    });

    it('generates byproducts from blessed items', () => {
      const item = makeItem({ provenance: { flags: ['blessed'] } });
      const result = salvageItem(item);
      expect(result.byproducts).toContain('sanctified-essence');
    });

    it('generates byproducts from contraband items', () => {
      const item = makeItem({ provenance: { flags: ['contraband'] } });
      const result = salvageItem(item);
      expect(result.byproducts).toContain('contraband-parts');
    });

    it('generates chronicle detail', () => {
      const result = salvageItem(makeItem({ rarity: 'rare', slot: 'weapon', name: 'Flame Blade' }));
      expect(result.chronicleDetail).toContain('Flame Blade');
      expect(result.chronicleDetail).toContain('components');
    });
  });

  describe('suspicion and rumor checks', () => {
    it('detects suspicion when salvaging stolen faction item in faction district', () => {
      const item = makeItem({ provenance: { factionId: 'iron-wardens', flags: ['stolen'] } });
      expect(wouldGenerateSuspicion(item, ['iron-wardens', 'merchants'])).toBe(true);
    });

    it('no suspicion without stolen flag', () => {
      const item = makeItem({ provenance: { factionId: 'iron-wardens' } });
      expect(wouldGenerateSuspicion(item, ['iron-wardens'])).toBe(false);
    });

    it('no suspicion when faction not present', () => {
      const item = makeItem({ provenance: { factionId: 'iron-wardens', flags: ['stolen'] } });
      expect(wouldGenerateSuspicion(item, ['merchants'])).toBe(false);
    });

    it('generates rumor for relic salvage', () => {
      const claim = getSalvageRumorClaim(makeItem({ name: 'Doomhammer' }), 2);
      expect(claim).toContain('renowned');
      expect(claim).toContain('Doomhammer');
    });

    it('generates rumor for legendary item salvage', () => {
      const claim = getSalvageRumorClaim(makeItem({ name: 'Excalibur', rarity: 'legendary' }), 0);
      expect(claim).toContain('legendary');
      expect(claim).toContain('Excalibur');
    });

    it('no rumor for mundane item', () => {
      expect(getSalvageRumorClaim(makeItem(), 0)).toBeUndefined();
    });
  });

  describe('formatting', () => {
    it('formats director material view', () => {
      const inv = getMaterialInventory({ 'materials.medicine': 5, 'materials.components': 12 });
      const output = formatMaterialsForDirector(inv);
      expect(output).toContain('MATERIALS');
      expect(output).toContain('medicine');
      expect(output).toContain('components');
      expect(output).not.toContain('weapons'); // 0 quantity not shown
    });

    it('formats empty material view', () => {
      const inv = getMaterialInventory({});
      const output = formatMaterialsForDirector(inv);
      expect(output).toContain('(none)');
    });

    it('formats compact material summary', () => {
      const inv = getMaterialInventory({ 'materials.fuel': 10, 'materials.medicine': 3 });
      const output = formatMaterialsCompact(inv);
      expect(output).toContain('Materials:');
      expect(output).toContain('fuel');
      expect(output).toContain('medicine');
    });

    it('returns empty string for zero materials', () => {
      const inv = getMaterialInventory({});
      expect(formatMaterialsCompact(inv)).toBe('');
    });

    it('formats salvage preview', () => {
      const item = makeItem({ rarity: 'rare', slot: 'weapon', name: 'Flame Blade' });
      const result = salvageItem(item);
      const output = formatSalvagePreview(item, result);
      expect(output).toContain('Flame Blade');
      expect(output).toContain('components');
      expect(output).toContain('fine');
    });
  });
});
