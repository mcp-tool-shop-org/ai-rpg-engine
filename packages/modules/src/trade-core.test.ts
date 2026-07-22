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
import { createDistrictCore } from './district-core.js';
import { createEconomyCore, getSupplyLevel, type EconomyCoreState } from './economy-core.js';
import { createTradeCore, inferSupplyCategory, SELL_CURRENCY, SELL_SUPPLY_RAISE, SELL_BASE_VALUE } from './trade-core.js';

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
