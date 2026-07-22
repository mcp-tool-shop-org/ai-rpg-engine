// trade-core — the sell + buy verbs: player loot meets district-scarcity
// pricing in both directions (F-6c3e4fde sell, F-31f15013 buy).
// trade-value.ts's computeItemValue/deriveTradeAdvice and economy-core.ts's
// DistrictEconomy/applyEconomyShift are fully authored and tested but — until
// F-6c3e4fde — had zero callers outside their own test files: a player could
// find loot but never sell it for contextual, scarcity-aware value.
// F-6c3e4fde was the missing sell wire, a small EngineModule following
// inventory-core.ts's 'use' verb shape; F-31f15013 adds the matching buy wire
// in the same module.
//
// Buy is category-granular, NOT a per-item merchant catalog (F-f73aa080): a
// small fixed genre-flavored item-id list per SupplyCategory
// (GENRE_BUYABLE_STOCK / DEFAULT_BUYABLE_STOCK below — the same combined
// idiom as this file's own CATEGORY_HINTS and economy-core's
// GENRE_SUPPLY_DEFAULTS), offered only when the category's live supply is
// at/above BUY_SUPPLY_FLOOR. No separate restock timer: the district's own
// supply level IS the restock signal. Crafting/salvage is still out of scope
// this wave; this file never imports crafting-core.
//
// Honest ceiling: the plain inventory these verbs read (EntityState.inventory:
// string[], inventory-core's own shape) carries no catalog metadata — no
// stored base value, no supply category, no @ai-rpg-engine/equipment
// ItemDefinition/provenance (that package models a SEPARATE loadout/chronicle
// system inventory-core's shape never touches). inferSupplyCategory below
// infers a SOLD item's category from its id — the same hint-matching idiom
// pressure-system.ts's isMerchantFaction/findFactionByHint already use for an
// unmodeled classification; a BOUGHT item's category is always already known
// (it came from this file's own fixed BuyableStock lists), so the buy path
// never needs to guess. Every sale/purchase prices off the same flat base
// value (SELL_BASE_VALUE) run through computeItemValue, with buy applying one
// additional fixed markup (BUY_MARKUP_MULTIPLIER, F-e9f0a338) so a same-
// district buy-then-sell of one item is always a net coin loss. Provenance
// (stolen/relic/notoriety) stays undefined: computeItemValue's own contract
// treats that as "no premium, no penalty," which is the honest answer until a
// catalog-aware pricing pass threads real item metadata through here.

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
} from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';
import type { SupplyCategory, EconomyShift, DistrictEconomy } from './economy-core.js';
import { getDistrictEconomy, setDistrictEconomy, applyEconomyShift, getSupplyLevel } from './economy-core.js';
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

// --- Buyable stock model (F-f73aa080: category granularity, not a per-item catalog) ---

/** A merchant's offered item ids, keyed by SupplyCategory — not a per-item
 *  catalog (see file header). Partial: a genre need not flavor every
 *  category, and the caller's own getBuyableStock falls back to
 *  DEFAULT_BUYABLE_STOCK per-category when it doesn't. */
export type BuyableStock = Partial<Record<SupplyCategory, string[]>>;

/**
 * Genre-flavored buyable item ids per category — the same combined idiom as
 * this file's own CATEGORY_HINTS (category-keyed lists) and economy-core's
 * GENRE_SUPPLY_DEFAULTS (genre-keyed records). A small FIXED list, not a
 * generated catalog: these (plus DEFAULT_BUYABLE_STOCK) are the only ids the
 * buy verb will ever offer or accept. Every id here round-trips through
 * inferSupplyCategory back to the SAME category it's listed under, so a
 * bought-then-resold item never jumps categories.
 */
const GENRE_BUYABLE_STOCK: Record<string, BuyableStock> = {
  fantasy: {
    medicine: ['healing-draught', 'antidote-salts'],
    weapons: ['iron-sword', 'hunting-dagger'],
    food: ['trail-bread', 'dried-meat'],
    luxuries: ['silver-gem', 'silk-scarf'],
    components: ['iron-scrap'],
  },
  cyberpunk: {
    components: ['circuit-board', 'servo-gear'],
    contraband: ['smuggled-chipware'],
    medicine: ['stim-tonic'],
    ammunition: ['smart-round'],
    fuel: ['power-cell'],
  },
  pirate: {
    ammunition: ['cannon-shell'],
    food: ['salt-meat', 'ship-provisions'],
    luxuries: ['rum-barrel', 'gold-doubloon'],
    medicine: ['sea-salve'],
    fuel: ['lamp-fuel'],
  },
  zombie: {
    medicine: ['antibiotic', 'bandage'],
    ammunition: ['shotgun-shell'],
    food: ['canned-ration'],
    fuel: ['gas-can'],
    weapons: ['machete-blade'],
  },
  detective: {
    contraband: ['smuggled-goods'],
    luxuries: ['gold-cufflinks'],
    weapons: ['service-pistol'],
    medicine: ['smelling-salts'],
  },
  colony: {
    components: ['spare-part'],
    fuel: ['reactor-fuel-cell'],
    food: ['algae-ration-pack'],
    medicine: ['trauma-medkit'],
    ammunition: ['flare-round'],
  },
  'weird-west': {
    ammunition: ['bullet-box'],
    medicine: ['tonic'],
    food: ['trail-meat-jerky'],
    luxuries: ['gold-pocket-watch'],
    fuel: ['coal-oil-fuel'],
  },
};

