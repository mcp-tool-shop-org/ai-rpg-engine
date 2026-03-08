// arc-detection — derive narrative arc signals from accumulated world state
// v2.0: pure query functions, no state mutation, no storage
// Arcs are derived views — they reflect accumulated state, not managed objects.

import type { LeverageState, LeverageCurrency } from './player-leverage.js';
import type { CompanionState } from './companion-core.js';
import type { DistrictEconomy } from './economy-core.js';
import type { NpcProfile, NpcObligationLedger, LoyaltyBreakpoint } from './npc-agency.js';
import type { WorldPressure } from './pressure-system.js';
import type { PressureFallout } from './pressure-resolution.js';
import type { OpportunityState } from './opportunity-core.js';
import type { OpportunityFallout } from './opportunity-resolution.js';

// --- Types ---

export type ArcKind =
  | 'rising-power'
  | 'hunted'
  | 'kingmaker'
  | 'resistance'
  | 'merchant-prince'
  | 'shadow-broker'
  | 'last-stand'
  | 'community-builder'
  | 'descent'
  | 'reckoning';

export type ArcMomentum = 'building' | 'steady' | 'waning';

export type ArcSignal = {
  kind: ArcKind;
  /** 0-1 strength of the arc signal */
  strength: number;
  /** Direction of change compared to previous tick */
  momentum: ArcMomentum;
  /** Human-readable strings explaining why this arc is active */
  primaryDrivers: string[];
  /** How many ticks this arc has been continuously detected (strength > 0.1) */
  turnsActive: number;
};

export type ArcSnapshot = {
  signals: ArcSignal[];
  /** Strongest signal if strength > 0.5 */
  dominantArc: ArcKind | null;
  tick: number;
};

export type ReputationEntry = { factionId: string; value: number };
export type FactionStateEntry = { factionId: string; alertLevel: number; cohesion: number };

export type ArcInputs = {
  factionStates: FactionStateEntry[];
  playerReputations: ReputationEntry[];
  playerLeverage: LeverageState;
  activePressures: WorldPressure[];
  npcProfiles: NpcProfile[];
  npcObligations: Map<string, NpcObligationLedger>;
  companions: CompanionState[];
  districtEconomies: Map<string, DistrictEconomy>;
  activeOpportunities: OpportunityState[];
  resolvedPressures: PressureFallout[];
  resolvedOpportunities: OpportunityFallout[];
  playerHp?: number;
  playerMaxHp?: number;
  playerLevel: number;
  totalTurns: number;
  currentTick: number;
};

// --- Constants ---

const STRENGTH_THRESHOLD = 0.1;
const DOMINANT_THRESHOLD = 0.5;
const MOMENTUM_DELTA = 0.05;

// --- Scoring Functions ---

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function avgRep(reps: ReputationEntry[]): number {
  if (reps.length === 0) return 0;
  return reps.reduce((sum, r) => sum + r.value, 0) / reps.length;
}

function alliedFactionCount(reps: ReputationEntry[]): number {
  return reps.filter((r) => r.value > 30).length;
}

function hostileFactionCount(reps: ReputationEntry[]): number {
  return reps.filter((r) => r.value < -20).length;
}

function alliedNpcCount(profiles: NpcProfile[]): number {
  return profiles.filter((p) => p.breakpoint === 'allied' || p.breakpoint === 'favorable').length;
}

function avgDistrictStability(economies: Map<string, DistrictEconomy>): number {
  if (economies.size === 0) return 50;
  let total = 0;
  for (const econ of economies.values()) {
    // Approximate stability from supply levels
    const supplies = Object.values(econ.supplies);
    total += supplies.reduce((s, v) => s + v.level, 0) / supplies.length;
  }
  return total / economies.size;
}

function totalObligationsOwedToPlayer(obligations: Map<string, NpcObligationLedger>): number {
  let count = 0;
  for (const ledger of obligations.values()) {
    count += ledger.obligations.filter((o) => o.direction === 'npc-owes-player').length;
  }
  return count;
}

