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
import { getPersistedOpportunities, setPersistedOpportunities, getOpportunityById } from './opportunity-core.js';
import { adjustLeverage, type LeverageCurrency } from './player-leverage.js';
import type { SupplyCategory } from './economy-core.js';
import { getDistrictEconomy, setDistrictEconomy, applyEconomyShift } from './economy-core.js';
import type { ObligationKind, ObligationDirection } from './npc-agency.js';
import type { PressureKind } from './pressure-system.js';
import type { RumorValence } from './player-rumor.js';
import { makeEvent } from './make-event.js';
import { getDistrictForZone } from './district-core.js';
import { HEAT_KEY } from './world-tick.js';
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
 *  - npc-relationship/obligation — no persisted sink anywhere in the engine
 *    today: npc-agency's relationship/obligation ledgers are never persisted
 *    (endgame.ts's own buildEndgameInputs comment says the same). Honest
 *    no-op.
 *  - rumor/materials/milestone-tag/title-trigger/spawn-pressure/spawn-
 *    opportunity — no persisted sink today either (mirrors world-tick.ts's
 *    OWN applyFallout treatment of the identical effect kinds for pressure
 *    fallout — "rides the pressure.expired payload"). Honest no-op; the
 *    verb handler's emitted event payload carries the full effect list
 *    regardless, so nothing is silently lost, only not yet WRITTEN anywhere.
 */
export function applyOpportunityFallout(world: WorldState, actorId: string, fallout: OpportunityFallout): void {
  const actor = world.entities[actorId];
  let party = getPartyState(world);
  const hasParty = party.companions.length > 0;
  let partyChanged = false;

  for (const effect of fallout.effects) {
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
      case 'npc-relationship':
      case 'obligation':
      case 'rumor':
      case 'materials':
      case 'milestone-tag':
      case 'title-trigger':
      case 'spawn-pressure':
      case 'spawn-opportunity':
        break; // no persisted sink today — see doc comment above
      default:
        break;
    }
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
// The state machine's other terminal outcomes (failed/betrayed/expired/
// declined) remain fully authored and handled end-to-end by
// computeOpportunityFallout/applyOpportunityFallout for whatever future
// caller reaches them (proven directly, unit-level, in this file's own
// test — the mechanism doesn't care how a resolutionType arrived). This
// verb reaches exactly 'completed' and 'abandoned' this wave — the same
// "authored but not every outcome is yet reachable" honesty this engine
// already practices elsewhere (world-tick.ts's own 'resolved-by-player'
// resolutionType, e.g., is authored, tested, and unreached in production).
// ---------------------------------------------------------------------------

function reject(action: ActionIntent, reason: string, hint: string, extra?: Record<string, unknown>): ResolvedEvent[] {
  return [makeEvent(action, 'action.rejected', { verb: action.verb, reason, hint, ...extra })];
}

function opportunityHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) {
    return reject(action, 'actor not found', 'Only a live entity in the world can act on an opportunity.');
  }

  const op = action.parameters?.op;
  if (op !== 'accept' && op !== 'complete' && op !== 'abandon') {
    return reject(action, `unknown op '${String(op)}'`, 'opportunity accept|complete|abandon <id>');
  }

  const opportunityId = action.toolId ?? action.targetIds?.[0];
  if (!opportunityId) {
    return reject(action, 'no opportunity specified', 'opportunity accept|complete|abandon <id>');
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

  // complete/abandon both require the opportunity to already be accepted.
  if (opp.status !== 'accepted') {
    return reject(
      action,
      `opportunity is ${opp.status}, not accepted`,
      `Accept it first before you can ${op} it.`,
      { opportunityId },
    );
  }

  const resolutionType: OpportunityResolutionType = op === 'complete' ? 'completed' : 'abandoned';
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

  return [makeEvent(action, `opportunity.${resolutionType}`, {
    opportunityId: opp.id,
    kind: opp.kind,
    title: opp.title,
    summary: fallout.summary,
    effects: fallout.effects,
    ...(fallout.warnings ? { warnings: fallout.warnings } : {}),
  }, {
    presentation: { channels: ['objective', 'narrator'], priority: 'high' },
  })];
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
