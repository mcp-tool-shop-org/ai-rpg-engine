// trade-core (F-6c3e4fde) — the sell verb. Before this file, no player-facing
// trade verb existed anywhere: trade-value.ts's computeItemValue and
// economy-core.ts's DistrictEconomy/applyEconomyShift had zero callers
// outside their own test files. These tests pin: selling credits scarcity-
// aware value, removes the item, and raises local supply (the matching
// TradeEffect); rejection paths never mutate state; and the narrator hint
// (F-47b295e7) rides the event payload.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ZoneState } from '@ai-rpg-engine/core';
import { createEnvironmentCore } from './environment-core.js';
import { createDistrictCore, getDistrictState } from './district-core.js';
import { createEconomyCore, createDistrictEconomy, getSupplyLevel, type EconomyCoreState } from './economy-core.js';
import {
  createTradeCore,
  inferSupplyCategory,
  getBuyableStock,
  quoteBuyPrice,
  SELL_CURRENCY,
  SELL_SUPPLY_RAISE,
  SELL_BASE_VALUE,
  BUY_SUPPLY_FLOOR,
  BUY_MARKUP_MULTIPLIER,
  BUY_SUPPLY_LOWER,
} from './trade-core.js';

const zones: ZoneState[] = [{ id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: [] }];
const districts = [{ id: 'district-1', name: 'Market', zoneIds: ['zone-a'], tags: [] }];

const makePlayer = (inventory: string[] = []): EntityState => ({
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
});

/** District-1 has NO controllingFaction, so reputation/heat stay neutral (0) — isolates scarcity as the only price driver. */
function makeSellEngine(inventory: string[] = ['rum-barrel']) {
  return createTestEngine({
    modules: [
      createEnvironmentCore(),
      createDistrictCore({ districts }),
      createEconomyCore({ districts: districts.map((d) => ({ id: d.id, tags: d.tags })) }),
      createTradeCore(),
    ],
    entities: [makePlayer(inventory)],
    zones,
  });
}

describe('inferSupplyCategory — id-keyword inference (no ItemDefinition catalog wired)', () => {
  it('matches the 4 F-d70c722d items to their documented categories', () => {
    expect(inferSupplyCategory('emergency-cell')).toBe('fuel');
    expect(inferSupplyCategory('smelling-salts')).toBe('medicine');
    expect(inferSupplyCategory('rum-barrel')).toBe('luxuries');
    expect(inferSupplyCategory('sage-bundle')).toBe('medicine');
  });

  it('falls back to components for an unrecognized id', () => {
    expect(inferSupplyCategory('mystery-widget-9000')).toBe('components');
  });
});

