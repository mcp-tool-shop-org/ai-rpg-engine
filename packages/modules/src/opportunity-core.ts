// opportunity-core — emergent opportunity generation from world state
// v1.9: The world offers work because it needs things. Contracts, bounties,
// favors, supply runs — generated deterministically from pressures, scarcity,
// NPC goals, faction needs, and companion asks. Pure functions, no module registration.

import type { LeverageCurrency, LeverageState } from './player-leverage.js';
import type { SupplyCategory, DistrictEconomy } from './economy-core.js';
import type { ObligationKind, ObligationDirection, NpcProfile, NpcObligationLedger, LoyaltyBreakpoint } from './npc-agency.js';
import type { WorldPressure, PressureKind } from './pressure-system.js';
import type { RumorValence } from './player-rumor.js';
import type { CompanionState } from './companion-core.js';
import { getSupplyLevel } from './economy-core.js';
import { getObligationsToward, getNetObligationWeight } from './npc-agency.js';

// --- Types ---

export type OpportunityKind =
  | 'contract'
  | 'favor-request'
  | 'bounty'
  | 'supply-run'
  | 'recovery'
  | 'escort'
  | 'investigation'
  | 'faction-job';

export type OpportunityStatus =
  | 'available'
  | 'accepted'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'declined'
  | 'abandoned'
  | 'betrayed';

export type OpportunityVisibility = 'hidden' | 'rumored' | 'known' | 'offered';

export type OpportunityReward =
  | { type: 'reputation'; factionId: string; delta: number }
  | { type: 'leverage'; currency: LeverageCurrency; delta: number }
  | { type: 'materials'; category: SupplyCategory; quantity: number }
  | { type: 'economy-shift'; districtId: string; category: SupplyCategory; delta: number }
  | { type: 'obligation'; kind: ObligationKind; direction: ObligationDirection; npcId: string; magnitude: number }
  | { type: 'item'; itemTag: string; rarity: string }
  | { type: 'rumor'; claim: string; valence: RumorValence; spreadTo: string[] };

export type OpportunityRisk =
  | { type: 'heat'; delta: number }
  | { type: 'reputation'; factionId: string; delta: number }
  | { type: 'alert'; factionId: string; delta: number }
  | { type: 'combat'; threatLevel: number }
  | { type: 'obligation'; kind: ObligationKind; direction: 'player-owes-npc'; npcId: string; magnitude: number };

export type OpportunityState = {
  id: string;
  kind: OpportunityKind;
  status: OpportunityStatus;
  // Source
  sourceNpcId?: string;
  sourceFactionId?: string;
  // Description (structured, not prose — Claude narrates from these)
  title: string;
  description: string;
  objectiveDescription: string;
  // Linking
  linkedPressureId?: string;
  linkedDistrictId?: string;
  linkedRumorIds: string[];
  linkedNpcIds: string[];
  tags: string[];
  // Rewards + risks
  rewards: OpportunityReward[];
  risks: OpportunityRisk[];
  // Lifecycle
  visibility: OpportunityVisibility;
  urgency: number; // 0-1
  turnsRemaining: number | null; // null = no deadline
  createdAtTick: number;
  acceptedAtTick?: number;
  resolvedAtTick?: number;
  // Genre context
  genre: string;
};

export type OpportunityInputs = {
  activeOpportunities: OpportunityState[];
  activePressures: WorldPressure[];
  npcProfiles: NpcProfile[];
  npcObligations: Map<string, NpcObligationLedger>;
  factionStates: Record<string, { alertLevel: number; cohesion: number }>;
  playerReputations: Array<{ factionId: string; value: number }>;
  playerLeverage: LeverageState;
  districtEconomies: Map<string, DistrictEconomy>;
  companions: CompanionState[];
  playerDistrictId: string;
  playerLevel: number;
  currentTick: number;
  genre: string;
  totalTurns: number;
};

export type OpportunitySpawnResult = {
  opportunity: OpportunityState;
  /** One-line reason for director mode */
  reason: string;
};

export type OpportunityTickResult = {
  /** Opportunities still active after this tick */
  active: OpportunityState[];
  /** Opportunities that expired this tick */
  expired: OpportunityState[];
};

// --- Constants ---

const MAX_ACTIVE_OPPORTUNITIES = 5;
const MIN_TURNS_BETWEEN_SPAWNS = 3;
const DEFAULT_DEADLINE = 12;
const VISIBILITY_ESCALATION_TICKS = 3;

let opportunityCounter = 0;
function nextOpportunityId(): string {
  return `opp-${++opportunityCounter}`;
}

/** Reset counter for testing. */
export function resetOpportunityCounter(): void {
  opportunityCounter = 0;
}

