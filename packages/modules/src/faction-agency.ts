// faction-agency — factions as active strategic actors
// Pure functions. Goals derived from state (not stored). Deterministic evaluation.
// Actions produce effects through existing systems: pressures, rumors, districts, reputation.

import type { WorldState } from '@ai-rpg-engine/core';
import type { DistrictMetrics, DistrictDefinition } from './district-core.js';
import type { RumorValence } from './player-rumor.js';
import type { PressureKind, WorldPressure } from './pressure-system.js';
import { getFactionCognition, getFactionMembers } from './faction-cognition.js';
import {
  getAllDistrictIds,
  getDistrictDefinition,
  getDistrictState,
  isDistrictOnAlert,
} from './district-core.js';
import { getPressuresForFaction } from './pressure-system.js';

// --- Types ---

export type FactionActionVerb =
  | 'recruit'
  | 'investigate'
  | 'retaliate'
  | 'fortify'
  | 'bribe'
  | 'spread-rumor'
  | 'sanction'
  | 'patrol'
  | 'smuggle'
  | 'hoard'
  | 'declare-claim';

export type FactionGoal = {
  id: string;
  label: string;
  priority: number;
  verb: FactionActionVerb;
  targetFactionId?: string;
  targetDistrictId?: string;
};

export type FactionProfile = {
  factionId: string;
  goals: FactionGoal[];
  riskTolerance: number;
  memberCount: number;
  controlledDistricts: string[];
  enemyFactions: string[];
  alliedFactions: string[];
};

export type FactionAction = {
  factionId: string;
  verb: FactionActionVerb;
  targetFactionId?: string;
  targetDistrictId?: string;
  description: string;
};

export type FactionEffect =
  | { type: 'district-metric'; districtId: string; metric: keyof DistrictMetrics; delta: number }
  | { type: 'reputation'; factionId: string; delta: number }
  | { type: 'rumor'; claim: string; valence: RumorValence; targetFactionIds: string[] }
  | { type: 'pressure'; kind: PressureKind; sourceFactionId: string; description: string; urgency: number }
  | { type: 'cohesion'; factionId: string; delta: number }
  | { type: 'alert'; factionId: string; delta: number }
  | { type: 'member-count'; factionId: string; delta: number };

export type FactionActionResult = {
  action: FactionAction;
  effects: FactionEffect[];
  narratorHint: string;
};

// --- Constants ---

const MAX_GOALS = 3;
const MAX_GLOBAL_ACTIONS = 2;
const STAGGER_MODULUS = 3;

// --- Profile Building ---

/**
 * Derive a faction's current goals and profile from world state.
 * Goals are not stored — they shift as state changes.
 */
export function buildFactionProfile(
  factionId: string,
  world: WorldState,
  playerReputation: number,
  activePressures: WorldPressure[],
): FactionProfile {
  const cognition = getFactionCognition(world, factionId);
  const members = getFactionMembers(world, factionId);
  const livingMembers = members.filter((id) => {
    const entity = world.entities[id];
    return entity && (entity.resources.hp ?? entity.resources.health ?? 1) > 0;
  });

  // Find controlled districts
  const controlledDistricts: string[] = [];
  for (const districtId of getAllDistrictIds(world)) {
    const def = getDistrictDefinition(world, districtId);
    if (def?.controllingFaction === factionId) {
      controlledDistricts.push(districtId);
    }
  }

  // Risk tolerance: high cohesion + low alert = more willing to act aggressively
  const riskTolerance = Math.max(0, Math.min(1,
    cognition.cohesion * 0.6 + (1 - cognition.alertLevel / 100) * 0.4,
  ));

  // Enemy factions: player has ≤ -30 rep AND this faction has high alert
  const enemyFactions: string[] = [];
  if (playerReputation <= -30 && cognition.alertLevel >= 30) {
    // This faction considers the player an enemy — track rival factions too
    for (const otherId of Object.keys(world.factions)) {
      if (otherId === factionId) continue;
      const otherCog = getFactionCognition(world, otherId);
      // Rival: high alert toward same threat, or competing for districts
      if (otherCog.alertLevel >= 40) {
        enemyFactions.push(otherId);
      }
    }
  }

  // Derive goals from state
  const goals = deriveGoals(
    factionId,
    cognition,
    livingMembers.length,
    members.length,
    playerReputation,
    controlledDistricts,
    activePressures,
    world,
  );

  return {
    factionId,
    goals,
    riskTolerance,
    memberCount: livingMembers.length,
    controlledDistricts,
    enemyFactions,
    alliedFactions: [],
  };
}

