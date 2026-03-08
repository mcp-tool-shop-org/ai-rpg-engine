// trade-value — context-sensitive item valuation
// v1.7: Items are worth different amounts depending on district scarcity,
// faction attitude, provenance notoriety, contraband status, and active pressures.
// Pure functions, lookup-table driven. No side effects.

import type { SupplyCategory, DistrictEconomy } from './economy-core.js';
import type { PressureKind } from './pressure-system.js';
import { getSupplyLevel, isBlackMarketCondition } from './economy-core.js';

// --- Types ---

/** Everything needed to compute an item's contextual value */
export type TradeContext = {
  districtEconomy: DistrictEconomy;
  /** Seller/buyer faction, if any */
  factionId?: string;
  /** Player reputation with the relevant faction (-100 to 100) */
  playerReputation: number;
  /** Player heat (0-100) */
  playerHeat: number;
  /** Whether the item is contraband */
  isContraband: boolean;
  /** Item provenance flags */
  itemProvenance?: {
    isStolen: boolean;
    isRelic: boolean;
    /** Notoriety — how well known the item's history is (0-100) */
    notoriety: number;
  };
  /** Active pressure kinds in the district */
  activePressureKinds: PressureKind[];
};

/** Breakdown of all value modifiers */
export type ValueModifiers = {
  /** 0.5-3.0 — scarce items are worth more */
  scarcityMultiplier: number;
  /** 0.7-1.5 — hostile factions gouge, friendly ones discount */
  factionAttitude: number;
  /** 1.0-2.0 — notorious/relic items command premiums */
  provenanceNotoriety: number;
  /** 0.0-1.0 — contraband penalty if no black market */
  contrabandPenalty: number;
  /** 0.8-1.2 — district prosperity scales */
  districtProsperity: number;
  /** 0.8-1.5 — active pressures inflate or deflate */
  pressureModifier: number;
};

/** Trade advice categories */
export type TradeAdvice =
  | 'sell-here'
  | 'sell-elsewhere'
  | 'hold'
  | 'risky'
  | 'untradeable';

/** Complete valuation result */
export type ItemValueResult = {
  baseValue: number;
  finalValue: number;
  modifiers: ValueModifiers;
  tradeAdvice: TradeAdvice;
  reason: string;
};

/** Side effects that a trade might produce */
export type TradeEffect =
  | { type: 'economy-shift'; districtId: string; category: SupplyCategory; delta: number; cause: string }
  | { type: 'leverage'; currency: string; delta: number }
  | { type: 'reputation'; factionId: string; delta: number }
  | { type: 'rumor'; claim: string; valence: string; targetFactionIds: string[] }
  | { type: 'heat'; delta: number }
  | { type: 'commerce'; districtId: string; delta: number };

// --- Computation ---

/** Scarcity multiplier: scarce items are worth more, surplus items less */
export function computeScarcityMultiplier(supplyLevel: number): number {
  if (supplyLevel < 20) return 3.0;
  if (supplyLevel < 30) return 2.0;
  if (supplyLevel < 40) return 1.5;
  if (supplyLevel <= 60) return 1.0;
  if (supplyLevel <= 70) return 0.8;
  if (supplyLevel <= 80) return 0.7;
  return 0.5;
}

/** Faction attitude: hostile gouges, friendly discounts */
export function computeFactionAttitudeMultiplier(reputation: number): number {
  if (reputation <= -60) return 1.5;
  if (reputation <= -30) return 1.3;
  if (reputation <= -10) return 1.1;
  if (reputation <= 10) return 1.0;
  if (reputation <= 30) return 0.95;
  if (reputation <= 60) return 0.9;
  return 0.85;
}

/** Provenance premium: stolen+hot items are risky, relics command premiums */
export function computeProvenanceMultiplier(
  provenance?: TradeContext['itemProvenance'],
  heat?: number,
): number {
  if (!provenance) return 1.0;
  let mult = 1.0;
  if (provenance.isRelic) mult += 0.5;
  if (provenance.notoriety > 50) mult += 0.2;
  if (provenance.isStolen && (heat ?? 0) > 30) {
    // Hot stolen goods: risky premium (black market inflates, legit deflates)
    mult += 0.3;
  }
  return Math.min(2.0, mult);
}

/** Contraband factor: no market = unsellable, black market = tradeable */
export function computeContrabandFactor(
  isContraband: boolean,
  blackMarketActive: boolean,
  reputation: number,
): number {
  if (!isContraband) return 1.0;
  if (!blackMarketActive) return 0.0; // untradeable
  // Black market active — rep affects willingness
  if (reputation <= -40) return 0.6;
  if (reputation <= -10) return 0.8;
  return 1.0;
}

/** Pressure modifier: active pressures inflate relevant categories */
export function computePressureModifier(
  pressureKinds: PressureKind[],
  category: SupplyCategory,
): number {
  let mod = 1.0;
  for (const kind of pressureKinds) {
    const effect = PRESSURE_PRICE_EFFECTS[kind];
    if (effect && effect.categories.includes(category)) {
      mod *= effect.multiplier;
    }
  }
  return Math.min(1.5, Math.max(0.8, mod));
}