// --- Lifecycle ---

/**
 * Tick all active opportunities: decrement timers, remove expired,
 * escalate visibility over time. Returns active + expired arrays.
 */
export function tickOpportunities(
  opportunities: OpportunityState[],
  currentTick: number,
): OpportunityTickResult {
  const active: OpportunityState[] = [];
  const expired: OpportunityState[] = [];

  for (const opp of opportunities) {
    // Only tick available or accepted opportunities
    if (opp.status !== 'available' && opp.status !== 'accepted') continue;

    // Expire if turnsRemaining hit 0
    if (opp.turnsRemaining !== null && opp.turnsRemaining <= 0) {
      expired.push({ ...opp, status: 'expired', resolvedAtTick: currentTick });
      continue;
    }

    const updated = { ...opp };

    // Decrement timer
    if (updated.turnsRemaining !== null) {
      updated.turnsRemaining = updated.turnsRemaining - 1;
    }

    // Escalate visibility over time
    const age = currentTick - updated.createdAtTick;
    if (updated.visibility === 'hidden' && age >= VISIBILITY_ESCALATION_TICKS) {
      updated.visibility = 'rumored';
    } else if (updated.visibility === 'rumored' && age >= VISIBILITY_ESCALATION_TICKS * 2) {
      updated.visibility = 'known';
    } else if (updated.visibility === 'known' && age >= VISIBILITY_ESCALATION_TICKS * 3) {
      updated.visibility = 'offered';
    }

    active.push(updated);
  }

  return { active, expired };
}

// --- Queries ---

export function getAvailableOpportunities(opps: OpportunityState[]): OpportunityState[] {
  return opps.filter((o) => o.status === 'available');
}

export function getAcceptedOpportunities(opps: OpportunityState[]): OpportunityState[] {
  return opps.filter((o) => o.status === 'accepted');
}

export function getOpportunityById(opps: OpportunityState[], id: string): OpportunityState | undefined {
  return opps.find((o) => o.id === id);
}

export function getOpportunitiesForNpc(opps: OpportunityState[], npcId: string): OpportunityState[] {
  return opps.filter((o) => o.sourceNpcId === npcId || o.linkedNpcIds.includes(npcId));
}

export function getOpportunitiesForFaction(opps: OpportunityState[], factionId: string): OpportunityState[] {
  return opps.filter((o) => o.sourceFactionId === factionId);
}

// --- Evaluation ---

type ScoredCandidate = {
  opportunity: OpportunityState;
  score: number;
  reason: string;
};

/**
 * Evaluate simulation state for new opportunity. Returns at most ONE new opportunity.
 * Returns null most turns — scarcity by design.
 */
export function evaluateOpportunities(inputs: OpportunityInputs): OpportunitySpawnResult | null {
  // Capacity guard
  const liveCount = inputs.activeOpportunities.filter(
    (o) => o.status === 'available' || o.status === 'accepted',
  ).length;
  if (liveCount >= MAX_ACTIVE_OPPORTUNITIES) return null;

  // Interval guard
  if (inputs.activeOpportunities.length > 0) {
    const mostRecent = Math.max(
      ...inputs.activeOpportunities.map((o) => o.createdAtTick),
    );
    if (inputs.currentTick - mostRecent < MIN_TURNS_BETWEEN_SPAWNS) return null;
  }

  // Existing kinds (no duplicate kinds unless different sources)
  const activeKindSourcePairs = new Set(
    inputs.activeOpportunities
      .filter((o) => o.status === 'available' || o.status === 'accepted')
      .map((o) => `${o.kind}:${o.sourceNpcId ?? o.sourceFactionId ?? 'none'}`),
  );

  // Collect candidates from all evaluation rules
  const candidates: ScoredCandidate[] = [];

  const pressureLinked = evaluatePressureLinkedOpportunities(inputs, activeKindSourcePairs);
  if (pressureLinked) candidates.push(pressureLinked);

  const scarcity = evaluateScarcityOpportunities(inputs, activeKindSourcePairs);
  if (scarcity) candidates.push(scarcity);

  const npcGoal = evaluateNpcGoalOpportunities(inputs, activeKindSourcePairs);
  if (npcGoal) candidates.push(npcGoal);

  const obligation = evaluateObligationOpportunities(inputs, activeKindSourcePairs);
  if (obligation) candidates.push(obligation);

  const faction = evaluateFactionOpportunities(inputs, activeKindSourcePairs);
  if (faction) candidates.push(faction);

  const companion = evaluateCompanionOpportunities(inputs, activeKindSourcePairs);
  if (companion) candidates.push(companion);

  const district = evaluateDistrictOpportunities(inputs, activeKindSourcePairs);
  if (district) candidates.push(district);

  if (candidates.length === 0) return null;

  // Pick highest score
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  return { opportunity: best.opportunity, reason: best.reason };
}

