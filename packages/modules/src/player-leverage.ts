// player-leverage — structured player social actions
// Pure functions + types. Resolution lookup tables. Mirrors faction-agency.ts pattern.
// v1.0: Player Leverage — the player can manipulate the social machine.

import type { DistrictMetrics } from './district-core.js';
import type { RumorValence } from './player-rumor.js';
import type { PressureKind } from './pressure-system.js';

// Minimal shape of profile hints needed for leverage gain computation.
// The full ProfileUpdateHints type lives in the product layer (turn-loop.ts).
export type LeverageHints = {
  xpGained: number;
  reputationDelta?: { factionId: string; delta: number };
  milestoneTriggered?: { label: string; tags: string[] };
  pressureResolution?: { resolutionType: string };
};

// --- Types ---

export type LeverageCurrency = 'favor' | 'debt' | 'blackmail' | 'influence' | 'heat' | 'legitimacy';

export type LeverageState = Record<LeverageCurrency, number>;

export type PlayerSocialVerb =
  | 'bribe'
  | 'intimidate'
  | 'call-in-favor'
  | 'recruit-ally'
  | 'petition-authority'
  | 'disguise'
  | 'stake-claim';

export type PlayerRumorVerb =
  | 'seed'
  | 'deny'
  | 'frame'
  | 'claim-false-credit'
  | 'bury-scandal'
  | 'leak-truth'
  | 'spread-counter-rumor';

export type PlayerDiplomacyVerb =
  | 'request-meeting'
  | 'improve-standing'
  | 'cash-milestone'
  | 'negotiate-access'
  | 'trade-secret'
  | 'temporary-alliance'
  | 'broker-truce';

export type PlayerSabotageVerb =
  | 'sabotage'
  | 'plant-evidence'
  | 'blackmail-target';

export type LeverageCost = Partial<Record<LeverageCurrency, number>>;

export type LeverageRequirement = {
  costs: LeverageCost;
  minimumReputation?: number;
  requiredAccess?: 'normal' | 'privileged';
  cooldownTurns?: number;
};

export type LeverageEffect =
  | { type: 'reputation'; factionId: string; delta: number }
  | { type: 'leverage'; currency: LeverageCurrency; delta: number }
  | { type: 'rumor'; claim: string; valence: RumorValence; targetFactionIds: string[] }
  | { type: 'district-metric'; districtId: string; metric: keyof DistrictMetrics; delta: number }
  | { type: 'pressure'; kind: PressureKind; sourceFactionId: string; description: string; urgency: number }
  | { type: 'cohesion'; factionId: string; delta: number }
  | { type: 'alert'; factionId: string; delta: number }
  | { type: 'access'; factionId: string; level: 'denied' | 'restricted' | 'normal' | 'privileged' }
  | { type: 'heat'; delta: number };

export type LeverageResolution = {
  verb: 'social' | 'rumor' | 'diplomacy' | 'sabotage';
  subAction: string;
  targetId?: string;
  targetFactionId?: string;
  effects: LeverageEffect[];
  narratorHint: string;
  success: boolean;
  failReason?: string;
};

// --- Constants ---

const ALL_CURRENCIES: LeverageCurrency[] = ['favor', 'debt', 'blackmail', 'influence', 'heat', 'legitimacy'];
const HEAT_DECAY_PER_TURN = 3;
const MAX_LEVERAGE = 100;
const MIN_LEVERAGE = 0;

// --- Leverage State Accessors ---

/** Read typed leverage state from CharacterProfile.custom. */
export function getLeverageState(
  custom: Record<string, string | number | boolean>,
): LeverageState {
  const state: LeverageState = {
    favor: 0,
    debt: 0,
    blackmail: 0,
    influence: 0,
    heat: 0,
    legitimacy: 0,
  };
  for (const currency of ALL_CURRENCIES) {
    const key = `leverage.${currency}`;
    const value = custom[key];
    if (typeof value === 'number') {
      state[currency] = value;
    }
  }
  return state;
}

