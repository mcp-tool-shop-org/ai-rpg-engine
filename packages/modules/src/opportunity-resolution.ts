// opportunity-resolution — structured opportunity resolution + fallout generation
// v1.9: When an opportunity resolves (completed, failed, abandoned, betrayed, expired, declined),
// computeOpportunityFallout() returns structured effects for the product layer to apply.
// Pure functions + types. Mirrors pressure-resolution.ts exactly.
//
// v2.9 (F-f3f2a84c): the resolution LOOP (accept → resolve → consequence).
// createOpportunityCore() is the write-wire — mirrors trade-core.ts's
// createTradeCore 'sell' verb shape: a single EngineModule registering ONE
// verb ('opportunity') plus applyOpportunityFallout, the effect-applier that
// finally writes computeOpportunityFallout's output somewhere real (mirrors
// world-tick.ts's own applyFallout for pressures). Closes the v2.8
// 'companion-morale favor-fallout' honest-skip: computeOpportunityFallout
// has always COMPUTED companion-morale effects (getFavorRequestFallout's
// completed/abandoned/betrayed cases, getEscortFallout's failed case) but
// nothing ever APPLIED them — opportunity-core.ts is "pure functions, no
// module registration" (its own header) and this file had no production
// caller anywhere. applyOpportunityFallout is that caller now. Lives in THIS
// file (not opportunity-core.ts) to keep the dependency graph one-
// directional: this file already imports opportunity-core.ts's pure
// evaluation types; the reverse would be circular.

import type { EngineModule, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { OpportunityKind, OpportunityState } from './opportunity-core.js';
import {
  getPersistedOpportunities,
  setPersistedOpportunities,
  getOpportunityById,
  makeOpportunity,
  deadlineFor,
  MAX_ACTIVE_OPPORTUNITIES,
  isFactionSaturated,
} from './opportunity-core.js';
import { adjustLeverage, type LeverageCurrency } from './player-leverage.js';
import type { SupplyCategory } from './economy-core.js';
import { getDistrictEconomy, setDistrictEconomy, applyEconomyShift } from './economy-core.js';
import type { ObligationKind, ObligationDirection, NpcObligationLedger } from './npc-agency.js';
import {
  createObligation,
  addObligation,
  getPersistedNpcObligations,
  getPersistedNpcProfiles,
  getPersistedNpcLastActions,
  setPersistedNpcState,
  relationshipBaseKey,
  RELATIONSHIP_AXIS_RANGE,
} from './npc-agency.js';
import type { PressureKind } from './pressure-system.js';
import { makePressure } from './pressure-system.js';
import type { RumorValence, PlayerRumor } from './player-rumor.js';
import {
  spawnNpcOriginatedRumor,
  propagateRumor,
  getPlayerRumorState,
  setPlayerRumorState,
} from './player-rumor.js';
import { makeEvent } from './make-event.js';
import { getDistrictForZone } from './district-core.js';
import { grantTitleToEntity } from './player-titles.js';
import { adjustMaterial } from './crafting-core.js';
import { HEAT_KEY, recordMilestone, pushActivePressure, CHAIN_TURNS_REMAINING, resolvePressureByPlayer } from './world-tick.js';
import {
  getPartyState,
  setPartyState,
  getCompanion,
  adjustCompanionMorale,
  syncCompanionCustomFields,
} from './companion-core.js';

// --- Types ---

export type OpportunityResolutionType =
  | 'completed'
  | 'failed'
  | 'abandoned'
  | 'betrayed'
  | 'expired'
  | 'declined';

export type OpportunityFalloutEffect =
  | { type: 'reputation'; factionId: string; delta: number }
  | { type: 'leverage'; currency: LeverageCurrency; delta: number }
  | { type: 'materials'; category: SupplyCategory; quantity: number }
  | { type: 'economy-shift'; districtId: string; category: SupplyCategory; delta: number; cause: string }
  | { type: 'rumor'; claim: string; valence: RumorValence; spreadTo: string[] }
  | { type: 'obligation'; kind: ObligationKind; direction: ObligationDirection; npcId: string; magnitude: number }
  | { type: 'spawn-pressure'; kind: PressureKind; sourceFactionId: string; description: string; urgency: number; tags: string[] }
  | { type: 'spawn-opportunity'; kind: OpportunityKind; sourceNpcId?: string; sourceFactionId?: string; description: string }
  | { type: 'heat'; delta: number }
  | { type: 'alert'; factionId: string; delta: number }
  | { type: 'npc-relationship'; npcId: string; axis: 'trust' | 'fear'; delta: number }
  | { type: 'companion-morale'; npcId: string; delta: number }
  | { type: 'milestone-tag'; tag: string }
  | { type: 'title-trigger'; tag: string };

export type OpportunityResolution = {
  opportunityId: string;
  opportunityKind: OpportunityKind;
  resolutionType: OpportunityResolutionType;
  resolvedAtTick: number;
  /**
   * Who the resolved opportunity came from. OPTIONAL — records written before
   * v3.8 lack both, and every reader tolerates absence.
   *
   * Added because applyOpportunityFallout receives the fallout and NOT the
   * opportunity, so a sink needing to attribute a consequence to its source
   * had nowhere to look. The `rumor` sink is the first: a rumor needs an
   * origin, and misattributing one to the player is exactly the mistake
   * world-tick declined to make when it left its own generic-rumor case
   * unwired ("spawnIntentionalRumor tags source 'player-leverage'").
   */
  sourceNpcId?: string;
  sourceFactionId?: string;
  /**
   * The genre the resolution happened in. OPTIONAL for the same
   * pre-v3.8-record reason as the source fields, and present for the same
   * reason: the `spawn-opportunity` sink mints a real OpportunityState, and
   * every one of those carries a genre.
   */
  genre?: string;
};

export type OpportunityFallout = {
  resolution: OpportunityResolution;
  effects: OpportunityFalloutEffect[];
  /** One-line summary for director mode */
  summary: string;
  /**
   * Structured author signal, present only when `opp.kind` did not match any
   * case in getKindFallout — e.g. a corrupted/schema-drifted save, a
   * hand-built OpportunityState in test/content tooling, or a future
   * OpportunityKind added without updating this switch (F-0e7a14c3). Absent
   * when the kind resolved normally. Mirrors pressure-resolution.ts's
   * PressureFallout.warnings.
   */
  warnings?: string[];
};

export type OpportunityResolutionContext = {
  currentTick: number;
  playerDistrictId?: string;
  genre: string;
};

// --- Main Entry ---

/**
 * Compute structured fallout from a resolved opportunity.
 * Pure function — returns effects for the product layer to apply.
 */
export function computeOpportunityFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  ctx: OpportunityResolutionContext,
): OpportunityFallout {
  const resolution: OpportunityResolution = {
    opportunityId: opp.id,
    opportunityKind: opp.kind,
    resolutionType,
    resolvedAtTick: ctx.currentTick,
    ...(opp.sourceNpcId ? { sourceNpcId: opp.sourceNpcId } : {}),
    ...(opp.sourceFactionId ? { sourceFactionId: opp.sourceFactionId } : {}),
    ...(ctx.genre ? { genre: ctx.genre } : {}),
  };

  const kindEffects = getKindFallout(opp, resolutionType, ctx);
  const effects = kindEffects ?? [];
  const summary = buildFalloutSummary(opp, resolutionType);

  // Loud no-op guard (F-0e7a14c3): an opportunity kind unknown to the switch
  // used to fall through to an implicit `undefined` return, and the first
  // consumer touching `.effects.length`/`.effects.map(...)` threw instead of
  // degrading gracefully. Surface it as a structured warning for the product
  // layer, mirroring pressure-resolution.ts's computeFallout.
  const warnings: string[] = [];
  if (kindEffects === null) {
    warnings.push(
      `opportunity kind '${opp.kind}' has no entry in getKindFallout — ` +
      `resolution '${resolutionType}' produced zero effects. Add a case to ` +
      `getKindFallout (opportunity-resolution.ts) for this kind.`,
    );
  }

  return { resolution, effects, summary, ...(warnings.length > 0 ? { warnings } : {}) };
}

