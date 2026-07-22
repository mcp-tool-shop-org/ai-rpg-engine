// trade-core — the sell verb: player loot meets district-scarcity pricing
// (F-6c3e4fde). trade-value.ts's computeItemValue/deriveTradeAdvice and
// economy-core.ts's DistrictEconomy/applyEconomyShift are fully authored and
// tested but — until this file — had zero callers outside their own test
// files: a player could find loot but never sell it for contextual,
// scarcity-aware value. This is the missing wire, a small EngineModule
// following inventory-core.ts's 'use' verb shape.
//
// SELL-ONLY for v2.8 (locked design decision): no buy, no merchant stock, no
// currency purchase — those defer to v2.9. Crafting/salvage is also out of
// scope this wave; this file never imports crafting-core.
//
// Honest ceiling: the plain inventory this verb reads (EntityState.inventory:
// string[], inventory-core's own shape) carries no catalog metadata — no
// stored base value, no supply category, no @ai-rpg-engine/equipment
// ItemDefinition/provenance (that package models a SEPARATE loadout/chronicle
// system inventory-core's shape never touches). inferSupplyCategory below
// infers a category from the item id itself — the same hint-matching idiom
// pressure-system.ts's isMerchantFaction/findFactionByHint already use for an
// unmodeled classification — and every sale prices off a flat base value.
// Provenance (stolen/relic/notoriety) stays undefined: computeItemValue's own
// contract treats that as "no premium, no penalty," which is the honest
// answer until a catalog-aware pricing pass threads real item metadata
// through here.

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
} from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';
import type { SupplyCategory, EconomyShift } from './economy-core.js';
import { getDistrictEconomy, setDistrictEconomy, applyEconomyShift } from './economy-core.js';
import { getDistrictForZone, getDistrictDefinition } from './district-core.js';
import {
  computeItemValue,
  formatTradeAdviceForNarrator,
  type TradeContext,
  type TradeEffect,
} from './trade-value.js';
import { getActivePressures, HEAT_KEY } from './world-tick.js';

// --- Category inference (no ItemDefinition catalog wired — see file header) ---

const CATEGORY_HINTS: [SupplyCategory, string[]][] = [
  ['medicine', ['medicine', 'medkit', 'draught', 'antibiotic', 'salts', 'salve', 'bandage', 'heal', 'cure', 'tonic', 'elixir', 'sage']],
  ['ammunition', ['ammo', 'bullet', 'round', 'shell', 'cartridge', 'arrow', 'bolt']],
  ['weapons', ['sword', 'blade', 'gun', 'rifle', 'pistol', 'axe', 'spear', 'cutter', 'knife', 'dagger']],
  ['fuel', ['fuel', 'cell', 'battery', 'gas', 'charge', 'power-core']],
  ['food', ['food', 'ration', 'bread', 'meat', 'fruit', 'meal', 'provision']],
  ['luxuries', ['rum', 'wine', 'gem', 'jewel', 'silk', 'perfume', 'gold', 'barrel', 'relic', 'trinket']],
  ['contraband', ['contraband', 'drug', 'smuggled', 'stolen-goods']],
  ['components', ['component', 'part', 'scrap', 'circuit', 'gear']],
];

/**
 * Infer a sellable item's SupplyCategory from its id. Falls back to
 * 'components' — the generic-goods bucket crafting-core's own tool/armor
 * salvage table defaults to — when no hint matches, so an unrecognized item
 * still sells at a reasonable, if unremarkable, category rather than
 * rejecting.
 */
export function inferSupplyCategory(itemId: string): SupplyCategory {
  const haystack = itemId.toLowerCase();
  for (const [category, hints] of CATEGORY_HINTS) {
    if (hints.some((hint) => haystack.includes(hint))) return category;
  }
  return 'components';
}

/** Flat base value every sale prices from — see file header's honest ceiling. */
export const SELL_BASE_VALUE = 10;

/** Local supply raised per sale (mirrors crafting-core's own +1-per-yield-unit salvage feedback, scaled up slightly since a sale is one completed transaction, not a per-material-unit yield). */
export const SELL_SUPPLY_RAISE = 3;

/** The resource credited on the seller — a plain EntityState.resources key, no progression-core ledger dependency. */
export const SELL_CURRENCY = 'coin';

