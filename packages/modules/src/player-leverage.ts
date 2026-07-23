// player-leverage — structured player social actions
// Pure functions + types + the write-wire EngineModule (F-677e94ad/F-19a23718).
// Resolution lookup tables mirror faction-agency.ts's pattern; the module
// registration at the bottom of this file mirrors trade-core.ts's "thin verb
// wrapper around a pure resolver" shape.
// v1.0: Player Leverage — the player can manipulate the social machine.
// v1.1 (F-677e94ad/F-19a23718/F-92dd2068/F-4684385c): createPlayerLeverageCore
// registered exactly FOUR verbs — 'seed', 'bribe', 'intimidate', 'petition' —
// the Director's deliberately narrow scope for that wave (18 of the 22
// authored sub-actions across all four groups stayed unregistered; their
// resolve*Action cases were already fully implemented and tested but had no
// verb yet).
// v1.2 (v3.0 feature cycle, wave 1 "social-verbs"): createPlayerLeverageCore
// now registers ALL 25 authored sub-actions across all four groups. The
// remaining 21 — call-in-favor/recruit-ally/disguise/stake-claim;
// deny/frame/claim-false-credit/bury-scandal/leak-truth/spread-counter-rumor;
// request-meeting/improve-standing/cash-milestone/negotiate-access/
// trade-secret/temporary-alliance/broker-truce;
// sabotage/plant-evidence/blackmail-target/incite-riot — are wired below,
// grouped by their originating Set (SOCIAL_VERBS/RUMOR_VERBS/DIPLOMACY_VERBS/
// SABOTAGE_VERBS), each through a shared per-group handler mirroring
// bribe/intimidate/petition's existing socialVerbHandler shape. No
// resolve*Action switch case changed — every effect these verbs produce was
// already authored and unit-tested; this wave is wiring only.

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
} from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';
import type { DistrictMetrics } from './district-core.js';
import { getDistrictForZone } from './district-core.js';
import type { RumorValence, PlayerRumorState, PlayerRumor } from './player-rumor.js';
import { spawnIntentionalRumor, getPlayerRumorState, setPlayerRumorState, applyRumorManipulation } from './player-rumor.js';
import type { PressureKind } from './pressure-system.js';
import { makePressure, type WorldPressure } from './pressure-system.js';
import { getWorldTickState, getActivePressures, HEAT_KEY } from './world-tick.js';
import {
  getPartyState,
  setPartyState,
  getCompanion,
  adjustCompanionMorale,
  removeCompanion,
  removeCompanionTags,
  refreshCompanionAbilityStatus,
  syncCompanionCustomFields,
} from './companion-core.js';
import { evaluateCompanionReactions, type ReactionTrigger } from './companion-reactions.js';
import { getFactionCognition } from './faction-cognition.js';
// Type-only (F-92dd2068 — the anti-retrofit modifier slot): no behavior
// coupling to npc-agency.ts, just the shape a future wave's
// computeRelationshipModifiers output will pass in.
import type { RelationshipModifiers } from './npc-agency.js';

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
  | 'blackmail-target'
  | 'incite-riot';

export type LeverageCost = Partial<Record<LeverageCurrency, number>>;

