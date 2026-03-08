// endgame-detection — detect campaign turning points from accumulated state
// v2.0: one-shot threshold detection, no LLM calls, deterministic
// Returns at most one trigger per evaluation. Triggers are persisted.

// --- Starter Pack Campaign Pacing Audit (v2.1) ---
//
// Pack                | Zones | Districts | Factions | NPCs | Reachable Arcs                                    | Plausible Endgames
// --------------------|-------|-----------|----------|------|---------------------------------------------------|--------------------------------------------
// Chapel Threshold    |   5   |     2     |    1     |  3   | last-stand, descent, reckoning                    | tragic-stab, martyrdom, quiet-retire
// Neon Lockbox        |   3   |     2     |    1     |  2   | last-stand, descent, reckoning                    | tragic-stab, exile, martyrdom
// Gaslight Detective  |   5   |     2     |    1     |  3   | descent, reckoning, last-stand                    | tragic-stab, exile, quiet-retire
// Black Flag Requiem  |   5   |     2     |    1     |  3   | last-stand, descent, reckoning                    | tragic-stab, exile, martyrdom, overthrow(border)
// Ashfall Dead        |   5   |     2     |    1     |  3   | community-builder, last-stand, descent, reckoning | tragic-stab, martyrdom, quiet-retire(border)
// Dust Devil's Bargain|   5   |     2     |    2     |  2   | resistance, last-stand, descent, community-builder| tragic-stab, exile, overthrow, martyrdom
// Signal Loss         |   5   |     2     |    1     |  2   | community-builder, last-stand, descent, reckoning | tragic-stab, exile, collapse(border)
//
// Key findings:
// - 6/7 packs have only 1 faction → rising-power, hunted, kingmaker, victory unreachable
// - Only Dust Devil's Bargain (2 factions) supports political arcs
// - All packs have exactly 2 districts → collapse needs both unstable (tight)
// - puppet-master unreachable in all packs (no blackmail content hooks)
// - last-stand, descent, reckoning are universally reachable (combat-driven)
// - Each pack has only 1 dialogue tree → obligation pressure is thin

import type {
  ArcKind,
  ArcSnapshot,
  ArcInputs,
  FactionStateEntry,
} from './arc-detection.js';
import type { NpcProfile } from './npc-agency.js';

// --- Types ---

export type ResolutionClass =
  | 'victory'
  | 'tragic-stabilization'
  | 'exile'
  | 'overthrow'
  | 'martyrdom'
  | 'quiet-retirement'
  | 'puppet-master'
  | 'collapse';

export type EndgameTrigger = {
  id: string;
  resolutionClass: ResolutionClass;
  detectedAtTick: number;
  /** Deterministic reason string for director mode */
  reason: string;
  /** Key state values that caused the trigger */
  evidence: Record<string, number | string | boolean>;
  /** The dominant arc at time of trigger */
  dominantArc: ArcKind | null;
  /** Whether the player has acknowledged/acted on this */
  acknowledged: boolean;
};

export type EndgameInputs = ArcInputs & {
  arcSnapshot: ArcSnapshot;
  playerHp: number;
  playerMaxHp: number;
  previousTriggers: EndgameTrigger[];
};

// --- Constants ---

let endgameCounter = 0;

/** Reset counter (for tests). */
export function resetEndgameCounter(): void {
  endgameCounter = 0;
}

// --- Threshold Checkers ---

function checkVictory(inputs: EndgameInputs): EndgameTrigger | null {
  const { playerReputations, playerLeverage, activePressures, factionStates } = inputs;
  if (playerReputations.length === 0) return null;

  // Need at least one dominant allied faction
  const alliedFactions = playerReputations.filter((r) => r.value > 60);
  if (alliedFactions.length === 0) return null;

  const { influence, heat } = playerLeverage;
  if (influence < 50) return null;
  if (heat > 20) return null;
  if (activePressures.length > 2) return null;

  // Need district control (approximated by allied faction count ≥ 3 or majority)
  const majorityAllied = alliedFactions.length >= Math.ceil(playerReputations.length / 2);
  if (!majorityAllied && alliedFactions.length < 3) return null;

  return {
    id: `endgame_${++endgameCounter}`,
    resolutionClass: 'victory',
    detectedAtTick: inputs.currentTick,
    reason: 'Dominant position established — allied factions, high influence, pressures resolved.',
    evidence: {
      alliedFactions: alliedFactions.length,
      influence,
      heat,
      activePressures: activePressures.length,
    },
    dominantArc: inputs.arcSnapshot.dominantArc,
    acknowledged: false,
  };
}