describe('sell verb (F-6c3e4fde) — the missing trade wire', () => {
  it('credits coin at the district-scarcity price, removes the item, and raises local supply (the TradeEffect)', () => {
    const engine = makeSellEngine(['rum-barrel']);

    const events = engine.submitAction('sell', { targetIds: ['rum-barrel'] });

    expect(events.some((e) => e.type === 'item.sold')).toBe(true);
    // Baseline district (tradeVolume 50, luxuries at 50, no active pressures,
    // no controlling faction, no contraband): every ValueModifiers multiplier
    // is 1.0, so finalValue == the flat base value exactly.
    expect(engine.world.entities.player.resources[SELL_CURRENCY]).toBe(SELL_BASE_VALUE);
    expect(engine.world.entities.player.inventory).not.toContain('rum-barrel');

    const economy = (engine.world.modules['economy-core'] as EconomyCoreState).districts['district-1'];
    expect(getSupplyLevel(economy, 'luxuries')).toBe(50 + SELL_SUPPLY_RAISE);
  });

  it('was impossible before this module: no "sell" verb existed anywhere (RED without createTradeCore registered)', () => {
    // Same fixture, minus createTradeCore — the exact pre-fix condition.
    const engine = createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createEconomyCore({ districts: districts.map((d) => ({ id: d.id, tags: d.tags })) }),
      ],
      entities: [makePlayer(['rum-barrel'])],
      zones,
    });

    const events = engine.submitAction('sell', { targetIds: ['rum-barrel'] });

    expect(events.some((e) => e.type === 'item.sold')).toBe(false);
    expect(engine.world.entities.player.inventory).toContain('rum-barrel'); // untouched
    expect(engine.world.entities.player.resources[SELL_CURRENCY] ?? 0).toBe(0);
  });

  it('scarcity drives price: a scarce supply sells for more than a surplus one', () => {
    const scarce = makeSellEngine(['rum-barrel']);
    (scarce.world.modules['economy-core'] as EconomyCoreState).districts['district-1'].supplies.luxuries.level = 10;

    const surplus = makeSellEngine(['rum-barrel']);
    (surplus.world.modules['economy-core'] as EconomyCoreState).districts['district-1'].supplies.luxuries.level = 90;

    scarce.submitAction('sell', { targetIds: ['rum-barrel'] });
    surplus.submitAction('sell', { targetIds: ['rum-barrel'] });

    // computeScarcityMultiplier: <20 -> 3.0x, >80 -> 0.5x (trade-value.ts).
    expect(scarce.world.entities.player.resources[SELL_CURRENCY]).toBe(30);
    expect(surplus.world.entities.player.resources[SELL_CURRENCY]).toBe(5);
    expect(scarce.world.entities.player.resources[SELL_CURRENCY]).toBeGreaterThan(
      surplus.world.entities.player.resources[SELL_CURRENCY],
    );
  });

  it('threads formatTradeAdviceForNarrator into the item.sold payload (F-47b295e7)', () => {
    const engine = makeSellEngine(['rum-barrel']);
    const events = engine.submitAction('sell', { targetIds: ['rum-barrel'] });
    const sold = events.find((e) => e.type === 'item.sold');
    expect(typeof sold?.payload.narratorHint).toBe('string');
    expect((sold?.payload.narratorHint as string).length).toBeGreaterThan(0);
  });

  it('rejects selling an item not carried — no state mutation', () => {
    const engine = makeSellEngine([]);
    const events = engine.submitAction('sell', { targetIds: ['rum-barrel'] });
    expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
    expect(engine.world.entities.player.resources[SELL_CURRENCY] ?? 0).toBe(0);
  });

  it('rejects when the player\'s zone has no district/economy to sell into', () => {
    const engine = createTestEngine({
      modules: [createTradeCore()], // no district-core/economy-core registered
      entities: [makePlayer(['rum-barrel'])],
      zones,
    });
    const events = engine.submitAction('sell', { targetIds: ['rum-barrel'] });
    expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
    expect(engine.world.entities.player.inventory).toContain('rum-barrel');
  });

  it('rejects an untradeable item (contraband with no active black market)', () => {
    const engine = makeSellEngine(['smuggled-goods']);
    const economy = (engine.world.modules['economy-core'] as EconomyCoreState).districts['district-1'];
    // <=30 and no other category <20 -> isBlackMarketCondition() is false.
    economy.supplies.contraband.level = 25;

    const events = engine.submitAction('sell', { targetIds: ['smuggled-goods'] });

    expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
    expect(engine.world.entities.player.inventory).toContain('smuggled-goods');
    expect(engine.world.entities.player.resources[SELL_CURRENCY] ?? 0).toBe(0);
  });
});

// --- Buyable stock model (F-f73aa080) ---