function totalObligationsPlayerOwes(obligations: Map<string, NpcObligationLedger>): number {
  let count = 0;
  for (const ledger of obligations.values()) {
    count += ledger.obligations.filter((o) => o.direction === 'player-owes-npc').length;
  }
  return count;
}

function totalObligationMagnitude(obligations: Map<string, NpcObligationLedger>): number {
  let total = 0;
  for (const ledger of obligations.values()) {
    total += ledger.obligations.reduce((s, o) => s + o.magnitude, 0);
  }
  return total;
}

function hasPressureKind(pressures: WorldPressure[], kind: string): boolean {
  return pressures.some((p) => p.kind === kind);
}

function completedOpportunityCount(resolved: OpportunityFallout[], kind?: string): number {
  return resolved.filter((r) =>
    r.resolution.resolutionType === 'completed' &&
    (!kind || r.resolution.opportunityKind === kind),
  ).length;
}

// --- Individual Arc Scorers ---

function scoreRisingPower(inputs: ArcInputs): { strength: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  const allied = alliedFactionCount(inputs.playerReputations);
  if (allied >= 2) { score += 0.3; drivers.push(`${allied} allied factions`); }
  else if (allied >= 1) { score += 0.15; drivers.push(`${allied} allied faction`); }

  const { influence, heat } = inputs.playerLeverage;
  if (influence > 40) { score += 0.25; drivers.push(`influence: ${influence}`); }
  if (heat < 30) { score += 0.15; drivers.push(`heat controlled: ${heat}`); }

  const completed = completedOpportunityCount(inputs.resolvedOpportunities);
  if (completed >= 3) { score += 0.15; drivers.push(`${completed} contracts completed`); }

  if (inputs.playerLevel >= 5) { score += 0.15; drivers.push(`level ${inputs.playerLevel}`); }

  return { strength: clamp01(score), drivers };
}

function scoreHunted(inputs: ArcInputs): { strength: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  const hostile = hostileFactionCount(inputs.playerReputations);
  const total = inputs.playerReputations.length;
  if (total > 0 && hostile === total) { score += 0.35; drivers.push('all factions hostile'); }
  else if (hostile >= 2) { score += 0.2; drivers.push(`${hostile} hostile factions`); }

  const { heat } = inputs.playerLeverage;
  if (heat > 60) { score += 0.25; drivers.push(`heat: ${heat}`); }

  if (hasPressureKind(inputs.activePressures, 'bounty-issued')) {
    score += 0.2; drivers.push('active bounty');
  }
  if (hasPressureKind(inputs.activePressures, 'corp-manhunt') ||
      hasPressureKind(inputs.activePressures, 'navy-bounty')) {
    score += 0.1; drivers.push('manhunt active');
  }

  if (inputs.companions.length === 0) { score += 0.1; drivers.push('no companions'); }

  return { strength: clamp01(score), drivers };
}

function scoreKingmaker(inputs: ArcInputs): { strength: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  const { influence, legitimacy } = inputs.playerLeverage;
  if (influence > 50) { score += 0.3; drivers.push(`influence: ${influence}`); }
  if (legitimacy > 30) { score += 0.15; drivers.push(`legitimacy: ${legitimacy}`); }

  // High rep variance = factions competing for player
  const reps = inputs.playerReputations.map((r) => r.value);
  if (reps.length >= 2) {
    const max = Math.max(...reps);
    const min = Math.min(...reps);
    const variance = max - min;
    if (variance > 50) { score += 0.25; drivers.push('factions polarized on player'); }
    else if (variance > 30) { score += 0.15; drivers.push('faction opinions divergent'); }
  }

  const allied = alliedFactionCount(inputs.playerReputations);
  if (allied >= 1 && allied < inputs.playerReputations.length) {
    score += 0.15; drivers.push('selective alliances');
  }

  if (totalObligationsOwedToPlayer(inputs.npcObligations) >= 3) {
    score += 0.15; drivers.push('NPCs in debt to player');
  }

  return { strength: clamp01(score), drivers };
}