/** Set a single leverage currency on CharacterProfile.custom (clamped 0-100). */
export function adjustLeverage(
  custom: Record<string, string | number | boolean>,
  currency: LeverageCurrency,
  delta: number,
): Record<string, string | number | boolean> {
  const key = `leverage.${currency}`;
  const current = typeof custom[key] === 'number' ? (custom[key] as number) : 0;
  const next = Math.max(MIN_LEVERAGE, Math.min(MAX_LEVERAGE, current + delta));
  return { ...custom, [key]: next };
}

/** Apply multiple leverage deltas. */
export function applyLeverageDeltas(
  custom: Record<string, string | number | boolean>,
  deltas: Partial<Record<LeverageCurrency, number>>,
): Record<string, string | number | boolean> {
  let result = custom;
  for (const [currency, delta] of Object.entries(deltas)) {
    if (delta && delta !== 0) {
      result = adjustLeverage(result, currency as LeverageCurrency, delta);
    }
  }
  return result;
}

// --- Cost Checking ---

/** Check if the player can afford a leverage cost. */
export function canAfford(state: LeverageState, costs: LeverageCost): boolean {
  for (const [currency, amount] of Object.entries(costs)) {
    if (amount && state[currency as LeverageCurrency] < amount) {
      return false;
    }
  }
  return true;
}

/** Get the first currency that's too low to afford. */
function getShortfall(state: LeverageState, costs: LeverageCost): string | undefined {
  for (const [currency, amount] of Object.entries(costs)) {
    if (amount && state[currency as LeverageCurrency] < amount) {
      return currency;
    }
  }
  return undefined;
}

// --- Cooldown Checking ---

/** Check if a sub-action is on cooldown. Returns true if available. */
export function isCooldownReady(
  custom: Record<string, string | number | boolean>,
  verb: string,
  subAction: string,
  currentTick: number,
  cooldownTurns: number,
): boolean {
  const key = `cooldown.${verb}.${subAction}`;
  const lastUsed = custom[key];
  if (typeof lastUsed !== 'number') return true;
  return currentTick - lastUsed >= cooldownTurns;
}

/** Record a cooldown usage. */
export function setCooldown(
  custom: Record<string, string | number | boolean>,
  verb: string,
  subAction: string,
  currentTick: number,
): Record<string, string | number | boolean> {
  return { ...custom, [`cooldown.${verb}.${subAction}`]: currentTick };
}

// --- Requirements Lookup ---

const SOCIAL_REQUIREMENTS: Record<PlayerSocialVerb, LeverageRequirement> = {
  'bribe': { costs: { favor: 15 }, cooldownTurns: 3 },
  'intimidate': { costs: { heat: 10 }, cooldownTurns: 3 },
  'call-in-favor': { costs: { debt: 20, favor: 10 }, cooldownTurns: 5 },
  'recruit-ally': { costs: { favor: 25, influence: 15 }, cooldownTurns: 5 },
  'petition-authority': { costs: { legitimacy: 20 }, cooldownTurns: 4 },
  'disguise': { costs: { influence: 5 }, cooldownTurns: 5 },
  'stake-claim': { costs: { influence: 30, legitimacy: 20 }, cooldownTurns: 8 },
};

const RUMOR_REQUIREMENTS: Record<PlayerRumorVerb, LeverageRequirement> = {
  'seed': { costs: { influence: 10 }, cooldownTurns: 3 },
  'deny': { costs: { legitimacy: 10 }, cooldownTurns: 2 },
  'frame': { costs: { blackmail: 20, heat: 15 }, cooldownTurns: 5 },
  'claim-false-credit': { costs: { influence: 15 }, cooldownTurns: 4 },
  'bury-scandal': { costs: { favor: 15, influence: 10 }, cooldownTurns: 4 },
  'leak-truth': { costs: { blackmail: 15 }, cooldownTurns: 3 },
  'spread-counter-rumor': { costs: { influence: 10 }, cooldownTurns: 3 },
};