describe('getBuyableStock (F-f73aa080) — category-granularity merchant stock, not a per-item catalog', () => {
  it('offers the generic default list when no genre is configured', () => {
    const economy = createDistrictEconomy();
    expect(getBuyableStock(economy, 'weapons')).toEqual(['short-sword']);
  });

  it('genre flavoring is respected — pirate and fantasy differ for the same category', () => {
    const economy = createDistrictEconomy();
    const pirateLuxuries = getBuyableStock(economy, 'luxuries', 'pirate');
    const fantasyLuxuries = getBuyableStock(economy, 'luxuries', 'fantasy');

    expect(pirateLuxuries).toContain('rum-barrel');
    expect(fantasyLuxuries).not.toContain('rum-barrel');
    expect(fantasyLuxuries.length).toBeGreaterThan(0);
  });

  it('an unknown genre falls back to the generic default list', () => {
    const economy = createDistrictEconomy();
    expect(getBuyableStock(economy, 'weapons', 'not-a-real-genre')).toEqual(['short-sword']);
  });

  it('below-floor category is not offered, genre or no genre (BUY_SUPPLY_FLOOR)', () => {
    const economy = createDistrictEconomy();
    economy.supplies.weapons.level = BUY_SUPPLY_FLOOR - 1;

    expect(getBuyableStock(economy, 'weapons')).toEqual([]);
    expect(getBuyableStock(economy, 'weapons', 'pirate')).toEqual([]);
  });

  it('a category exactly at the floor IS offered (floor is inclusive)', () => {
    const economy = createDistrictEconomy();
    economy.supplies.weapons.level = BUY_SUPPLY_FLOOR;
    expect(getBuyableStock(economy, 'weapons')).toEqual(['short-sword']);
  });
});

// --- The buy verb (F-31f15013) ---

const makeBuyerPlayer = (coin: number, inventory: string[] = []): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: {},
  resources: { hp: 20, coin },
  statuses: [],
  zoneId: 'zone-a',
  inventory,
});

/** Same neutral Market-1 district as makeSellEngine — no controlling faction, baseline (50) supply on every category unless a genre is given. */
function makeBuyEngine(coin: number, opts: { genre?: string; inventory?: string[] } = {}) {
  return createTestEngine({
    modules: [
      createEnvironmentCore(),
      createDistrictCore({ districts }),
      createEconomyCore({ districts: districts.map((d) => ({ id: d.id, tags: d.tags })), genre: opts.genre }),
      createTradeCore({ genre: opts.genre }),
    ],
    entities: [makeBuyerPlayer(coin, opts.inventory ?? [])],
    zones,
  });
}