/** Pressure effects on specific supply categories */
const PRESSURE_PRICE_EFFECTS: Record<string, { categories: SupplyCategory[]; multiplier: number }> = {
  'merchant-blacklist': { categories: ['luxuries', 'components', 'food'], multiplier: 1.2 },
  'bounty-issued': { categories: ['weapons', 'ammunition'], multiplier: 1.15 },
  'investigation-opened': { categories: ['contraband'], multiplier: 1.3 },
  'infection-suspicion': { categories: ['medicine'], multiplier: 1.4 },
  'camp-panic': { categories: ['food', 'medicine', 'ammunition'], multiplier: 1.25 },
  'corp-manhunt': { categories: ['components', 'contraband'], multiplier: 1.2 },
  'mutiny-brewing': { categories: ['food', 'weapons'], multiplier: 1.15 },
  'supply-crisis': { categories: ['medicine', 'food', 'fuel'], multiplier: 1.4 },
  'trade-war': { categories: ['luxuries', 'components', 'food'], multiplier: 1.3 },
  'black-market-boom': { categories: ['contraband', 'weapons'], multiplier: 1.2 },
};

/** District prosperity modifier based on trade volume */
function computeDistrictProsperity(economy: DistrictEconomy): number {
  const tv = economy.tradeVolume;
  if (tv < 30) return 0.85;
  if (tv < 45) return 0.95;
  if (tv <= 55) return 1.0;
  if (tv <= 70) return 1.1;
  return 1.2;
}

// --- Main Valuation ---

/** Compute an item's contextual value given all trade factors */
export function computeItemValue(
  baseValue: number,
  supplyCategory: SupplyCategory,
  ctx: TradeContext,
): ItemValueResult {
  const supplyLevel = getSupplyLevel(ctx.districtEconomy, supplyCategory);
  const blackMarketActive = isBlackMarketCondition(ctx.districtEconomy);

  const modifiers: ValueModifiers = {
    scarcityMultiplier: computeScarcityMultiplier(supplyLevel),
    factionAttitude: computeFactionAttitudeMultiplier(ctx.playerReputation),
    provenanceNotoriety: computeProvenanceMultiplier(ctx.itemProvenance, ctx.playerHeat),
    contrabandPenalty: computeContrabandFactor(ctx.isContraband, blackMarketActive, ctx.playerReputation),
    districtProsperity: computeDistrictProsperity(ctx.districtEconomy),
    pressureModifier: computePressureModifier(ctx.activePressureKinds, supplyCategory),
  };

  const rawMult =
    modifiers.scarcityMultiplier *
    modifiers.factionAttitude *
    modifiers.provenanceNotoriety *
    modifiers.contrabandPenalty *
    modifiers.districtProsperity *
    modifiers.pressureModifier;

  const finalValue = Math.round(baseValue * rawMult);
  const tradeAdvice = deriveTradeAdvice(modifiers, ctx.isContraband);
  const reason = buildReason(modifiers, ctx.isContraband);

  return { baseValue, finalValue, modifiers, tradeAdvice, reason };
}

// --- Trade Advice ---

/** Derive trade advice from modifiers */
export function deriveTradeAdvice(
  modifiers: ValueModifiers,
  isContraband: boolean,
): TradeAdvice {
  if (modifiers.contrabandPenalty === 0) return 'untradeable';
  if (isContraband && modifiers.contrabandPenalty < 0.8) return 'risky';
  if (modifiers.provenanceNotoriety > 1.3) return 'risky';

  const net = modifiers.scarcityMultiplier * modifiers.districtProsperity;
  if (net >= 1.5) return 'sell-here';
  if (net <= 0.7) return 'sell-elsewhere';
  return 'hold';
}

function buildReason(modifiers: ValueModifiers, isContraband: boolean): string {
  if (modifiers.contrabandPenalty === 0) return 'No market for this contraband here';
  const parts: string[] = [];
  if (modifiers.scarcityMultiplier >= 2.0) parts.push('high demand');
  else if (modifiers.scarcityMultiplier <= 0.7) parts.push('oversupplied');
  if (modifiers.factionAttitude >= 1.3) parts.push('hostile faction');
  else if (modifiers.factionAttitude <= 0.9) parts.push('friendly faction');
  if (modifiers.provenanceNotoriety >= 1.5) parts.push('notorious item');
  if (isContraband) parts.push('contraband');
  if (modifiers.pressureModifier >= 1.2) parts.push('pressure inflation');
  return parts.length > 0 ? parts.join(', ') : 'standard market rate';
}

// --- Formatting ---

/** Director-facing value breakdown */
export function formatValueBreakdownForDirector(result: ItemValueResult): string {
  const m = result.modifiers;
  const lines = [
    `  Value: ${result.baseValue} -> ${result.finalValue}`,
    `    Scarcity: x${m.scarcityMultiplier.toFixed(1)} | Faction: x${m.factionAttitude.toFixed(2)}`,
    `    Provenance: x${m.provenanceNotoriety.toFixed(1)} | Contraband: x${m.contrabandPenalty.toFixed(1)}`,
    `    Prosperity: x${m.districtProsperity.toFixed(2)} | Pressure: x${m.pressureModifier.toFixed(2)}`,
    `    Advice: ${result.tradeAdvice} — ${result.reason}`,
  ];
  return lines.join('\n');
}

/** Narrator-facing trade advice (~15 tokens) */
export function formatTradeAdviceForNarrator(result: ItemValueResult): string {
  switch (result.tradeAdvice) {
    case 'sell-here': return `worth ${result.finalValue} here (${result.reason})`;
    case 'sell-elsewhere': return `poor price here — better elsewhere`;
    case 'hold': return `fair price at ${result.finalValue}`;
    case 'risky': return `risky trade — ${result.reason}`;
    case 'untradeable': return result.reason;
  }
}