const DIPLOMACY_REQUIREMENTS: Record<PlayerDiplomacyVerb, LeverageRequirement> = {
  'request-meeting': { costs: { favor: 5 }, minimumReputation: -10, cooldownTurns: 2 },
  'improve-standing': { costs: { favor: 20 }, cooldownTurns: 4 },
  'cash-milestone': { costs: {}, cooldownTurns: 5 },
  'negotiate-access': { costs: { favor: 15, legitimacy: 10 }, minimumReputation: -10, cooldownTurns: 5 },
  'trade-secret': { costs: { blackmail: 15 }, cooldownTurns: 4 },
  'temporary-alliance': { costs: { favor: 25, influence: 20 }, minimumReputation: 0, cooldownTurns: 8 },
  'broker-truce': { costs: { influence: 30, legitimacy: 15 }, cooldownTurns: 8 },
};

const SABOTAGE_REQUIREMENTS: Record<PlayerSabotageVerb, LeverageRequirement> = {
  'sabotage': { costs: { blackmail: 10 }, cooldownTurns: 4 },
  'plant-evidence': { costs: { blackmail: 20 }, cooldownTurns: 5 },
  'blackmail-target': { costs: { blackmail: 25 }, cooldownTurns: 5 },
};

export function getSocialRequirements(subAction: PlayerSocialVerb): LeverageRequirement {
  return SOCIAL_REQUIREMENTS[subAction];
}

export function getRumorRequirements(subAction: PlayerRumorVerb): LeverageRequirement {
  return RUMOR_REQUIREMENTS[subAction];
}

export function getDiplomacyRequirements(subAction: PlayerDiplomacyVerb): LeverageRequirement {
  return DIPLOMACY_REQUIREMENTS[subAction];
}

export function getSabotageRequirements(subAction: PlayerSabotageVerb): LeverageRequirement {
  return SABOTAGE_REQUIREMENTS[subAction];
}

// --- Resolution: Social ---

const SOCIAL_VERBS: Set<string> = new Set([
  'bribe', 'intimidate', 'call-in-favor', 'recruit-ally',
  'petition-authority', 'disguise', 'stake-claim',
]);

export function isPlayerSocialVerb(s: string): s is PlayerSocialVerb {
  return SOCIAL_VERBS.has(s);
}