describe('buy verb (F-31f15013) — the missing merchant-side wire', () => {
  it('was impossible before this module: no "buy" verb existed anywhere (RED without createTradeCore registered)', () => {
    const engine = createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createEconomyCore({ districts: districts.map((d) => ({ id: d.id, tags: d.tags })) }),
        // no createTradeCore() — the exact pre-fix condition.
      ],
      entities: [makeBuyerPlayer(50)],
      zones,
    });

    const events = engine.submitAction('buy', { targetIds: ['short-sword'] });

    // dispatch() returns [] directly for a truly unregistered verb (it never
    // reaches a handler that could emit action.rejected into the returned
    // array) — same "impossible before" shape as the sell verb's own pin above.
    expect(events.some((e) => e.type === 'item.bought')).toBe(false);
    expect(engine.world.entities.player.inventory).not.toContain('short-sword');
    expect(engine.world.entities.player.resources[SELL_CURRENCY]).toBe(50);
  });

  it('succeeds: debits coin at base-value + markup, adds the item, lowers category supply (mirrored TradeEffect), and emits item.bought + inventory.item.received', () => {
    const engine = makeBuyEngine(50);

    const events = engine.submitAction('buy', { targetIds: ['short-sword'] });

    expect(events.some((e) => e.type === 'item.bought')).toBe(true);
    expect(events.some((e) => e.type === 'inventory.item.received')).toBe(true);

    // Baseline district (all supply 50, tradeVolume 50, no faction, no pressures):
    // computeItemValue's rawMult is 1.0, so finalValue == SELL_BASE_VALUE (10);
    // buy price is that times BUY_MARKUP_MULTIPLIER (1.3) == 13.
    const expectedPrice = Math.round(SELL_BASE_VALUE * BUY_MARKUP_MULTIPLIER);
    expect(expectedPrice).toBe(13);
    expect(engine.world.entities.player.resources[SELL_CURRENCY]).toBe(50 - expectedPrice);
    expect(engine.world.entities.player.inventory).toContain('short-sword');

    const economy = (engine.world.modules['economy-core'] as EconomyCoreState).districts['district-1'];
    expect(getSupplyLevel(economy, 'weapons')).toBe(50 + BUY_SUPPLY_LOWER);

    // district-core's dormant 'inventory.item.received' listener (commerce +3) wakes up.
    const district = getDistrictState(engine.world, 'district-1');
    expect(district?.commerce).toBe(53);
  });

  it('rejects insufficient coin with a structured failure event — no state mutation', () => {
    const engine = makeBuyEngine(5); // price is 13; 5 is not enough

    const events = engine.submitAction('buy', { targetIds: ['short-sword'] });

    const rejected = events.find((e) => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(String(rejected?.payload.reason)).toMatch(/coin/);
    expect(engine.world.entities.player.resources[SELL_CURRENCY]).toBe(5);
    expect(engine.world.entities.player.inventory).not.toContain('short-sword');
  });

  it('reads a missing coin resource safely (0, not NaN/undefined) and still rejects — F-92c78519', () => {
    const engine = createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createEconomyCore({ districts: districts.map((d) => ({ id: d.id, tags: d.tags })) }),
        createTradeCore(),
      ],
      entities: [{
        id: 'player', blueprintId: 'player', type: 'player', name: 'Hero',
        tags: ['player'], stats: {}, resources: { hp: 20 }, statuses: [],
        zoneId: 'zone-a', inventory: [],
      }],
      zones,
    });

    const events = engine.submitAction('buy', { targetIds: ['short-sword'] });

    const rejected = events.find((e) => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(String(rejected?.payload.reason)).not.toMatch(/NaN|undefined/);
    expect(engine.world.entities.player.inventory).not.toContain('short-sword');
    expect(engine.world.entities.player.resources.coin ?? 0).toBe(0);
  });

  it('refuses to buy from a category whose supply has fallen below the offer floor', () => {
    const engine = makeBuyEngine(50);
    (engine.world.modules['economy-core'] as EconomyCoreState).districts['district-1'].supplies.weapons.level = BUY_SUPPLY_FLOOR - 1;

    const events = engine.submitAction('buy', { targetIds: ['short-sword'] });

    expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
    expect(engine.world.entities.player.inventory).not.toContain('short-sword');
    expect(engine.world.entities.player.resources[SELL_CURRENCY]).toBe(50);
  });

  it("rejects an item not present in this district's (or genre's) buyable stock", () => {
    const engine = makeBuyEngine(50);
    const events = engine.submitAction('buy', { targetIds: ['nonexistent-widget'] });

    expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
    expect(engine.world.entities.player.inventory).not.toContain('nonexistent-widget');
    expect(engine.world.entities.player.resources[SELL_CURRENCY]).toBe(50);
  });

  it('rejects contraband that clears the offer floor but has no active black market (untradeable gate, mirrors sell)', () => {
    const engine = makeBuyEngine(50);
    const economy = (engine.world.modules['economy-core'] as EconomyCoreState).districts['district-1'];
    // 30 clears BUY_SUPPLY_FLOOR (>=30) but isBlackMarketCondition needs contraband STRICTLY >30.
    economy.supplies.contraband.level = 30;

    const events = engine.submitAction('buy', { targetIds: ['contraband-goods'] });

    expect(events.some((e) => e.type === 'action.rejected')).toBe(true);
    expect(engine.world.entities.player.resources[SELL_CURRENCY]).toBe(50);
    expect(engine.world.entities.player.inventory).not.toContain('contraband-goods');
  });

  it('genre flavoring reaches the buy verb end-to-end: a pirate-genre district offers rum-barrel, a fantasy one does not', () => {
    const pirateEngine = makeBuyEngine(50, { genre: 'pirate' });
    const pirateEvents = pirateEngine.submitAction('buy', { targetIds: ['rum-barrel'] });
    expect(pirateEvents.some((e) => e.type === 'item.bought')).toBe(true);

    const fantasyEngine = makeBuyEngine(50, { genre: 'fantasy' });
    const fantasyEvents = fantasyEngine.submitAction('buy', { targetIds: ['rum-barrel'] });
    expect(fantasyEvents.some((e) => e.type === 'action.rejected')).toBe(true);
  });
});