/** Generic fallback stock — no genre configured (or genre has no entry for
 *  this category): one plausible item id per category, the same
 *  "unremarkable but valid" posture inferSupplyCategory's own 'components'
 *  fallback takes. Every id here round-trips through inferSupplyCategory the
 *  same way GENRE_BUYABLE_STOCK's do (see its own comment). */
const DEFAULT_BUYABLE_STOCK: BuyableStock = {
  medicine: ['medkit'],
  weapons: ['short-sword'],
  ammunition: ['ammo-pack'],
  fuel: ['fuel-cell'],
  food: ['ration-pack'],
  luxuries: ['trinket'],
  contraband: ['contraband-goods'],
  components: ['scrap-metal'],
};

/** Every SupplyCategory, derived from CATEGORY_HINTS's own keys so the two
 *  never drift apart (both enumerate the full SupplyCategory union). */
const ALL_SUPPLY_CATEGORIES: SupplyCategory[] = CATEGORY_HINTS.map(([category]) => category);

/**
 * Minimum supply level (0-100) a category must hold before its fixed item
 * list is offered for purchase — mirrors isBlackMarketCondition's own
 * threshold idiom (economy-core.ts). No separate restock timer: the live
 * supply level IS the restock signal, so a merchant's shelves refill (or
 * empty) exactly as fast as the district's own economy ticks.
 */
export const BUY_SUPPLY_FLOOR = 30;

/**
 * The fixed item ids a merchant offers for `category` in this district right
 * now: [] when the category's supply is below BUY_SUPPLY_FLOOR (nothing
 * spare to sell the player), otherwise the genre's list — falling back to
 * DEFAULT_BUYABLE_STOCK when genre is unset or has no entry for this
 * category, the same fallback order createDistrictEconomy's own genre lookup
 * uses for supply defaults.
 */
export function getBuyableStock(
  economy: DistrictEconomy,
  category: SupplyCategory,
  genre?: string,
): string[] {
  if (getSupplyLevel(economy, category) < BUY_SUPPLY_FLOOR) return [];
  const genreStock = genre ? GENRE_BUYABLE_STOCK[genre]?.[category] : undefined;
  return genreStock ?? DEFAULT_BUYABLE_STOCK[category] ?? [];
}

/**
 * Which SupplyCategory (if any) currently offers `itemId` for purchase —
 * searches every category's live getBuyableStock, so an item below its
 * category's floor is correctly reported as not-for-sale rather than guessed
 * from its id's keywords (inferSupplyCategory's job is pricing an arbitrary
 * SOLD item's category post hoc; a BOUGHT item's category is always already
 * known — it came from this file's own fixed BuyableStock lists).
 */
function findBuyableCategory(
  economy: DistrictEconomy,
  itemId: string,
  genre?: string,
): SupplyCategory | undefined {
  for (const category of ALL_SUPPLY_CATEGORIES) {
    if (getBuyableStock(economy, category, genre).includes(itemId)) return category;
  }
  return undefined;
}

/** Buy-side markup over computeItemValue's finalValue (F-e9f0a338) — the
 *  only buy/sell spread. Keeps a same-district buy-then-sell of one item a
 *  net coin loss (no riskless round-trip): the same base value and district
 *  context price both directions, buy just pays this much more. */
export const BUY_MARKUP_MULTIPLIER = 1.3;

/** Local supply lowered per purchase — exact mirror of SELL_SUPPLY_RAISE:
 *  buying consumes stock the same magnitude selling replenishes it. */
export const BUY_SUPPLY_LOWER = -SELL_SUPPLY_RAISE;

