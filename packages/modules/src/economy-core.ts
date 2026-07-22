// economy-core — category-level supply tracking per district
// v1.7: Districts develop meaningful supply conditions — medicine scarce,
// ammunition plentiful, contraband abundant. Category-level pressure,
// not individual item inventories.
//
// v2.8 (F-d0b5edb5): createDistrictEconomy/tickDistrictEconomy were pure
// functions with zero callers outside their own test file — no played
// session ever created world.modules['economy-core'], so director.ts's
// MARKET OVERVIEW ledger section and FACTIONS' economy-driven goal scoring,
// endgame.ts's merchant-prince arc/collapse triggers, and the 4 economy-
// driven pressure kinds (pressure-system.ts) all sat dormant behind a
// defensively-empty read. createEconomyCore below is the write-wire: a
// module (the district-core/quest-core idiom) that seeds one DistrictEconomy
// per district at pack-load and persists it at the EXACT shape those readers
// already expect: world.modules['economy-core'] = { districts }. Per-round
// ticking lives in world-tick.ts's tickWorld (this file only seeds and
// exposes read/write accessors) — same split as district-core (state +
// accessors here, the round-driver owns the cadence) except district-core
// also owns its own tick verb; economy-core's tick is driven entirely by
// world-tick.ts, so no verb is registered here.

import type { EngineModule, WorldState } from '@ai-rpg-engine/core';

// --- Types ---

/** Eight supply categories — genre-agnostic, category-level */
export type SupplyCategory =
  | 'medicine'
  | 'weapons'
  | 'ammunition'
  | 'food'
  | 'fuel'
  | 'luxuries'
  | 'components'
  | 'contraband';

/** Per-category supply level within a district. 0-100, baseline 50. */
export type SupplyLevel = {
  category: SupplyCategory;
  /** 0-100. <30 = scarce, >70 = surplus, 50 = normal */
  level: number;
  trend: 'rising' | 'falling' | 'stable';
  /** Most recent modifier source, e.g. "smuggling", "blockade" */
  cause?: string;
};

/** Complete district economy state */
export type DistrictEconomy = {
  supplies: Record<SupplyCategory, SupplyLevel>;
  /** Aggregate activity level, 0-100 */
  tradeVolume: number;
  /** True when contraband > 30 or any supply < 20 */
  blackMarketActive: boolean;
  lastUpdateTick: number;
};

/** Derived scarcity descriptor for narration */
export type ScarcitySeverity = 'tight' | 'scarce' | 'desperate';
export type SurplusDegree = 'plentiful' | 'flooded';

export type EconomyDescriptor = {
  scarcities: { category: SupplyCategory; severity: ScarcitySeverity }[];
  surpluses: { category: SupplyCategory; degree: SurplusDegree }[];
  overallTone: 'thriving' | 'normal' | 'strained' | 'crisis';
  /** ~10 tokens, e.g. "medicine scarce, weapons plentiful" */
  compactPhrase: string;
};

/** Event that shifts district supply */
export type EconomyShift = {
  districtId: string;
  category: SupplyCategory;
  delta: number;
  cause: string;
  sourceFactionId?: string;
};

// --- Constants ---

const ALL_CATEGORIES: SupplyCategory[] = [
  'medicine', 'weapons', 'ammunition', 'food',
  'fuel', 'luxuries', 'components', 'contraband',
];

const BASELINE = 50;
const DECAY_RATE = 1; // per tick, toward baseline
const STABILITY_DRIFT_THRESHOLD = 30; // below this, negative drift accelerates
const STABILITY_DRIFT_BONUS = 0.5; // extra decay rate per stability deficit