export function resolveSocialAction(
  subAction: PlayerSocialVerb,
  targetId: string | undefined,
  targetFactionId: string | undefined,
  leverageState: LeverageState,
  playerReputation: number,
  factionCognition: { alertLevel: number; cohesion: number } | undefined,
  currentTick: number,
): LeverageResolution {
  const req = SOCIAL_REQUIREMENTS[subAction];
  if (!canAfford(leverageState, req.costs)) {
    const short = getShortfall(leverageState, req.costs);
    return {
      verb: 'social',
      subAction,
      targetId,
      targetFactionId,
      effects: [],
      narratorHint: '',
      success: false,
      failReason: `Not enough ${short ?? 'leverage'}`,
    };
  }

  const effects: LeverageEffect[] = [];
  let narratorHint = '';

  // Deduct costs
  for (const [currency, amount] of Object.entries(req.costs)) {
    if (amount) {
      effects.push({ type: 'leverage', currency: currency as LeverageCurrency, delta: -amount });
    }
  }

  switch (subAction) {
    case 'bribe':
      if (targetFactionId) {
        effects.push({ type: 'reputation', factionId: targetFactionId, delta: 10 });
      }
      effects.push({ type: 'leverage', currency: 'debt', delta: 5 });
      effects.push({ type: 'heat', delta: 10 });
      if (factionCognition && factionCognition.alertLevel >= 50) {
        if (targetFactionId) {
          effects.push({ type: 'alert', factionId: targetFactionId, delta: 5 });
        }
        narratorHint = 'Your coin is accepted, but watchful eyes note the exchange';
      } else {
        narratorHint = 'A quiet arrangement is made';
      }
      break;

    case 'intimidate':
      effects.push({ type: 'heat', delta: 10 });
      if (targetFactionId) {
        effects.push({ type: 'alert', factionId: targetFactionId, delta: 15 });
        effects.push({ type: 'reputation', factionId: targetFactionId, delta: -5 });
        effects.push({ type: 'cohesion', factionId: targetFactionId, delta: -0.05 });
      }
      narratorHint = 'Your threat hangs in the air';
      break;

    case 'call-in-favor':
      if (targetFactionId) {
        effects.push({ type: 'reputation', factionId: targetFactionId, delta: 5 });
        effects.push({ type: 'access', factionId: targetFactionId, level: 'normal' });
      }
      narratorHint = 'An old debt is called due';
      break;

    case 'recruit-ally':
      if (targetFactionId) {
        effects.push({ type: 'cohesion', factionId: targetFactionId, delta: 0.05 });
      }
      effects.push({ type: 'leverage', currency: 'influence', delta: -5 });
      narratorHint = 'A new ally joins your cause';
      break;

    case 'petition-authority':
      if (targetFactionId) {
        effects.push({
          type: 'pressure',
          kind: 'investigation-opened',
          sourceFactionId: targetFactionId,
          description: 'The authorities have opened a formal inquiry',
          urgency: 0.4,
        });
        effects.push({ type: 'alert', factionId: targetFactionId, delta: 5 });
      }
      narratorHint = 'The authorities take notice';
      break;

    case 'disguise':
      effects.push({ type: 'heat', delta: -20 });
      narratorHint = 'You slip into a new guise';
      break;

    case 'stake-claim': {
      const districtId = targetId;
      if (districtId) {
        effects.push({
          type: 'district-metric',
          districtId,
          metric: 'surveillance',
          delta: 10,
        });
      }
      if (targetFactionId) {
        effects.push({
          type: 'pressure',
          kind: 'faction-summons',
          sourceFactionId: targetFactionId,
          description: 'A bold claim has been staked',
          urgency: 0.5,
        });
      }
      narratorHint = 'You plant your flag';
      break;
    }
  }

  return {
    verb: 'social',
    subAction,
    targetId,
    targetFactionId,
    effects,
    narratorHint,
    success: true,
  };
}

// --- Resolution: Rumor ---

const RUMOR_VERBS: Set<string> = new Set([
  'seed', 'deny', 'frame', 'claim-false-credit',
  'bury-scandal', 'leak-truth', 'spread-counter-rumor',
]);

export function isPlayerRumorVerb(s: string): s is PlayerRumorVerb {
  return RUMOR_VERBS.has(s);
}

