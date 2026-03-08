// move-advisor — deterministic move recommendation engine
// Pure scoring functions. No state mutation. No LLM calls.
// Evaluates leverage sub-actions against world state and returns ranked recommendations.

import type { LeverageState, LeverageCurrency } from './player-leverage.js';
import {
  canAfford,
  isCooldownReady,
  getSocialRequirements,
  getRumorRequirements,
  getDiplomacyRequirements,
  getSabotageRequirements,
  isPlayerSocialVerb,
  isPlayerRumorVerb,
  isPlayerDiplomacyVerb,
  isPlayerSabotageVerb,
} from './player-leverage.js';
import type { WorldPressure } from './pressure-system.js';
import type { FactionStrategicView, DistrictStrategicView } from './strategic-map.js';

// --- Types ---

export type MoveCategory = 'social' | 'rumor' | 'diplomacy' | 'sabotage';

export type ScoredMove = {
  category: MoveCategory;
  verb: string;
  subAction: string;
  score: number;           // 0-100 composite
  urgency: number;         // 0-1
  feasibility: number;     // 0-1
  impact: number;          // 0-1
  risk: number;            // 0-1
  reason: string;          // ~15-20 token deterministic description
  targetFactionId?: string;
};

export type AdvisorInputs = {
  leverageState: LeverageState;
  activePressures: WorldPressure[];
  factionViews: FactionStrategicView[];
  districtViews: DistrictStrategicView[];
  playerReputation: { factionId: string; value: number }[];
  currentTick: number;
  cooldowns: Record<string, number>;  // "verb.subAction" -> lastUsedTick
  playerHeat: number;
};

export type MoveRecommendation = {
  top3: ScoredMove[];
  situationTag: 'safe' | 'pressured' | 'crisis' | 'opportunity';
};

// --- Static Impact Table ---

const IMPACT_TABLE: Record<string, number> = {
  'social.bribe': 0.4,
  'social.intimidate': 0.4,
  'social.call-in-favor': 0.5,
  'social.recruit-ally': 0.5,
  'social.petition-authority': 0.6,
  'social.disguise': 0.3,
  'social.stake-claim': 0.7,
  'rumor.seed': 0.4,
  'rumor.deny': 0.3,
  'rumor.frame': 0.6,
  'rumor.claim-false-credit': 0.4,
  'rumor.bury-scandal': 0.4,
  'rumor.leak-truth': 0.5,
  'rumor.spread-counter-rumor': 0.4,
  'diplomacy.request-meeting': 0.3,
  'diplomacy.improve-standing': 0.6,
  'diplomacy.cash-milestone': 0.7,
  'diplomacy.negotiate-access': 0.5,
  'diplomacy.negotiate-trade': 0.5,
  'diplomacy.trade-secret': 0.5,
  'diplomacy.temporary-alliance': 0.9,
  'diplomacy.broker-truce': 0.8,
  'sabotage.sabotage': 0.6,
  'sabotage.plant-evidence': 0.7,
  'sabotage.blackmail-target': 0.7,
};

// Heat generated per action (from resolution tables)
const HEAT_TABLE: Record<string, number> = {
  'social.bribe': 10,
  'social.intimidate': 0,      // intimidate costs heat, doesn't generate more
  'social.stake-claim': 0,
  'rumor.frame': 15,
  'rumor.claim-false-credit': 5,
  'rumor.spread-counter-rumor': 5,
  'sabotage.sabotage': 20,
  'sabotage.plant-evidence': 15,
  'sabotage.blackmail-target': 20,
};

// Alert generated per action
const ALERT_TABLE: Record<string, number> = {
  'social.intimidate': 15,
  'social.petition-authority': 5,
  'sabotage.plant-evidence': 10,
};

// --- Reason Templates ---

type ReasonContext = {
  targetFactionId?: string;
  pressureKind?: string;
  districtName?: string;
  vulnerability?: string;
};