export type LeverageRequirement = {
  costs: LeverageCost;
  minimumReputation?: number;
  /**
   * v3.0 wave-3 (menu-social-fix, V3R-MENU-1 — the SEED-0 breach fix): a
   * floor on the actor's OWN accrued `legitimacy` balance, checked the same
   * way/place `minimumReputation` is (BEFORE affordability, in both
   * resolveDiplomacyAction and menu.ts's buildLeverageActions). Optional and
   * unset for every sub-action except 'cash-milestone' today — a no-op for
   * the rest, the same "most entries leave it unset" shape minimumReputation
   * already has.
   */
  minimumLegitimacy?: number;
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

/**
 * v3.0 wave-3 (menu-social-fix, V3R-MENU-1 — the Phase-9-audited SEED-0
 * breach). 'cash-milestone' previously authored `costs: {}` and no
 * `minimumReputation` — a genuinely zero-cost, zero-precondition lever whose
 * ONLY remaining gate (buildLeverageActions, menu.ts) was "a controllingFaction
 * exists on the player's current district," true from the FIRST rendered
 * frame for 6 of 10 starters (gladiator/ronin/vampire/zombie/weird-west/
 * colony all start the player inside a controlled district). A brand-new
 * v3.0 menu row visible to a zero-engagement player on turn 1 is a seed-0
 * byte-identity breach; resolveDiplomacyAction's own switch case compounded
 * it by granting +20 reputation/+10 influence unconditionally, every 5 turns,
 * forever, with no check that any milestone had actually occurred.
 *
 * The fix ties "cash in A MILESTONE" to the one currency
 * computeLeverageGains already grants for a REAL milestone event (+5
 * legitimacy per `milestoneTriggered` hint — see that function below; also
 * earned via 'deny' and a player-resolved pressure) via a `minimumLegitimacy`
 * floor, checked in BOTH buildLeverageActions (menu.ts) and
 * resolveDiplomacyAction below, so the row can neither render nor grant
 * without it. The same amount is then SPENT on success (see the
 * 'cash-milestone' switch case) — "cashing in" consumes the accrued
 * legitimacy rather than leaving it a free, infinitely-repeatable lever once
 * unlocked once.
 */
const CASH_MILESTONE_LEGITIMACY_FLOOR = 15;

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

/**
 * A currency balance for comparisons. NaN guard: `undefined < amount` and
 * `NaN < amount` are both `false`, so a MISSING or NaN balance used to pass
 * the affordability gate (and then poison downstream ratios). A malformed
 * balance reads as 0 — cannot afford.
 */
function balanceOf(state: LeverageState, currency: LeverageCurrency): number {
  const raw = state[currency];
  return Number.isFinite(raw) ? raw : 0;
}

/** Check if the player can afford a leverage cost. */
export function canAfford(state: LeverageState, costs: LeverageCost): boolean {
  for (const [currency, amount] of Object.entries(costs)) {
    if (amount && balanceOf(state, currency as LeverageCurrency) < amount) {
      return false;
    }
  }
  return true;
}

/** Get the first currency that's too low to afford. */
function getShortfall(state: LeverageState, costs: LeverageCost): string | undefined {
  for (const [currency, amount] of Object.entries(costs)) {
    if (amount && balanceOf(state, currency as LeverageCurrency) < amount) {
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
  // v3.0 wave-3 (V3R-MENU-1): costs stays {} — nothing else about this verb's
  // cost shape changes — but minimumLegitimacy now gates BOTH surfacing and
  // resolution (see CASH_MILESTONE_LEGITIMACY_FLOOR's own doc comment above).
  'cash-milestone': { costs: {}, minimumLegitimacy: CASH_MILESTONE_LEGITIMACY_FLOOR, cooldownTurns: 5 },
  'negotiate-access': { costs: { favor: 15, legitimacy: 10 }, minimumReputation: -10, cooldownTurns: 5 },
  'trade-secret': { costs: { blackmail: 15 }, cooldownTurns: 4 },
  'temporary-alliance': { costs: { favor: 25, influence: 20 }, minimumReputation: 0, cooldownTurns: 8 },
  'broker-truce': { costs: { influence: 30, legitimacy: 15 }, cooldownTurns: 8 },
};

const SABOTAGE_REQUIREMENTS: Record<PlayerSabotageVerb, LeverageRequirement> = {
  'sabotage': { costs: { blackmail: 10 }, cooldownTurns: 4 },
  'plant-evidence': { costs: { blackmail: 20 }, cooldownTurns: 5 },
  'blackmail-target': { costs: { blackmail: 25 }, cooldownTurns: 5 },
  'incite-riot': { costs: { blackmail: 15, influence: 10 }, cooldownTurns: 6 },
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

// --- Relationship Modifiers (F-92dd2068: the anti-retrofit modifier slot) ---
//
// Every resolve*Action below takes an OPTIONAL trailing `modifiers` param.
// Absent (the only case any production caller exercises today —
// createPlayerLeverageCore never threads a real NPC relationship in this
// wave), it defaults to this neutral struct: multiplying any cost by 1.0 and
// applying a 0.0 side-effect chance is a byte-identical no-op, so all 15
// pre-existing resolve*Action unit tests keep passing unchanged. The slot
// exists so a FUTURE wave that wires npc-agency.ts's
// computeRelationshipModifiers into the verb layer only has to pass a value
// in — no resolve*Action signature changes, no retrofit.
const NEUTRAL_MODIFIERS: RelationshipModifiers = {
  costMultiplier: 1.0,
  reputationMultiplier: 1.0,
  rumorHeatMultiplier: 1.0,
  sideEffectChance: 0.0,
};

/**
 * Scale a cost table by costMultiplier, rounding to whole currency units (the
 * authored tables are all integers; a fractional leverage balance would be a
 * new, unauthored concept). multiplier === 1 short-circuits to the ORIGINAL
 * object — not just an equal-valued copy — so the neutral-default path never
 * even allocates, let alone rounds.
 */
function scaleCosts(costs: LeverageCost, multiplier: number): LeverageCost {
  if (multiplier === 1) return costs;
  const scaled: LeverageCost = {};
  for (const [currency, amount] of Object.entries(costs)) {
    if (amount) scaled[currency as LeverageCurrency] = Math.round(amount * multiplier);
  }
  return scaled;
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
  modifiers: RelationshipModifiers = NEUTRAL_MODIFIERS,
): LeverageResolution {
  const req = SOCIAL_REQUIREMENTS[subAction];
  const costs = scaleCosts(req.costs, modifiers.costMultiplier);
  if (!canAfford(leverageState, costs)) {
    const short = getShortfall(leverageState, costs);
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
  for (const [currency, amount] of Object.entries(costs)) {
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
  modifiers: RelationshipModifiers = NEUTRAL_MODIFIERS,
): LeverageResolution {
  const req = RUMOR_REQUIREMENTS[subAction];
  const costs = scaleCosts(req.costs, modifiers.costMultiplier);
  if (!canAfford(leverageState, costs)) {
    const short = getShortfall(leverageState, costs);
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
  for (const [currency, amount] of Object.entries(costs)) {
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
      // Deny effect: reduces confidence of the target rumor. This function is
      // pure (no world/action access), so it cannot look the rumor up itself —
      // the real call site is player-rumor.ts's applyRumorManipulation(world,
      // 'deny', rumorId), invoked by the caller with the rumor id it reads
      // from action.parameters (F-19a23718; a stale comment here previously
      // claimed a non-existent "game.ts" module handled this — no such file
      // exists anywhere in this codebase). 'deny' has no registered verb this
      // wave (F-677e94ad's scope is exactly seed/bribe/intimidate/petition),
      // so applyRumorManipulation is tested directly today, ready for a future
      // wave's verb wrapper to call with a real rumor id.
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
      // Bury effect: accelerates decay of the target rumor. Same real call
      // site as 'deny' above — player-rumor.ts's applyRumorManipulation(world,
      // 'bury-scandal', rumorId) — not a registered verb this wave (F-19a23718;
      // the stale "game.ts" reference is gone from this file).
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
  modifiers: RelationshipModifiers = NEUTRAL_MODIFIERS,
): LeverageResolution {
  const req = DIPLOMACY_REQUIREMENTS[subAction];
  const costs = scaleCosts(req.costs, modifiers.costMultiplier);

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

  // Legitimacy gate (v3.0 wave-3, V3R-MENU-1 — the SEED-0 breach fix): most
  // diplomacy verbs leave minimumLegitimacy unset (undefined), so this is a
  // no-op for them — only 'cash-milestone' authors one today (see
  // CASH_MILESTONE_LEGITIMACY_FLOOR's own doc comment). balanceOf (not a
  // raw property read) so a malformed/missing legitimacy balance reads as 0
  // — cannot afford — the same NaN-safety balanceOf's own doc comment
  // documents for canAfford/getShortfall above.
  if (req.minimumLegitimacy != null && balanceOf(leverageState, 'legitimacy') < req.minimumLegitimacy) {
    return {
      verb: 'diplomacy',
      subAction,
      targetFactionId,
      effects: [],
      narratorHint: '',
      success: false,
      failReason: 'Your legitimacy is too low',
    };
  }

  if (!canAfford(leverageState, costs)) {
    const short = getShortfall(leverageState, costs);
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
  for (const [currency, amount] of Object.entries(costs)) {
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
      // v3.0 wave-3 (V3R-MENU-1): "cashing in" SPENDS the accrued legitimacy
      // the minimumLegitimacy gate above just proved is present — the same
      // amount, so a repeat cash-in needs a freshly re-earned floor rather
      // than remaining a free, infinitely-repeatable lever once unlocked
      // once. Independent of `costs` (which stays {}) so move-advisor.ts's
      // own canAfford-based feasibility scoring — which reads req.costs, not
      // this switch case — is untouched by this wave.
      effects.push({ type: 'leverage', currency: 'legitimacy', delta: -CASH_MILESTONE_LEGITIMACY_FLOOR });
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
  'sabotage', 'plant-evidence', 'blackmail-target', 'incite-riot',
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
  modifiers: RelationshipModifiers = NEUTRAL_MODIFIERS,
): LeverageResolution {
  const req = SABOTAGE_REQUIREMENTS[subAction];
  const costs = scaleCosts(req.costs, modifiers.costMultiplier);
  if (!canAfford(leverageState, costs)) {
    const short = getShortfall(leverageState, costs);
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
  for (const [currency, amount] of Object.entries(costs)) {
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

    case 'incite-riot': {
      effects.push({ type: 'heat', delta: 25 });
      const riotDistrict = targetId;
      if (riotDistrict) {
        effects.push({
          type: 'district-metric',
          districtId: riotDistrict,
          metric: 'stability',
          delta: -10,
        });
      }
      if (targetFactionId) {
        effects.push({ type: 'alert', factionId: targetFactionId, delta: 20 });
        effects.push({ type: 'cohesion', factionId: targetFactionId, delta: -0.15 });
        effects.push({ type: 'reputation', factionId: targetFactionId, delta: -10 });
      }
      narratorHint = 'The streets erupt in fury';
      break;
    }
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
 * Per-turn passive changes: heat decays; the reputation-derived component of
 * influence is reconciled WITHOUT clobbering influence earned or spent through
 * play.
 *
 * Influence has two sources: a reputation-derived floor (`floor(maxRep/2)`) and
 * the amount gained/spent by player actions (recruit-ally, seed rumor, etc.).
 * Earlier this function overwrote `leverage.influence` unconditionally every
 * tick, so any influence the player spent was silently refunded next turn and
 * any influence earned was wiped. We instead track the last-applied reputation
 * baseline in `leverage.influenceRepBase` and apply only the *delta* between the
 * old and new baseline, so the earned/spent component persists across ticks
 * while reputation changes still raise or lower influence proportionally.
 */
const INFLUENCE_REP_BASE_KEY = 'leverage.influenceRepBase';

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

  // Reconcile the reputation-derived component of influence.
  const maxRep = Math.max(0, ...reputations.map((r) => r.value));
  const newRepBase = Math.min(MAX_LEVERAGE, Math.floor(maxRep / 2));

  const hasStoredBase = typeof custom[INFLUENCE_REP_BASE_KEY] === 'number';
  const prevRepBase = hasStoredBase ? (custom[INFLUENCE_REP_BASE_KEY] as number) : 0;

  if (!hasStoredBase) {
    // First reconcile: seed the reputation-derived floor on top of any existing
    // influence the profile already carries.
    result = adjustLeverage(result, 'influence', newRepBase);
  } else if (newRepBase !== prevRepBase) {
    // Apply only the change in the reputation component; the earned/spent
    // portion is preserved (and the clamp in adjustLeverage keeps it in range).
    result = adjustLeverage(result, 'influence', newRepBase - prevRepBase);
  }

  result = { ...result, [INFLUENCE_REP_BASE_KEY]: newRepBase };

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
    gains.blackmail = (gains.blackmail ?? 0) + 5;
  }

  // Reputation change → favor
  if (hints.reputationDelta) {
    if (hints.reputationDelta.delta > 0) {
      gains.favor = 5;
    }
    // Negative rep change → blackmail (you know their secrets from the
    // conflict). Accumulates (F-da82fb75) — a notable kill that ALSO tanks
    // reputation with the victim's faction in the same turn must stack with
    // the xpGained trigger above, not silently overwrite it.
    if (hints.reputationDelta.delta < -10) {
      gains.blackmail = (gains.blackmail ?? 0) + 3;
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

// ---------------------------------------------------------------------------
// The write-wire: createPlayerLeverageCore (F-677e94ad / F-19a23718 / v3.0 w1)
// ---------------------------------------------------------------------------
//
// Everything above this line is pure functions + lookup tables —
// resolveSocial/Rumor/Diplomacy/SabotageAction compute WHAT should happen (a
// LeverageEffect[] + narratorHint). This section is the write-wire: one
// shared handler per originating Set (SOCIAL_VERBS/RUMOR_VERBS/
// DIPLOMACY_VERBS/SABOTAGE_VERBS) plus a thin per-verb wrapper, registering
// ALL 25 authored sub-actions. v1.1 wired exactly four — seed/bribe/
// intimidate/petition — as a deliberately narrow first wave; v3.0 wave 1
// "social-verbs" wires the remaining 21.
//
// Verb-name notes:
//   'petition'      → resolveSocialAction('petition-authority', ...) —
//                      registered as the single word 'petition' (the v1.1
//                      choice, kept as-is) to match this codebase's dominant
//                      player-facing verb style.
//   'recruit-ally'  → registered under its FULL subAction name, NOT a
//                      shortened 'recruit' — companion-core.ts already owns
//                      the verb name 'recruit' for party recruitment;
//                      collapsing to the short form here would silently
//                      shadow it.
//   every other new verb is registered under its literal authored subAction
//                      string (call-in-favor, disguise, stake-claim, deny,
//                      frame, claim-false-credit, bury-scandal, leak-truth,
//                      spread-counter-rumor, request-meeting,
//                      improve-standing, cash-milestone, negotiate-access,
//                      trade-secret, temporary-alliance, broker-truce,
//                      sabotage, plant-evidence, blackmail-target,
//                      incite-riot) — none collide with any verb registered
//                      elsewhere in packages/modules/src.
//
// Each handler: actor exists? → this group's target requirement (social:
// bribe/intimidate/petition/call-in-favor/recruit-ally hard-require a target
// faction — "no target" would be a silent no-op charge, not a smaller version
// of the action, same reasoning the v1.1 header already documented;
// disguise/stake-claim do not, matching seed's "need not be about
// anyone/anywhere in particular" shape — stake-claim's real payload
// (districtId) comes from the actor's OWN zone, not player input; diplomacy
// hard-requires a target faction — resolveDiplomacyAction's targetFactionId
// parameter isn't even optional, it's the type signature's own requirement;
// sabotage never hard-requires one — every sabotage sub-action bakes in an
// UNCONDITIONAL heat effect, so there is no no-op case to guard against;
// deny/bury-scandal hard-require a rumorId instead of a faction) → cooldown
// ready (isCooldownReady/setCooldown, the authored per-sub-action
// cooldownTurns, keyed per cost-group: 'social'/'rumor'/'diplomacy'/
// 'sabotage') → resolve*Action (which itself enforces cost affordability) →
// on success, applyLeverageEffects writes the real state. A 'rumor' effect,
// when present (frame/claim-false-credit/leak-truth/spread-counter-rumor/
// plant-evidence), is split out first and spawned via spawnIntentionalRumor
// instead — same as 'seed' already does — since applyLeverageEffects itself
// deliberately drops 'rumor' effects (see its own doc comment). deny/
// bury-scandal additionally call player-rumor.ts's applyRumorManipulation on
// the rumor id the caller supplies via action.parameters.rumorId. Then —
// party non-empty — dispatches the matching companion-reaction trigger.
//
// Trigger count: all FOUR leverage-* triggers are reachable as of this wave —
// bribe/intimidate/petition/call-in-favor/recruit-ally/disguise/stake-claim
// dispatch 'leverage-social'; seed/deny/frame/claim-false-credit/
// bury-scandal/leak-truth/spread-counter-rumor dispatch 'leverage-rumor'; all
// seven diplomacy verbs dispatch 'leverage-diplomacy' (newly reachable this
// wave — resolveDiplomacyAction's LeverageResolution.verb is always the
// literal 'diplomacy', distinct from resolveSocialAction's 'social'); all
// four sabotage verbs dispatch 'leverage-sabotage' (newly reachable this
// wave — resolveSabotageAction's verb is always 'sabotage'). See
// companion-reactions.ts's REACTION_TRIGGER_STATUS for the flip from 'dark'
// to 'reachable'.

const LEVERAGE_ACTOR_MISSING = 'actor not found';

/** Player-initiated pressure spawn's turns-remaining (petition-authority).
 *  Deliberately its own (smaller) constant rather than reusing
 *  world-tick.ts's CHAIN_TURNS_REMAINING — that constant times a FALLOUT
 *  chain's slow build; a petition is a single overt act the authorities
 *  react to promptly. */
const PETITION_PRESSURE_TURNS_REMAINING = 8;

function numGlobal(world: WorldState, key: string): number {
  const value = world.globals[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function addGlobal(world: WorldState, key: string, delta: number): void {
  world.globals[key] = numGlobal(world, key) + delta;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Reputation merge: authored faction baseline + the accrued delta global —
 * the SAME merge trade-core.ts's sellHandler and world-tick.ts's
 * buildPressureInputs both use, so a leverage action and a sale can never
 * disagree about how a faction feels about the player.
 */
function playerReputationFor(world: WorldState, factionId: string): number {
  return (world.factions?.[factionId]?.reputation ?? 0) + numGlobal(world, `reputation_${factionId}`);
}

/**
 * Translate a resolved LeverageEffect[] into real writes (F-677e94ad). Mirrors
 * world-tick.ts's applyFallout shape: one case per effect type, each landing
 * in the SAME store other systems already read —
 *   - 'leverage'        → adjustLeverage on the actor's custom fields
 *   - 'reputation'      → world.globals.reputation_<factionId>
 *   - 'alert'           → world.globals.faction_alert_<factionId>
 *   - 'heat'            → world.globals[HEAT_KEY] ('player_heat')
 *   - 'district-metric' → world.globals.district_<id>_<metric>
 *   - 'cohesion'        → faction-cognition's per-faction cohesion (0-1 clamp)
 *   - 'pressure'        → makePressure + getWorldTickState(world).pressures,
 *                         respecting the one-active-pressure-per-kind
 *                         invariant world-tick.ts's own chain spawn honors
 *
 * 'rumor' effects are a documented ceiling HERE — deliberately NOT handled by
 * this generic translator. Spawning a PlayerRumor needs district/confidence
 * context this function doesn't have, and the namespace push is the 'seed'
 * verb's own job (F-19a23718); a 'rumor' effect reaching this function is
 * silently dropped — same "rides elsewhere, not this choke point" contract
 * applyFallout documents for its own unwired effect types. 'access' has no
 * wired store anywhere in this codebase yet (accessLevel today is only ever
 * DERIVED on the fly by social-consequence.ts's getReputationConsequence,
 * never persisted) — also an honest ceiling. Neither is ever produced by the
 * 4 wired verbs' resolutions (bribe/intimidate/petition-authority never emit
 * 'rumor'; none of the 4 emit 'access'), so both are documented-unreached
 * branches today, not a silent behavior gap for anything this wave wires.
 *
 * Returns any newly spawned pressures (empty when none) so the caller can
 * emit a matching 'pressure.spawned' event — the same split applyFallout
 * uses (it returns chain pressures; tickWorld does the emitting).
 */
export function applyLeverageEffects(
  world: WorldState,
  actorId: string,
  effects: LeverageEffect[],
  currentTick: number,
): WorldPressure[] {
  const actor = world.entities[actorId];
  const spawned: WorldPressure[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case 'leverage':
        if (actor) {
          actor.custom = adjustLeverage(actor.custom ?? {}, effect.currency, effect.delta);
        }
        break;

      case 'reputation':
        addGlobal(world, `reputation_${effect.factionId}`, effect.delta);
        break;

      case 'alert':
        addGlobal(world, `faction_alert_${effect.factionId}`, effect.delta);
        break;

      case 'heat':
        addGlobal(world, HEAT_KEY, effect.delta);
        break;

      case 'district-metric':
        addGlobal(world, `district_${effect.districtId}_${effect.metric}`, effect.delta);
        break;

      case 'cohesion': {
        const cognition = getFactionCognition(world, effect.factionId);
        cognition.cohesion = clamp01(cognition.cohesion + effect.delta);
        break;
      }

      case 'pressure': {
        // One active pressure per kind — the system-wide invariant
        // world-tick.ts's own chain-spawn merge honors (tickWorld: "if
        // (activeKinds.has(chain.kind)) continue;").
        const alreadyActive = getActivePressures(world).some((p) => p.kind === effect.kind);
        if (alreadyActive) break;
        const state = getWorldTickState(world);
        const pressure = makePressure(
          {
            kind: effect.kind,
            sourceFactionId: effect.sourceFactionId,
            description: effect.description,
            triggeredBy: `player-leverage:${actorId}`,
            urgency: effect.urgency,
            visibility: 'known', // the player did this openly — they know
            turnsRemaining: PETITION_PRESSURE_TURNS_REMAINING,
            potentialOutcomes: [],
            tags: [],
            currentTick,
          },
          world,
        );
        state.pressures.push(pressure);
        spawned.push(pressure);
        break;
      }

      case 'rumor':
      case 'access':
      default:
        break; // documented ceiling — see function doc comment
    }
  }

  return spawned;
}

/**
 * Apply the one matching companion-reaction trigger for a leverage action and
 * return the resulting events for the verb handler's own return array — NOT
 * via engine.store.emitEvent, because VerbHandler is `(action, world) =>
 * ResolvedEvent[]` with no engine/store parameter (core/src/types.ts gives
 * verb handlers world-only access; only world-tick.ts's tickWorld, driven by
 * the CLI with a real Engine in hand, can call engine.store directly). This
 * function reproduces world-tick.ts's applyCompanionReactions body — same
 * evaluateCompanionReactions call from companion-reactions.ts, same
 * morale/departure/ability-status side effects on the SAME party namespace —
 * just returning ResolvedEvent objects for ActionDispatcher.dispatch's own
 * recordEvent loop to stamp, the identical choke point engine.store.emitEvent
 * itself funnels through, so ids/ordering are byte-identical either way.
 *
 * Real production caller retiring 2 of world-tick.ts's 12 "dark" companion-
 * reaction triggers (leverage-social, leverage-rumor) — see this file's
 * header for the honest count on why not all 4 leverage-* keys light up yet.
 */
function dispatchLeverageCompanionReactions(
  action: ActionIntent,
  world: WorldState,
  trigger: ReactionTrigger,
  currentTick: number,
): ResolvedEvent[] {
  let party = getPartyState(world);
  if (party.companions.length === 0) return [];

  const events: ResolvedEvent[] = [];
  let changed = false;

  const reactions = evaluateCompanionReactions(party.companions, trigger, { tick: currentTick });
  for (const reaction of reactions) {
    const companion = getCompanion(party, reaction.npcId);
    if (!companion) continue;

    party = adjustCompanionMorale(party, reaction.npcId, reaction.moraleDelta);
    changed = true;
    const newMorale = getCompanion(party, reaction.npcId)?.morale ?? 0;
    const entityForSync = world.entities[reaction.npcId];
    if (entityForSync) syncCompanionCustomFields(entityForSync, companion.role, newMorale);

    events.push(makeEvent(action, 'companion.reaction', {
      npcId: reaction.npcId,
      trigger: reaction.trigger,
      moraleDelta: reaction.moraleDelta,
      morale: newMorale,
      narratorHint: reaction.narratorHint,
    }, {
      targetIds: [reaction.npcId],
      presentation: { channels: ['narrator'], priority: 'low' },
    }));

    if (reaction.departure) {
      const removal = removeCompanion(party, reaction.npcId);
      party = removal.party;
      const entity = world.entities[reaction.npcId];
      if (entity) removeCompanionTags(entity, companion.role);
      events.push(makeEvent(action, 'companion.departed', {
        npcId: reaction.npcId,
        npcName: entity?.name ?? reaction.npcId,
        role: companion.role,
        reason: reaction.departureReason ?? 'left the party',
      }, {
        targetIds: [reaction.npcId],
        presentation: { channels: ['objective', 'narrator'], priority: 'high' },
      }));
    }
  }

  if (!changed) return events;
  setPartyState(world, party);

  const player = world.entities[world.playerId];
  if (player) {
    const statusEvent = refreshCompanionAbilityStatus(world, party, player, currentTick);
    if (statusEvent) events.push(statusEvent);
  }

  return events;
}

function rejectLeverageAction(action: ActionIntent, reason: string): ResolvedEvent[] {
  return [makeEvent(action, 'action.rejected', { verb: action.verb, reason })];
}

/** Shared shape for all seven resolveSocialAction-backed verbs (bribe,
 *  intimidate, petition-authority, call-in-favor, recruit-ally, disguise,
 *  stake-claim) — all resolve through the SAME 'social' cost/cooldown group.
 *
 *  `options.requireTargetFaction` (default true) preserves the ORIGINAL hard
 *  gate bribe/intimidate/petition-authority always had ("no target is a
 *  structured rejection, not a silent no-op charge") and extends it to
 *  call-in-favor/recruit-ally, whose only meaningful effects are likewise
 *  targetFactionId-gated. disguise (no target usage at all) and stake-claim
 *  (whose primary payload — districtId — comes from the actor's OWN zone, not
 *  player input) pass `false`: a missing target faction there narrows the
 *  action, it doesn't turn it into a no-op charge.
 *
 *  districtId is now ALWAYS derived from the actor's current zone — a no-op
 *  for bribe/intimidate/petition-authority/call-in-favor/recruit-ally (none
 *  of their resolveSocialAction switch cases read targetId) and the real
 *  payload for stake-claim ("wherever you're standing"), the same
 *  zone→district derivation seedHandler already uses for rumor placement. */
function socialVerbHandler(
  action: ActionIntent,
  world: WorldState,
  subAction: PlayerSocialVerb,
  rejectVerbLabel: string,
  options: { requireTargetFaction?: boolean } = {},
): ResolvedEvent[] {
  const requireTargetFaction = options.requireTargetFaction ?? true;
  const actor = world.entities[action.actorId];
  if (!actor) return rejectLeverageAction(action, LEVERAGE_ACTOR_MISSING);

  const targetFactionId = action.targetIds?.[0];
  if (requireTargetFaction && !targetFactionId) {
    return rejectLeverageAction(action, 'no target faction specified');
  }

  const currentTick = action.issuedAtTick;
  const custom = actor.custom ?? {};
  const req = getSocialRequirements(subAction);
  if (!isCooldownReady(custom, 'social', subAction, currentTick, req.cooldownTurns ?? 0)) {
    return rejectLeverageAction(action, `${rejectVerbLabel} is on cooldown`);
  }

  const leverageState = getLeverageState(custom);
  const playerReputation = targetFactionId ? playerReputationFor(world, targetFactionId) : 0;
  const cognition = targetFactionId ? getFactionCognition(world, targetFactionId) : undefined;
  const districtId = actor.zoneId ? getDistrictForZone(world, actor.zoneId) : undefined;

  const resolution = resolveSocialAction(
    subAction,
    districtId,
    targetFactionId,
    leverageState,
    playerReputation,
    cognition ? { alertLevel: cognition.alertLevel, cohesion: cognition.cohesion } : undefined,
    currentTick,
  );
  if (!resolution.success) {
    return rejectLeverageAction(action, resolution.failReason ?? `cannot ${rejectVerbLabel}`);
  }

  const spawnedPressures = applyLeverageEffects(world, action.actorId, resolution.effects, currentTick);
  actor.custom = setCooldown(actor.custom ?? {}, 'social', subAction, currentTick);

  const events: ResolvedEvent[] = [
    makeEvent(action, 'leverage.resolved', {
      verb: 'social',
      subAction,
      actorId: action.actorId,
      targetId: districtId ?? null,
      targetFactionId: targetFactionId ?? null,
      effects: resolution.effects,
      narratorHint: resolution.narratorHint,
    }),
  ];

  for (const pressure of spawnedPressures) {
    events.push(makeEvent(action, 'pressure.spawned', {
      pressureId: pressure.id,
      kind: pressure.kind,
      description: pressure.description,
      urgency: pressure.urgency,
      visibility: pressure.visibility,
      sourceFactionId: pressure.sourceFactionId,
      triggeredBy: pressure.triggeredBy,
    }));
  }

  events.push(...dispatchLeverageCompanionReactions(action, world, 'leverage-social', currentTick));
  return events;
}

function bribeHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return socialVerbHandler(action, world, 'bribe', 'bribe');
}

function intimidateHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return socialVerbHandler(action, world, 'intimidate', 'intimidate');
}

function petitionHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return socialVerbHandler(action, world, 'petition-authority', 'petition');
}

// --- v3.0 wave 1 "social-verbs": the remaining four SOCIAL_VERBS members ---

function callInFavorHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return socialVerbHandler(action, world, 'call-in-favor', 'call-in-favor');
}

function recruitAllyHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return socialVerbHandler(action, world, 'recruit-ally', 'recruit-ally');
}

function disguiseHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return socialVerbHandler(action, world, 'disguise', 'disguise', { requireTargetFaction: false });
}

function stakeClaimHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return socialVerbHandler(action, world, 'stake-claim', 'stake-claim', { requireTargetFaction: false });
}

/**
 * The 'seed' verb (F-677e94ad + F-19a23718): resolves through
 * resolveRumorAction, then splits its effects in two — the mechanical
 * 'leverage' cost goes through applyLeverageEffects like every other verb,
 * but the 'rumor' effect is spawned via player-rumor.ts's
 * spawnIntentionalRumor and pushed into the SAME 'player-rumor' namespace
 * director.ts's RUMORS ABOUT YOU section reads (world.modules['player-rumor']
 * = { rumors: [...] }) — applyLeverageEffects deliberately does not handle
 * 'rumor' effects generically (see its own doc comment).
 */
function seedHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return rejectLeverageAction(action, LEVERAGE_ACTOR_MISSING);

  const targetFactionId = action.targetIds?.[0];
  const claim = typeof action.parameters?.claim === 'string' ? action.parameters.claim : undefined;
  const currentTick = action.issuedAtTick;
  const custom = actor.custom ?? {};

  const req = getRumorRequirements('seed');
  if (!isCooldownReady(custom, 'rumor', 'seed', currentTick, req.cooldownTurns ?? 0)) {
    return rejectLeverageAction(action, 'seed is on cooldown');
  }

  const leverageState = getLeverageState(custom);
  const resolution = resolveRumorAction('seed', targetFactionId, leverageState, currentTick, claim);
  if (!resolution.success) {
    return rejectLeverageAction(action, resolution.failReason ?? 'cannot seed a rumor');
  }

  const rumorEffect = resolution.effects.find(
    (e): e is Extract<LeverageEffect, { type: 'rumor' }> => e.type === 'rumor',
  );
  const mechanicalEffects = resolution.effects.filter((e) => e.type !== 'rumor');

  applyLeverageEffects(world, action.actorId, mechanicalEffects, currentTick);
  actor.custom = setCooldown(actor.custom ?? {}, 'rumor', 'seed', currentTick);

  const events: ResolvedEvent[] = [];

  if (rumorEffect) {
    const districtId = actor.zoneId ? getDistrictForZone(world, actor.zoneId) : undefined;
    const rumor = spawnIntentionalRumor(
      rumorEffect.claim,
      rumorEffect.valence,
      targetFactionId,
      districtId,
      currentTick,
      0.8,
      world,
    );
    const ns = getPlayerRumorState(world);
    setPlayerRumorState(world, { rumors: [...ns.rumors, rumor] });

    events.push(makeEvent(action, 'rumor.seeded', {
      rumorId: rumor.id,
      claim: rumor.claim,
      valence: rumor.valence,
      targetFactionId: targetFactionId ?? null,
      narratorHint: resolution.narratorHint,
    }));
  } else {
    // Defensive only — resolveRumorAction's 'seed' case unconditionally
    // pushes a 'rumor' effect today, so this branch is unreached in
    // practice; kept so a future change to that switch degrades to a
    // structured event instead of silently dropping the action's own record.
    events.push(makeEvent(action, 'leverage.resolved', {
      verb: 'rumor',
      subAction: 'seed',
      actorId: action.actorId,
      targetFactionId: targetFactionId ?? null,
      effects: resolution.effects,
      narratorHint: resolution.narratorHint,
    }));
  }

  events.push(...dispatchLeverageCompanionReactions(action, world, 'leverage-rumor', currentTick));
  return events;
}

// ---------------------------------------------------------------------------
// v3.0 wave 1 "social-verbs": the remaining 21 verbs, grouped by their
// originating Set. No resolve*Action switch case changes below this line —
// only wiring (guard → resolve → apply → cooldown → event → dispatch).
// ---------------------------------------------------------------------------

/**
 * Split a resolution's effects into "mechanical" (applied via
 * applyLeverageEffects) and an optional 'rumor' effect, then spawn that rumor
 * into the SAME player-rumor namespace 'seed' writes to. applyLeverageEffects
 * itself deliberately drops 'rumor' effects (see its own doc comment), so
 * every resolve*Action call that can produce one needs this same extraction
 * seedHandler pioneered. Shared by the rumor-group's spawn verbs
 * (frame/claim-false-credit/leak-truth/spread-counter-rumor, via
 * rumorSpawnVerbHandler below) AND sabotage's 'plant-evidence' — the only
 * sabotage sub-action whose resolution includes a 'rumor' effect; a no-op
 * split for the other three sabotage verbs, whose effects never include one.
 */
function applyLeverageEffectsAndSpawnRumor(
  world: WorldState,
  actorId: string,
  effects: LeverageEffect[],
  currentTick: number,
  originFactionId: string | undefined,
): { spawnedPressures: WorldPressure[]; rumor?: PlayerRumor } {
  const rumorEffect = effects.find(
    (e): e is Extract<LeverageEffect, { type: 'rumor' }> => e.type === 'rumor',
  );
  const mechanicalEffects = effects.filter((e) => e.type !== 'rumor');
  const spawnedPressures = applyLeverageEffects(world, actorId, mechanicalEffects, currentTick);

  if (!rumorEffect) return { spawnedPressures };

  const actor = world.entities[actorId];
  const districtId = actor?.zoneId ? getDistrictForZone(world, actor.zoneId) : undefined;
  const rumor = spawnIntentionalRumor(
    rumorEffect.claim,
    rumorEffect.valence,
    originFactionId,
    districtId,
    currentTick,
    0.8,
    world,
  );
  const ns = getPlayerRumorState(world);
  setPlayerRumorState(world, { rumors: [...ns.rumors, rumor] });

  return { spawnedPressures, rumor };
}

// --- Rumor group: the spawn family (frame/claim-false-credit/leak-truth/
// spread-counter-rumor) — same shape as 'seed', generalized. ---

type RumorSpawnVerb = Exclude<PlayerRumorVerb, 'seed' | 'deny' | 'bury-scandal'>;

/**
 * Shared shape for the resolveRumorAction-backed verbs that (like 'seed')
 * always produce a 'rumor' effect: frame, claim-false-credit, leak-truth,
 * spread-counter-rumor. None require a target faction — every switch case in
 * resolveRumorAction defaults gracefully when it's absent (the same "a rumor
 * need not be about anyone in particular" contract 'seed' already has).
 */
function rumorSpawnVerbHandler(
  action: ActionIntent,
  world: WorldState,
  subAction: RumorSpawnVerb,
): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return rejectLeverageAction(action, LEVERAGE_ACTOR_MISSING);

  const targetFactionId = action.targetIds?.[0];
  const claim = typeof action.parameters?.claim === 'string' ? action.parameters.claim : undefined;
  const currentTick = action.issuedAtTick;
  const custom = actor.custom ?? {};

  const req = getRumorRequirements(subAction);
  if (!isCooldownReady(custom, 'rumor', subAction, currentTick, req.cooldownTurns ?? 0)) {
    return rejectLeverageAction(action, `${subAction} is on cooldown`);
  }

  const leverageState = getLeverageState(custom);
  const resolution = resolveRumorAction(subAction, targetFactionId, leverageState, currentTick, claim);
  if (!resolution.success) {
    return rejectLeverageAction(action, resolution.failReason ?? `cannot ${subAction}`);
  }

  const { rumor } = applyLeverageEffectsAndSpawnRumor(
    world, action.actorId, resolution.effects, currentTick, targetFactionId,
  );
  actor.custom = setCooldown(actor.custom ?? {}, 'rumor', subAction, currentTick);

  const events: ResolvedEvent[] = [];

  if (rumor) {
    events.push(makeEvent(action, 'rumor.seeded', {
      rumorId: rumor.id,
      subAction,
      claim: rumor.claim,
      valence: rumor.valence,
      targetFactionId: targetFactionId ?? null,
      narratorHint: resolution.narratorHint,
    }));
  } else {
    // Defensive only — every RumorSpawnVerb's resolveRumorAction case
    // unconditionally pushes a 'rumor' effect today (frame/claim-false-credit/
    // leak-truth/spread-counter-rumor all default their claim rather than
    // omitting it), so this branch is unreached in practice; kept for the
    // same reason seedHandler keeps its own analogous fallback.
    events.push(makeEvent(action, 'leverage.resolved', {
      verb: 'rumor',
      subAction,
      actorId: action.actorId,
      targetFactionId: targetFactionId ?? null,
      effects: resolution.effects,
      narratorHint: resolution.narratorHint,
    }));
  }

  events.push(...dispatchLeverageCompanionReactions(action, world, 'leverage-rumor', currentTick));
  return events;
}

function frameHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return rumorSpawnVerbHandler(action, world, 'frame');
}

function claimFalseCreditHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return rumorSpawnVerbHandler(action, world, 'claim-false-credit');
}

function leakTruthHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return rumorSpawnVerbHandler(action, world, 'leak-truth');
}

function spreadCounterRumorHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return rumorSpawnVerbHandler(action, world, 'spread-counter-rumor');
}

// --- Rumor group: the manipulation family (deny/bury-scandal) — mutates an
// EXISTING rumor by id instead of spawning a new one. ---

/**
 * Shared shape for deny/bury-scandal: the only two PlayerRumorVerb members
 * whose real effect is mutating an EXISTING rumor by id, not spawning a new
 * one — resolveRumorAction's own case comments point here (F-19a23718): "the
 * real call site is player-rumor.ts's applyRumorManipulation(world, subAction,
 * rumorId), invoked by the caller with the rumor id it reads from
 * action.parameters." A missing rumorId is a structured rejection (the same
 * "not a silent no-op charge" contract bribe's missing target has) — denying
 * or burying nothing isn't a smaller version of the action, it's not the
 * action at all. A rumorId that doesn't match any known rumor (stale/
 * decayed/mistyped) is NOT rejected — applyRumorManipulation's own documented
 * contract is to quietly no-op that case, so the mechanical leverage cost
 * still applies (the player spent the resource attempting it) and the event
 * payload reports `rumorFound: false` rather than pretending the attempt
 * never happened.
 */
function rumorManipulationVerbHandler(
  action: ActionIntent,
  world: WorldState,
  subAction: 'deny' | 'bury-scandal',
): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return rejectLeverageAction(action, LEVERAGE_ACTOR_MISSING);

  const rumorId = typeof action.parameters?.rumorId === 'string' ? action.parameters.rumorId : undefined;
  if (!rumorId) return rejectLeverageAction(action, 'no rumor specified');

  const currentTick = action.issuedAtTick;
  const custom = actor.custom ?? {};
  const req = getRumorRequirements(subAction);
  if (!isCooldownReady(custom, 'rumor', subAction, currentTick, req.cooldownTurns ?? 0)) {
    return rejectLeverageAction(action, `${subAction} is on cooldown`);
  }

  const leverageState = getLeverageState(custom);
  const targetFactionId = action.targetIds?.[0];
  const resolution = resolveRumorAction(subAction, targetFactionId, leverageState, currentTick);
  if (!resolution.success) {
    return rejectLeverageAction(action, resolution.failReason ?? `cannot ${subAction}`);
  }

  applyLeverageEffects(world, action.actorId, resolution.effects, currentTick);
  actor.custom = setCooldown(actor.custom ?? {}, 'rumor', subAction, currentTick);

  const manipulated = applyRumorManipulation(world, subAction, rumorId);

  const events: ResolvedEvent[] = [
    makeEvent(action, 'leverage.resolved', {
      verb: 'rumor',
      subAction,
      actorId: action.actorId,
      targetFactionId: targetFactionId ?? null,
      rumorId,
      rumorFound: manipulated !== undefined,
      effects: resolution.effects,
      narratorHint: resolution.narratorHint,
    }),
  ];

  events.push(...dispatchLeverageCompanionReactions(action, world, 'leverage-rumor', currentTick));
  return events;
}

function denyHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return rumorManipulationVerbHandler(action, world, 'deny');
}

function buryScandalHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return rumorManipulationVerbHandler(action, world, 'bury-scandal');
}