function scoreResistance(inputs: ArcInputs): { strength: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  // Find dominant faction (highest alert or most NPCs)
  const dominantFaction = inputs.factionStates.length > 0
    ? inputs.factionStates.reduce((a, b) => a.alertLevel > b.alertLevel ? a : b)
    : null;

  if (dominantFaction) {
    const playerRep = inputs.playerReputations.find((r) => r.factionId === dominantFaction.factionId);
    if (playerRep && playerRep.value < -20) {
      score += 0.3; drivers.push(`opposing ${dominantFaction.factionId}`);
    }

    // Allied with a minority faction
    const otherAllied = inputs.playerReputations.filter(
      (r) => r.factionId !== dominantFaction.factionId && r.value > 20,
    );
    if (otherAllied.length > 0) {
      score += 0.25; drivers.push(`allied with ${otherAllied[0].factionId}`);
    }

    // Active pressures from dominant faction
    const dominantPressures = inputs.activePressures.filter(
      (p) => p.sourceFactionId === dominantFaction.factionId,
    );
    if (dominantPressures.length > 0) {
      score += 0.2; drivers.push(`${dominantPressures.length} pressures from dominant faction`);
    }
  }

  if (inputs.companions.length >= 2) {
    score += 0.15; drivers.push('companions at side');
  }

  return { strength: clamp01(score), drivers };
}

function scoreMerchantPrince(inputs: ArcInputs): { strength: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  const { legitimacy } = inputs.playerLeverage;
  if (legitimacy > 50) { score += 0.3; drivers.push(`legitimacy: ${legitimacy}`); }
  else if (legitimacy > 30) { score += 0.15; }

  const avgSupply = avgDistrictStability(inputs.districtEconomies);
  if (avgSupply > 60) { score += 0.25; drivers.push(`avg supply: ${Math.round(avgSupply)}`); }

  const supplyRuns = completedOpportunityCount(inputs.resolvedOpportunities, 'supply-run');
  if (supplyRuns >= 2) { score += 0.2; drivers.push(`${supplyRuns} supply runs completed`); }

  const { heat } = inputs.playerLeverage;
  if (heat < 20) { score += 0.15; drivers.push('clean reputation'); }

  if (inputs.playerLeverage.favor > 20) { score += 0.1; drivers.push('favors accumulated'); }

  return { strength: clamp01(score), drivers };
}

function scoreShadowBroker(inputs: ArcInputs): { strength: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  const { blackmail, debt, influence } = inputs.playerLeverage;
  if (blackmail > 30) { score += 0.25; drivers.push(`blackmail: ${blackmail}`); }
  if (debt > 20) { score += 0.15; drivers.push(`debt leverage: ${debt}`); }
  if (influence > 30) { score += 0.1; drivers.push(`influence: ${influence}`); }

  const owedToPlayer = totalObligationsOwedToPlayer(inputs.npcObligations);
  const playerOwes = totalObligationsPlayerOwes(inputs.npcObligations);
  if (owedToPlayer >= 3 && playerOwes <= 1) {
    score += 0.25; drivers.push(`${owedToPlayer} NPCs owe player`);
  } else if (owedToPlayer >= 2) {
    score += 0.15; drivers.push(`${owedToPlayer} NPCs owe player`);
  }

  // Mixed reputation — not clearly allied with anyone
  const allied = alliedFactionCount(inputs.playerReputations);
  const hostile = hostileFactionCount(inputs.playerReputations);
  if (allied <= 1 && hostile <= 1 && inputs.playerReputations.length >= 2) {
    score += 0.15; drivers.push('ambiguous loyalties');
  }

  return { strength: clamp01(score), drivers };
}

function scoreLastStand(inputs: ArcInputs): { strength: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  if (inputs.playerHp != null && inputs.playerMaxHp != null && inputs.playerMaxHp > 0) {
    const hpPct = inputs.playerHp / inputs.playerMaxHp;
    if (hpPct < 0.3) { score += 0.3; drivers.push(`hp: ${Math.round(hpPct * 100)}%`); }
  }

  if (inputs.activePressures.length >= 3) {
    score += 0.25; drivers.push(`${inputs.activePressures.length} active pressures`);
  }

  if (inputs.companions.length < 2) {
    score += 0.15; drivers.push(`${inputs.companions.length} companions remaining`);
  }

  const { heat } = inputs.playerLeverage;
  if (heat > 50) { score += 0.15; drivers.push(`heat: ${heat}`); }

  const hostile = hostileFactionCount(inputs.playerReputations);
  if (hostile >= 2) { score += 0.15; drivers.push(`${hostile} hostile factions`); }

  return { strength: clamp01(score), drivers };
}