/** Genre-specific starting supply profiles */
const GENRE_SUPPLY_DEFAULTS: Record<string, Partial<Record<SupplyCategory, number>>> = {
  fantasy:     { medicine: 40, weapons: 50, food: 55, luxuries: 45, components: 35 },
  cyberpunk:   { components: 60, contraband: 55, medicine: 40, ammunition: 50, fuel: 45 },
  pirate:      { ammunition: 45, food: 35, luxuries: 60, medicine: 30, fuel: 40 },
  zombie:      { medicine: 25, ammunition: 30, food: 20, fuel: 30, weapons: 40 },
  detective:   { contraband: 55, luxuries: 50, weapons: 40, medicine: 45 },
  colony:      { components: 35, fuel: 30, food: 40, medicine: 35, ammunition: 45 },
  'weird-west': { ammunition: 45, medicine: 35, food: 40, luxuries: 35, fuel: 30 },
};

/** District tag modifiers applied at creation */
const TAG_SUPPLY_MODIFIERS: Record<string, Partial<Record<SupplyCategory, number>>> = {
  market:      { food: 15, luxuries: 10, components: 5 },
  industrial:  { components: 15, fuel: 10, weapons: 5 },
  residential: { food: 5, medicine: 5 },
  underground: { contraband: 20, weapons: 10, medicine: -10 },
  sacred:      { medicine: 10, contraband: -15 },
  port:        { luxuries: 15, contraband: 10, food: 10 },
  military:    { weapons: 15, ammunition: 15, medicine: 5 },
  slums:       { contraband: 10, medicine: -10, luxuries: -15 },
  wealthy:     { luxuries: 20, medicine: 10, food: 10 },
  rural:       { food: 20, medicine: -5, components: -10 },
};

// --- Initialization ---

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function makeSupplyLevel(category: SupplyCategory, level: number): SupplyLevel {
  return { category, level: clamp(level), trend: 'stable' };
}

/** Create a fresh district economy with genre and tag adjustments */
export function createDistrictEconomy(
  genre?: string,
  districtTags?: string[],
): DistrictEconomy {
  const genreDefaults = genre ? GENRE_SUPPLY_DEFAULTS[genre] ?? {} : {};
  const tagMods: Partial<Record<SupplyCategory, number>> = {};

  if (districtTags) {
    for (const tag of districtTags) {
      const mods = TAG_SUPPLY_MODIFIERS[tag];
      if (mods) {
        for (const [cat, delta] of Object.entries(mods)) {
          tagMods[cat as SupplyCategory] = (tagMods[cat as SupplyCategory] ?? 0) + delta;
        }
      }
    }
  }

  const supplies = {} as Record<SupplyCategory, SupplyLevel>;
  for (const cat of ALL_CATEGORIES) {
    const base = genreDefaults[cat] ?? BASELINE;
    const tagDelta = tagMods[cat] ?? 0;
    supplies[cat] = makeSupplyLevel(cat, base + tagDelta);
  }

  return {
    supplies,
    tradeVolume: 50,
    blackMarketActive: isBlackMarketCondition({ supplies } as DistrictEconomy),
    lastUpdateTick: 0,
  };
}

// --- Queries ---

/** Get supply level for a single category */
export function getSupplyLevel(economy: DistrictEconomy, category: SupplyCategory): number {
  return economy.supplies[category].level;
}

/** Find the most scarce supply (lowest level), or undefined if all >= 50 */
export function getScarcestSupply(economy: DistrictEconomy): SupplyCategory | undefined {
  let lowest: SupplyCategory | undefined;
  let lowestLevel = BASELINE;
  for (const cat of ALL_CATEGORIES) {
    if (economy.supplies[cat].level < lowestLevel) {
      lowestLevel = economy.supplies[cat].level;
      lowest = cat;
    }
  }
  return lowest;
}

/** Find the most surplus supply (highest level), or undefined if all <= 50 */
export function getMostSurplusSupply(economy: DistrictEconomy): SupplyCategory | undefined {
  let highest: SupplyCategory | undefined;
  let highestLevel = BASELINE;
  for (const cat of ALL_CATEGORIES) {
    if (economy.supplies[cat].level > highestLevel) {
      highestLevel = economy.supplies[cat].level;
      highest = cat;
    }
  }
  return highest;
}