// --- Scoring ---

/**
 * Score = (urgency * 0.3 + feasibility * 0.25 + reward * 0.25 + relevance * 0.2) * 100
 */
function scoreCandidate(
  opp: OpportunityState,
  inputs: OpportunityInputs,
): number {
  const urgency = opp.urgency;

  // Feasibility: player has reasonable standing (not hostile with source faction)
  let feasibility = 0.5;
  if (opp.sourceFactionId) {
    const rep = inputs.playerReputations.find((r) => r.factionId === opp.sourceFactionId);
    if (rep) {
      feasibility = rep.value >= 0 ? Math.min(1, 0.5 + rep.value / 200) : Math.max(0, 0.5 + rep.value / 200);
    }
  }

  // Reward magnitude: count of rewards weighted by type
  const rewardScore = Math.min(1, opp.rewards.length * 0.25);

  // Relevance: same district, linked to pressures, companion involvement
  let relevance = 0.3;
  if (opp.linkedDistrictId === inputs.playerDistrictId) relevance += 0.3;
  if (opp.linkedPressureId) relevance += 0.2;
  if (opp.tags.includes('personal-ask')) relevance += 0.2;
  relevance = Math.min(1, relevance);

  return (urgency * 0.3 + feasibility * 0.25 + rewardScore * 0.25 + relevance * 0.2) * 100;
}

// --- Evaluation Rules ---

/** Pressure-linked: active pressures seed related opportunities. */
function evaluatePressureLinkedOpportunities(
  inputs: OpportunityInputs,
  activePairs: Set<string>,
): ScoredCandidate | null {
  for (const pressure of inputs.activePressures) {
    // bounty-issued → bounty opportunity
    if (
      pressure.kind === 'bounty-issued' &&
      !hasPairConflict(activePairs, 'bounty', pressure.sourceFactionId)
    ) {
      // Only offer bounty if player has reasonable rep with the faction being bounty'd
      // (bounty is offered to the player by a RIVAL faction of the bounty source)
      const rivalFaction = inputs.playerReputations.find(
        (r) => r.factionId !== pressure.sourceFactionId && r.value >= 10,
      );
      if (rivalFaction) {
        const opp = makeOpportunity({
          kind: 'bounty',
          sourceFactionId: rivalFaction.factionId,
          title: `Collect the bounty on ${pressure.sourceFactionId}'s target`,
          description: `${rivalFaction.factionId} wants someone to deal with the bounty target.`,
          objectiveDescription: 'Eliminate or capture the target.',
          linkedPressureId: pressure.id,
          linkedDistrictId: inputs.playerDistrictId,
          urgency: pressure.urgency,
          turnsRemaining: pressure.turnsRemaining ?? DEFAULT_DEADLINE,
          visibility: 'offered',
          rewards: [
            { type: 'reputation', factionId: rivalFaction.factionId, delta: 15 },
            { type: 'leverage', currency: 'blackmail', delta: 5 },
          ],
          risks: [
            { type: 'reputation', factionId: pressure.sourceFactionId, delta: -10 },
            { type: 'combat', threatLevel: 3 },
          ],
          genre: inputs.genre,
          currentTick: inputs.currentTick,
          tags: ['combat', 'hostile'],
        });
        return {
          opportunity: opp,
          score: scoreCandidate(opp, inputs),
          reason: `Bounty pressure ${pressure.id} creates bounty opportunity via ${rivalFaction.factionId}`,
        };
      }
    }

    // supply-crisis → supply-run
    if (
      pressure.kind === 'supply-crisis' &&
      !hasPairConflict(activePairs, 'supply-run', pressure.sourceFactionId)
    ) {
      const opp = makeOpportunity({
        kind: 'supply-run',
        sourceFactionId: pressure.sourceFactionId,
        title: `Deliver supplies for ${pressure.sourceFactionId}`,
        description: `${pressure.sourceFactionId} is critically short on supplies and needs a runner.`,
        objectiveDescription: 'Acquire and deliver the needed supplies.',
        linkedPressureId: pressure.id,
        linkedDistrictId: inputs.playerDistrictId,
        urgency: pressure.urgency,
        turnsRemaining: pressure.turnsRemaining ?? DEFAULT_DEADLINE,
        visibility: 'offered',
        rewards: [
          { type: 'reputation', factionId: pressure.sourceFactionId, delta: 10 },
          { type: 'leverage', currency: 'legitimacy', delta: 5 },
        ],
        risks: [
          { type: 'heat', delta: 5 },
        ],
        genre: inputs.genre,
        currentTick: inputs.currentTick,
        tags: ['logistics'],
      });
      return {
        opportunity: opp,
        score: scoreCandidate(opp, inputs),
        reason: `Supply crisis pressure ${pressure.id} creates supply-run opportunity`,
      };
    }

    // faction-summons → faction-job
    if (
      pressure.kind === 'faction-summons' &&
      !hasPairConflict(activePairs, 'faction-job', pressure.sourceFactionId)
    ) {
      const opp = makeOpportunity({
        kind: 'faction-job',
        sourceFactionId: pressure.sourceFactionId,
        title: `${pressure.sourceFactionId} has a mission for you`,
        description: `The faction summons you to discuss an important assignment.`,
        objectiveDescription: 'Meet with faction leadership and accept or decline their mission.',
        linkedPressureId: pressure.id,
        linkedDistrictId: inputs.playerDistrictId,
        urgency: pressure.urgency,
        turnsRemaining: pressure.turnsRemaining ?? DEFAULT_DEADLINE,
        visibility: 'offered',
        rewards: [
          { type: 'reputation', factionId: pressure.sourceFactionId, delta: 20 },
          { type: 'leverage', currency: 'influence', delta: 8 },
        ],
        risks: [
          { type: 'reputation', factionId: pressure.sourceFactionId, delta: -10 },
        ],
        genre: inputs.genre,
        currentTick: inputs.currentTick,
        tags: ['diplomatic', 'faction'],
      });
      return {
        opportunity: opp,
        score: scoreCandidate(opp, inputs),
        reason: `Faction summons pressure ${pressure.id} creates faction-job`,
      };
    }
  }

  return null;
}