function deriveGoals(
  factionId: string,
  cognition: { alertLevel: number; cohesion: number },
  livingCount: number,
  totalCount: number,
  playerReputation: number,
  controlledDistricts: string[],
  activePressures: WorldPressure[],
  world: WorldState,
): FactionGoal[] {
  const goals: FactionGoal[] = [];
  const factionPressures = getPressuresForFaction(activePressures, factionId);

  // 1. Members depleted → recruit (priority scales with loss ratio)
  if (totalCount > 0 && livingCount < totalCount) {
    const lossRatio = 1 - livingCount / totalCount;
    if (lossRatio >= 0.2) {
      goals.push({
        id: `${factionId}-recruit`,
        label: 'Replenish ranks',
        priority: Math.min(1, lossRatio * 1.2),
        verb: 'recruit',
        targetDistrictId: controlledDistricts[0],
      });
    }
  }

  // 2. High alert + hostile reputation → retaliate
  if (cognition.alertLevel >= 50 && playerReputation <= -30) {
    const hasRetaliation = factionPressures.some(
      (p) => p.kind === 'revenge-attempt' || p.kind === 'bounty-issued',
    );
    if (!hasRetaliation) {
      goals.push({
        id: `${factionId}-retaliate`,
        label: 'Strike back',
        priority: Math.min(1, cognition.alertLevel / 100 + 0.2),
        verb: 'retaliate',
      });
    }
  }

  // 3. Moderate hostility → investigate
  if (playerReputation <= -20 && cognition.alertLevel >= 20) {
    const hasInvestigation = factionPressures.some(
      (p) => p.kind === 'investigation-opened',
    );
    if (!hasInvestigation) {
      goals.push({
        id: `${factionId}-investigate`,
        label: 'Probe the outsider',
        priority: 0.5,
        verb: 'investigate',
        targetDistrictId: controlledDistricts[0],
      });
    }
  }

  // 4. Controlled district on alert → patrol or fortify
  for (const districtId of controlledDistricts) {
    if (isDistrictOnAlert(world, districtId)) {
      const state = getDistrictState(world, districtId);
      if (state && state.surveillance < 30) {
        goals.push({
          id: `${factionId}-fortify-${districtId}`,
          label: `Fortify ${districtId}`,
          priority: 0.6,
          verb: 'fortify',
          targetDistrictId: districtId,
        });
      } else {
        goals.push({
          id: `${factionId}-patrol-${districtId}`,
          label: `Patrol ${districtId}`,
          priority: 0.5,
          verb: 'patrol',
          targetDistrictId: districtId,
        });
      }
      break; // One district goal at a time
    }
  }

  // 5. Low cohesion → hoard (internal consolidation)
  if (cognition.cohesion < 0.5) {
    goals.push({
      id: `${factionId}-hoard`,
      label: 'Consolidate power',
      priority: Math.min(1, (1 - cognition.cohesion) * 0.8),
      verb: 'hoard',
    });
  }

  // 6. Hostile + no active pressure → spread rumor
  if (playerReputation <= -20 && factionPressures.length === 0) {
    goals.push({
      id: `${factionId}-spread-rumor`,
      label: 'Undermine the outsider',
      priority: 0.4,
      verb: 'spread-rumor',
    });
  }

  // 7. Hostile + controls district → sanction
  if (playerReputation <= -40 && controlledDistricts.length > 0) {
    goals.push({
      id: `${factionId}-sanction`,
      label: 'Restrict access',
      priority: 0.55,
      verb: 'sanction',
      targetDistrictId: controlledDistricts[0],
    });
  }

  // Sort by priority descending, take top MAX_GOALS
  goals.sort((a, b) => b.priority - a.priority);
  return goals.slice(0, MAX_GOALS);
}

// --- Action Evaluation ---

/**
 * Deterministic action selection. Each faction evaluates every 3rd turn (staggered).
 * Returns at most maxGlobal actions per turn.
 */