export function resolveRumorAction(
  subAction: PlayerRumorVerb,
  targetFactionId: string | undefined,
  leverageState: LeverageState,
  _currentTick: number,
  rumorClaim?: string,
): LeverageResolution {
  const req = RUMOR_REQUIREMENTS[subAction];
  if (!canAfford(leverageState, req.costs)) {
    const short = getShortfall(leverageState, req.costs);
    return {
      verb: 'rumor',
      subAction,
      targetFactionId,
      effects: [],
      narratorHint: '',
      success: false,
      failReason: `Not enough ${short ?? 'leverage'}`,
    };
  }

  const effects: LeverageEffect[] = [];
  let narratorHint = '';

  // Deduct costs
  for (const [currency, amount] of Object.entries(req.costs)) {
    if (amount) {
      effects.push({ type: 'leverage', currency: currency as LeverageCurrency, delta: -amount });
    }
  }

  switch (subAction) {
    case 'seed':
      effects.push({
        type: 'rumor',
        claim: rumorClaim ?? 'strange happenings have been reported',
        valence: 'mysterious',
        targetFactionIds: targetFactionId ? [targetFactionId] : [],
      });
      narratorHint = 'Whispers begin to spread';
      break;

    case 'deny':
      // Deny effect: reduces confidence of target rumor (handled by game.ts using denyRumor())
      effects.push({ type: 'leverage', currency: 'legitimacy', delta: 3 });
      narratorHint = 'You set the record straight';
      break;

    case 'frame':
      effects.push({ type: 'heat', delta: 15 });
      effects.push({
        type: 'rumor',
        claim: rumorClaim ?? `${targetFactionId ?? 'someone'} is not what they seem`,
        valence: 'fearsome',
        targetFactionIds: targetFactionId ? [targetFactionId] : [],
      });
      if (targetFactionId) {
        effects.push({ type: 'alert', factionId: targetFactionId, delta: 10 });
      }
      narratorHint = 'Evidence points elsewhere';
      break;

    case 'claim-false-credit':
      effects.push({
        type: 'rumor',
        claim: rumorClaim ?? 'a great deed was accomplished',
        valence: 'heroic',
        targetFactionIds: [],
      });
      effects.push({ type: 'heat', delta: 5 });
      narratorHint = 'The story grows in the telling';
      break;

    case 'bury-scandal':
      // Bury effect: accelerates decay of target rumor (handled by game.ts using buryRumor())
      narratorHint = 'The truth is quietly buried';
      break;

    case 'leak-truth':
      effects.push({
        type: 'rumor',
        claim: rumorClaim ?? 'a secret has come to light',
        valence: 'fearsome',
        targetFactionIds: targetFactionId ? [targetFactionId] : [],
      });
      narratorHint = 'Secrets come to light';
      break;

    case 'spread-counter-rumor':
      effects.push({ type: 'heat', delta: 5 });
      effects.push({
        type: 'rumor',
        claim: rumorClaim ?? 'a different version of events',
        valence: 'heroic',
        targetFactionIds: targetFactionId ? [targetFactionId] : [],
      });
      narratorHint = 'A different story takes hold';
      break;
  }

  return {
    verb: 'rumor',
    subAction,
    targetFactionId,
    effects,
    narratorHint,
    success: true,
  };
}

// --- Resolution: Diplomacy ---

const DIPLOMACY_VERBS: Set<string> = new Set([
  'request-meeting', 'improve-standing', 'cash-milestone',
  'negotiate-access', 'trade-secret', 'temporary-alliance', 'broker-truce',
]);

export function isPlayerDiplomacyVerb(s: string): s is PlayerDiplomacyVerb {
  return DIPLOMACY_VERBS.has(s);
}

export function resolveDiplomacyAction(
  subAction: PlayerDiplomacyVerb,
  targetFactionId: string,
  leverageState: LeverageState,
  playerReputation: number,
  factionCognition: { alertLevel: number; cohesion: number } | undefined,
  _currentTick: number,
): LeverageResolution {
  const req = DIPLOMACY_REQUIREMENTS[subAction];

  // Reputation gate
  if (req.minimumReputation != null && playerReputation < req.minimumReputation) {
    return {
      verb: 'diplomacy',
      subAction,
      targetFactionId,
      effects: [],
      narratorHint: '',
      success: false,
      failReason: `Your reputation with this faction is too low`,
    };
  }

  if (!canAfford(leverageState, req.costs)) {
    const short = getShortfall(leverageState, req.costs);
    return {
      verb: 'diplomacy',
      subAction,
      targetFactionId,
      effects: [],
      narratorHint: '',
      success: false,
      failReason: `Not enough ${short ?? 'leverage'}`,
    };
  }

  const effects: LeverageEffect[] = [];
  let narratorHint = '';

  // Deduct costs
  for (const [currency, amount] of Object.entries(req.costs)) {
    if (amount) {
      effects.push({ type: 'leverage', currency: currency as LeverageCurrency, delta: -amount });
    }
  }

  switch (subAction) {
    case 'request-meeting':
      effects.push({ type: 'alert', factionId: targetFactionId, delta: -5 });
      narratorHint = 'Word is sent ahead';
      break;

    case 'improve-standing':
      effects.push({ type: 'reputation', factionId: targetFactionId, delta: 15 });
      effects.push({ type: 'heat', delta: -5 });
      narratorHint = 'Relations begin to thaw';
      break;

    case 'cash-milestone':
      effects.push({ type: 'reputation', factionId: targetFactionId, delta: 20 });
      effects.push({ type: 'leverage', currency: 'influence', delta: 10 });
      narratorHint = 'Your deeds speak for themselves';
      break;

    case 'negotiate-access':
      effects.push({ type: 'access', factionId: targetFactionId, level: playerReputation >= 20 ? 'privileged' : 'normal' });
      narratorHint = 'Doors that were closed now open';
      break;

    case 'trade-secret':
      effects.push({ type: 'reputation', factionId: targetFactionId, delta: 10 });
      effects.push({ type: 'cohesion', factionId: targetFactionId, delta: -0.05 });
      narratorHint = 'Knowledge changes hands';
      break;

    case 'temporary-alliance':
      effects.push({ type: 'reputation', factionId: targetFactionId, delta: 25 });
      effects.push({ type: 'alert', factionId: targetFactionId, delta: -10 });
      narratorHint = 'An uneasy accord is struck';
      break;

    case 'broker-truce':
      effects.push({ type: 'alert', factionId: targetFactionId, delta: -20 });
      effects.push({ type: 'reputation', factionId: targetFactionId, delta: 10 });
      narratorHint = 'Swords are sheathed, for now';
      break;
  }

  return {
    verb: 'diplomacy',
    subAction,
    targetFactionId,
    effects,
    narratorHint,
    success: true,
  };
}