/** Scarcity-driven: low supply in player's district → supply-run. */
function evaluateScarcityOpportunities(
  inputs: OpportunityInputs,
  activePairs: Set<string>,
): ScoredCandidate | null {
  const economy = inputs.districtEconomies.get(inputs.playerDistrictId);
  if (!economy) return null;

  // Find the scarcest supply below threshold
  const categories: SupplyCategory[] = [
    'medicine', 'weapons', 'ammunition', 'food', 'fuel', 'luxuries', 'components', 'contraband',
  ];

  let worstCategory: SupplyCategory | null = null;
  let worstLevel = 20; // threshold

  for (const cat of categories) {
    if (cat === 'contraband') continue; // Contraband scarcity handled by black market, not supply runs
    const level = getSupplyLevel(economy, cat);
    if (level < worstLevel) {
      // Find a faction in this district that could offer the job
      const factionId = findLocalFaction(inputs);
      if (factionId && !hasPairConflict(activePairs, 'supply-run', factionId)) {
        worstCategory = cat;
        worstLevel = level;
      }
    }
  }

  if (!worstCategory) return null;

  const factionId = findLocalFaction(inputs)!;
  const urgency = Math.min(1, (20 - worstLevel) / 20 * 0.5 + 0.3);

  const opp = makeOpportunity({
    kind: 'supply-run',
    sourceFactionId: factionId,
    title: `Source ${worstCategory} for the district`,
    description: `${worstCategory} supplies are critically low. Someone needs to find more.`,
    objectiveDescription: `Acquire ${worstCategory} and deliver it to the district.`,
    linkedDistrictId: inputs.playerDistrictId,
    urgency,
    turnsRemaining: DEFAULT_DEADLINE,
    visibility: 'known',
    rewards: [
      { type: 'reputation', factionId, delta: 8 },
      { type: 'economy-shift', districtId: inputs.playerDistrictId, category: worstCategory, delta: 15 },
      { type: 'leverage', currency: 'legitimacy', delta: 3 },
    ],
    risks: [
      { type: 'heat', delta: 3 },
    ],
    genre: inputs.genre,
    currentTick: inputs.currentTick,
    tags: ['logistics', 'scarcity'],
  });

  return {
    opportunity: opp,
    score: scoreCandidate(opp, inputs),
    reason: `${worstCategory} at level ${worstLevel} in player district — supply-run opportunity`,
  };
}