export function evaluateFactionActions(
  profiles: FactionProfile[],
  currentTick: number,
  maxGlobal = MAX_GLOBAL_ACTIONS,
): FactionAction[] {
  const actions: FactionAction[] = [];

  for (const profile of profiles) {
    if (actions.length >= maxGlobal) break;
    if (profile.goals.length === 0) continue;

    // Stagger: deterministic hash of factionId + tick
    const hash = simpleHash(profile.factionId + currentTick);
    if (hash % STAGGER_MODULUS !== 0) continue;

    // Top-priority goal becomes the action
    const goal = profile.goals[0];
    const factionName = profile.factionId;

    actions.push({
      factionId: profile.factionId,
      verb: goal.verb,
      targetFactionId: goal.targetFactionId,
      targetDistrictId: goal.targetDistrictId,
      description: buildActionDescription(factionName, goal.verb, goal.targetDistrictId),
    });
  }

  return actions;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildActionDescription(
  factionName: string,
  verb: FactionActionVerb,
  districtId?: string,
): string {
  const district = districtId ?? 'their territory';
  switch (verb) {
    case 'recruit': return `${factionName} recruits new members in ${district}`;
    case 'investigate': return `${factionName} opens an investigation`;
    case 'retaliate': return `${factionName} prepares to strike back`;
    case 'fortify': return `${factionName} fortifies ${district}`;
    case 'bribe': return `${factionName} attempts to buy influence`;
    case 'spread-rumor': return `${factionName} spreads rumors about the outsider`;
    case 'sanction': return `${factionName} restricts access to ${district}`;
    case 'patrol': return `${factionName} increases patrols in ${district}`;
    case 'smuggle': return `${factionName} runs a smuggling operation in ${district}`;
    case 'hoard': return `${factionName} consolidates internal power`;
    case 'declare-claim': return `${factionName} declares control over ${district}`;
  }
}

// --- Action Resolution ---

/**
 * Resolve a faction action into concrete effects.
 * Lookup table — each verb produces a fixed set of effects.
 */
export function resolveFactionAction(
  action: FactionAction,
): FactionActionResult {
  const effects: FactionEffect[] = [];
  let narratorHint = '';

  switch (action.verb) {
    case 'recruit':
      effects.push({ type: 'member-count', factionId: action.factionId, delta: 1 });
      effects.push({ type: 'cohesion', factionId: action.factionId, delta: 0.05 });
      if (action.targetDistrictId) {
        effects.push({ type: 'district-metric', districtId: action.targetDistrictId, metric: 'morale', delta: 2 });
      }
      narratorHint = `The ${action.factionId} have been seen recruiting in ${action.targetDistrictId ?? 'the district'}`;
      break;

    case 'investigate':
      effects.push({ type: 'alert', factionId: action.factionId, delta: 10 });
      if (action.targetDistrictId) {
        effects.push({
          type: 'district-metric',
          districtId: action.targetDistrictId,
          metric: 'alertPressure',
          delta: 5,
        });
      }
      narratorHint = `${action.factionId} agents are asking questions about you`;
      break;

    case 'retaliate':
      effects.push({
        type: 'pressure',
        kind: 'revenge-attempt',
        sourceFactionId: action.factionId,
        description: `${action.factionId} has sent agents to settle the score`,
        urgency: 0.6,
      });
      effects.push({ type: 'alert', factionId: action.factionId, delta: 15 });
      narratorHint = `The ${action.factionId} are planning something`;
      break;

    case 'fortify':
      if (action.targetDistrictId) {
        effects.push({
          type: 'district-metric',
          districtId: action.targetDistrictId,
          metric: 'surveillance',
          delta: 10,
        });
        effects.push({
          type: 'district-metric',
          districtId: action.targetDistrictId,
          metric: 'stability',
          delta: 2,
        });
      }
      narratorHint = `${action.targetDistrictId ?? 'The district'} feels tighter under ${action.factionId} watch`;
      break;

    case 'bribe':
      effects.push({ type: 'reputation', factionId: action.factionId, delta: 5 });
      effects.push({ type: 'cohesion', factionId: action.factionId, delta: -0.05 });
      narratorHint = `Someone from the ${action.factionId} has been offering coin for cooperation`;
      break;

    case 'spread-rumor':
      effects.push({
        type: 'rumor',
        claim: `The ${action.factionId} warns that the outsider cannot be trusted`,
        valence: 'fearsome',
        targetFactionIds: [],
      });
      narratorHint = `Whispers against you are spreading from ${action.factionId} circles`;
      break;

    case 'sanction':
      if (action.targetDistrictId) {
        effects.push({
          type: 'district-metric',
          districtId: action.targetDistrictId,
          metric: 'alertPressure',
          delta: 10,
        });
      }
      effects.push({ type: 'reputation', factionId: action.factionId, delta: -5 });
      narratorHint = `The ${action.factionId} have restricted access in ${action.targetDistrictId ?? 'their territory'}`;
      break;

    case 'patrol':
      if (action.targetDistrictId) {
        effects.push({
          type: 'district-metric',
          districtId: action.targetDistrictId,
          metric: 'surveillance',
          delta: 15,
        });
        effects.push({
          type: 'district-metric',
          districtId: action.targetDistrictId,
          metric: 'intruderLikelihood',
          delta: -5,
        });
      }
      narratorHint = `${action.factionId} patrols are thicker in ${action.targetDistrictId ?? 'the area'}`;
      break;

    case 'smuggle':
      if (action.targetDistrictId) {
        effects.push({
          type: 'district-metric',
          districtId: action.targetDistrictId,
          metric: 'stability',
          delta: -3,
        });
        effects.push({ type: 'district-metric', districtId: action.targetDistrictId, metric: 'commerce', delta: 3 });
      }
      effects.push({ type: 'cohesion', factionId: action.factionId, delta: 0.03 });
      narratorHint = `Something is moving through ${action.targetDistrictId ?? 'the district'} at odd hours`;
      break;

    case 'hoard':
      effects.push({ type: 'cohesion', factionId: action.factionId, delta: 0.1 });
      effects.push({ type: 'reputation', factionId: action.factionId, delta: -3 });
      if (action.targetDistrictId) {
        effects.push({ type: 'district-metric', districtId: action.targetDistrictId, metric: 'commerce', delta: -3 });
      }
      narratorHint = `The ${action.factionId} have gone quiet — consolidating`;
      break;

    case 'declare-claim':
      if (action.targetDistrictId) {
        effects.push({
          type: 'district-metric',
          districtId: action.targetDistrictId,
          metric: 'surveillance',
          delta: 20,
        });
      }
      effects.push({ type: 'alert', factionId: action.factionId, delta: 20 });
      effects.push({
        type: 'pressure',
        kind: 'faction-summons',
        sourceFactionId: action.factionId,
        description: `${action.factionId} has declared authority over ${action.targetDistrictId ?? 'a district'}`,
        urgency: 0.5,
      });
      narratorHint = `The ${action.factionId} have made a bold claim over ${action.targetDistrictId ?? 'new territory'}`;
      break;
  }

  return {
    action,
    effects,
    narratorHint,
  };
}

// --- Convenience Wrapper ---

/**
 * Run one full faction agency tick.
 * Builds profiles → evaluates actions → resolves effects.
 * Returns results for the product layer to apply.
 */
export function runFactionAgencyTick(
  world: WorldState,
  playerReputations: { factionId: string; value: number }[],
  activePressures: WorldPressure[],
  currentTick: number,
): FactionActionResult[] {
  const factionIds = Object.keys(world.factions);
  if (factionIds.length === 0) return [];

  // Build profiles
  const profiles: FactionProfile[] = [];
  for (const factionId of factionIds) {
    const rep = playerReputations.find((r) => r.factionId === factionId)?.value ?? 0;
    const profile = buildFactionProfile(factionId, world, rep, activePressures);
    profiles.push(profile);
  }

  // Evaluate which factions act this turn
  const actions = evaluateFactionActions(profiles, currentTick);

  // Resolve each action
  return actions.map((action) => resolveFactionAction(action));
}

// --- Formatting ---

const DIVIDER = '─'.repeat(60);

/** Format faction profiles + last actions for director /factions view. */
export function formatFactionProfilesForDirector(
  profiles: FactionProfile[],
  lastActions: FactionActionResult[],
): string {
  if (profiles.length === 0) return '  No factions found.';

  const lines: string[] = [];
  lines.push('');
  lines.push(DIVIDER);
  lines.push(`  FACTION AGENCY — ${profiles.length} faction${profiles.length > 1 ? 's' : ''}`);
  lines.push(DIVIDER);

  for (const profile of profiles) {
    lines.push('');
    lines.push(`  ${profile.factionId}`);
    lines.push(`    Members: ${profile.memberCount} | Risk tolerance: ${(profile.riskTolerance * 100).toFixed(0)}%`);
    if (profile.controlledDistricts.length > 0) {
      lines.push(`    Controls: ${profile.controlledDistricts.join(', ')}`);
    }
    if (profile.enemyFactions.length > 0) {
      lines.push(`    Rivals: ${profile.enemyFactions.join(', ')}`);
    }

    if (profile.goals.length > 0) {
      lines.push('    Goals:');
      for (const goal of profile.goals) {
        const pct = (goal.priority * 100).toFixed(0);
        const target = goal.targetDistrictId ? ` → ${goal.targetDistrictId}` : '';
        lines.push(`      [${pct}%] ${goal.label} (${goal.verb}${target})`);
      }
    } else {
      lines.push('    Goals: (none — faction is idle)');
    }

    // Show last action if any
    const lastAction = lastActions.find((a) => a.action.factionId === profile.factionId);
    if (lastAction) {
      lines.push(`    Last action: ${lastAction.action.description}`);
    }
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push('');

  return lines.join('\n');
}

/** Format faction action results for narrator prompt injection (max 2, ~15 tokens each). */
export function formatFactionAgencyForNarrator(
  results: FactionActionResult[],
): string[] {
  return results.slice(0, 2).map((r) => r.narratorHint);
}