// --- Resolution: Sabotage ---

const SABOTAGE_VERBS: Set<string> = new Set([
  'sabotage', 'plant-evidence', 'blackmail-target',
]);

export function isPlayerSabotageVerb(s: string): s is PlayerSabotageVerb {
  return SABOTAGE_VERBS.has(s);
}

export function resolveSabotageAction(
  subAction: PlayerSabotageVerb,
  targetId: string | undefined,
  targetFactionId: string | undefined,
  leverageState: LeverageState,
  _currentTick: number,
): LeverageResolution {
  const req = SABOTAGE_REQUIREMENTS[subAction];
  if (!canAfford(leverageState, req.costs)) {
    const short = getShortfall(leverageState, req.costs);
    return {
      verb: 'sabotage',
      subAction,
      targetId,
      targetFactionId,
      effects: [],
      narratorHint: '',
      success: false,
      failReason: `Not enough ${short ?? 'leverage'}`,
    };
  }

  const effects: LeverageEffect[] = [];
  let narratorHint = '';

  // Deduct costs
  for (const [currency, amount] of Object.entries(req.costs)) {
    if (amount) {
      effects.push({ type: 'leverage', currency: currency as LeverageCurrency, delta: -amount });
    }
  }

  switch (subAction) {
    case 'sabotage': {
      effects.push({ type: 'heat', delta: 20 });
      const districtId = targetId;
      if (districtId) {
        effects.push({
          type: 'district-metric',
          districtId,
          metric: 'stability',
          delta: -5,
        });
        effects.push({
          type: 'district-metric',
          districtId,
          metric: 'surveillance',
          delta: -10,
        });
      }
      narratorHint = 'Something breaks in the night';
      break;
    }

    case 'plant-evidence':
      effects.push({ type: 'heat', delta: 15 });
      effects.push({
        type: 'rumor',
        claim: `damning evidence discovered against ${targetFactionId ?? 'someone'}`,
        valence: 'fearsome',
        targetFactionIds: targetFactionId ? [targetFactionId] : [],
      });
      if (targetFactionId) {
        effects.push({ type: 'alert', factionId: targetFactionId, delta: 10 });
      }
      narratorHint = 'The evidence is damning';
      break;

    case 'blackmail-target':
      effects.push({ type: 'heat', delta: 20 });
      if (targetFactionId) {
        effects.push({ type: 'reputation', factionId: targetFactionId, delta: 15 });
        effects.push({ type: 'cohesion', factionId: targetFactionId, delta: -0.1 });
      }
      narratorHint = 'Compliance comes at a price';
      break;
  }

  return {
    verb: 'sabotage',
    subAction,
    targetId,
    targetFactionId,
    effects,
    narratorHint,
    success: true,
  };
}