/** NPC goal-driven: favorable/allied NPCs with bargain or recruit goals → contract. */
function evaluateNpcGoalOpportunities(
  inputs: OpportunityInputs,
  activePairs: Set<string>,
): ScoredCandidate | null {
  for (const npc of inputs.npcProfiles) {
    // Skip hostile or compromised NPCs
    if (npc.breakpoint === 'hostile' || npc.breakpoint === 'compromised') continue;
    // Must have favorable+ relationship
    if (npc.breakpoint !== 'allied' && npc.breakpoint !== 'favorable') continue;

    // Check for bargain goal → contract
    const bargainGoal = npc.goals.find((g) => g.verb === 'bargain' && g.priority >= 0.5);
    if (bargainGoal && !hasPairConflict(activePairs, 'contract', npc.npcId)) {
      const factionId = npc.factionId ?? undefined;
      const opp = makeOpportunity({
        kind: 'contract',
        sourceNpcId: npc.npcId,
        sourceFactionId: factionId,
        title: `${npc.name} has a job for you`,
        description: `${npc.name} wants to hire you for a task.`,
        objectiveDescription: bargainGoal.reason || 'Complete the task for your employer.',
        linkedDistrictId: inputs.playerDistrictId,
        linkedNpcIds: [npc.npcId],
        urgency: bargainGoal.priority * 0.7,
        turnsRemaining: DEFAULT_DEADLINE,
        visibility: 'offered',
        rewards: [
          { type: 'leverage', currency: 'favor', delta: 5 },
          ...(factionId ? [{ type: 'reputation' as const, factionId, delta: 5 }] : []),
          { type: 'obligation', kind: 'favor' as const, direction: 'npc-owes-player' as const, npcId: npc.npcId, magnitude: 3 },
        ],
        risks: [],
        genre: inputs.genre,
        currentTick: inputs.currentTick,
        tags: ['npc-sourced'],
      });

      return {
        opportunity: opp,
        score: scoreCandidate(opp, inputs),
        reason: `${npc.name} (${npc.breakpoint}) has bargain goal → contract`,
      };
    }

    // Check for recruit goal → faction-job
    const recruitGoal = npc.goals.find((g) => g.verb === 'recruit' && g.priority >= 0.4);
    if (recruitGoal && npc.factionId && !hasPairConflict(activePairs, 'faction-job', npc.factionId)) {
      const opp = makeOpportunity({
        kind: 'faction-job',
        sourceNpcId: npc.npcId,
        sourceFactionId: npc.factionId,
        title: `${npc.name} offers a mission on behalf of ${npc.factionId}`,
        description: `${npc.name} wants to recruit you for faction work.`,
        objectiveDescription: recruitGoal.reason || 'Prove yourself to the faction.',
        linkedDistrictId: inputs.playerDistrictId,
        linkedNpcIds: [npc.npcId],
        urgency: recruitGoal.priority * 0.6,
        turnsRemaining: DEFAULT_DEADLINE + 4,
        visibility: 'offered',
        rewards: [
          { type: 'reputation', factionId: npc.factionId, delta: 15 },
          { type: 'leverage', currency: 'influence', delta: 5 },
        ],
        risks: [
          { type: 'reputation', factionId: npc.factionId, delta: -5 },
        ],
        genre: inputs.genre,
        currentTick: inputs.currentTick,
        tags: ['npc-sourced', 'faction'],
      });

      return {
        opportunity: opp,
        score: scoreCandidate(opp, inputs),
        reason: `${npc.name} (${npc.breakpoint}) has recruit goal → faction-job`,
      };
    }
  }

  return null;
}

/** Obligation-driven: player owes NPC with high magnitude → favor-request. */
function evaluateObligationOpportunities(
  inputs: OpportunityInputs,
  activePairs: Set<string>,
): ScoredCandidate | null {
  for (const [npcId, ledger] of inputs.npcObligations) {
    const npcProfile = inputs.npcProfiles.find((p) => p.npcId === npcId);
    if (!npcProfile) continue;

    // Find obligations where player owes NPC
    const playerDebts = ledger.obligations.filter(
      (o) => o.direction === 'player-owes-npc' && o.magnitude >= 4,
    );

    if (playerDebts.length === 0) continue;
    if (hasPairConflict(activePairs, 'favor-request', npcId)) continue;

    const highestDebt = playerDebts.reduce((a, b) => a.magnitude > b.magnitude ? a : b);

    const opp = makeOpportunity({
      kind: 'favor-request',
      sourceNpcId: npcId,
      sourceFactionId: npcProfile.factionId ?? undefined,
      title: `${npcProfile.name} calls in a favor`,
      description: `${npcProfile.name} reminds you of the debt you owe. They need help.`,
      objectiveDescription: `Repay your obligation to ${npcProfile.name}.`,
      linkedDistrictId: inputs.playerDistrictId,
      linkedNpcIds: [npcId],
      urgency: Math.min(1, highestDebt.magnitude / 10 + 0.3),
      turnsRemaining: DEFAULT_DEADLINE,
      visibility: 'offered',
      rewards: [
        { type: 'obligation', kind: 'favor', direction: 'npc-owes-player', npcId, magnitude: 2 },
        { type: 'leverage', currency: 'favor', delta: 3 },
      ],
      risks: [
        { type: 'obligation', kind: 'betrayed' as ObligationKind, direction: 'player-owes-npc', npcId, magnitude: highestDebt.magnitude + 2 },
      ],
      genre: inputs.genre,
      currentTick: inputs.currentTick,
      tags: ['obligation', 'personal'],
    });

    return {
      opportunity: opp,
      score: scoreCandidate(opp, inputs),
      reason: `Player owes ${npcProfile.name} (magnitude ${highestDebt.magnitude}) → favor-request`,
    };
  }

  return null;
}