function checkTragicStabilization(inputs: EndgameInputs): EndgameTrigger | null {
  const { activePressures, totalTurns, playerReputations, playerHp, playerMaxHp, playerLeverage } = inputs;

  if (totalTurns < 45) return null;
  if (activePressures.length > 1) return null;

  // Average rep near 0 (nobody cares about you)
  const avgRep = playerReputations.length > 0
    ? playerReputations.reduce((s, r) => s + r.value, 0) / playerReputations.length
    : 0;
  if (Math.abs(avgRep) > 15) return null;

  // Diminished state
  const hpPct = playerMaxHp > 0 ? playerHp / playerMaxHp : 1;
  if (hpPct > 0.5) return null;

  if (playerLeverage.legitimacy > 20) return null;

  return {
    id: `endgame_${++endgameCounter}`,
    resolutionClass: 'tragic-stabilization',
    detectedAtTick: inputs.currentTick,
    reason: 'The world has stabilized, but at great cost. Nobody remembers your name.',
    evidence: {
      totalTurns,
      avgReputation: Math.round(avgRep),
      hpPercent: Math.round(hpPct * 100),
      legitimacy: playerLeverage.legitimacy,
    },
    dominantArc: inputs.arcSnapshot.dominantArc,
    acknowledged: false,
  };
}

function checkExile(inputs: EndgameInputs): EndgameTrigger | null {
  const { playerReputations, playerLeverage, companions, npcProfiles } = inputs;
  if (playerReputations.length === 0) return null;

  // All factions hostile
  const allHostile = playerReputations.every((r) => r.value < -30);
  if (!allHostile) return null;

  if (playerLeverage.heat < 80) return null;

  // No companions
  if (companions.filter((c) => c.active).length > 0) return null;

  // No allied NPCs
  const alliedNpcs = npcProfiles.filter((p) => p.breakpoint === 'allied' || p.breakpoint === 'favorable');
  if (alliedNpcs.length > 0) return null;

  return {
    id: `endgame_${++endgameCounter}`,
    resolutionClass: 'exile',
    detectedAtTick: inputs.currentTick,
    reason: 'No allies remain. Every faction wants you gone. There is nowhere left to turn.',
    evidence: {
      allFactionsHostile: true,
      heat: playerLeverage.heat,
      companions: 0,
      alliedNpcs: 0,
    },
    dominantArc: inputs.arcSnapshot.dominantArc,
    acknowledged: false,
  };
}

function checkOverthrow(inputs: EndgameInputs): EndgameTrigger | null {
  const { playerReputations, factionStates } = inputs;
  if (factionStates.length < 2) return null;

  // Find dominant faction by alert level (the one being attacked)
  const dominant = factionStates.reduce((a, b) => a.alertLevel > b.alertLevel ? a : b);
  const dominantRep = playerReputations.find((r) => r.factionId === dominant.factionId);

  // Player is the one overthrowing: hostile to dominant, dominant is crumbling
  if (!dominantRep || dominantRep.value > -50) return null;
  if (dominant.alertLevel < 90) return null;
  if (dominant.cohesion > 20) return null;

  // Player has an alternative ally
  const rival = playerReputations.find(
    (r) => r.factionId !== dominant.factionId && r.value > 20,
  );
  if (!rival) return null;

  return {
    id: `endgame_${++endgameCounter}`,
    resolutionClass: 'overthrow',
    detectedAtTick: inputs.currentTick,
    reason: `The dominant power crumbles. ${dominant.factionId} collapses under the weight of your opposition.`,
    evidence: {
      dominantFaction: dominant.factionId,
      dominantRep: dominantRep.value,
      dominantAlert: dominant.alertLevel,
      dominantCohesion: dominant.cohesion,
      allyFaction: rival.factionId,
    },
    dominantArc: inputs.arcSnapshot.dominantArc,
    acknowledged: false,
  };
}