function scoreCommunityBuilder(inputs: ArcInputs): { strength: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  const activeCompanions = inputs.companions.filter((c) => c.active);
  if (activeCompanions.length >= 2) {
    const allHigh = activeCompanions.every((c) => c.morale > 60);
    if (allHigh) { score += 0.3; drivers.push('all companions high morale'); }
    else { score += 0.15; drivers.push(`${activeCompanions.length} active companions`); }
  }

  const { legitimacy } = inputs.playerLeverage;
  if (legitimacy > 40) { score += 0.2; drivers.push(`legitimacy: ${legitimacy}`); }

  const alliedNpcs = alliedNpcCount(inputs.npcProfiles);
  if (alliedNpcs >= 2) { score += 0.2; drivers.push(`${alliedNpcs} allied NPCs`); }

  const avgStab = avgDistrictStability(inputs.districtEconomies);
  if (avgStab > 50) { score += 0.15; drivers.push('districts stable'); }

  const { heat } = inputs.playerLeverage;
  if (heat < 20) { score += 0.15; drivers.push('low heat'); }

  return { strength: clamp01(score), drivers };
}

function scoreDescent(inputs: ArcInputs): { strength: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  // Declining reputation
  const avg = avgRep(inputs.playerReputations);
  if (avg < -10) { score += 0.25; drivers.push(`avg reputation: ${Math.round(avg)}`); }

  const { heat, legitimacy } = inputs.playerLeverage;
  if (heat > 40) { score += 0.2; drivers.push(`heat rising: ${heat}`); }
  if (legitimacy < 15) { score += 0.15; drivers.push(`legitimacy: ${legitimacy}`); }

  // Losing companions
  if (inputs.companions.length === 0) {
    score += 0.2; drivers.push('all companions gone');
  } else {
    const lowMorale = inputs.companions.filter((c) => c.morale < 30);
    if (lowMorale.length > 0) { score += 0.1; drivers.push(`${lowMorale.length} companions low morale`); }
  }

  if (inputs.activePressures.length >= 2) {
    score += 0.1; drivers.push(`${inputs.activePressures.length} active pressures`);
  }

  return { strength: clamp01(score), drivers };
}

function scoreReckoning(inputs: ArcInputs): { strength: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  const totalOblMag = totalObligationMagnitude(inputs.npcObligations);
  if (totalOblMag >= 20) { score += 0.25; drivers.push(`obligation pressure: ${totalOblMag}`); }
  else if (totalOblMag >= 10) { score += 0.15; drivers.push(`obligations mounting: ${totalOblMag}`); }

  const totalObls = totalObligationsPlayerOwes(inputs.npcObligations) +
                    totalObligationsOwedToPlayer(inputs.npcObligations);
  if (totalObls >= 5) { score += 0.2; drivers.push(`${totalObls} active obligations`); }

  if (inputs.activePressures.length >= 3) {
    score += 0.25; drivers.push(`${inputs.activePressures.length} converging pressures`);
  }

  // High-urgency pressures
  const urgentPressures = inputs.activePressures.filter((p) => p.urgency >= 0.7);
  if (urgentPressures.length >= 2) {
    score += 0.15; drivers.push(`${urgentPressures.length} urgent pressures`);
  }

  // Many hostile NPCs at breakpoints
  const hostileNpcs = inputs.npcProfiles.filter((p) => p.breakpoint === 'hostile' || p.breakpoint === 'compromised');
  if (hostileNpcs.length >= 3) {
    score += 0.15; drivers.push(`${hostileNpcs.length} hostile NPCs`);
  }

  return { strength: clamp01(score), drivers };
}

// --- Scorer Registry ---