/** Faction-driven: allied faction with low alert → faction-job. */
function evaluateFactionOpportunities(
  inputs: OpportunityInputs,
  activePairs: Set<string>,
): ScoredCandidate | null {
  for (const rep of inputs.playerReputations) {
    if (rep.value < 30) continue; // Not allied enough
    const state = inputs.factionStates[rep.factionId];
    if (!state || state.alertLevel >= 50) continue; // Too on-edge to offer jobs

    if (hasPairConflict(activePairs, 'faction-job', rep.factionId)) continue;

    // Find an NPC from this faction as the quest-giver
    const factionNpc = inputs.npcProfiles.find(
      (p) => p.factionId === rep.factionId && p.breakpoint !== 'hostile',
    );

    const opp = makeOpportunity({
      kind: 'faction-job',
      sourceNpcId: factionNpc?.npcId,
      sourceFactionId: rep.factionId,
      title: `${rep.factionId} has work available`,
      description: `Your reputation with ${rep.factionId} has opened up opportunities.`,
      objectiveDescription: 'Complete a task for the faction to strengthen your standing.',
      linkedDistrictId: inputs.playerDistrictId,
      linkedNpcIds: factionNpc ? [factionNpc.npcId] : [],
      urgency: 0.4,
      turnsRemaining: DEFAULT_DEADLINE + 4,
      visibility: 'known',
      rewards: [
        { type: 'reputation', factionId: rep.factionId, delta: 10 },
        { type: 'leverage', currency: 'influence', delta: 5 },
      ],
      risks: [],
      genre: inputs.genre,
      currentTick: inputs.currentTick,
      tags: ['faction'],
    });

    return {
      opportunity: opp,
      score: scoreCandidate(opp, inputs),
      reason: `Allied faction ${rep.factionId} (rep ${rep.value}, alert ${state.alertLevel}) → faction-job`,
    };
  }

  return null;
}

/** Companion-driven: companion with personalGoal → favor-request (personal-ask). */
function evaluateCompanionOpportunities(
  inputs: OpportunityInputs,
  activePairs: Set<string>,
): ScoredCandidate | null {
  for (const comp of inputs.companions) {
    if (!comp.active || !comp.personalGoal) continue;
    if (hasPairConflict(activePairs, 'favor-request', comp.npcId)) continue;

    const npcProfile = inputs.npcProfiles.find((p) => p.npcId === comp.npcId);
    const name = npcProfile?.name ?? comp.npcId;

    const opp = makeOpportunity({
      kind: 'favor-request',
      sourceNpcId: comp.npcId,
      title: `${name} asks for your help`,
      description: `Your companion ${name} has a personal request: "${comp.personalGoal}"`,
      objectiveDescription: comp.personalGoal,
      linkedDistrictId: inputs.playerDistrictId,
      linkedNpcIds: [comp.npcId],
      urgency: comp.morale < 40 ? 0.7 : 0.4,
      turnsRemaining: DEFAULT_DEADLINE + 8,
      visibility: 'offered',
      rewards: [
        { type: 'obligation', kind: 'favor', direction: 'npc-owes-player', npcId: comp.npcId, magnitude: 5 },
        { type: 'leverage', currency: 'favor', delta: 5 },
      ],
      risks: [],
      genre: inputs.genre,
      currentTick: inputs.currentTick,
      tags: ['personal-ask', 'companion'],
    });

    return {
      opportunity: opp,
      score: scoreCandidate(opp, inputs),
      reason: `Companion ${name} has personal goal "${comp.personalGoal}" → favor-request`,
    };
  }

  return null;
}

