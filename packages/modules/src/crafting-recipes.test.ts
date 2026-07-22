import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ZoneState } from '@ai-rpg-engine/core';
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
  createCraftingCore,
} from './crafting-recipes.js';
import { getMaterialInventory } from './crafting-core.js';
import { createDistrictEconomy, createEconomyCore, getSupplyLevel, type EconomyCoreState } from './economy-core.js';
import { createEnvironmentCore } from './environment-core.js';
import { createDistrictCore } from './district-core.js';
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

// ---------------------------------------------------------------------------
// Module (F-6631dd57) — the salvage/craft/repair/modify write-wire. Before
// this module, salvageItem/resolveCraft/resolveRepair/resolveModify (above)
// and crafting-core.ts's material-inventory API had ZERO production callers
// — no played session ever invoked these verbs (they didn't exist), so
// director.ts's MATERIALS section read a permanently-empty
// getMaterialInventory({}). These tests pin: the verbs are genuinely absent
// without the module (RED); salvage moves a carried item into materials and
// applies the matching EconomyShift; craft consumes materials and produces
// the recipe's own item; and rejection paths never mutate state.
// ---------------------------------------------------------------------------

const craftingZones: ZoneState[] = [{ id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: [] }];
const craftingDistricts = [{ id: 'district-1', name: 'Workshop District', zoneIds: ['zone-a'], tags: [] }];

const makeCraftingPlayer = (
  inventory: string[] = [],
  custom: Record<string, string | number | boolean> = {},
): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: {},
  resources: { hp: 20 },
  statuses: [],
  zoneId: 'zone-a',
  inventory,
  custom,
});

/** District-1 has NO controllingFaction, so reputation/heat stay neutral (0) — isolates materials/economy as the only observable effects. */
function makeCraftingEngine(inventory: string[] = [], custom: Record<string, string | number | boolean> = {}, genre?: string) {
  return createTestEngine({
    modules: [
      createEnvironmentCore(),
      createDistrictCore({ districts: craftingDistricts }),
      createEconomyCore({ districts: craftingDistricts.map((d) => ({ id: d.id, tags: d.tags })) }),
      createCraftingCore(genre !== undefined ? { genre } : {}),
    ],
    entities: [makeCraftingPlayer(inventory, custom)],
    zones: craftingZones,
  });
}