function checkMartyrdom(inputs: EndgameInputs): EndgameTrigger | null {
  const { playerHp, playerReputations, companions } = inputs;

  // Player must be dead
  if (playerHp > 0) return null;

  // Must have had positive reputation
  const avgRep = playerReputations.length > 0
    ? playerReputations.reduce((s, r) => s + r.value, 0) / playerReputations.length
    : 0;
  if (avgRep < 20) return null;

  // Companions were loyal
  const avgMorale = companions.length > 0
    ? companions.reduce((s, c) => s + c.morale, 0) / companions.length
    : 0;
  if (companions.length > 0 && avgMorale < 50) return null;

  return {
    id: `endgame_${++endgameCounter}`,
    resolutionClass: 'martyrdom',
    detectedAtTick: inputs.currentTick,
    reason: 'Fallen in service of a cause. The world mourns — or celebrates — what you represented.',
    evidence: {
      playerHp: 0,
      avgReputation: Math.round(avgRep),
      companionCount: companions.length,
      avgMorale: Math.round(avgMorale),
    },
    dominantArc: inputs.arcSnapshot.dominantArc,
    acknowledged: false,
  };
}

function checkQuietRetirement(inputs: EndgameInputs): EndgameTrigger | null {
  const { activePressures, playerLeverage, companions, totalTurns } = inputs;

  if (totalTurns < 40) return null;
  if (activePressures.length > 1) return null;
  if (playerLeverage.heat > 10) return null;
  if (playerLeverage.legitimacy < 40) return null;

  // All companions content
  const activeCompanions = companions.filter((c) => c.active);
  if (activeCompanions.length > 0) {
    const allContent = activeCompanions.every((c) => c.morale > 60);
    if (!allContent) return null;
  }

  return {
    id: `endgame_${++endgameCounter}`,
    resolutionClass: 'quiet-retirement',
    detectedAtTick: inputs.currentTick,
    reason: 'The threats have passed. Your name carries weight. The world is at peace — or close enough.',
    evidence: {
      totalTurns,
      activePressures: 0,
      heat: playerLeverage.heat,
      legitimacy: playerLeverage.legitimacy,
      companionMoraleOk: true,
    },
    dominantArc: inputs.arcSnapshot.dominantArc,
    acknowledged: false,
  };
}

function checkPuppetMaster(inputs: EndgameInputs): EndgameTrigger | null {
  const { playerLeverage, playerReputations, npcObligations } = inputs;

  if (playerLeverage.blackmail < 30) return null;
  if (playerLeverage.influence < 40) return null;
  if (playerLeverage.heat > 30) return null;

  // Reputation is mixed — not clearly allied (no strong allies)
  const strongAllies = playerReputations.filter((r) => r.value > 40);
  const strongEnemies = playerReputations.filter((r) => r.value < -40);
  if (strongAllies.length > 1 || strongEnemies.length > 1) return null;

  // Many NPCs owe player
  let owedCount = 0;
  for (const ledger of npcObligations.values()) {
    owedCount += ledger.obligations.filter((o) => o.direction === 'npc-owes-player').length;
  }
  if (owedCount < 3) return null;

  return {
    id: `endgame_${++endgameCounter}`,
    resolutionClass: 'puppet-master',
    detectedAtTick: inputs.currentTick,
    reason: 'Nobody knows who pulls the strings. But everyone dances.',
    evidence: {
      blackmail: playerLeverage.blackmail,
      influence: playerLeverage.influence,
      heat: playerLeverage.heat,
      npcsOwed: owedCount,
    },
    dominantArc: inputs.arcSnapshot.dominantArc,
    acknowledged: false,
  };
}