/** District-driven: high instability → recovery or investigation. */
function evaluateDistrictOpportunities(
  inputs: OpportunityInputs,
  activePairs: Set<string>,
): ScoredCandidate | null {
  // Check player's district for instability
  const economy = inputs.districtEconomies.get(inputs.playerDistrictId);
  if (!economy) return null;

  // Use district metrics if available
  const metrics = inputs.factionStates; // district metrics come through faction states
  // We need to check district stability via economy proxy: low trade volume + black market = instability
  const isUnstable = economy.tradeVolume < 30 || economy.blackMarketActive;
  if (!isUnstable) return null;

  const factionId = findLocalFaction(inputs);

  // Black market active → investigation
  if (economy.blackMarketActive && !hasPairConflict(activePairs, 'investigation', factionId ?? 'none')) {
    const opp = makeOpportunity({
      kind: 'investigation',
      sourceFactionId: factionId,
      title: 'Investigate the black market activity',
      description: 'Contraband is flowing freely. Someone wants answers.',
      objectiveDescription: 'Gather information about the black market operation.',
      linkedDistrictId: inputs.playerDistrictId,
      urgency: 0.5,
      turnsRemaining: DEFAULT_DEADLINE,
      visibility: 'rumored',
      rewards: [
        ...(factionId ? [{ type: 'reputation' as const, factionId, delta: 10 }] : []),
        { type: 'leverage', currency: 'blackmail' as LeverageCurrency, delta: 8 },
      ],
      risks: [
        { type: 'heat', delta: 10 },
        { type: 'combat', threatLevel: 2 },
      ],
      genre: inputs.genre,
      currentTick: inputs.currentTick,
      tags: ['underworld', 'stealth'],
    });

    return {
      opportunity: opp,
      score: scoreCandidate(opp, inputs),
      reason: `Black market active in player district → investigation`,
    };
  }

  // Low trade volume → recovery (district needs something found/restored)
  if (economy.tradeVolume < 30 && !hasPairConflict(activePairs, 'recovery', factionId ?? 'none')) {
    const opp = makeOpportunity({
      kind: 'recovery',
      sourceFactionId: factionId,
      title: 'Recover lost trade goods',
      description: 'Trade has nearly collapsed. Missing shipments need to be found.',
      objectiveDescription: 'Locate and recover the missing goods.',
      linkedDistrictId: inputs.playerDistrictId,
      urgency: 0.4,
      turnsRemaining: DEFAULT_DEADLINE,
      visibility: 'known',
      rewards: [
        ...(factionId ? [{ type: 'reputation' as const, factionId, delta: 8 }] : []),
        { type: 'leverage', currency: 'legitimacy' as LeverageCurrency, delta: 5 },
      ],
      risks: [
        { type: 'combat', threatLevel: 1 },
      ],
      genre: inputs.genre,
      currentTick: inputs.currentTick,
      tags: ['exploration'],
    });

    return {
      opportunity: opp,
      score: scoreCandidate(opp, inputs),
      reason: `Low trade volume (${economy.tradeVolume}) in player district → recovery`,
    };
  }

  return null;
}

// --- Formatting ---

/** Detailed director view of a single opportunity. */
export function formatOpportunityForDirector(opp: OpportunityState): string {
  const deadline = opp.turnsRemaining !== null ? `${opp.turnsRemaining} turns` : 'no deadline';
  const urgencyLabel = opp.urgency >= 0.7 ? 'URGENT' : opp.urgency >= 0.4 ? 'moderate' : 'low';
  const parts = [
    `  [${opp.id}] ${opp.kind.toUpperCase()}: ${opp.title}`,
    `    Status: ${opp.status} | Urgency: ${urgencyLabel} | Deadline: ${deadline}`,
    `    ${opp.description}`,
    `    Objective: ${opp.objectiveDescription}`,
  ];

  if (opp.sourceNpcId) parts.push(`    Source: ${opp.sourceNpcId}${opp.sourceFactionId ? ` (${opp.sourceFactionId})` : ''}`);
  else if (opp.sourceFactionId) parts.push(`    Source: ${opp.sourceFactionId}`);

  if (opp.linkedPressureId) parts.push(`    Linked pressure: ${opp.linkedPressureId}`);
  if (opp.linkedDistrictId) parts.push(`    District: ${opp.linkedDistrictId}`);

  if (opp.rewards.length > 0) {
    parts.push(`    Rewards:`);
    for (const r of opp.rewards) {
      parts.push(`      ${formatReward(r)}`);
    }
  }

  if (opp.risks.length > 0) {
    parts.push(`    Risks:`);
    for (const r of opp.risks) {
      parts.push(`      ${formatRisk(r)}`);
    }
  }

  if (opp.tags.length > 0) parts.push(`    Tags: ${opp.tags.join(', ')}`);

  return parts.join('\n');
}