// --- Diplomacy group: all seven resolveDiplomacyAction-backed verbs. ---

/**
 * Shared shape for all seven resolveDiplomacyAction-backed verbs. Unlike
 * resolveSocialAction/resolveSabotageAction, resolveDiplomacyAction's
 * targetFactionId parameter is NON-optional (`string`, not `string |
 * undefined`) — every diplomacy sub-action is inherently about a specific
 * faction relationship, so the target-faction gate here isn't a judgment call
 * the way it was for the social group; it's the type signature's own
 * requirement. Dispatches 'leverage-diplomacy' (newly reachable this wave —
 * see companion-reactions.ts's REACTION_TRIGGER_STATUS).
 */
function diplomacyVerbHandler(
  action: ActionIntent,
  world: WorldState,
  subAction: PlayerDiplomacyVerb,
  rejectVerbLabel: string,
): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return rejectLeverageAction(action, LEVERAGE_ACTOR_MISSING);

  const targetFactionId = action.targetIds?.[0];
  if (!targetFactionId) return rejectLeverageAction(action, 'no target faction specified');

  const currentTick = action.issuedAtTick;
  const custom = actor.custom ?? {};
  const req = getDiplomacyRequirements(subAction);
  if (!isCooldownReady(custom, 'diplomacy', subAction, currentTick, req.cooldownTurns ?? 0)) {
    return rejectLeverageAction(action, `${rejectVerbLabel} is on cooldown`);
  }

  const leverageState = getLeverageState(custom);
  const playerReputation = playerReputationFor(world, targetFactionId);
  const cognition = getFactionCognition(world, targetFactionId);

  const resolution = resolveDiplomacyAction(
    subAction,
    targetFactionId,
    leverageState,
    playerReputation,
    { alertLevel: cognition.alertLevel, cohesion: cognition.cohesion },
    currentTick,
  );
  if (!resolution.success) {
    return rejectLeverageAction(action, resolution.failReason ?? `cannot ${rejectVerbLabel}`);
  }

  const spawnedPressures = applyLeverageEffects(world, action.actorId, resolution.effects, currentTick);
  actor.custom = setCooldown(actor.custom ?? {}, 'diplomacy', subAction, currentTick);

  const events: ResolvedEvent[] = [
    makeEvent(action, 'leverage.resolved', {
      verb: 'diplomacy',
      subAction,
      actorId: action.actorId,
      targetFactionId,
      effects: resolution.effects,
      narratorHint: resolution.narratorHint,
    }),
  ];

  for (const pressure of spawnedPressures) {
    events.push(makeEvent(action, 'pressure.spawned', {
      pressureId: pressure.id,
      kind: pressure.kind,
      description: pressure.description,
      urgency: pressure.urgency,
      visibility: pressure.visibility,
      sourceFactionId: pressure.sourceFactionId,
      triggeredBy: pressure.triggeredBy,
    }));
  }

  events.push(...dispatchLeverageCompanionReactions(action, world, 'leverage-diplomacy', currentTick));
  return events;
}

function requestMeetingHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return diplomacyVerbHandler(action, world, 'request-meeting', 'request-meeting');
}

function improveStandingHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return diplomacyVerbHandler(action, world, 'improve-standing', 'improve-standing');
}

function cashMilestoneHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return diplomacyVerbHandler(action, world, 'cash-milestone', 'cash-milestone');
}

function negotiateAccessHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return diplomacyVerbHandler(action, world, 'negotiate-access', 'negotiate-access');
}

function tradeSecretHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return diplomacyVerbHandler(action, world, 'trade-secret', 'trade-secret');
}

function temporaryAllianceHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return diplomacyVerbHandler(action, world, 'temporary-alliance', 'temporary-alliance');
}

function brokerTruceHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return diplomacyVerbHandler(action, world, 'broker-truce', 'broker-truce');
}

// --- Sabotage group: all four resolveSabotageAction-backed verbs. ---

/**
 * Shared shape for all four resolveSabotageAction-backed verbs. Unlike the
 * social/diplomacy groups, no sabotage sub-action hard-requires a target:
 * every one of them pushes an UNCONDITIONAL 'heat' effect (sabotage always
 * burns heat, targeted or not — an authored fact of SABOTAGE_REQUIREMENTS /
 * the resolveSabotageAction switch, not a decision made here), so there is no
 * "silent no-op charge" case to guard against the way bribe's all-conditional
 * effect list needed. targetId is the district the actor is standing in
 * (derived from the actor's zone, same as stake-claim); targetFactionId is
 * optional (action.targetIds[0]). Dispatches 'leverage-sabotage' (newly
 * reachable this wave — see companion-reactions.ts's REACTION_TRIGGER_STATUS).
 *
 * 'plant-evidence' is the one sabotage sub-action whose resolution includes a
 * 'rumor' effect — applyLeverageEffectsAndSpawnRumor handles that uniformly
 * for all four (a no-op split for the other three, whose effects never
 * include a 'rumor' entry).
 */