// --- Single-source buy price (menu-integration wave) ---
//
// buyHandler used to compute its price inline; menu.ts's buildBuyActions (the
// numbered CLI menu's buy entries) needs to PREVIEW that same price before
// the player commits a turn to it — a second, hand-rolled copy of the
// ctx-building + computeItemValue + markup pipeline would drift the moment
// either copy changed. quoteBuyPrice is the single source both now call.
describe('quoteBuyPrice (single-source buy price) — buyHandler must debit exactly this value', () => {
  it('returns the same number buyHandler actually debits — no divergence', () => {
    const engine = makeBuyEngine(50);
    const price = quoteBuyPrice(engine.world, 'short-sword');
    expect(price).toBe(13); // SELL_BASE_VALUE(10) * BUY_MARKUP_MULTIPLIER(1.3), baseline district

    const before = engine.world.entities.player.resources[SELL_CURRENCY];
    engine.submitAction('buy', { targetIds: ['short-sword'] });
    const after = engine.world.entities.player.resources[SELL_CURRENCY];
    expect(before - after).toBe(price);
  });

  it('returns undefined for an item not currently offered (below-floor or unknown id)', () => {
    const engine = makeBuyEngine(50);
    expect(quoteBuyPrice(engine.world, 'nonexistent-widget')).toBeUndefined();

    const economy = (engine.world.modules['economy-core'] as EconomyCoreState).districts['district-1'];
    economy.supplies.weapons.level = BUY_SUPPLY_FLOOR - 1;
    expect(quoteBuyPrice(engine.world, 'short-sword')).toBeUndefined();
  });

  it('returns undefined when the player is nowhere near a market', () => {
    const engine = createTestEngine({
      modules: [createTradeCore()], // no district-core/economy-core registered
      entities: [makeBuyerPlayer(50)],
      zones,
    });
    expect(quoteBuyPrice(engine.world, 'short-sword')).toBeUndefined();
  });

  it('returns undefined for a contraband item with no active black market (untradeable gate, mirrors buyHandler)', () => {
    const engine = makeBuyEngine(50);
    const economy = (engine.world.modules['economy-core'] as EconomyCoreState).districts['district-1'];
    economy.supplies.contraband.level = 30; // clears BUY_SUPPLY_FLOOR but not the black-market threshold
    expect(quoteBuyPrice(engine.world, 'contraband-goods')).toBeUndefined();
  });

  it('respects genre flavoring exactly like getBuyableStock (same genre argument, same offered ids)', () => {
    const pirateEngine = makeBuyEngine(50, { genre: 'pirate' });
    expect(quoteBuyPrice(pirateEngine.world, 'rum-barrel', 'pirate')).toBeDefined();

    const fantasyEngine = makeBuyEngine(50, { genre: 'fantasy' });
    expect(quoteBuyPrice(fantasyEngine.world, 'rum-barrel', 'fantasy')).toBeUndefined();
  });
});

// --- Buy/sell spread (F-e9f0a338) ---

describe('buy/sell spread (F-e9f0a338) — BUY_MARKUP_MULTIPLIER prevents a riskless round-trip', () => {
  it('buying then selling the same item in the same district always loses coin', () => {
    const engine = makeBuyEngine(50);
    const startingCoin = 50;

    engine.submitAction('buy', { targetIds: ['short-sword'] });
    const afterBuy = engine.world.entities.player.resources[SELL_CURRENCY];
    expect(afterBuy).toBe(startingCoin - 13); // 37

    engine.submitAction('sell', { targetIds: ['short-sword'] });
    const afterSell = engine.world.entities.player.resources[SELL_CURRENCY];

    // Post-buy weapons supply (50 + BUY_SUPPLY_LOWER = 47) is still in the same
    // 40-60 scarcity bucket as baseline, so sell's finalValue is still
    // SELL_BASE_VALUE (10) unmarked-up — the round trip nets a loss, never a gain.
    expect(afterSell).toBe(37 + 10); // 47
    expect(afterSell).toBeLessThan(startingCoin);
    expect(engine.world.entities.player.inventory).not.toContain('short-sword');
  });
});