// --- Leverage Tick (Passive) ---

/**
 * Per-turn passive changes: heat decays, influence recalculated from max rep.
 */
export function tickLeverage(
  custom: Record<string, string | number | boolean>,
  reputations: { factionId: string; value: number }[],
): Record<string, string | number | boolean> {
  let result = custom;

  // Heat decay
  const currentHeat = typeof custom['leverage.heat'] === 'number' ? (custom['leverage.heat'] as number) : 0;
  if (currentHeat > 0) {
    result = adjustLeverage(result, 'heat', -HEAT_DECAY_PER_TURN);
  }

  // Influence is derived from max positive reputation (not stored separately)
  const maxRep = Math.max(0, ...reputations.map((r) => r.value));
  const computedInfluence = Math.min(MAX_LEVERAGE, Math.floor(maxRep / 2));
  result = { ...result, 'leverage.influence': computedInfluence };

  return result;
}

// --- Natural Leverage Gains ---

/**
 * Compute leverage gains from game events (profile hints).
 * Called alongside existing XP, reputation, milestone processing.
 */
export function computeLeverageGains(
  hints: LeverageHints,
): Partial<Record<LeverageCurrency, number>> {
  const gains: Partial<Record<LeverageCurrency, number>> = {};

  // Kill/defeat → blackmail (information power)
  if (hints.xpGained >= 15) {
    gains.blackmail = 5;
  }

  // Reputation change → favor
  if (hints.reputationDelta) {
    if (hints.reputationDelta.delta > 0) {
      gains.favor = 5;
    }
    // Negative rep change → blackmail (you know their secrets from the conflict)
    if (hints.reputationDelta.delta < -10) {
      gains.blackmail = 3;
    }
  }

  // Milestone → legitimacy
  if (hints.milestoneTriggered) {
    gains.legitimacy = 5;
    // Discovery milestones also grant blackmail
    if (hints.milestoneTriggered.tags.includes('exploration') || hints.milestoneTriggered.tags.includes('landmark')) {
      gains.blackmail = (gains.blackmail ?? 0) + 5;
    }
  }

  // Pressure resolved → favor
  if (hints.pressureResolution?.resolutionType === 'resolved-by-player') {
    gains.favor = (gains.favor ?? 0) + 10;
    gains.legitimacy = (gains.legitimacy ?? 0) + 5;
  }

  return gains;
}

// --- Formatting ---

const DIVIDER = '─'.repeat(60);

const CURRENCY_LABELS: Record<LeverageCurrency, string> = {
  favor: 'Favor',
  debt: 'Debt',
  blackmail: 'Blackmail',
  influence: 'Influence',
  heat: 'Heat',
  legitimacy: 'Legitimacy',
};

/** Format leverage state for director /leverage view. */
export function formatLeverageForDirector(state: LeverageState): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(DIVIDER);
  lines.push('  PLAYER LEVERAGE');
  lines.push(DIVIDER);
  lines.push('');

  for (const currency of ALL_CURRENCIES) {
    const value = state[currency];
    const bar = '█'.repeat(Math.floor(value / 5)) + '░'.repeat(20 - Math.floor(value / 5));
    lines.push(`  ${CURRENCY_LABELS[currency].padEnd(12)} ${bar} ${value}`);
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push('');
  return lines.join('\n');
}

/** Format a leverage action result for narrator prompt injection (~15 tokens). */
export function formatLeverageActionForNarrator(resolution: LeverageResolution): string {
  return resolution.narratorHint;
}

/** Format leverage state as a compact status string for the play screen. */
export function formatLeverageStatus(state: LeverageState): string {
  const parts: string[] = [];
  for (const currency of ALL_CURRENCIES) {
    const val = state[currency];
    if (val > 0) {
      parts.push(`${CURRENCY_LABELS[currency]}: ${val}`);
    }
  }
  return parts.length > 0 ? parts.join(' | ') : 'No leverage';
}