function sabotageVerbHandler(
  action: ActionIntent,
  world: WorldState,
  subAction: PlayerSabotageVerb,
  rejectVerbLabel: string,
): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) return rejectLeverageAction(action, LEVERAGE_ACTOR_MISSING);

  const currentTick = action.issuedAtTick;
  const custom = actor.custom ?? {};
  const req = getSabotageRequirements(subAction);
  if (!isCooldownReady(custom, 'sabotage', subAction, currentTick, req.cooldownTurns ?? 0)) {
    return rejectLeverageAction(action, `${rejectVerbLabel} is on cooldown`);
  }

  const leverageState = getLeverageState(custom);
  const targetFactionId = action.targetIds?.[0];
  const districtId = actor.zoneId ? getDistrictForZone(world, actor.zoneId) : undefined;

  const resolution = resolveSabotageAction(
    subAction,
    districtId,
    targetFactionId,
    leverageState,
    currentTick,
  );
  if (!resolution.success) {
    return rejectLeverageAction(action, resolution.failReason ?? `cannot ${rejectVerbLabel}`);
  }

  const { spawnedPressures } = applyLeverageEffectsAndSpawnRumor(
    world, action.actorId, resolution.effects, currentTick, targetFactionId,
  );
  actor.custom = setCooldown(actor.custom ?? {}, 'sabotage', subAction, currentTick);

  const events: ResolvedEvent[] = [
    makeEvent(action, 'leverage.resolved', {
      verb: 'sabotage',
      subAction,
      actorId: action.actorId,
      targetId: districtId ?? null,
      targetFactionId: targetFactionId ?? null,
      effects: resolution.effects,
      narratorHint: resolution.narratorHint,
    }),
  ];

  for (const pressure of spawnedPressures) {
    events.push(makeEvent(action, 'pressure.spawned', {
      pressureId: pressure.id,
      kind: pressure.kind,
      description: pressure.description,
      urgency: pressure.urgency,
      visibility: pressure.visibility,
      sourceFactionId: pressure.sourceFactionId,
      triggeredBy: pressure.triggeredBy,
    }));
  }

  events.push(...dispatchLeverageCompanionReactions(action, world, 'leverage-sabotage', currentTick));
  return events;
}

function sabotageHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return sabotageVerbHandler(action, world, 'sabotage', 'sabotage');
}

function plantEvidenceHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return sabotageVerbHandler(action, world, 'plant-evidence', 'plant-evidence');
}

function blackmailTargetHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return sabotageVerbHandler(action, world, 'blackmail-target', 'blackmail-target');
}

function inciteRiotHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  return sabotageVerbHandler(action, world, 'incite-riot', 'incite-riot');
}

/**
 * The player-leverage module: registers ALL 25 authored leverage verbs (v1.1
 * wired bribe/intimidate/seed/petition; v3.0 wave 1 "social-verbs" wires the
 * remaining 21 — see the write-wire section above) plus the 'player-rumor'
 * persistence namespace default (F-19a23718 — 'seed' is the namespace's
 * original production writer; frame/claim-false-credit/leak-truth/
 * spread-counter-rumor/plant-evidence now also write into it). No config
 * needed — the same "always includable, no author input" shape trade-core.ts
 * and companion-core.ts already have in buildWorldStack.
 */
export function createPlayerLeverageCore(): EngineModule {
  return {
    id: 'player-leverage',
    version: '1.0.0',

    register(ctx) {
      // F-19a23718: { rumors: [] } — the exact shape director.test.ts:287
      // pins and director.ts's RUMORS ABOUT YOU section reads via
      // namespace<{ rumors: unknown }>(world, 'player-rumor').
      ctx.persistence.registerNamespace('player-rumor', { rumors: [] } as PlayerRumorState);

      // Social group (resolveSocialAction / 'social' cost-cooldown key) —
      // dispatches 'leverage-social'.
      ctx.actions.registerVerb('bribe', bribeHandler);
      ctx.actions.registerVerb('intimidate', intimidateHandler);
      ctx.actions.registerVerb('petition', petitionHandler);
      ctx.actions.registerVerb('call-in-favor', callInFavorHandler);
      ctx.actions.registerVerb('recruit-ally', recruitAllyHandler);
      ctx.actions.registerVerb('disguise', disguiseHandler);
      ctx.actions.registerVerb('stake-claim', stakeClaimHandler);

      // Rumor group (resolveRumorAction / 'rumor' cost-cooldown key) —
      // dispatches 'leverage-rumor'.
      ctx.actions.registerVerb('seed', seedHandler);
      ctx.actions.registerVerb('deny', denyHandler);
      ctx.actions.registerVerb('frame', frameHandler);
      ctx.actions.registerVerb('claim-false-credit', claimFalseCreditHandler);
      ctx.actions.registerVerb('bury-scandal', buryScandalHandler);
      ctx.actions.registerVerb('leak-truth', leakTruthHandler);
      ctx.actions.registerVerb('spread-counter-rumor', spreadCounterRumorHandler);

      // Diplomacy group (resolveDiplomacyAction / 'diplomacy' cost-cooldown
      // key) — dispatches 'leverage-diplomacy' (newly reachable this wave).
      ctx.actions.registerVerb('request-meeting', requestMeetingHandler);
      ctx.actions.registerVerb('improve-standing', improveStandingHandler);
      ctx.actions.registerVerb('cash-milestone', cashMilestoneHandler);
      ctx.actions.registerVerb('negotiate-access', negotiateAccessHandler);
      ctx.actions.registerVerb('trade-secret', tradeSecretHandler);
      ctx.actions.registerVerb('temporary-alliance', temporaryAllianceHandler);
      ctx.actions.registerVerb('broker-truce', brokerTruceHandler);

      // Sabotage group (resolveSabotageAction / 'sabotage' cost-cooldown key)
      // — dispatches 'leverage-sabotage' (newly reachable this wave).
      ctx.actions.registerVerb('sabotage', sabotageHandler);
      ctx.actions.registerVerb('plant-evidence', plantEvidenceHandler);
      ctx.actions.registerVerb('blackmail-target', blackmailTargetHandler);
      ctx.actions.registerVerb('incite-riot', inciteRiotHandler);
    },
  };
}

export const playerLeverageCore: EngineModule = createPlayerLeverageCore();
