// opportunity-resolution — structured opportunity resolution + fallout generation
// v1.9: When an opportunity resolves (completed, failed, abandoned, betrayed, expired, declined),
// computeOpportunityFallout() returns structured effects for the product layer to apply.
// Pure functions + types. Mirrors pressure-resolution.ts exactly.

import type { OpportunityKind, OpportunityState } from './opportunity-core.js';
import type { LeverageCurrency } from './player-leverage.js';
import type { SupplyCategory } from './economy-core.js';
import type { ObligationKind, ObligationDirection } from './npc-agency.js';
import type { PressureKind } from './pressure-system.js';
import type { RumorValence } from './player-rumor.js';

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

  const effects = getKindFallout(opp, resolutionType, ctx);
  const summary = buildFalloutSummary(opp, resolutionType);

  return { resolution, effects, summary };
}

// --- Per-Kind Fallout ---

function getKindFallout(
  opp: OpportunityState,
  resolutionType: OpportunityResolutionType,
  ctx: OpportunityResolutionContext,
): OpportunityFalloutEffect[] {
  switch (opp.kind) {
    case 'contract': return getContractFallout(opp, resolutionType, ctx);
    case 'favor-request': return getFavorRequestFallout(opp, resolutionType, ctx);
    case 'bounty': return getBountyFallout(opp, resolutionType, ctx);
    case 'supply-run': return getSupplyRunFallout(opp, resolutionType, ctx);
    case 'recovery': return getRecoveryFallout(opp, resolutionType, ctx);
    case 'escort': return getEscortFallout(opp, resolutionType, ctx);
    case 'investigation': return getInvestigationFallout(opp, resolutionType, ctx);
    case 'faction-job': return getFactionJobFallout(opp, resolutionType, ctx);
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
      if (opp.tags.includes('companion')) {
        if (npc) effects.push({ type: 'companion-morale', npcId: npc, delta: 15 });
      }
      break;
    case 'abandoned':
      if (npc) {
        effects.push({ type: 'obligation', kind: 'betrayed', direction: 'player-owes-npc', npcId: npc, magnitude: 3 });
        effects.push({ type: 'npc-relationship', npcId: npc, axis: 'trust', delta: -20 });
      }
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
      // Companion morale hit if escorting a linked NPC
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