/** Check if black market conditions are met */
export function isBlackMarketCondition(economy: DistrictEconomy): boolean {
  if (economy.supplies.contraband.level > 30) return true;
  for (const cat of ALL_CATEGORIES) {
    if (economy.supplies[cat].level < 20) return true;
  }
  return false;
}

// --- Derivation ---

/** Derive trend from current vs previous level */
export function deriveSupplyTrend(current: number, previous: number): SupplyLevel['trend'] {
  const delta = current - previous;
  if (delta > 1) return 'rising';
  if (delta < -1) return 'falling';
  return 'stable';
}

function deriveSeverity(level: number): ScarcitySeverity {
  if (level < 15) return 'desperate';
  if (level < 25) return 'scarce';
  return 'tight';
}

function deriveSurplusDegree(level: number): SurplusDegree {
  if (level > 85) return 'flooded';
  return 'plentiful';
}

function deriveOverallTone(
  scarcityCount: number,
  surplusCount: number,
  desperateCount: number,
): EconomyDescriptor['overallTone'] {
  if (desperateCount >= 2) return 'crisis';
  if (scarcityCount >= 3) return 'strained';
  if (surplusCount >= 3 && scarcityCount === 0) return 'thriving';
  return 'normal';
}

/** Derive a readable economy descriptor from raw state */
export function deriveEconomyDescriptor(economy: DistrictEconomy): EconomyDescriptor {
  const scarcities: EconomyDescriptor['scarcities'] = [];
  const surpluses: EconomyDescriptor['surpluses'] = [];

  for (const cat of ALL_CATEGORIES) {
    const level = economy.supplies[cat].level;
    if (level < 35) {
      scarcities.push({ category: cat, severity: deriveSeverity(level) });
    } else if (level > 70) {
      surpluses.push({ category: cat, degree: deriveSurplusDegree(level) });
    }
  }

  // Sort by severity (desperate first)
  const severityOrder: Record<ScarcitySeverity, number> = { desperate: 0, scarce: 1, tight: 2 };
  scarcities.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const desperateCount = scarcities.filter(s => s.severity === 'desperate').length;
  const overallTone = deriveOverallTone(scarcities.length, surpluses.length, desperateCount);

  // Build compact phrase
  const parts: string[] = [];
  for (const s of scarcities.slice(0, 2)) {
    parts.push(`${s.category} ${s.severity}`);
  }
  for (const s of surpluses.slice(0, 2)) {
    parts.push(`${s.category} ${s.degree}`);
  }
  const compactPhrase = parts.length > 0 ? parts.join(', ') : 'supplies normal';

  return { scarcities, surpluses, overallTone, compactPhrase };
}

// --- Tick Processing ---

/** Tick a district economy — baseline-seeking decay, stability modulation */
export function tickDistrictEconomy(
  economy: DistrictEconomy,
  commerce: number,
  stability: number,
  currentTick: number,
): DistrictEconomy {
  const newSupplies = {} as Record<SupplyCategory, SupplyLevel>;
  const stabilityDeficit = Math.max(0, STABILITY_DRIFT_THRESHOLD - stability);
  const negDriftBonus = stabilityDeficit * STABILITY_DRIFT_BONUS * 0.1;
  // High commerce buffers surplus (slows decay of high supply)
  const commerceBuffer = (commerce - BASELINE) * 0.02;

  for (const cat of ALL_CATEGORIES) {
    const prev = economy.supplies[cat];
    let level = prev.level;
    const distFromBaseline = level - BASELINE;

    if (Math.abs(distFromBaseline) > 1) {
      // Baseline-seeking decay
      let decay = DECAY_RATE;
      if (distFromBaseline < 0) {
        // Below baseline: accelerate recovery by stability, slow by low commerce
        decay += negDriftBonus;
      } else {
        // Above baseline: high commerce slows surplus decay
        decay = Math.max(0.2, decay - commerceBuffer);
      }
      level -= Math.sign(distFromBaseline) * Math.min(decay, Math.abs(distFromBaseline));
    }

    level = clamp(level);
    const trend = deriveSupplyTrend(level, prev.level);
    newSupplies[cat] = { category: cat, level, trend, cause: prev.cause };
  }

  // Trade volume tracks commerce
  const tradeVolume = clamp(commerce * 0.8 + economy.tradeVolume * 0.2);

  const newEconomy: DistrictEconomy = {
    supplies: newSupplies,
    tradeVolume,
    blackMarketActive: false,
    lastUpdateTick: currentTick,
  };
  newEconomy.blackMarketActive = isBlackMarketCondition(newEconomy);

  return newEconomy;
}