/**
 * What a runner keeps of a supply run they completed.
 *
 * GROUNDED IN WHAT MATERIALS ARE FOR, not picked for feel: every recipe input
 * in crafting-recipes.ts costs 1 or 2 units of a category (repair-weapon is 2
 * components, field-medicine 2 medicine, the modification recipes 1 each). At
 * 2, one completed run buys exactly one repair or one craft — a reward with a
 * use on the round it lands, rather than a number that accumulates toward
 * nothing. `adjustMaterial` clamps the store at 0-50, so a run-heavy session
 * saturates at 25 runs' worth and stops paying, which is the same
 * "saturation is the ceiling, not the goal" posture the district economy takes.
 */
export const SUPPLY_RUN_RUNNERS_CUT = 2;

/**
 * Urgency a CHAINED offer enters at.
 *
 * Matches world-tick's NPC_OPPORTUNITY_URGENCY (0.5) for the same stated
 * reason: the effect carries no urgency signal, so neither caller invents a
 * sharper one. Neutral also keeps the chain out of the relax-valley filter's
 * way — Booth 2009 (see PRESSURE_SUPPRESSION_URGENCY) suppresses UNRELATED
 * side work during a peak, and a chained job arriving at 0.5 is offered, not
 * shouted.
 */
export const CHAINED_OPPORTUNITY_URGENCY = 0.5;

/**
 * Urgency the lapsed-bounty escalation enters at.
 *
 * Deliberately UNDER opportunity-core's PRESSURE_SUPPRESSION_URGENCY (0.7),
 * which is Booth 2009's relax-valley rule: at or above it, the world stops
 * handing out unrelated work. A consequence for missing a deadline that also
 * shuts the offer board would punish one lapse twice — the escalation is meant
 * to be a thing you now have to deal with, not a stop on everything else.
 *
 * 0.55 also sits above HEAT_URGENCY_STEP's reach from a standing start, so it
 * reads as a distinct event rather than as ambient pressure drift.
 */
export const BOUNTY_LAPSE_ESCALATION_URGENCY = 0.55;

// --- Per-Kind Fallout ---

/** Returns the effects for an opportunity kind, or `null` when the kind has no entry at all. */
function getKindFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  ctx: OpportunityResolutionContext,
): OpportunityFalloutEffect[] | null {
  switch (opp.kind) {
    case 'contract': return getContractFallout(opp, resolutionType, ctx);
    case 'favor-request': return getFavorRequestFallout(opp, resolutionType, ctx);
    case 'bounty': return getBountyFallout(opp, resolutionType, ctx);
    case 'supply-run': return getSupplyRunFallout(opp, resolutionType, ctx);
    case 'recovery': return getRecoveryFallout(opp, resolutionType, ctx);
    case 'escort': return getEscortFallout(opp, resolutionType, ctx);
    case 'investigation': return getInvestigationFallout(opp, resolutionType, ctx);
    case 'faction-job': return getFactionJobFallout(opp, resolutionType, ctx);
    default: {
      // Exhaustiveness gate (matches faction-agency.ts's resolveFactionAction
      // pattern): a genuine future OpportunityKind addition fails to compile
      // here until a case is added above; a runtime-only unknown kind (bad
      // save data, hand-built test fixture) falls through to `null`.
      const _exhaustive: never = opp.kind;
      return null;
    }
  }
}

function getContractFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  _ctx: OpportunityResolutionContext,
): OpportunityFalloutEffect[] {
  const effects: OpportunityFalloutEffect[] = [];
  const faction = opp.sourceFactionId;
  const npc = opp.sourceNpcId;

  switch (resolutionType) {
    case 'completed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: 10 });
      effects.push({ type: 'leverage', currency: 'favor', delta: 5 });
      effects.push({ type: 'rumor', claim: `completed a contract for ${faction ?? 'an employer'}`, valence: 'heroic', spreadTo: faction ? [faction] : [] });
      if (npc) effects.push({ type: 'obligation', kind: 'favor', direction: 'npc-owes-player', npcId: npc, magnitude: 3 });
      effects.push({ type: 'milestone-tag', tag: 'contract-completed' });
      break;
    case 'abandoned':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -8 });
      effects.push({ type: 'rumor', claim: `abandoned a contract — unreliable`, valence: 'fearsome', spreadTo: faction ? [faction] : [] });
      effects.push({ type: 'heat', delta: 5 });
      break;
    case 'betrayed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -20 });
      effects.push({ type: 'rumor', claim: `betrayed their employer — not to be trusted`, valence: 'fearsome', spreadTo: faction ? [faction] : [] });
      effects.push({ type: 'heat', delta: 15 });
      if (npc) effects.push({ type: 'obligation', kind: 'betrayed', direction: 'player-owes-npc', npcId: npc, magnitude: 6 });
      if (faction) effects.push({ type: 'spawn-pressure', kind: 'investigation-opened', sourceFactionId: faction, description: `${faction} investigates betrayal of contract`, urgency: 0.6, tags: ['hostile'] });
      break;
    case 'failed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -5 });
      if (npc) effects.push({ type: 'npc-relationship', npcId: npc, axis: 'trust', delta: -15 });
      break;
    case 'expired':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -3 });
      if (npc) effects.push({ type: 'npc-relationship', npcId: npc, axis: 'trust', delta: -10 });
      break;
    case 'declined':
      // Mild — declining is legitimate
      if (opp.urgency >= 0.7 && faction) {
        effects.push({ type: 'reputation', factionId: faction, delta: -3 });
      }
      break;
  }

  return effects;
}

function getFavorRequestFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  _ctx: OpportunityResolutionContext,
): OpportunityFalloutEffect[] {
  const effects: OpportunityFalloutEffect[] = [];
  const npc = opp.sourceNpcId;

  switch (resolutionType) {
    case 'completed':
      effects.push({ type: 'leverage', currency: 'favor', delta: 5 });
      if (npc) {
        effects.push({ type: 'obligation', kind: 'favor', direction: 'npc-owes-player', npcId: npc, magnitude: 4 });
        effects.push({ type: 'npc-relationship', npcId: npc, axis: 'trust', delta: 20 });
      }
      // F-P9-007: 'companion-morale' (here and at this function's other two
      // sites below, plus getEscortFallout's own) IS applied now — this
      // file's own applyOpportunityFallout (F-f3f2a84c) is
      // computeOpportunityFallout's real production caller, writing every
      // companion-morale effect via adjustCompanionMorale + setPartyState. A
      // real completed favor genuinely moves a companion's morale today.
      if (opp.tags.includes('companion')) {
        if (npc) effects.push({ type: 'companion-morale', npcId: npc, delta: 15 });
      }
      break;
    case 'abandoned':
      if (npc) {
        effects.push({ type: 'obligation', kind: 'betrayed', direction: 'player-owes-npc', npcId: npc, magnitude: 3 });
        effects.push({ type: 'npc-relationship', npcId: npc, axis: 'trust', delta: -20 });
      }
      // F-P9-007: same real application as the 'completed' case above.
      if (opp.tags.includes('companion') && npc) {
        effects.push({ type: 'companion-morale', npcId: npc, delta: -15 });
      }
      break;
    case 'betrayed':
      if (npc) {
        effects.push({ type: 'obligation', kind: 'betrayed', direction: 'player-owes-npc', npcId: npc, magnitude: 7 });
        effects.push({ type: 'npc-relationship', npcId: npc, axis: 'trust', delta: -40 });
      }
      effects.push({ type: 'rumor', claim: `betrayed someone who trusted them`, valence: 'fearsome', spreadTo: [] });
      // F-P9-007: same real application — see the 'completed' case's comment above.
      if (opp.tags.includes('companion') && npc) {
        effects.push({ type: 'companion-morale', npcId: npc, delta: -30 });
      }
      break;
    case 'expired':
      if (npc) {
        // Obligation grows if favor wasn't fulfilled
        effects.push({ type: 'obligation', kind: 'debt', direction: 'player-owes-npc', npcId: npc, magnitude: 2 });
        effects.push({ type: 'npc-relationship', npcId: npc, axis: 'trust', delta: -10 });
      }
      break;
    case 'failed':
    case 'declined':
      if (npc) effects.push({ type: 'npc-relationship', npcId: npc, axis: 'trust', delta: -5 });
      break;
  }

  return effects;
}

function getBountyFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  _ctx: OpportunityResolutionContext,
): OpportunityFalloutEffect[] {
  const effects: OpportunityFalloutEffect[] = [];
  const faction = opp.sourceFactionId;

  switch (resolutionType) {
    case 'completed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: 15 });
      effects.push({ type: 'leverage', currency: 'blackmail', delta: 5 });
      effects.push({ type: 'rumor', claim: `collected a bounty — dangerous and effective`, valence: 'fearsome', spreadTo: faction ? [faction] : [] });
      effects.push({ type: 'milestone-tag', tag: 'bounty-collected' });
      break;
    case 'abandoned':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -5 });
      break;
    case 'betrayed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -15 });
      effects.push({ type: 'heat', delta: 10 });
      effects.push({ type: 'rumor', claim: `turned against the bounty issuer`, valence: 'fearsome', spreadTo: faction ? [faction] : [] });
      break;
    case 'failed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -3 });
      effects.push({ type: 'heat', delta: 5 });
      break;
    case 'expired':
      // The advance you took and did nothing with (v3.8). `spawn-pressure`
      // had three authored producers before this and every one sat inside a
      // `betrayed` case — a resolution no shipped path reaches — so FSA-1
      // measured it dead ONE LEVEL EARLIER than a missing sink: not
      // unpersisted, but never announced by any session that could be played.
      //
      // `expired` and not `failed`, and that is the measurement talking: the
      // verb reaches accept|complete|abandon and the tick expires, so `failed`
      // would have reproduced the very defect being fixed.
      //
      // `faction-summons` and not `investigation-opened`, and THAT is the
      // one-active-per-kind guard talking. The first draft used
      // investigation-opened — the kind contract and supply-run already use
      // for broken faith — and a played session showed the escalation refused
      // five times running, because an investigation-opened pressure was
      // already live from the ordinary pressure rules. The guard was right and
      // the kind was wrong: a consequence that lands only when the world
      // happens to be quiet is not a consequence.
      //
      // Summons is also the better reading, and it CHAINS: the issuer calls
      // you in to explain, and evaluatePressureLinkedOpportunities turns a
      // live faction-summons into a `faction-job` — the work that makes it
      // right. You took their money and let the clock run out, so now there is
      // a conversation, and the conversation has a job attached.
      if (faction) {
        effects.push({
          type: 'spawn-pressure',
          kind: 'faction-summons',
          sourceFactionId: faction,
          description: `${faction} summons you to explain the bounty they paid for`,
          urgency: BOUNTY_LAPSE_ESCALATION_URGENCY,
          tags: ['pursuit', 'bounty'],
        });
      }
      break;
    case 'declined':
      break;
  }

  return effects;
}

function getSupplyRunFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  ctx: OpportunityResolutionContext,
): OpportunityFalloutEffect[] {
  const effects: OpportunityFalloutEffect[] = [];
  const faction = opp.sourceFactionId;
  const districtId = opp.linkedDistrictId ?? ctx.playerDistrictId;

  switch (resolutionType) {
    case 'completed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: 10 });
      effects.push({ type: 'leverage', currency: 'legitimacy', delta: 5 });
      // Find the supply category from rewards
      const economyReward = opp.rewards.find((r) => r.type === 'economy-shift');
      if (economyReward && economyReward.type === 'economy-shift') {
        effects.push({ type: 'economy-shift', districtId: economyReward.districtId, category: economyReward.category, delta: economyReward.delta, cause: 'supply-run completed' });
        // The runner's cut (v3.8). `materials` was declared on BOTH this union
        // and OpportunityReward, formatted by formatFalloutEffect, and emitted
        // by nothing anywhere in the engine — FSA-1's producer census found it
        // dead at the vocabulary level, one tier above a missing sink.
        //
        // A supply run is the one kind that already knows which category moved
        // and how much, so it is the honest place for the effect to exist: you
        // sourced the goods, the district gets the shipment, and you keep a
        // little of what passed through your hands.
        effects.push({ type: 'materials', category: economyReward.category, quantity: SUPPLY_RUN_RUNNERS_CUT });
      }
      effects.push({ type: 'rumor', claim: `delivered critical supplies — a reliable runner`, valence: 'heroic', spreadTo: faction ? [faction] : [] });
      break;
    case 'abandoned':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -5 });
      break;
    case 'betrayed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -15 });
      effects.push({ type: 'heat', delta: 10 });
      effects.push({ type: 'rumor', claim: `stole a supply shipment`, valence: 'fearsome', spreadTo: faction ? [faction] : [] });
      if (faction) effects.push({ type: 'spawn-pressure', kind: 'investigation-opened', sourceFactionId: faction, description: `${faction} investigates stolen supplies`, urgency: 0.5, tags: ['hostile'] });
      break;
    case 'expired':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -3 });
      if (districtId) {
        effects.push({ type: 'economy-shift', districtId, category: 'food' as SupplyCategory, delta: -5, cause: 'supply-run expired' });
      }
      break;
    case 'failed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -5 });
      break;
    case 'declined':
      break;
  }

  return effects;
}

function getRecoveryFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  _ctx: OpportunityResolutionContext,
): OpportunityFalloutEffect[] {
  const effects: OpportunityFalloutEffect[] = [];
  const faction = opp.sourceFactionId;

  switch (resolutionType) {
    case 'completed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: 8 });
      effects.push({ type: 'leverage', currency: 'legitimacy', delta: 5 });
      effects.push({ type: 'rumor', claim: `recovered what was lost — resourceful`, valence: 'heroic', spreadTo: faction ? [faction] : [] });
      break;
    case 'abandoned':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -3 });
      break;
    case 'betrayed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -10 });
      effects.push({ type: 'heat', delta: 8 });
      break;
    case 'failed':
    case 'expired':
    case 'declined':
      break;
  }

  return effects;
}

function getEscortFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  _ctx: OpportunityResolutionContext,
): OpportunityFalloutEffect[] {
  const effects: OpportunityFalloutEffect[] = [];
  const faction = opp.sourceFactionId;
  const npc = opp.sourceNpcId;

  switch (resolutionType) {
    case 'completed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: 10 });
      effects.push({ type: 'leverage', currency: 'favor', delta: 5 });
      if (npc) effects.push({ type: 'obligation', kind: 'saved', direction: 'npc-owes-player', npcId: npc, magnitude: 4 });
      break;
    case 'failed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -10 });
      effects.push({ type: 'rumor', claim: `failed to protect their charge — a tragic loss`, valence: 'tragic', spreadTo: faction ? [faction] : [] });
      if (npc) effects.push({ type: 'npc-relationship', npcId: npc, axis: 'trust', delta: -20 });
      // Companion morale hit if escorting a linked NPC — F-P9-007: same real
      // application as getFavorRequestFallout's companion-morale note
      // (applyOpportunityFallout writes it via adjustCompanionMorale). As of
      // v3.0, 'escort' is live-spawnable — evaluateEscortOpportunities produces
      // one on a protective-travel need in a dangerous district — so this
      // 'failed' case is now reachable from real play, not only from a
      // hand-built or imported OpportunityState.
      for (const linkedNpc of opp.linkedNpcIds) {
        effects.push({ type: 'companion-morale', npcId: linkedNpc, delta: -10 });
      }
      break;
    case 'abandoned':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -8 });
      effects.push({ type: 'rumor', claim: `abandoned their escort duty`, valence: 'fearsome', spreadTo: faction ? [faction] : [] });
      break;
    case 'betrayed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -20 });
      effects.push({ type: 'heat', delta: 15 });
      if (npc) effects.push({ type: 'obligation', kind: 'betrayed', direction: 'player-owes-npc', npcId: npc, magnitude: 8 });
      break;
    case 'expired':
    case 'declined':
      break;
  }

  return effects;
}

function getInvestigationFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  _ctx: OpportunityResolutionContext,
): OpportunityFalloutEffect[] {
  const effects: OpportunityFalloutEffect[] = [];
  const faction = opp.sourceFactionId;

  switch (resolutionType) {
    case 'completed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: 10 });
      effects.push({ type: 'leverage', currency: 'blackmail', delta: 8 });
      effects.push({ type: 'rumor', claim: `uncovered hidden information — knows things`, valence: 'mysterious', spreadTo: faction ? [faction] : [] });
      effects.push({ type: 'milestone-tag', tag: 'investigation-completed' });
      // The CHAINED JOB (v3.8). `spawn-opportunity` was the second effect type
      // FSA-1's producer census found dead at the vocabulary level — declared,
      // formatted, emitted nowhere.
      //
      // An investigation that succeeds ends with a NAME, which is the one
      // outcome that self-evidently implies more work: you now know who, and
      // somebody wants that acted on. Chaining it to `bounty` is the only
      // reading where the second job could not have existed without the first
      // — a supply run or a contract would have been available anyway, and
      // chaining to those would just be spawning.
      if (faction) {
        effects.push({
          type: 'spawn-opportunity',
          kind: 'bounty',
          sourceFactionId: faction,
          description: `Act on what the investigation turned up for ${faction}`,
        });
      }
      break;
    case 'abandoned':
      break;
    case 'betrayed':
      effects.push({ type: 'heat', delta: 10 });
      effects.push({ type: 'leverage', currency: 'blackmail', delta: 5 });
      effects.push({ type: 'rumor', claim: `sold investigation findings to the wrong people`, valence: 'fearsome', spreadTo: [] });
      break;
    case 'failed':
      effects.push({ type: 'heat', delta: 5 });
      break;
    case 'expired':
    case 'declined':
      break;
  }

  return effects;
}

function getFactionJobFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  _ctx: OpportunityResolutionContext,
): OpportunityFalloutEffect[] {
  const effects: OpportunityFalloutEffect[] = [];
  const faction = opp.sourceFactionId;

  switch (resolutionType) {
    case 'completed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: 20 });
      effects.push({ type: 'leverage', currency: 'influence', delta: 8 });
      effects.push({ type: 'rumor', claim: `carried out a mission for ${faction ?? 'a powerful faction'}`, valence: 'heroic', spreadTo: faction ? [faction] : [] });
      effects.push({ type: 'milestone-tag', tag: 'faction-mission-completed' });
      effects.push({ type: 'title-trigger', tag: 'faction-operative' });
      break;
    case 'abandoned':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -10 });
      if (faction) effects.push({ type: 'alert', factionId: faction, delta: 10 });
      effects.push({ type: 'rumor', claim: `abandoned a faction mission — unreliable`, valence: 'fearsome', spreadTo: faction ? [faction] : [] });
      break;
    case 'betrayed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -30 });
      if (faction) effects.push({ type: 'alert', factionId: faction, delta: 25 });
      effects.push({ type: 'heat', delta: 20 });
      effects.push({ type: 'rumor', claim: `betrayed a faction — a dangerous enemy`, valence: 'fearsome', spreadTo: faction ? [faction] : [] });
      if (faction) effects.push({ type: 'spawn-pressure', kind: 'bounty-issued', sourceFactionId: faction, description: `${faction} issues a bounty for betrayal`, urgency: 0.8, tags: ['hostile', 'revenge'] });
      break;
    case 'failed':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -8 });
      break;
    case 'expired':
      if (faction) effects.push({ type: 'reputation', factionId: faction, delta: -5 });
      if (faction) effects.push({ type: 'alert', factionId: faction, delta: 5 });
      break;
    case 'declined':
      if (opp.urgency >= 0.7 && faction) {
        effects.push({ type: 'reputation', factionId: faction, delta: -5 });
        effects.push({ type: 'alert', factionId: faction, delta: 5 });
      }
      break;
  }

  return effects;
}

// --- Formatting ---

export function formatOpportunityFalloutForDirector(fallout: OpportunityFallout): string {
  const { resolution, effects, summary } = fallout;
  const parts = [
    `  [${resolution.opportunityId}] ${resolution.opportunityKind} → ${resolution.resolutionType}`,
    `    ${summary}`,
  ];

  if (effects.length > 0) {
    parts.push('    Effects:');
    for (const e of effects) {
      parts.push(`      ${formatFalloutEffect(e)}`);
    }
  }

  return parts.join('\n');
}

export function formatOpportunityFalloutForNarrator(fallout: OpportunityFallout): string {
  return fallout.summary;
}

function formatFalloutEffect(e: OpportunityFalloutEffect): string {
  switch (e.type) {
    case 'reputation': return `${e.delta >= 0 ? '+' : ''}${e.delta} reputation (${e.factionId})`;
    case 'leverage': return `${e.delta >= 0 ? '+' : ''}${e.delta} ${e.currency}`;
    case 'materials': return `+${e.quantity} ${e.category}`;
    case 'economy-shift': return `${e.delta >= 0 ? '+' : ''}${e.delta} ${e.category} in ${e.districtId}`;
    case 'rumor': return `rumor: "${e.claim}" (${e.valence})`;
    case 'obligation': return `${e.direction}: ${e.kind} with ${e.npcId} (${e.magnitude})`;
    case 'spawn-pressure': return `spawns ${e.kind} from ${e.sourceFactionId}`;
    case 'spawn-opportunity': return `spawns ${e.kind} opportunity`;
    case 'heat': return `${e.delta >= 0 ? '+' : ''}${e.delta} heat`;
    case 'alert': return `${e.delta >= 0 ? '+' : ''}${e.delta} alert (${e.factionId})`;
    case 'npc-relationship': return `${e.delta >= 0 ? '+' : ''}${e.delta} ${e.axis} with ${e.npcId}`;
    case 'companion-morale': return `${e.delta >= 0 ? '+' : ''}${e.delta} morale for ${e.npcId}`;
    case 'milestone-tag': return `milestone: ${e.tag}`;
    case 'title-trigger': return `title trigger: ${e.tag}`;
  }
}

// --- Summary ---

function buildFalloutSummary(opp: OpportunityState, resolutionType: OpportunityResolutionType): string {
  const kindLabel = opp.kind.replace('-', ' ');
  switch (resolutionType) {
    case 'completed': return `${kindLabel} "${opp.title}" completed successfully.`;
    case 'failed': return `${kindLabel} "${opp.title}" ended in failure.`;
    case 'abandoned': return `${kindLabel} "${opp.title}" was abandoned.`;
    case 'betrayed': return `${kindLabel} "${opp.title}" was betrayed.`;
    case 'expired': return `${kindLabel} "${opp.title}" expired before resolution.`;
    case 'declined': return `${kindLabel} "${opp.title}" was declined.`;
  }
}

// ---------------------------------------------------------------------------
// Persistence — the resolved-opportunity ledger, world.modules['opportunity-
// core'].resolvedOpportunities. Mirrors world-tick.ts's own
// getResolvedPressures/RESOLVED_PRESSURES_KEPT: non-attaching read, bounded
// ledger, tolerant merge-write that never disturbs opportunity-core.ts's own
// `opportunities` field living in the SAME namespace (see that file's
// getPersistedOpportunities/setPersistedOpportunities doc comment — this is
// the sibling half of that same contract).
// ---------------------------------------------------------------------------

/** Most recent resolved-opportunity fallout records kept (oldest dropped past the cap). */
export const RESOLVED_OPPORTUNITIES_KEPT = 20;

/**
 * Confidence a resolution-sourced rumor enters the world at — the SAME 0.75
 * world-tick's step 5a passes for NPC-originated rumors, because this is that
 * same path. Word of what someone did travels a little softened; the number
 * is not re-derived here so the two callers cannot drift.
 */