const REASON_TEMPLATES: Record<string, (ctx: ReasonContext) => string> = {
  'social.bribe': (ctx) => ctx.targetFactionId
    ? `Bribe to ease tensions with ${ctx.targetFactionId}`
    : 'Spend Favor to buy cooperation',
  'social.intimidate': (ctx) => ctx.targetFactionId
    ? `Intimidate ${ctx.targetFactionId} — they look vulnerable`
    : 'Intimidate to force compliance',
  'social.call-in-favor': () => 'Call in a favor — restore access or standing',
  'social.recruit-ally': () => 'Recruit an ally to strengthen your position',
  'social.petition-authority': () => 'Petition authority — trigger investigation',
  'social.disguise': () => 'Disguise to shed Heat and lower alert',
  'social.stake-claim': (ctx) => ctx.districtName
    ? `Stake claim in ${ctx.districtName}`
    : 'Stake claim to assert dominance',
  'rumor.seed': () => 'Seed a rumor to shape faction perception',
  'rumor.deny': () => 'Deny a rumor before it spreads further',
  'rumor.frame': (ctx) => ctx.targetFactionId
    ? `Frame ${ctx.targetFactionId} with fabricated evidence`
    : 'Frame a target with planted evidence',
  'rumor.claim-false-credit': () => 'Claim false credit to boost your legend',
  'rumor.bury-scandal': () => 'Bury a scandal before it damages you',
  'rumor.leak-truth': () => 'Leak truth to expose a faction secret',
  'rumor.spread-counter-rumor': () => 'Spread a counter-rumor to neutralize gossip',
  'diplomacy.request-meeting': (ctx) => ctx.targetFactionId
    ? `Request meeting with ${ctx.targetFactionId} — signal peace`
    : 'Request a meeting to de-escalate',
  'diplomacy.improve-standing': (ctx) => ctx.targetFactionId
    ? `Mend relations with ${ctx.targetFactionId}`
    : 'Improve standing to restore trust',
  'diplomacy.cash-milestone': () => 'Cash in your milestone for influence',
  'diplomacy.negotiate-access': (ctx) => ctx.targetFactionId
    ? `Negotiate access with ${ctx.targetFactionId}`
    : 'Negotiate access to restricted areas',
  'diplomacy.negotiate-trade': (ctx) => ctx.targetFactionId
    ? `Negotiate trade deal with ${ctx.targetFactionId}`
    : 'Negotiate trade to address supply needs',
  'diplomacy.trade-secret': (ctx) => ctx.targetFactionId
    ? `Trade secrets with ${ctx.targetFactionId}`
    : 'Trade a secret for reputation',
  'diplomacy.temporary-alliance': (ctx) => ctx.targetFactionId
    ? `Form temporary alliance with ${ctx.targetFactionId}`
    : 'Propose a temporary alliance',
  'diplomacy.broker-truce': () => 'Broker a truce between warring factions',
  'sabotage.sabotage': (ctx) => ctx.districtName
    ? `Sabotage infrastructure in ${ctx.districtName}`
    : 'Sabotage to destabilize a district',
  'sabotage.plant-evidence': (ctx) => ctx.targetFactionId
    ? `Plant evidence against ${ctx.targetFactionId}`
    : 'Plant evidence to frame a target',
  'sabotage.blackmail-target': (ctx) => ctx.targetFactionId
    ? `Blackmail ${ctx.targetFactionId} into compliance`
    : 'Blackmail a target for forced cooperation',
};

// Pressure-aware reason overrides
function buildReason(key: string, ctx: ReasonContext, hasPressure: boolean): string {
  if (hasPressure && ctx.pressureKind) {
    return `The ${ctx.pressureKind} grows urgent — intervene now`;
  }
  if (ctx.vulnerability) {
    return `${ctx.targetFactionId ?? 'Target'} ${ctx.vulnerability}`;
  }
  const template = REASON_TEMPLATES[key];
  return template ? template(ctx) : `Consider ${key}`;
}

// --- All Sub-Actions ---

const ALL_ACTIONS: { category: MoveCategory; subAction: string }[] = [
  { category: 'social', subAction: 'bribe' },
  { category: 'social', subAction: 'intimidate' },
  { category: 'social', subAction: 'call-in-favor' },
  { category: 'social', subAction: 'recruit-ally' },
  { category: 'social', subAction: 'petition-authority' },
  { category: 'social', subAction: 'disguise' },
  { category: 'social', subAction: 'stake-claim' },
  { category: 'rumor', subAction: 'seed' },
  { category: 'rumor', subAction: 'deny' },
  { category: 'rumor', subAction: 'frame' },
  { category: 'rumor', subAction: 'claim-false-credit' },
  { category: 'rumor', subAction: 'bury-scandal' },
  { category: 'rumor', subAction: 'leak-truth' },
  { category: 'rumor', subAction: 'spread-counter-rumor' },
  { category: 'diplomacy', subAction: 'request-meeting' },
  { category: 'diplomacy', subAction: 'improve-standing' },
  { category: 'diplomacy', subAction: 'cash-milestone' },
  { category: 'diplomacy', subAction: 'negotiate-access' },
  { category: 'diplomacy', subAction: 'negotiate-trade' },
  { category: 'diplomacy', subAction: 'trade-secret' },
  { category: 'diplomacy', subAction: 'temporary-alliance' },
  { category: 'diplomacy', subAction: 'broker-truce' },
  { category: 'sabotage', subAction: 'sabotage' },
  { category: 'sabotage', subAction: 'plant-evidence' },
  { category: 'sabotage', subAction: 'blackmail-target' },
];

// --- Scoring ---