// --- Supply Modification ---

/** Apply a supply shift to a district economy */
export function applyEconomyShift(
  economy: DistrictEconomy,
  shift: EconomyShift,
): DistrictEconomy {
  const prev = economy.supplies[shift.category];
  const newLevel = clamp(prev.level + shift.delta);
  const trend = deriveSupplyTrend(newLevel, prev.level);

  const newSupplies = { ...economy.supplies };
  newSupplies[shift.category] = {
    category: shift.category,
    level: newLevel,
    trend,
    cause: shift.cause,
  };

  const newEconomy: DistrictEconomy = {
    ...economy,
    supplies: newSupplies,
  };
  newEconomy.blackMarketActive = isBlackMarketCondition(newEconomy);

  return newEconomy;
}

// --- Formatting ---

/** Director-facing detailed economy view for a single district */
export function formatEconomyForDirector(
  districtId: string,
  districtName: string,
  economy: DistrictEconomy,
  descriptor: EconomyDescriptor,
): string {
  const divider = '─'.repeat(60);
  const lines: string[] = [
    divider,
    `  ECONOMY: ${districtName} (${districtId})`,
    `  Tone: ${descriptor.overallTone} | Trade volume: ${Math.round(economy.tradeVolume)} | Black market: ${economy.blackMarketActive ? 'YES' : 'no'}`,
    divider,
  ];

  for (const cat of ALL_CATEGORIES) {
    const s = economy.supplies[cat];
    const bar = renderBar(s.level);
    const trendIcon = s.trend === 'rising' ? '+' : s.trend === 'falling' ? '-' : '=';
    const causeStr = s.cause ? ` (${s.cause})` : '';
    lines.push(`  ${padRight(cat, 12)} ${bar} ${padRight(String(Math.round(s.level)), 3)} [${trendIcon}]${causeStr}`);
  }

  if (descriptor.scarcities.length > 0) {
    lines.push('');
    lines.push(`  Scarce: ${descriptor.scarcities.map(s => `${s.category} (${s.severity})`).join(', ')}`);
  }
  if (descriptor.surpluses.length > 0) {
    lines.push(`  Surplus: ${descriptor.surpluses.map(s => `${s.category} (${s.degree})`).join(', ')}`);
  }

  lines.push(divider);
  return lines.join('\n');
}

/** Narrator-facing compact phrase (~10-15 tokens) */
export function formatEconomyForNarrator(descriptor: EconomyDescriptor): string {
  return descriptor.compactPhrase;
}

/** Director overview of all district economies */
export function formatAllDistrictEconomiesForDirector(
  economies: { districtId: string; districtName: string; economy: DistrictEconomy }[],
): string {
  const divider = '─'.repeat(60);
  const lines: string[] = [divider, '  MARKET OVERVIEW', divider];

  for (const { districtId, districtName, economy } of economies) {
    const desc = deriveEconomyDescriptor(economy);
    const bm = economy.blackMarketActive ? ' [BLACK MARKET]' : '';
    lines.push(`  ${districtName} (${districtId}): ${desc.overallTone}${bm}`);
    lines.push(`    ${desc.compactPhrase}`);
  }

  lines.push(divider);
  return lines.join('\n');
}