/** List all opportunities with compact format. */
export function formatOpportunityListForDirector(opps: OpportunityState[]): string {
  const available = opps.filter((o) => o.status === 'available');
  const accepted = opps.filter((o) => o.status === 'accepted');

  const parts: string[] = ['=== OPPORTUNITIES ==='];

  if (accepted.length > 0) {
    parts.push('\n  ACCEPTED:');
    for (const opp of accepted) {
      parts.push(formatOpportunityForDirector(opp));
    }
  }

  if (available.length > 0) {
    parts.push('\n  AVAILABLE:');
    for (const opp of available) {
      parts.push(formatOpportunityForDirector(opp));
    }
  }

  if (available.length === 0 && accepted.length === 0) {
    parts.push('  No active opportunities.');
  }

  return parts.join('\n');
}

/** Compact summary for narrator prompt injection (~15 tokens). */
export function formatOpportunityForNarrator(opp: OpportunityState): string {
  const urgency = opp.urgency >= 0.7 ? 'urgent' : opp.urgency >= 0.4 ? 'active' : 'available';
  const deadline = opp.turnsRemaining !== null ? `, ${opp.turnsRemaining} turns left` : '';
  return `${opp.kind}: ${opp.title} (${urgency}${deadline})`;
}

/** NPC-facing description for dialogue context. */
export function formatOpportunityForDialogue(opp: OpportunityState): string {
  const status = opp.status === 'accepted' ? 'in progress' : opp.status;
  const deadline = opp.turnsRemaining !== null ? ` — ${opp.turnsRemaining} turns remaining` : '';
  return `${opp.kind} (${status}): ${opp.title}${deadline}`;
}

// --- Helpers ---

function formatReward(r: OpportunityReward): string {
  switch (r.type) {
    case 'reputation': return `+${r.delta} reputation with ${r.factionId}`;
    case 'leverage': return `+${r.delta} ${r.currency}`;
    case 'materials': return `+${r.quantity} ${r.category}`;
    case 'economy-shift': return `+${r.delta} ${r.category} supply in ${r.districtId}`;
    case 'obligation': return `${r.npcId} owes you a ${r.kind} (magnitude ${r.magnitude})`;
    case 'item': return `${r.rarity} ${r.itemTag} item`;
    case 'rumor': return `${r.valence} rumor: "${r.claim}"`;
  }
}

function formatRisk(r: OpportunityRisk): string {
  switch (r.type) {
    case 'heat': return `+${r.delta} heat`;
    case 'reputation': return `${r.delta} reputation with ${r.factionId}`;
    case 'alert': return `+${r.delta} alert (${r.factionId})`;
    case 'combat': return `combat threat level ${r.threatLevel}`;
    case 'obligation': return `owe ${r.npcId} a ${r.kind} (magnitude ${r.magnitude})`;
  }
}

function hasPairConflict(activePairs: Set<string>, kind: OpportunityKind, sourceId: string | undefined): boolean {
  return activePairs.has(`${kind}:${sourceId ?? 'none'}`);
}

function findLocalFaction(inputs: OpportunityInputs): string | undefined {
  // Find a faction the player has neutral-or-better rep with
  const friendly = inputs.playerReputations
    .filter((r) => r.value >= -10)
    .sort((a, b) => b.value - a.value);
  return friendly[0]?.factionId;
}

export function makeOpportunity(opts: {
  kind: OpportunityKind;
  sourceNpcId?: string;
  sourceFactionId?: string;
  title: string;
  description: string;
  objectiveDescription: string;
  linkedPressureId?: string;
  linkedDistrictId?: string;
  linkedNpcIds?: string[];
  linkedRumorIds?: string[];
  urgency: number;
  turnsRemaining: number | null;
  visibility: OpportunityVisibility;
  rewards: OpportunityReward[];
  risks: OpportunityRisk[];
  genre: string;
  currentTick: number;
  tags?: string[];
}): OpportunityState {
  return {
    id: nextOpportunityId(),
    kind: opts.kind,
    status: 'available',
    sourceNpcId: opts.sourceNpcId,
    sourceFactionId: opts.sourceFactionId,
    title: opts.title,
    description: opts.description,
    objectiveDescription: opts.objectiveDescription,
    linkedPressureId: opts.linkedPressureId,
    linkedDistrictId: opts.linkedDistrictId,
    linkedRumorIds: opts.linkedRumorIds ?? [],
    linkedNpcIds: opts.linkedNpcIds ?? [],
    tags: opts.tags ?? [],
    rewards: opts.rewards,
    risks: opts.risks,
    visibility: opts.visibility,
    urgency: opts.urgency,
    turnsRemaining: opts.turnsRemaining,
    createdAtTick: opts.currentTick,
    genre: opts.genre,
  };
}