function getRequirements(category: MoveCategory, subAction: string) {
  switch (category) {
    case 'social': return isPlayerSocialVerb(subAction) ? getSocialRequirements(subAction) : null;
    case 'rumor': return isPlayerRumorVerb(subAction) ? getRumorRequirements(subAction) : null;
    case 'diplomacy': return isPlayerDiplomacyVerb(subAction) ? getDiplomacyRequirements(subAction) : null;
    case 'sabotage': return isPlayerSabotageVerb(subAction) ? getSabotageRequirements(subAction) : null;
  }
}

function computeUrgency(
  category: MoveCategory,
  subAction: string,
  targetFactionId: string | undefined,
  inputs: AdvisorInputs,
): number {
  let urgency = 0.1; // baseline

  // Pressure-driven urgency
  if (inputs.activePressures.length > 0) {
    const maxPressureUrgency = Math.max(...inputs.activePressures.map((p) => p.urgency));
    urgency = Math.max(urgency, maxPressureUrgency * 0.8);
  }

  // Faction hostility boost
  if (targetFactionId) {
    const faction = inputs.factionViews.find((f) => f.factionId === targetFactionId);
    if (faction) {
      if (faction.stance === 'hostile') urgency += 0.2;
      else if (faction.alertLevel > 50 && faction.playerReputation < 0) urgency += 0.15;
    }
  }

  // Disguise urgency increases with heat
  if (subAction === 'disguise' && inputs.playerHeat > 40) {
    urgency += 0.3;
  }

  // Deny/bury urgency when harmful rumors exist
  if ((subAction === 'deny' || subAction === 'bury-scandal') && inputs.activePressures.some((p) =>
    p.kind === 'revenge-attempt' || p.kind === 'investigation-opened')) {
    urgency += 0.2;
  }

  // Trade negotiation urgency when supply-crisis or trade-war active
  if (subAction === 'negotiate-trade' && inputs.activePressures.some((p) =>
    p.kind === 'supply-crisis' || p.kind === 'trade-war')) {
    urgency += 0.3;
  }

  return Math.min(1, urgency);
}

function computeFeasibility(
  category: MoveCategory,
  subAction: string,
  targetFactionId: string | undefined,
  inputs: AdvisorInputs,
): number {
  const req = getRequirements(category, subAction);
  if (!req) return 0;

  // Affordability gate
  if (!canAfford(inputs.leverageState, req.costs)) return 0;

  // Cooldown gate
  const cdKey = `${category}.${subAction}`;
  const lastUsed = inputs.cooldowns[cdKey];
  if (lastUsed != null && req.cooldownTurns) {
    if (inputs.currentTick - lastUsed < req.cooldownTurns) return 0;
  }

  // Reputation gate for diplomacy
  if (req.minimumReputation != null && targetFactionId) {
    const rep = inputs.playerReputation.find((r) => r.factionId === targetFactionId);
    if (rep && rep.value < req.minimumReputation) return 0;
  }

  // Surplus ratio — how much headroom the player has
  const costs = Object.entries(req.costs).filter(([, v]) => v && v > 0);
  if (costs.length === 0) return 1; // free action

  const surplusRatios = costs.map(([currency, amount]) => {
    const available = inputs.leverageState[currency as LeverageCurrency];
    return available / (amount as number);
  });
  const minSurplus = Math.min(...surplusRatios);
  return Math.min(1, minSurplus / 2); // 2x surplus = full feasibility
}

function computeImpact(
  category: MoveCategory,
  subAction: string,
  inputs: AdvisorInputs,
): number {
  const key = `${category}.${subAction}`;
  let impact = IMPACT_TABLE[key] ?? 0.3;

  // Boost if action could address an active pressure
  if (inputs.activePressures.length > 0) {
    const couldAddress = canAddressPressure(category, subAction, inputs.activePressures);
    if (couldAddress) impact = Math.min(1, impact * 1.3);
  }

  return impact;
}

function canAddressPressure(
  category: MoveCategory,
  subAction: string,
  pressures: WorldPressure[],
): boolean {
  // Diplomacy actions can address faction-conflict pressures
  if (category === 'diplomacy' && pressures.some((p) =>
    p.kind === 'faction-summons' || p.kind === 'bounty-issued')) return true;
  // Rumor deny/bury can address rumor-driven pressures
  if ((subAction === 'deny' || subAction === 'bury-scandal') && pressures.some((p) =>
    p.kind === 'revenge-attempt')) return true;
  // Disguise can help with investigation pressures
  if (subAction === 'disguise' && pressures.some((p) =>
    p.kind === 'investigation-opened')) return true;
  // Petition can address general faction pressures
  if (subAction === 'petition-authority' && pressures.some((p) =>
    p.kind === 'bounty-issued' || p.kind === 'merchant-blacklist')) return true;
  return false;
}