function checkCollapse(inputs: EndgameInputs): EndgameTrigger | null {
  const { districtEconomies, factionStates, activePressures } = inputs;

  if (activePressures.length < 5) return null;

  // Check district stability (approximate from supply levels)
  let unstableDistricts = 0;
  for (const econ of districtEconomies.values()) {
    const supplies = Object.values(econ.supplies);
    const avgLevel = supplies.reduce((s, v) => s + v.level, 0) / supplies.length;
    if (avgLevel < 15) unstableDistricts++;
  }
  if (unstableDistricts < 2) return null;

  // Average faction cohesion low
  if (factionStates.length > 0) {
    const avgCohesion = factionStates.reduce((s, f) => s + f.cohesion, 0) / factionStates.length;
    if (avgCohesion > 30) return null;
  }

  return {
    id: `endgame_${++endgameCounter}`,
    resolutionClass: 'collapse',
    detectedAtTick: inputs.currentTick,
    reason: 'The world fractures. Districts fall. Factions splinter. There is nothing left to hold together.',
    evidence: {
      unstableDistricts,
      activePressures: activePressures.length,
      avgFactionCohesion: factionStates.length > 0
        ? Math.round(factionStates.reduce((s, f) => s + f.cohesion, 0) / factionStates.length)
        : 0,
    },
    dominantArc: inputs.arcSnapshot.dominantArc,
    acknowledged: false,
  };
}

// --- Checker Registry ---

const RESOLUTION_CHECKERS: { class: ResolutionClass; check: (inputs: EndgameInputs) => EndgameTrigger | null }[] = [
  { class: 'martyrdom', check: checkMartyrdom },        // Check death first (most specific)
  { class: 'collapse', check: checkCollapse },           // Total failure
  { class: 'exile', check: checkExile },                 // Social failure
  { class: 'overthrow', check: checkOverthrow },         // Destructive victory
  { class: 'victory', check: checkVictory },             // Constructive victory
  { class: 'puppet-master', check: checkPuppetMaster },  // Shadow victory
  { class: 'quiet-retirement', check: checkQuietRetirement }, // Peaceful ending
  { class: 'tragic-stabilization', check: checkTragicStabilization }, // Ambiguous ending (last, needs long game)
];

// --- Public Functions ---

/**
 * Evaluate all 8 resolution thresholds. Returns the first that passes,
 * skipping any resolution class already in previousTriggers.
 * Returns null on most ticks.
 */
export function evaluateEndgame(inputs: EndgameInputs): EndgameTrigger | null {
  const triggeredClasses = new Set(inputs.previousTriggers.map((t) => t.resolutionClass));

  for (const { class: cls, check } of RESOLUTION_CHECKERS) {
    if (triggeredClasses.has(cls)) continue;
    const trigger = check(inputs);
    if (trigger) return trigger;
  }

  return null;
}

/**
 * Format endgame trigger for director mode display.
 */
export function formatEndgameForDirector(trigger: EndgameTrigger): string {
  const lines: string[] = [];
  lines.push(`  Resolution: ${trigger.resolutionClass.toUpperCase()}`);
  lines.push(`  Detected at tick: ${trigger.detectedAtTick}`);
  lines.push(`  ${trigger.reason}`);
  if (trigger.dominantArc) {
    lines.push(`  Dominant arc: ${trigger.dominantArc}`);
  }
  lines.push('  Evidence:');
  for (const [key, value] of Object.entries(trigger.evidence)) {
    lines.push(`    ${key}: ${value}`);
  }
  lines.push(`  Acknowledged: ${trigger.acknowledged ? 'yes' : 'no'}`);
  return lines.join('\n');
}

/**
 * Format endgame trigger for narrator context (~20 tokens).
 */
export function formatEndgameForNarrator(trigger: EndgameTrigger): string {
  const label = trigger.resolutionClass.replace(/-/g, ' ');
  return `Campaign turning point: ${label}. ${trigger.reason}`;
}