function numGlobal(world: WorldState, key: string): number {
  const value = world.globals[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The sell verb: reads the seller's CURRENT district's live DistrictEconomy,
 * prices the item via computeItemValue, credits SELL_CURRENCY, removes the
 * item, and applies a supply-raising TradeEffect (economy-shift) back into
 * the same district. Rejects (no state mutation) when the actor is missing,
 * no item is specified, the item isn't carried, the actor's zone has no
 * district/economy to sell into, or the item is untradeable (contraband with
 * no black market).
 */
function sellHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor not found' })];
  }

  const itemId = action.toolId ?? action.targetIds?.[0];
  if (!itemId) {
    return [makeEvent(action, 'action.rejected', { reason: 'no item specified' })];
  }

  const inventory = actor.inventory ?? [];
  const itemIndex = inventory.indexOf(itemId);
  if (itemIndex === -1) {
    return [makeEvent(action, 'action.rejected', { reason: `you don't have ${itemId}` })];
  }

  const zoneId = actor.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  const districtEconomy = districtId ? getDistrictEconomy(world, districtId) : undefined;
  if (!districtId || !districtEconomy) {
    return [makeEvent(action, 'action.rejected', { reason: 'no market here' })];
  }

  const supplyCategory = inferSupplyCategory(itemId);
  const isContraband = supplyCategory === 'contraband';
  const controllingFactionId = getDistrictDefinition(world, districtId)?.controllingFaction;
  // Same authored-baseline + accrued-delta merge world-tick.ts's
  // buildPressureInputs uses for reputation — the sell verb and the pressure
  // tick can never disagree about how a faction feels about the player.
  const playerReputation = controllingFactionId
    ? (world.factions?.[controllingFactionId]?.reputation ?? 0) +
      numGlobal(world, `reputation_${controllingFactionId}`)
    : 0;
  const playerHeat = numGlobal(world, HEAT_KEY);
  const activePressureKinds = getActivePressures(world).map((pressure) => pressure.kind);

  const ctx: TradeContext = {
    districtEconomy,
    factionId: controllingFactionId,
    playerReputation,
    playerHeat,
    isContraband,
    activePressureKinds,
  };

  const result = computeItemValue(SELL_BASE_VALUE, supplyCategory, ctx);
  if (result.tradeAdvice === 'untradeable') {
    return [makeEvent(action, 'action.rejected', { reason: result.reason })];
  }

  // Remove from inventory (sold, same splice inventory-core's 'use' verb performs).
  inventory.splice(itemIndex, 1);

  // Credit the player resource.
  actor.resources[SELL_CURRENCY] = (actor.resources[SELL_CURRENCY] ?? 0) + result.finalValue;

  // The matching TradeEffect: an economy-shift that RAISES the sold
  // category's local supply (mirrors crafting-core's own documented
  // salvage-economy-feedback rule) — applied back into the same district.
  const effect: TradeEffect = {
    type: 'economy-shift',
    districtId,
    category: supplyCategory,
    delta: SELL_SUPPLY_RAISE,
    cause: `sold ${itemId}`,
  };
  const shift: EconomyShift = {
    districtId: effect.districtId,
    category: effect.category,
    delta: effect.delta,
    cause: effect.cause,
  };
  setDistrictEconomy(world, districtId, applyEconomyShift(districtEconomy, shift));

  return [
    makeEvent(action, 'item.sold', {
      entityId: actor.id,
      itemId,
      districtId,
      supplyCategory,
      value: result.finalValue,
      currency: SELL_CURRENCY,
      advice: result.tradeAdvice,
      // F-47b295e7: the cheapest real narrator win — thread the ~15-token
      // advice phrase into this event's own payload so the round's existing
      // narration line can pick it up without a new narrator-context pipeline
      // (see trade-value.ts's formatTradeAdviceForNarrator and this repo's
      // honest-ceiling note on the detailed single-district director view).
      narratorHint: formatTradeAdviceForNarrator(result),
    }),
  ];
}

/** The trade-core module: registers the 'sell' verb. No config — see file header. */
export function createTradeCore(): EngineModule {
  return {
    id: 'trade-core',
    version: '1.0.0',

    register(ctx) {
      ctx.actions.registerVerb('sell', (action, world) => sellHandler(action, world));
    },
  };
}

export const tradeCore: EngineModule = createTradeCore();