// --- Internal formatting helpers ---

function renderBar(value: number): string {
  const width = 20;
  const filled = Math.round((value / 100) * width);
  return '[' + '#'.repeat(filled) + '.'.repeat(width - filled) + ']';
}

function padRight(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - s.length));
}

// --- Module (v2.8: F-d0b5edb5 write-wire) ---

/** Config accepted by createEconomyCore — only id/tags are read (district-core's own DistrictDefinition satisfies this shape). */
export type EconomyCoreConfig = {
  /** Districts to seed a DistrictEconomy for. */
  districts: { id: string; tags: string[] }[];
  /** Genre-flavored starting supply profile (GENRE_SUPPLY_DEFAULTS). Omit for baseline+tag defaults only. */
  genre?: string;
};

/** The persisted shape: world.modules['economy-core'] — read defensively today by director.ts and endgame.ts. */
export type EconomyCoreState = {
  districts: Record<string, DistrictEconomy>;
};

const ECONOMY_MODULE_ID = 'economy-core';

/**
 * The economy-core module: seeds one DistrictEconomy per district at
 * pack-load (createDistrictEconomy(genre, tags), this file's own factory)
 * and persists it under world.modules['economy-core'] = { districts } — the
 * literal shape director.ts's readDistrictEconomies() and endgame.ts's
 * buildEndgameInputs() already read defensively (F-d0b5edb5). Per-round
 * ticking is world-tick.ts's job (tickWorld calls tickDistrictEconomy per
 * district via the accessors below); this factory only seeds the initial
 * state, the same division of labor createWorldTick already has with the
 * pressure lifecycle it drives.
 *
 * Always included in buildWorldStack (world-stack.ts) — same contract as
 * district-core: a pack with no districts still registers the namespace, it
 * just governs {} (no separate presence flag to check).
 */
export function createEconomyCore(config: EconomyCoreConfig): EngineModule {
  const districts: Record<string, DistrictEconomy> = {};
  for (const def of config.districts) {
    districts[def.id] = createDistrictEconomy(config.genre, def.tags);
  }
  const initialState: EconomyCoreState = { districts };

  return {
    id: ECONOMY_MODULE_ID,
    version: '1.0.0',

    register(ctx) {
      ctx.persistence.registerNamespace(ECONOMY_MODULE_ID, initialState);
    },
  };
}

/**
 * Non-attaching read of this world's economy-core namespace — degrades to
 * `{ districts: {} }` when absent or malformed (a world whose pack never
 * wired the module, or a hand-built WorldState in a test). Mirrors the
 * world-tick.ts accessor contract: pure read, safe on any world.
 */
export function getEconomyCoreState(world: WorldState): EconomyCoreState {
  const ns = world.modules[ECONOMY_MODULE_ID];
  if (ns && typeof ns === 'object' && !Array.isArray(ns)) {
    const districts = (ns as { districts?: unknown }).districts;
    if (districts && typeof districts === 'object' && !Array.isArray(districts)) {
      return { districts: districts as Record<string, DistrictEconomy> };
    }
  }
  return { districts: {} };
}

/** A single district's live economy, or undefined when unseeded/absent. */
export function getDistrictEconomy(world: WorldState, districtId: string): DistrictEconomy | undefined {
  return getEconomyCoreState(world).districts[districtId];
}

/**
 * Write a district's economy back (tick results, trade-driven shifts). No-op
 * when the namespace is absent — a pack that never wired economy-core has
 * nothing to write into, the same tolerant-writer posture the rest of this
 * module's readers take toward absence.
 */
export function setDistrictEconomy(world: WorldState, districtId: string, economy: DistrictEconomy): void {
  const ns = world.modules[ECONOMY_MODULE_ID];
  if (ns && typeof ns === 'object' && !Array.isArray(ns)) {
    (ns as EconomyCoreState).districts[districtId] = economy;
  }
}