export const NPC_RUMOR_CONFIDENCE = 0.75;

type OpportunityCoreNamespace = {
  opportunities?: unknown;
  resolvedOpportunities?: unknown;
};

function peekOpportunityCoreNamespace(world: WorldState): OpportunityCoreNamespace | undefined {
  const ns = world.modules['opportunity-core'];
  return ns && typeof ns === 'object' && !Array.isArray(ns) ? (ns as OpportunityCoreNamespace) : undefined;
}

/**
 * Non-attaching read of the resolved-opportunity fallout ledger — the
 * Director's OPPORTUNITY FALLOUT section reads this same shape. [] when the
 * namespace is absent or malformed; never throws, never attaches.
 */
export function getResolvedOpportunities(world: WorldState): OpportunityFallout[] {
  const value = peekOpportunityCoreNamespace(world)?.resolvedOpportunities;
  return Array.isArray(value)
    ? value.filter((v): v is OpportunityFallout => typeof v === 'object' && v !== null)
    : [];
}

/**
 * Append a fallout record, bounded to RESOLVED_OPPORTUNITIES_KEPT (oldest
 * dropped). Exported (Phase-9 remediation, FIX 2) so world-tick.ts's natural-
 * expiry wire can append to the SAME ledger this file's own 'opportunity'
 * verb writes through — mirrors this file already exporting
 * applyOpportunityFallout for the identical cross-file reuse reason.
 */
export function appendResolvedOpportunity(world: WorldState, fallout: OpportunityFallout): void {
  const existing = peekOpportunityCoreNamespace(world);
  const ledger = getResolvedOpportunities(world);
  ledger.push(fallout);
  if (ledger.length > RESOLVED_OPPORTUNITIES_KEPT) {
    ledger.splice(0, ledger.length - RESOLVED_OPPORTUNITIES_KEPT);
  }
  world.modules['opportunity-core'] = { ...(existing ?? {}), resolvedOpportunities: ledger };
}

// ---------------------------------------------------------------------------
// Fallout application (F-f3f2a84c) — mirrors world-tick.ts's own applyFallout
// for pressures: writes every effect kind that has an established, real sink
// elsewhere in the engine today; kinds with no persisted sink ANYWHERE in the
// engine (documented per-case below) ride the emitted event payload only,
// exactly the same honest-ceiling posture world-tick.ts's own applyFallout
// already takes for the analogous pressure-fallout effect kinds.
// ---------------------------------------------------------------------------