const ARC_SCORERS: Record<ArcKind, (inputs: ArcInputs) => { strength: number; drivers: string[] }> = {
  'rising-power': scoreRisingPower,
  'hunted': scoreHunted,
  'kingmaker': scoreKingmaker,
  'resistance': scoreResistance,
  'merchant-prince': scoreMerchantPrince,
  'shadow-broker': scoreShadowBroker,
  'last-stand': scoreLastStand,
  'community-builder': scoreCommunityBuilder,
  'descent': scoreDescent,
  'reckoning': scoreReckoning,
};

const ALL_ARC_KINDS: ArcKind[] = Object.keys(ARC_SCORERS) as ArcKind[];

// --- Public Functions ---

/**
 * Score all 10 arc kinds against current state.
 * Returns only signals with strength > STRENGTH_THRESHOLD.
 */
export function evaluateArcs(inputs: ArcInputs): ArcSignal[] {
  const signals: ArcSignal[] = [];

  for (const kind of ALL_ARC_KINDS) {
    const { strength, drivers } = ARC_SCORERS[kind](inputs);
    if (strength > STRENGTH_THRESHOLD) {
      signals.push({
        kind,
        strength,
        momentum: 'steady', // Momentum is set by buildArcSnapshot with previous data
        primaryDrivers: drivers,
        turnsActive: 1,
      });
    }
  }

  // Sort by strength descending
  signals.sort((a, b) => b.strength - a.strength);
  return signals;
}

/**
 * Build a full arc snapshot with momentum tracking.
 * If previous snapshot is provided, derives momentum and turnsActive continuity.
 */
export function buildArcSnapshot(
  inputs: ArcInputs,
  previous?: ArcSnapshot,
): ArcSnapshot {
  const signals = evaluateArcs(inputs);

  // Derive momentum and continuity from previous snapshot
  if (previous) {
    for (const signal of signals) {
      const prev = previous.signals.find((s) => s.kind === signal.kind);
      if (prev) {
        const delta = signal.strength - prev.strength;
        signal.momentum = delta > MOMENTUM_DELTA ? 'building'
          : delta < -MOMENTUM_DELTA ? 'waning'
          : 'steady';
        signal.turnsActive = prev.turnsActive + 1;
      }
      // No previous → momentum stays 'steady', turnsActive stays 1
    }
  }

  // Pick dominant arc
  const dominant = signals.length > 0 && signals[0].strength >= DOMINANT_THRESHOLD
    ? signals[0].kind
    : null;

  return {
    signals,
    dominantArc: dominant,
    tick: inputs.currentTick,
  };
}

/**
 * Format arc snapshot for director mode display.
 */
export function formatArcForDirector(snapshot: ArcSnapshot): string {
  if (snapshot.signals.length === 0) {
    return '  No narrative arcs detected yet.';
  }

  const lines: string[] = [];
  if (snapshot.dominantArc) {
    lines.push(`  Dominant Arc: ${snapshot.dominantArc}`);
  }
  lines.push('');

  for (const signal of snapshot.signals) {
    const bar = '█'.repeat(Math.round(signal.strength * 10)).padEnd(10, '░');
    const arrow = signal.momentum === 'building' ? '▲'
      : signal.momentum === 'waning' ? '▼'
      : '─';
    lines.push(`  ${signal.kind.padEnd(20)} ${bar} ${(signal.strength * 100).toFixed(0).padStart(3)}% ${arrow}  (${signal.turnsActive} turns)`);
    if (signal.primaryDrivers.length > 0) {
      lines.push(`    ${signal.primaryDrivers.join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format compact arc context for narrator (~15 tokens).
 */
export function formatArcForNarrator(snapshot: ArcSnapshot): string {
  if (!snapshot.dominantArc) return '';

  const dominant = snapshot.signals.find((s) => s.kind === snapshot.dominantArc);
  if (!dominant) return '';

  const label = snapshot.dominantArc.replace(/-/g, ' ');
  const momentum = dominant.momentum === 'building' ? 'intensifying'
    : dominant.momentum === 'waning' ? 'fading'
    : 'steady';

  return `Campaign arc: ${label} (${momentum}, ${dominant.turnsActive} turns)`;
}