function computeRisk(
  category: MoveCategory,
  subAction: string,
  inputs: AdvisorInputs,
): number {
  const key = `${category}.${subAction}`;
  const heatGen = HEAT_TABLE[key] ?? 0;
  const alertGen = ALERT_TABLE[key] ?? 0;

  const baseRisk = (heatGen / 40) * 0.6 + (alertGen / 30) * 0.4;
  const heatPenalty = (inputs.playerHeat / 100) * 0.2;

  return Math.min(1, baseRisk + heatPenalty);
}

/** Score a single leverage sub-action. */
export function scoreAction(
  category: MoveCategory,
  subAction: string,
  targetFactionId: string | undefined,
  inputs: AdvisorInputs,
): ScoredMove {
  const urgency = computeUrgency(category, subAction, targetFactionId, inputs);
  const feasibility = computeFeasibility(category, subAction, targetFactionId, inputs);
  const impact = computeImpact(category, subAction, inputs);
  const risk = computeRisk(category, subAction, inputs);

  const score = (urgency * 0.3 + feasibility * 0.3 + impact * 0.25 + (1 - risk) * 0.15) * 100;

  // Build reason context
  const faction = targetFactionId
    ? inputs.factionViews.find((f) => f.factionId === targetFactionId)
    : undefined;
  const district = inputs.districtViews.find((d) => d.hotspotTags.length > 0);
  const matchingPressure = inputs.activePressures.find((p) => p.urgency >= 0.5);

  const ctx: ReasonContext = {
    targetFactionId,
    pressureKind: matchingPressure?.kind,
    districtName: district?.name,
    vulnerability: faction?.vulnerability,
  };
  const reason = buildReason(`${category}.${subAction}`, ctx, !!matchingPressure && urgency > 0.5);

  return {
    category,
    verb: category,
    subAction,
    score: Math.round(score * 10) / 10,
    urgency,
    feasibility,
    impact,
    risk,
    reason,
    targetFactionId,
  };
}

/** Derive overall situation tag from pressure state and faction vulnerabilities. */
export function deriveSituation(inputs: AdvisorInputs): MoveRecommendation['situationTag'] {
  const maxPressureUrgency = inputs.activePressures.length > 0
    ? Math.max(...inputs.activePressures.map((p) => p.urgency))
    : 0;

  if (maxPressureUrgency >= 0.7 || inputs.playerHeat >= 70) return 'crisis';
  if (maxPressureUrgency >= 0.4) return 'pressured';
  if (inputs.factionViews.some((f) => f.vulnerability != null)) return 'opportunity';
  return 'safe';
}

/** Score all available leverage actions and return top 3 recommendations. */
export function recommendMoves(inputs: AdvisorInputs): MoveRecommendation {
  const situationTag = deriveSituation(inputs);
  const scored: ScoredMove[] = [];

  // Pick target factions: hostile/vulnerable first, then all
  const targetFactions = inputs.factionViews
    .filter((f) => f.stance === 'hostile' || f.vulnerability != null || f.alertLevel > 50)
    .map((f) => f.factionId);
  // Include at least one faction even if all are neutral
  if (targetFactions.length === 0 && inputs.factionViews.length > 0) {
    targetFactions.push(inputs.factionViews[0].factionId);
  }

  for (const { category, subAction } of ALL_ACTIONS) {
    // Untargeted actions (disguise, broker-truce, etc.)
    const req = getRequirements(category, subAction);
    if (!req) continue;

    if (category === 'social' && (subAction === 'disguise' || subAction === 'stake-claim' || subAction === 'call-in-favor')) {
      scored.push(scoreAction(category, subAction, undefined, inputs));
    } else if (category === 'rumor' && (subAction === 'seed' || subAction === 'deny' || subAction === 'bury-scandal'
      || subAction === 'leak-truth' || subAction === 'spread-counter-rumor' || subAction === 'claim-false-credit')) {
      scored.push(scoreAction(category, subAction, undefined, inputs));
    } else if (subAction === 'broker-truce' || subAction === 'cash-milestone') {
      scored.push(scoreAction(category, subAction, undefined, inputs));
    } else {
      // Targeted actions: score against each interesting faction
      for (const factionId of targetFactions) {
        scored.push(scoreAction(category, subAction, factionId, inputs));
      }
    }
  }

  // Sort by score descending, take top 3
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate: don't recommend the same subAction twice with different targets
  const seen = new Set<string>();
  const top3: ScoredMove[] = [];
  for (const move of scored) {
    if (top3.length >= 3) break;
    if (move.feasibility === 0) continue; // skip infeasible
    const key = `${move.category}.${move.subAction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    top3.push(move);
  }

  return { top3, situationTag };
}