/**
 * The buy verb: validates the item is currently offered by this district's
 * BuyableStock (F-f73aa080), prices it via computeItemValue +
 * BUY_MARKUP_MULTIPLIER (F-e9f0a338), debits SELL_CURRENCY — reading it
 * NaN/undefined-safely (F-92c78519) — adds the item to inventory (the exact
 * inverse of sellHandler's splice), and applies a supply-LOWERING TradeEffect
 * back into the same district (BUY_SUPPLY_LOWER, the mirror of
 * SELL_SUPPLY_RAISE). Rejects (no state mutation) when the actor is missing,
 * no item is specified, the district has no market, the item isn't currently
 * offered (absent from BuyableStock or its category is below-floor), the
 * item is untradeable (contraband with no black market — the same
 * computeItemValue-derived gate sellHandler uses), or coin is insufficient.
 */
function buyHandler(action: ActionIntent, world: WorldState, genre?: string): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor not found' })];
  }

  const itemId = action.toolId ?? action.targetIds?.[0];
  if (!itemId) {
    return [makeEvent(action, 'action.rejected', { reason: 'no item specified' })];
  }

  const zoneId = actor.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  const districtEconomy = districtId ? getDistrictEconomy(world, districtId) : undefined;
  if (!districtId || !districtEconomy) {
    return [makeEvent(action, 'action.rejected', { reason: 'no market here' })];
  }

  const supplyCategory = findBuyableCategory(districtEconomy, itemId, genre);
  if (!supplyCategory) {
    return [makeEvent(action, 'action.rejected', { reason: `${itemId} is not for sale here` })];
  }

  const controllingFactionId = getDistrictDefinition(world, districtId)?.controllingFaction;
  // Same authored-baseline + accrued-delta merge sellHandler uses for
  // reputation — buy and sell can never disagree about how a faction feels
  // about the player.
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
    isContraband: supplyCategory === 'contraband',
    activePressureKinds,
  };

  // Same flat base value + computeItemValue pipeline sellHandler uses — buy
  // and sell price identically except for the markup applied next, which is
  // what makes a round-trip a guaranteed loss (F-e9f0a338).
  const result = computeItemValue(SELL_BASE_VALUE, supplyCategory, ctx);
  if (result.tradeAdvice === 'untradeable') {
    return [makeEvent(action, 'action.rejected', { reason: result.reason })];
  }

  const price = Math.round(result.finalValue * BUY_MARKUP_MULTIPLIER);

  // F-92c78519: never NaN/undefined arithmetic on a possibly-unseeded resource.
  const coin = actor.resources[SELL_CURRENCY] ?? 0;
  if (coin < price) {
    return [
      makeEvent(action, 'action.rejected', {
        reason: `not enough ${SELL_CURRENCY} (need ${price}, have ${coin})`,
      }),
    ];
  }

  actor.resources[SELL_CURRENCY] = coin - price;

  // Add to inventory — the exact inverse of sellHandler's splice.
  if (!actor.inventory) actor.inventory = [];
  actor.inventory.push(itemId);

  // The matching TradeEffect: an economy-shift that LOWERS the bought
  // category's local supply (BUY_SUPPLY_LOWER, the mirror of
  // SELL_SUPPLY_RAISE) — applied back into the same district.
  const effect: TradeEffect = {
    type: 'economy-shift',
    districtId,
    category: supplyCategory,
    delta: BUY_SUPPLY_LOWER,
    cause: `bought ${itemId}`,
  };
  const shift: EconomyShift = {
    districtId: effect.districtId,
    category: effect.category,
    delta: effect.delta,
    cause: effect.cause,
  };
  setDistrictEconomy(world, districtId, applyEconomyShift(districtEconomy, shift));

  return [
    makeEvent(action, 'item.bought', {
      entityId: actor.id,
      itemId,
      districtId,
      supplyCategory,
      value: price,
      currency: SELL_CURRENCY,
    }),
    // F-31f15013: district-core's own 'inventory.item.received' listener
    // (commerce +3) has had zero emitters anywhere in the engine until this
    // verb — wake it up.
    makeEvent(action, 'inventory.item.received', {
      entityId: actor.id,
      itemId,
      districtId,
    }),
  ];
}

/** Config accepted by createTradeCore — genre selects GENRE_BUYABLE_STOCK's
 *  flavor for the buy verb's offered items (F-f73aa080); omit for the
 *  DEFAULT_BUYABLE_STOCK generic list only. Optional so the existing
 *  world-stack.ts call site (createTradeCore()) keeps compiling unchanged. */
export type TradeCoreConfig = {
  genre?: string;
};

/** The trade-core module: registers the 'sell' and 'buy' verbs. */
export function createTradeCore(config: TradeCoreConfig = {}): EngineModule {
  const { genre } = config;

  return {
    id: 'trade-core',
    version: '1.0.0',

    register(ctx) {
      ctx.actions.registerVerb('sell', (action, world) => sellHandler(action, world));
      ctx.actions.registerVerb('buy', (action, world) => buyHandler(action, world, genre));
    },
  };
}

export const tradeCore: EngineModule = createTradeCore();