function numGlobal(world: WorldState, key: string): number {
  const value = world.globals[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function addGlobal(world: WorldState, key: string, delta: number): void {
  world.globals[key] = numGlobal(world, key) + delta;
}

/**
 * The player's standing with a faction as every consumer reads it: the
 * authored baseline on `world.factions` plus the accrued global. Both halves
 * matter — packs seed a starting standing (black-flag's Navy at -35) and the
 * global carries everything play has added since.
 */
function currentReputation(world: WorldState, factionId: string): number {
  const authored = world.factions?.[factionId]?.reputation ?? 0;
  return authored + numGlobal(world, `reputation_${factionId}`);
}

/**
 * Apply a resolved opportunity's fallout to real, persisted state. `actorId`
 * is the entity whose leverage currency changes — the resolution verb
 * (opportunityHandler, below) passes action.actorId; world-tick.ts's
 * natural-expiry wire passes world.playerId (opportunities are player-scoped
 * — only the player ever accepts one — so that's the same actor identity,
 * just reached via the tick instead of a submitted action).
 *
 *  - leverage → adjustLeverage on actor.custom (Phase-9 remediation, FIX 1) —
 *    the SAME accessor player-leverage.ts's applyLeverageEffects uses for its
 *    own 'leverage' case. This closes the disconnected-economy gap: every
 *    opportunity kind computes a `{type:'leverage', currency, delta}` reward
 *    on completion (contract/favor-request/bounty/supply-run/recovery/
 *    investigation/faction-job all do), and formatFalloutEffect has always
 *    NARRATED it ("+5 favor") — but until now nothing ever WROTE it, so
 *    player-leverage.ts's four wired verbs (bribe/intimidate/petition/seed),
 *    each gated on an affordable currency balance, had no real production
 *    EARNING path. No-op when actorId resolves to no entity in this world —
 *    mirrors every other actor-gated case below.
 *  - reputation/alert/heat → the SAME globals world-tick.ts's applyFallout
 *    writes (reputation_<factionId>, faction_alert_<factionId>, HEAT_KEY) —
 *    buildPressureInputs' merge and trade-core's own reads pick these up
 *    automatically, no new plumbing needed.
 *  - economy-shift → getDistrictEconomy + applyEconomyShift + setDistrictEconomy,
 *    mirroring trade-core.ts's sell handler exactly.
 *  - companion-morale → REAL adjustCompanionMorale + setPartyState writes —
 *    the v2.8 'companion-morale favor-fallout' honest-skip closes here.
 *    Gated on the party being non-empty (mirrors world-tick.ts's
 *    applyCompanionReactions' own `if (party.companions.length === 0)
 *    return` gate); adjustCompanionMorale is ALSO independently a no-op for
 *    an npcId absent from the party, so this gate is a clarity/cost
 *    optimization, not a correctness requirement.
 *  - milestone-tag → recordMilestone (v3.8 sink #1), world-tick.ts's own
 *    milestone ledger — the SAME store its applyFallout has written the
 *    identical effect type into since v2.x, and the same one the genre spawn
 *    rules' milestone conditions and runLeverageIncomeStep's cursor already
 *    read. Labelled `opportunity:<kind>` beside the pressure side's
 *    `pressure:<kind>`.
 *  - obligation → createObligation + addObligation into npc-agency's persisted
 *    obligation ledgers (v3.8 sink #2), through setPersistedNpcState — the
 *    SAME store world-tick's step 5a writes and four production consumers
 *    already read: arc-detection's endgame scoring, deriveLoyaltyBreakpoint
 *    (via getNetObligationWeight), the Director's PEOPLE section, and
 *    opportunity-core's own obligation rule. Feeds back into the layer that
 *    produced it.
 *  - npc-relationship → the `relations['player-<axis>']` base
 *    deriveNpcRelationship starts from (v3.8 sink #3), clamped at the write to
 *    the range derivation can express. Two packs author this key and nothing
 *    ever wrote it; it feeds the profiles step 5a persists, hence
 *    deriveLoyaltyBreakpoint, hence which offers an NPC makes next.
 *  - rumor → spawnNpcOriginatedRumor + propagateRumor + setPlayerRumorState
 *    (v3.8 sink #4) — the SAME path world-tick step 5a applies for an NPC's
 *    own gossip. No new transport; the playerRumors ceiling world-tick
 *    documents stays closed. Skipped when the opportunity had neither a
 *    source NPC nor a source faction: a rumor about the player still comes
 *    from someone, and inventing an origin (or stamping the player as one) is
 *    the misattribution world-tick declined to make.
 *  - title-trigger → grantTitleToEntity on the actor's own custom record
 *    (v3.8 sink #5), the same flat `prefix.key` idiom player-leverage uses.
 *    Deliberately not a title subsystem: character-creation's build-time
 *    `custom.title` is untouched, and social-consequence's `evolveTitle` is
 *    left unwired because no pack authors the `TitleEvolution[]` it consumes.
 *  - materials → crafting-core's adjustMaterial (v3.8 sink #6), the
 *    `materials.<SupplyCategory>` store on the actor's custom that
 *    getMaterialInventory reads and the craft/repair recipes consume. District
 *    stock is `economy-shift`'s job; conflating the two would make them
 *    redundant.
 *  - spawn-opportunity → makeOpportunity + setPersistedOpportunities (v3.8
 *    sink #7), respecting BOTH of the spawner's own guards: POP-1's
 *    MAX_ACTIVE_OPPORTUNITIES cap, and one live offer per (kind, source)
 *    pair. A chain that could push past the cap would quietly undo the
 *    measured reason that cap exists.
 *  - spawn-pressure → makePressure + pushActivePressure (v3.8 sink #8), into
 *    world-tick's own persisted pressure list, honouring the
 *    one-active-per-kind invariant both other spawners hold.
 *
 * Every one of the fourteen declared effect types now has a persisted sink.
 *
 *    ⚠ CORRECTED v3.8: this list used to justify the obligation/npc-
 *    relationship no-op with "npc-agency's relationship/obligation ledgers are
 *    never persisted". That stopped being true in v3.0, when world-tick's step
 *    5a started writing obligation ledgers to world.modules['npc-agency']
 *    every round. The ledgers ARE persisted and readable
 *    (getPersistedNpcObligations); this file simply never wrote to them. The
 *    stale reason is recorded rather than deleted because it is exactly how a
 *    ceiling outlives the thing that made it one.
 */
export function applyOpportunityFallout(world: WorldState, actorId: string, fallout: OpportunityFallout): void {
  const actor = world.entities[actorId];
  let party = getPartyState(world);
  const hasParty = party.companions.length > 0;
  let partyChanged = false;

  // Read-once / write-once for the obligation ledgers, the same batched-commit
  // shape the party state above uses and world-tick's own runNpcAgencyStep
  // uses for the identical store: N obligation effects cost one read and one
  // write, not N of each. Left undefined until an obligation effect actually
  // appears, so a fallout carrying none never touches npc-agency at all.
  let obligationLedgers: Map<string, NpcObligationLedger> | undefined;
  /** Same read-once/write-once treatment for the rumor list. */
  let rumors: PlayerRumor[] | undefined;
  /** …and for the persisted opportunity list the chain sink appends to. */
  let spawnedOpportunities: OpportunityState[] | undefined;

  for (const effect of fallout.effects) {
    switch (effect.type) {
      case 'leverage':
        if (actor) {
          actor.custom = adjustLeverage(actor.custom ?? {}, effect.currency, effect.delta);
        }
        break;
      case 'reputation': {
        // v3.8 saturation cap, at the REAL payer.
        //
        // ⚠ The first attempt at this put the cap on the offer's `rewards`
        // array, where the reputation is advertised — and measured EXACTLY
        // ZERO change, because `OpportunityReward[]` HAS NO APPLIER. Nothing
        // in the engine pays it: it is read by scoreCandidate (a count),
        // formatOpportunityForDirector (display), and getSupplyRunFallout
        // (which translates one entry into fallout). What actually pays is
        // this switch, off the per-kind fallout. Another advertised-but-
        // unapplied surface, found the same way as the rest of this cycle —
        // by a number that refused to move.
        //
        // Only the UPWARD direction is capped. A penalty must always land: a
        // faction you are made with can still be disappointed in you, and
        // gating that would make standing a ratchet.
        const current = currentReputation(world, effect.factionId);
        if (effect.delta > 0 && isFactionSaturated(current)) break;
        addGlobal(world, `reputation_${effect.factionId}`, effect.delta);
        break;
      }
      case 'alert':
        addGlobal(world, `faction_alert_${effect.factionId}`, effect.delta);
        break;
      case 'heat':
        addGlobal(world, HEAT_KEY, effect.delta);
        break;
      case 'economy-shift': {
        const economy = getDistrictEconomy(world, effect.districtId);
        if (economy) {
          setDistrictEconomy(world, effect.districtId, applyEconomyShift(economy, {
            districtId: effect.districtId,
            category: effect.category,
            delta: effect.delta,
            cause: effect.cause,
          }));
        }
        break;
      }
      case 'companion-morale':
        if (hasParty) {
          party = adjustCompanionMorale(party, effect.npcId, effect.delta);
          partyChanged = true;
        }
        break;
      case 'milestone-tag':
        // v3.8 sink #1. The pressure-side applier (world-tick.ts's own
        // applyFallout) has recorded this exact effect type into this exact
        // ledger since v2.x; the opportunity side announced it and wrote
        // nothing, purely because the array had no exported writer to reach
        // from another file. Same vocabulary, same store, same label shape —
        // `opportunity:<kind>` beside `pressure:<kind>`.
        recordMilestone(world, `opportunity:${fallout.resolution.opportunityKind}`, [effect.tag]);
        break;
      case 'obligation': {
        // v3.8 sink #2, and the first that feeds back into the rules that
        // produced it. npc-agency's obligation ledgers have been persisted
        // every round since v3.0 (world-tick step 5a) and read by four
        // production consumers — arc-detection's endgame scoring,
        // deriveLoyaltyBreakpoint via getNetObligationWeight, the Director's
        // PEOPLE section, and opportunity-core's own obligation rule. Every
        // opportunity that announced a debt or a favor owed wrote to none of
        // them.
        //
        // Gated on the NPC existing in this world, mirroring the `leverage`
        // case's own actor gate above: an obligation toward nobody is not a
        // record, and setPersistedNpcState must never be called for a world
        // with no named NPCs (its own SEED-0 contract).
        if (!world.entities[effect.npcId]) break;
        obligationLedgers ??= getPersistedNpcObligations(world);
        const ledger = obligationLedgers.get(effect.npcId) ?? { obligations: [] };
        obligationLedgers.set(
          effect.npcId,
          addObligation(
            ledger,
            createObligation(
              effect.kind,
              effect.direction,
              effect.npcId,
              // The player is always the counterparty: opportunities are
              // player-scoped (only the player ever accepts one), and both
              // production callers pass the player as actorId. This is the id
              // getNetObligationWeight is queried with downstream.
              actorId,
              effect.magnitude,
              `opportunity:${fallout.resolution.opportunityKind}:${fallout.resolution.resolutionType}`,
              fallout.resolution.resolvedAtTick,
              // Permanent, matching createObligation's own default and the
              // weighty half of npc-agency's own obligations (recruit,
              // betray, protect are all `null`; only the transactional warn
              // and bargain decay). The effect carries no decay signal, and a
              // favor earned by finishing someone's job is not the kind of
              // thing that quietly lapses — same posture world-tick takes
              // when it declines to invent an urgency for an NPC-bargained
              // opportunity.
            ),
          ),
        );
        break;
      }
      case 'npc-relationship': {
        // v3.8 sink #3, and the second feedback loop. deriveNpcRelationship
        // has read `relations['player-trust']` as its trust base since v1.x,
        // and two packs AUTHOR it (starter-fantasy 15, starter-merchant 68) —
        // but nothing in the engine ever WROTE it, so an NPC's disposition
        // toward the player was fixed at whatever the content declared plus
        // whatever cognition inferred. Nine authored fallout sites announced
        // a trust change; none of them moved it.
        //
        // The loop: this base feeds deriveNpcRelationship → the profiles
        // world-tick step 5a persists → deriveLoyaltyBreakpoint →
        // evaluateNpcGoalOpportunities, which only offers work from a
        // favorable or allied NPC. Finishing someone's favour changes what
        // they will ask of you next.
        const npc = world.entities[effect.npcId];
        if (!npc) break;
        const key = relationshipBaseKey(effect.axis);
        const range = RELATIONSHIP_AXIS_RANGE[effect.axis];
        const current = Number(npc.relations?.[key] ?? 0);
        npc.relations = {
          ...(npc.relations ?? {}),
          // Clamped at the WRITE, to the range derivation can express. An
          // unclamped base could sink past -100 and then need six favours to
          // climb back to a number the reader was already flooring anyway.
          [key]: Math.min(range.max, Math.max(range.min, current + effect.delta)),
        };
        break;
      }
      case 'rumor': {
        // v3.8 sink #4. Sixteen authored sites across every kind announce a
        // rumor on resolution — "completed a contract for the guild",
        // "betrayed their employer" — and the word reached nobody.
        //
        // REUSES the NPC-originated path world-tick step 5a already applies
        // (spawnNpcOriginatedRumor + propagateRumor + setPlayerRumorState).
        // No new transport: the playerRumors ceiling world-tick documents in
        // its own header stays closed, and this is deliberately the same door
        // an NPC's gossip goes through, because that is what this is.
        //
        // ORIGIN, not authorship. A rumor about the player still comes from
        // SOMEONE — the person who hired them, or the faction that did. The
        // one thing this must not do is tag the player as the source, which
        // is precisely why world-tick left its own generic-rumor case unwired
        // (spawnIntentionalRumor stamps 'player-leverage'). With neither a
        // source NPC nor a source faction there is no honest origin, so the
        // rumor is skipped rather than invented.
        const originNpcId = fallout.resolution.sourceNpcId ?? fallout.resolution.sourceFactionId;
        if (!originNpcId) break;
        rumors ??= getPlayerRumorState(world).rumors;
        const originEntity = world.entities[originNpcId];
        const originZone = originEntity?.zoneId ?? actor?.zoneId;
        const [firstFaction, ...restFactions] = effect.spreadTo;
        let rumor = spawnNpcOriginatedRumor(
          effect.claim,
          effect.valence,
          // Valence chooses the register: a fearsome claim is an accusation,
          // anything else is talk. Both are members of the same NpcRumorSource
          // vocabulary world-tick already maps onto.
          effect.valence === 'fearsome' ? 'npc-accusation' : 'npc-gossip',
          originNpcId,
          firstFaction ?? fallout.resolution.sourceFactionId,
          originZone ? getDistrictForZone(world, originZone) : undefined,
          fallout.resolution.resolvedAtTick,
          NPC_RUMOR_CONFIDENCE,
          world,
        );
        for (const extraFaction of restFactions) {
          rumor = propagateRumor(rumor, extraFaction);
        }
        rumors = [...rumors, rumor];
        break;
      }
      case 'title-trigger':
        // v3.8 sink #5. `faction-job` completed announces `faction-operative`
        // and the world had nowhere to put it — the same gap the pressure
        // side carries for six more tags, closed in the same commit through
        // the same store (world-tick.ts's applyFallout).
        //
        // Gated on the actor, like `leverage` above: a title belongs to
        // somebody. Grants are first-earned-wins, so the tick answers "when
        // did they become that" rather than "when did it last come up".
        if (actor) grantTitleToEntity(actor, effect.tag, fallout.resolution.resolvedAtTick);
        break;
      case 'materials':
        // v3.8 sink #6. crafting-core already owns exactly this store —
        // `materials.<SupplyCategory>` on the actor's custom record, with
        // getMaterialInventory as its public read and hasMaterials/craft as
        // its consumers. The effect type is keyed by the SAME SupplyCategory,
        // so this is a sink that was waiting to be plugged in rather than one
        // that had to be designed. District stock is the OTHER effect type
        // (`economy-shift`); making this one mean that too would have made
        // the two redundant.
        if (actor) {
          actor.custom = adjustMaterial(actor.custom ?? {}, effect.category, effect.quantity);
        }
        break;
      case 'spawn-opportunity': {
        // v3.8 sink #7. Mirrors world-tick's own runNpcAgencyStep handling of
        // the identically-named NpcEffect, including both guards, because the
        // list being written is the same list.
        spawnedOpportunities ??= getPersistedOpportunities(world);

        // Guard 1 — the CAP. POP-1's measured constant, deliberately kept at 5
        // (Iyengar & Lepper 2000, cited at its definition): a chain that could
        // push past the cap would make "the answer to the player wanting more
        // work is not a longer list" untrue by the back door.
        const live = spawnedOpportunities.filter(
          (o) => o.status === 'available' || o.status === 'accepted',
        );
        if (live.length >= MAX_ACTIVE_OPPORTUNITIES) break;

        // Guard 2 — one live offer per (kind, source) pair, the same dedup
        // evaluateOpportunities applies to its own candidates and world-tick
        // 5a applies to NPC-offered ones.
        const source = effect.sourceNpcId ?? effect.sourceFactionId ?? 'none';
        const pairKey = `${effect.kind}:${source}`;
        if (live.some((o) => `${o.kind}:${o.sourceNpcId ?? o.sourceFactionId ?? 'none'}` === pairKey)) break;

        const zone = actor?.zoneId;
        spawnedOpportunities = [
          ...spawnedOpportunities,
          makeOpportunity({
            kind: effect.kind,
            sourceNpcId: effect.sourceNpcId,
            sourceFactionId: effect.sourceFactionId,
            title: effect.description,
            description: effect.description,
            objectiveDescription: 'Follow the thread this opened.',
            linkedDistrictId: zone ? getDistrictForZone(world, zone) : undefined,
            urgency: CHAINED_OPPORTUNITY_URGENCY,
            // The kind's OWN authored deadline, not an invented one — a
            // chained bounty lapses on the same clock a spawned bounty does.
            turnsRemaining: deadlineFor(effect.kind),
            visibility: 'offered',
            // Empty, and deliberately: the effect carries no concrete amounts,
            // and this file does not invent them. The kind's fallout still
            // pays on resolution — getBountyFallout('completed') is reputation,
            // blackmail leverage, a rumor and a milestone, none of which comes
            // from `rewards`. Same honest scoping world-tick 5a documents for
            // its own minimal spawn.
            rewards: [],
            risks: [],
            genre: fallout.resolution.genre ?? '',
            currentTick: fallout.resolution.resolvedAtTick,
            tags: ['chained', `from:${fallout.resolution.opportunityKind}`],
          }),
        ];
        break;
      }
      case 'spawn-pressure': {
        // v3.8 sink #8, the last one. Writes into world-tick's OWN persisted
        // pressure list — the array `state.pressures` holds and
        // getActivePressures reads — through pushActivePressure, which exists
        // for exactly this reason: the tick reassigns `state.pressures` at the
        // END of its round, so a mid-tick write through the namespace would be
        // silently discarded. See that function's contract.
        //
        // Respects the one-active-per-kind invariant both other spawners hold
        // (applyFallout's chain pressures, runNpcAgencyStep's NPC-triggered
        // ones). Without it a player who lets three bounties lapse would
        // accumulate three identical investigations.
        pushActivePressure(
          world,
          makePressure(
            {
              kind: effect.kind,
              sourceFactionId: effect.sourceFactionId,
              description: effect.description,
              triggeredBy: `opportunity:${fallout.resolution.opportunityId}`,
              urgency: effect.urgency,
              // 'rumored' — fallout is word getting around by nature, the same
              // visibility applyFallout gives its own chain pressures.
              visibility: 'rumored',
              turnsRemaining: CHAIN_TURNS_REMAINING,
              potentialOutcomes: [],
              tags: effect.tags,
              currentTick: fallout.resolution.resolvedAtTick,
              ...(fallout.resolution.sourceNpcId ? { sourceNpcId: fallout.resolution.sourceNpcId } : {}),
            },
            world,
          ),
        );
        break;
      }
      default:
        break;
    }
  }

  if (rumors) setPlayerRumorState(world, { rumors });
  if (spawnedOpportunities) setPersistedOpportunities(world, spawnedOpportunities);

  if (obligationLedgers) {
    // Full-overwrite writer (npc-agency's own contract — no sibling module
    // shares that namespace), so this round's profiles and last-actions are
    // read back and re-supplied unchanged. On a world where step 5a has run,
    // those are this round's real values; on one where it has not, they are
    // [] and step 5a rebuilds them next round regardless.
    setPersistedNpcState(
      world,
      getPersistedNpcProfiles(world),
      getPersistedNpcLastActions(world),
      obligationLedgers,
    );
  }

  if (!partyChanged) return;
  setPartyState(world, party);
  // Keep npc-agency's .custom mirror in sync — its deriveCompanionGoals reads
  // that field directly, not party state (same diligence world-tick.ts's
  // applyCompanionReactions already shows for the identical mirror).
  for (const effect of fallout.effects) {
    if (effect.type !== 'companion-morale') continue;
    const companion = getCompanion(party, effect.npcId);
    const entity = world.entities[effect.npcId];
    if (companion && entity) syncCompanionCustomFields(entity, companion.role, companion.morale);
  }
}

// ---------------------------------------------------------------------------
// The 'opportunity' verb (F-f3f2a84c) — accept → resolve → consequence.
// Mirrors trade-core.ts's createTradeCore 'sell' verb shape: one EngineModule,
// one verb, reject()-then-mutate. action.parameters.op selects the
// transition ({accept | complete | abandon}); the opportunity id is read
// from action.toolId (mirrors trade-core's sell / inventory-core's use — "the
// noun this verb acts on"), falling back to targetIds[0].
//
// v3.8 adds the fourth op: `betray`. It was the last unreachable terminal
// outcome with authored content behind it, and the amount waiting was the
// argument for adding it — SIX obligation sites, THREE rumors, and all THREE
// `spawn-pressure` producers sit inside `betrayed` cases, written across
// several releases and reached by nothing. FSA-1 measured that directly: an
// effect type whose every producer sits on an unreachable resolution is dead
// one level earlier than a missing sink.
//
// Betrayal also unlocks `evaluateObligationOpportunities`, whose gate is
// `player-owes-npc && magnitude >= 4`. Every reachable resolution's debt sat
// below it — expiry writes 2, abandonment 3 — and only betrayal writes 4+
// (6, 7 and 8 across contract, favor-request and escort). That evaluator was
// never missing a sink; its threshold is authored at betrayal tier.
//
// It rejects when there is nobody to betray (a district's own supply run has
// no counterparty), rather than degrading to `abandoned` — a verb that
// quietly does something else is worse than one that says no.
//
// `failed` and `declined` remain authored and unreached, handled end-to-end
// by computeOpportunityFallout/applyOpportunityFallout for whatever future
// caller arrives (proven unit-level in this file's own test — the mechanism
// does not care how a resolutionType arrived). That is the same "authored but
// not every outcome is yet reachable" honesty the engine practises elsewhere,
// now with one fewer entry on the list.
// ---------------------------------------------------------------------------

/** One usage string, so every rejection advertises the same verb surface. */
const OPPORTUNITY_USAGE = 'opportunity accept|complete|abandon|betray <id>';

function reject(action: ActionIntent, reason: string, hint: string, extra?: Record<string, unknown>): ResolvedEvent[] {
  return [makeEvent(action, 'action.rejected', { verb: action.verb, reason, hint, ...extra })];
}

function opportunityHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) {
    return reject(action, 'actor not found', 'Only a live entity in the world can act on an opportunity.');
  }

  const op = action.parameters?.op;
  if (op !== 'accept' && op !== 'complete' && op !== 'abandon' && op !== 'betray') {
    return reject(action, `unknown op '${String(op)}'`, OPPORTUNITY_USAGE);
  }

  const opportunityId = action.toolId ?? action.targetIds?.[0];
  if (!opportunityId) {
    return reject(action, 'no opportunity specified', OPPORTUNITY_USAGE);
  }

  const opportunities = getPersistedOpportunities(world);
  const opp = getOpportunityById(opportunities, opportunityId);
  if (!opp) {
    return reject(action, `opportunity ${opportunityId} not found`, 'Check the OPPORTUNITIES list.', { opportunityId });
  }

  const tick = world.meta.tick;

  if (op === 'accept') {
    if (opp.status !== 'available') {
      return reject(action, `opportunity is ${opp.status}, not available`, 'Only an available opportunity can be accepted.', { opportunityId });
    }
    const updated: OpportunityState = { ...opp, status: 'accepted', acceptedAtTick: tick };
    setPersistedOpportunities(world, opportunities.map((o) => (o.id === opp.id ? updated : o)));
    return [makeEvent(action, 'opportunity.accepted', {
      opportunityId: opp.id,
      kind: opp.kind,
      title: opp.title,
    }, {
      presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
    })];
  }

  // complete/abandon/betray all require the opportunity to already be
  // accepted. Betrayal especially: you cannot sell out a job you never took.
  if (opp.status !== 'accepted') {
    return reject(
      action,
      `opportunity is ${opp.status}, not accepted`,
      `Accept it first before you can ${op} it.`,
      { opportunityId },
    );
  }

  // `betray` needs someone to betray. Abandoning a district's supply run is
  // walking away from work; there is no counterparty to sell out, and the
  // authored betrayal fallout is written entirely in terms of one — the
  // reputation hit, the obligation, the pressure all key off a faction or an
  // NPC. Rejecting is honest where silently degrading to `abandoned` would be
  // a verb that quietly does something else.
  if (op === 'betray' && !opp.sourceFactionId && !opp.sourceNpcId) {
    return reject(
      action,
      'nobody to betray',
      'This work came from the district itself, not from a person or a faction. Abandon it instead.',
      { opportunityId },
    );
  }

  const resolutionType: OpportunityResolutionType =
    op === 'complete' ? 'completed' : op === 'betray' ? 'betrayed' : 'abandoned';
  const resolvedOpp: OpportunityState = { ...opp, status: resolutionType, resolvedAtTick: tick };
  setPersistedOpportunities(world, opportunities.map((o) => (o.id === opp.id ? resolvedOpp : o)));

  const playerDistrictId = opp.linkedDistrictId
    ?? (actor.zoneId ? getDistrictForZone(world, actor.zoneId) : undefined);
  const fallout = computeOpportunityFallout(resolvedOpp, resolutionType, {
    currentTick: tick,
    playerDistrictId,
    genre: opp.genre,
  });
  applyOpportunityFallout(world, action.actorId, fallout);
  appendResolvedOpportunity(world, fallout);

  const events: ResolvedEvent[] = [makeEvent(action, `opportunity.${resolutionType}`, {
    opportunityId: opp.id,
    kind: opp.kind,
    title: opp.title,
    summary: fallout.summary,
    effects: fallout.effects,
    ...(fallout.warnings ? { warnings: fallout.warnings } : {}),
  }, {
    presentation: { channels: ['objective', 'narrator'], priority: 'high' },
  })];

  // F-04dece4f: completing a pressure-linked opportunity is the natural
  // "I dealt with this" mapping — computeFallout(..., 'resolved-by-player')
  // + applyFallout, so bounty-survivor and the other five pressure titles
  // are actually earnable. Abandon/betray leave the pressure to expire.
  if (op === 'complete' && opp.linkedPressureId) {
    const resolved = resolvePressureByPlayer(
      world,
      opp.linkedPressureId,
      tick,
      opp.genre || 'fantasy',
      action,
    );
    if (resolved) {
      events.push(makeEvent(action, 'pressure.resolved', {
        pressureId: resolved.pressure.id,
        kind: resolved.pressure.kind,
        description: resolved.pressure.description,
        urgency: resolved.pressure.urgency,
        visibility: resolved.pressure.visibility,
        sourceFactionId: resolved.pressure.sourceFactionId,
        summary: resolved.fallout.summary,
        resolutionType: resolved.fallout.resolution.resolutionType,
        effects: resolved.fallout.effects,
        ...(resolved.fallout.warnings ? { warnings: resolved.fallout.warnings } : {}),
      }, {
        presentation: { channels: ['narrator'], priority: 'high' },
      }));
      events.push(...resolved.companionEvents);
    }
  }

  return events;
}

/**
 * opportunity-resolution's EngineModule: registers the 'opportunity' verb
 * (accept/complete/abandon) and the 'opportunity-core' persistence namespace
 * default. Lives in THIS file (not opportunity-core.ts) — see file header.
 * Mirrors trade-core.ts's createTradeCore / companion-core.ts's
 * createCompanionCore shape exactly: one verb registration + one namespace
 * default, both inside a single register(ctx) call.
 */
export function createOpportunityCore(): EngineModule {
  return {
    id: 'opportunity-core',
    version: '1.0.0',

    register(ctx) {
      ctx.actions.registerVerb('opportunity', (action, world) => opportunityHandler(action, world));
      ctx.persistence.registerNamespace('opportunity-core', { opportunities: [], resolvedOpportunities: [] });
    },
  };
}

export const opportunityCore: EngineModule = createOpportunityCore();
