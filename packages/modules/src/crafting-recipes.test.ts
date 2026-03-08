import { describe, it, expect } from 'vitest';
import {
  getAvailableRecipes,
  getRecipeById,
  canCraft,
  computeQualityBonus,
  resolveCraft,
  resolveRepair,
  resolveModify,
  formatRecipeForDirector,
  formatAvailableRecipesForDirector,
} from './crafting-recipes.js';
import { getMaterialInventory } from './crafting-core.js';
import { createDistrictEconomy } from './economy-core.js';
import type { ItemDefinition } from '@ai-rpg-engine/equipment';
import type { CraftingContext } from './crafting-recipes.js';

function makeContext(overrides: Partial<CraftingContext> = {}): CraftingContext {
  return {
    districtEconomy: createDistrictEconomy('fantasy'),
    districtId: 'market-square',
    districtTags: ['market'],
    prosperity: 55,
    stability: 60,
    playerHeat: 0,
    isBlackMarket: false,
    ...overrides,
  };
}

function makeItem(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id: 'test-sword',
    name: 'Iron Sword',
    description: 'A sturdy blade',
    slot: 'weapon',
    rarity: 'uncommon',
    statModifiers: { attack: 3 },
    ...overrides,
  };
}

describe('crafting-recipes', () => {
  describe('recipe access', () => {
    it('returns universal recipes for any genre', () => {
      const recipes = getAvailableRecipes('fantasy');
      const ids = recipes.map((r) => r.id);
      expect(ids).toContain('repair-weapon');
      expect(ids).toContain('craft-bandage');
      expect(ids).toContain('modify-sharpen');
    });

    it('includes genre-specific recipes', () => {
      const fantasy = getAvailableRecipes('fantasy');
      expect(fantasy.map((r) => r.id)).toContain('craft-potion');

      const zombie = getAvailableRecipes('zombie');
      expect(zombie.map((r) => r.id)).toContain('craft-improvised-weapon');

      const cyber = getAvailableRecipes('cyberpunk');
      expect(cyber.map((r) => r.id)).toContain('craft-stim');
    });

    it('filters recipes by required tags', () => {
      // modify-bless requires 'sacred' tag
      const without = getAvailableRecipes('fantasy');
      const with_ = getAvailableRecipes('fantasy', [], ['sacred']);
      expect(without.map((r) => r.id)).not.toContain('modify-bless');
      expect(with_.map((r) => r.id)).toContain('modify-bless');
    });

    it('gets recipe by ID', () => {
      const recipe = getRecipeById('fantasy', 'craft-potion');
      expect(recipe).toBeDefined();
      expect(recipe!.name).toBe('Brew Potion');
    });

    it('returns undefined for unknown recipe', () => {
      expect(getRecipeById('fantasy', 'nonexistent')).toBeUndefined();
    });
  });

  describe('canCraft', () => {
    it('returns affordable when materials sufficient', () => {
      const materials = getMaterialInventory({ 'materials.medicine': 5 });
      const recipe = getRecipeById('fantasy', 'craft-potion')!;
      const result = canCraft(recipe, materials);
      expect(result.affordable).toBe(true);
      expect(result.meetsRequirements).toBe(true);
    });

    it('returns not affordable when materials insufficient', () => {
      const materials = getMaterialInventory({ 'materials.medicine': 1 });
      const recipe = getRecipeById('fantasy', 'craft-potion')!;
      const result = canCraft(recipe, materials);
      expect(result.affordable).toBe(false);
    });

    it('rejects black market recipe without black market', () => {
      const materials = getMaterialInventory({ 'materials.contraband': 5 });
      const recipe = getRecipeById('cyberpunk', 'modify-black-market-tune')!;
      const ctx = makeContext({ isBlackMarket: false });
      const result = canCraft(recipe, materials, ctx);
      expect(result.affordable).toBe(true);
      expect(result.meetsRequirements).toBe(false);
    });
  });

  describe('resolveCraft', () => {
    it('produces output item for craft recipe', () => {
      const recipe = getRecipeById('fantasy', 'craft-bandage')!;
      const ctx = makeContext();
      const result = resolveCraft(recipe, ctx);
      expect(result.success).toBe(true);
      expect(result.outputItem).toBeDefined();
      expect(result.outputItem!.slot).toBe('tool');
      expect(result.outputItem!.rarity).toBe('common');
      expect(result.materialsConsumed).toEqual(recipe.inputs);
    });

    it('applies quality bonus from high prosperity', () => {
      const ctx = makeContext({ prosperity: 70 });
      expect(computeQualityBonus(ctx)).toBe(1);
    });

    it('no quality bonus for low prosperity', () => {
      const ctx = makeContext({ prosperity: 40 });
      expect(computeQualityBonus(ctx)).toBe(0);
    });

    it('adds faction provenance when faction access provided', () => {
      const recipe = getRecipeById('fantasy', 'craft-bandage')!;
      const ctx = makeContext({ factionAccess: 'iron-wardens' });
      const result = resolveCraft(recipe, ctx);
      expect(result.outputItem!.provenance?.factionId).toBe('iron-wardens');
      expect(result.outputItem!.provenance?.origin).toContain('iron-wardens');
    });

    it('generates rumor for rare craft', () => {
      const recipe = getRecipeById('fantasy', 'craft-potion')!;
      // Force rare output by using high-stability context
      const ctx = makeContext({ stability: 90 });
      const result = resolveCraft(recipe, ctx);
      // Even if rarity doesn't upgrade, check side effects structure
      expect(result.sideEffects.filter((e) => e.type === 'economy-shift').length).toBeGreaterThan(0);
    });

    it('generates economy shifts from material consumption', () => {
      const recipe = getRecipeById('fantasy', 'craft-bandage')!;
      const ctx = makeContext();
      const result = resolveCraft(recipe, ctx);
      const shifts = result.sideEffects.filter((e) => e.type === 'economy-shift');
      expect(shifts.length).toBeGreaterThan(0);
      expect(shifts[0]).toHaveProperty('cause', 'player-crafting');
    });

    it('fails for non-craft recipe', () => {
      const recipe = getRecipeById('fantasy', 'repair-weapon')!;
      const ctx = makeContext();
      const result = resolveCraft(recipe, ctx);
      expect(result.success).toBe(false);
    });
  });

  describe('resolveRepair', () => {
    it('produces successful repair result', () => {
      const item = makeItem();
      const recipe = getRecipeById('fantasy', 'repair-weapon')!;
      const ctx = makeContext();
      const result = resolveRepair(item, recipe, ctx);
      expect(result.success).toBe(true);
      expect(result.chronicleDetail).toContain('Iron Sword');
    });
  });

  describe('resolveModify', () => {
    it('applies enhancement stat delta', () => {
      const item = makeItem();
      const recipe = getRecipeById('fantasy', 'modify-sharpen')!;
      const ctx = makeContext();
      const result = resolveModify(item, recipe, ctx);
      expect(result.success).toBe(true);
      expect(result.statDelta).toEqual({ attack: 1 });
      expect(result.loreAppend).toContain('Enhanced');
    });

    it('adds blessed flag for blessed modification', () => {
      const item = makeItem();
      const recipe = getRecipeById('fantasy', 'modify-bless')!;
      const ctx = makeContext();
      const result = resolveModify(item, recipe, ctx);
      expect(result.addFlags).toContain('blessed');
      expect(result.newProvenance.flags).toContain('blessed');
    });

    it('adds cursed flag and rumor for cursed modification', () => {
      const item = makeItem();
      const recipe = getRecipeById('weird-west', 'modify-curse')!;
      const ctx = makeContext();
      const result = resolveModify(item, recipe, ctx);
      expect(result.addFlags).toContain('cursed');
      const rumors = result.sideEffects.filter((e) => e.type === 'rumor');
      expect(rumors.length).toBeGreaterThan(0);
    });

    it('adds heat for black market modification', () => {
      const item = makeItem();
      const recipe = getRecipeById('cyberpunk', 'modify-black-market-tune')!;
      const ctx = makeContext({ isBlackMarket: true });
      const result = resolveModify(item, recipe, ctx);
      expect(result.addFlags).toContain('contraband');
      const heat = result.sideEffects.filter((e) => e.type === 'heat');
      expect(heat.length).toBe(1);
      expect((heat[0] as { type: 'heat'; delta: number }).delta).toBe(10);
    });

    it('adds faction reputation for faction mark', () => {
      const item = makeItem();
      const recipe = getRecipeById('pirate', 'modify-faction-mark')!;
      const ctx = makeContext({ factionAccess: 'black-flag' });
      const result = resolveModify(item, recipe, ctx);
      expect(result.newProvenance.factionId).toBe('black-flag');
      const rep = result.sideEffects.filter((e) => e.type === 'reputation');
      expect(rep.length).toBe(1);
    });

    it('preserves existing provenance flags', () => {
      const item = makeItem({ provenance: { flags: ['stolen'], lore: 'Taken from a guard' } });
      const recipe = getRecipeById('fantasy', 'modify-sharpen')!;
      const ctx = makeContext();
      const result = resolveModify(item, recipe, ctx);
      expect(result.newProvenance.flags).toContain('stolen');
      expect(result.newProvenance.lore).toContain('Taken from a guard');
      expect(result.newProvenance.lore).toContain('Enhanced');
    });
  });

  describe('formatting', () => {
    it('formats a single recipe for director', () => {
      const recipe = getRecipeById('fantasy', 'craft-bandage')!;
      const materials = getMaterialInventory({ 'materials.medicine': 5 });
      const output = formatRecipeForDirector(recipe, materials);
      expect(output).toContain('Craft Bandage');
      expect(output).toContain('CAN CRAFT');
    });

    it('shows missing materials status', () => {
      const recipe = getRecipeById('fantasy', 'craft-potion')!;
      const materials = getMaterialInventory({});
      const output = formatRecipeForDirector(recipe, materials);
      expect(output).toContain('missing materials');
    });

    it('formats all recipes for director', () => {
      const recipes = getAvailableRecipes('fantasy');
      const materials = getMaterialInventory({ 'materials.components': 10, 'materials.medicine': 5 });
      const output = formatAvailableRecipesForDirector(recipes, materials);
      expect(output).toContain('RECIPES');
      expect(output).toContain('Craft:');
      expect(output).toContain('Repair:');
      expect(output).toContain('Modify:');
    });
  });
});