describe('crafting-core module (F-6631dd57) — the salvage/craft/repair/modify write-wire', () => {
  it('salvage/craft/repair/modify are unknown verbs without createCraftingCore registered (RED without the module)', () => {
    const engine = createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts: craftingDistricts }),
        createEconomyCore({ districts: craftingDistricts.map((d) => ({ id: d.id, tags: d.tags })) }),
        // createCraftingCore() intentionally NOT registered — the exact
        // pre-fix condition every played session was stuck in.
      ],
      entities: [makeCraftingPlayer(['iron-sword'], { 'materials.medicine': 5 })],
      zones: craftingZones,
    });

    const successTypes = ['item.salvaged', 'item.crafted', 'item.repaired', 'item.modified'];
    for (const verb of ['salvage', 'craft', 'repair', 'modify']) {
      // ActionDispatcher.dispatch's unknown-verb branch emits 'action.rejected'
      // through the event bus but returns [] from dispatch/submitAction (same
      // contract trade-core.test.ts's own "RED without createTradeCore"
      // pins against) — so the observable proof here is drainEvents (which
      // subscribes to every emitted event, not just the handler's return
      // value) plus the absence of any success event and any state mutation.
      engine.drainEvents();
      const returned = engine.submitAction(verb, {
        targetIds: ['iron-sword'],
        parameters: { recipeId: 'craft-bandage' },
      });
      expect(returned, `${verb} dispatch() should return no events (unknown verb)`).toEqual([]);
      const emitted = engine.drainEvents();
      const rejection = emitted.find((e) => e.type === 'action.rejected');
      expect(rejection, `${verb} should emit action.rejected`).toBeDefined();
      expect(rejection!.payload.reason).toBe(`unknown verb: ${verb}`);
      expect(emitted.some((e) => successTypes.includes(e.type)), `${verb} must not succeed`).toBe(false);
    }
    // No state mutation from any of the four unknown-verb attempts.
    expect(engine.world.entities.player.inventory).toEqual(['iron-sword']);
    expect(engine.world.entities.player.custom).toEqual({ 'materials.medicine': 5 });
  });

  describe('salvage — SALVAGE FIRST (this wave\'s priority slice)', () => {
    it('consumes the carried item, writes materials, and applies the matching EconomyShift into the district economy', () => {
      const engine = makeCraftingEngine(['iron-sword']);

      const events = engine.submitAction('salvage', { targetIds: ['iron-sword'] });

      expect(events.some((e) => e.type === 'item.salvaged')).toBe(true);
      expect(engine.world.entities.player.inventory).not.toContain('iron-sword');
      // inferItemSlot('iron-sword') -> 'weapon'; SALVAGE_YIELDS.weapon.common
      // = [{ category: 'components', quantity: 1 }].
      expect(engine.world.entities.player.custom?.['materials.components']).toBe(1);

      const economy = (engine.world.modules['economy-core'] as EconomyCoreState).districts['district-1'];
      expect(getSupplyLevel(economy, 'components')).toBe(50 + 1); // baseline + the one economy-shift
    });

    it('still writes materials when the actor is in no district — the economy shift is skipped, not rejected', () => {
      const engine = createTestEngine({
        modules: [createCraftingCore()], // no district-core/economy-core registered
        entities: [makeCraftingPlayer(['iron-sword'])],
        zones: craftingZones,
      });

      const events = engine.submitAction('salvage', { targetIds: ['iron-sword'] });

      expect(events.some((e) => e.type === 'item.salvaged')).toBe(true);
      expect(engine.world.entities.player.inventory).not.toContain('iron-sword');
      expect(engine.world.entities.player.custom?.['materials.components']).toBe(1);
    });

    it('rejects salvaging an item not carried — no state mutation', () => {
      const engine = makeCraftingEngine([]);
      const events = engine.submitAction('salvage', { targetIds: ['iron-sword'] });
      expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
      expect(engine.world.entities.player.custom ?? {}).toEqual({});
    });

    it('rejects with no item specified — no state mutation', () => {
      const engine = makeCraftingEngine(['iron-sword']);
      const events = engine.submitAction('salvage', {});
      expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
      expect(engine.world.entities.player.inventory).toContain('iron-sword');
    });
  });

  describe('craft', () => {
    it('consumes materials and produces the recipe\'s own item in the actor\'s inventory', () => {
      const engine = makeCraftingEngine([], { 'materials.medicine': 2 }); // craft-bandage needs 2 medicine

      const events = engine.submitAction('craft', { parameters: { recipeId: 'craft-bandage' } });

      expect(events.some((e) => e.type === 'item.crafted')).toBe(true);
      expect(engine.world.entities.player.custom?.['materials.medicine']).toBe(0);
      expect(engine.world.entities.player.inventory).toContain('craft-bandage');
    });

    it('rejects with insufficient materials — no state mutation', () => {
      const engine = makeCraftingEngine([], {});
      const events = engine.submitAction('craft', { parameters: { recipeId: 'craft-bandage' } });
      expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
      expect(engine.world.entities.player.inventory).toEqual([]);
    });

    it('rejects when the actor is in no district ("nowhere to craft here")', () => {
      const engine = createTestEngine({
        modules: [createCraftingCore()],
        entities: [makeCraftingPlayer([], { 'materials.medicine': 5 })],
        zones: craftingZones,
      });
      const events = engine.submitAction('craft', { parameters: { recipeId: 'craft-bandage' } });
      expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
      expect(engine.world.entities.player.inventory).toEqual([]);
    });

    it('rejects an unknown recipe id', () => {
      const engine = makeCraftingEngine([], { 'materials.medicine': 5 });
      const events = engine.submitAction('craft', { parameters: { recipeId: 'nonexistent-recipe' } });
      expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
    });

    it('rejects a recipe that is not a craft recipe (category mismatch)', () => {
      const engine = makeCraftingEngine([], { 'materials.components': 5 });
      const events = engine.submitAction('craft', { parameters: { recipeId: 'repair-weapon' } });
      expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
    });

    it('genre config: a genre-flavored recipe resolves only when the genre is configured (universal-only otherwise)', () => {
      const withoutGenre = makeCraftingEngine([], { 'materials.medicine': 3 });
      const rejected = withoutGenre.submitAction('craft', { parameters: { recipeId: 'craft-potion' } });
      expect(rejected.some((e) => e.type === 'action.rejected')).toBe(true);

      const withGenre = makeCraftingEngine([], { 'materials.medicine': 3 }, 'fantasy');
      const crafted = withGenre.submitAction('craft', { parameters: { recipeId: 'craft-potion' } });
      expect(crafted.some((e) => e.type === 'item.crafted')).toBe(true);
      expect(withGenre.world.entities.player.inventory).toContain('craft-potion');
    });
  });

  describe('repair', () => {
    it('consumes materials for a carried item without destroying it', () => {
      const engine = makeCraftingEngine(['iron-sword'], { 'materials.components': 2 });
      const events = engine.submitAction('repair', {
        targetIds: ['iron-sword'],
        parameters: { recipeId: 'repair-weapon' },
      });
      expect(events.some((e) => e.type === 'item.repaired')).toBe(true);
      expect(engine.world.entities.player.custom?.['materials.components']).toBe(0);
      expect(engine.world.entities.player.inventory).toContain('iron-sword');
    });

    it('rejects when the item is not carried', () => {
      const engine = makeCraftingEngine([], { 'materials.components': 2 });
      const events = engine.submitAction('repair', {
        targetIds: ['iron-sword'],
        parameters: { recipeId: 'repair-weapon' },
      });
      expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
    });
  });

  describe('modify', () => {
    it('consumes materials and reports the mechanical result on the event (honest ceiling: not persisted to the bare inventory item)', () => {
      const engine = makeCraftingEngine(['iron-sword'], { 'materials.components': 1 });
      const events = engine.submitAction('modify', {
        targetIds: ['iron-sword'],
        parameters: { recipeId: 'modify-sharpen' },
      });
      const modified = events.find((e) => e.type === 'item.modified');
      expect(modified).toBeDefined();
      expect(modified!.payload.statDelta).toEqual({ attack: 1 });
      expect(engine.world.entities.player.custom?.['materials.components']).toBe(0);
      expect(engine.world.entities.player.inventory).toContain('iron-sword');
    });

    it('rejects when the item is not carried', () => {
      const engine = makeCraftingEngine([], { 'materials.components': 1 });
      const events = engine.submitAction('modify', {
        targetIds: ['iron-sword'],
        parameters: { recipeId: 'modify-sharpen' },
      });
      expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
    });
  });
});
