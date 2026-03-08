// npc-agency — named NPCs as individual actors with goals, fears, and autonomous actions
// Pure functions. Relationships and goals derived from state (not stored). Deterministic evaluation.
// Actions produce effects through existing systems: cognition, reputation, rumors, pressures.
// Mirrors faction-agency.ts pattern at the individual (meso) level.

import type { WorldState, EntityState, ScalarValue } from '@ai-rpg-engine/core';
import type { RumorValence } from './player-rumor.js';
import type { PressureKind, WorldPressure } from './pressure-system.js';
import {
  getCognition,
  getBelief,
  believes,
  getRecentMemories,
  type CognitionState,
  type Memory,
} from './cognition-core.js';
import { getEntityFaction, getFactionCognition } from './faction-cognition.js';
import { getPressuresForFaction } from './pressure-system.js';
import { getRumorsKnownToFaction, type PlayerRumor } from './player-rumor.js';

// --- Types ---

export type NpcActionVerb =
  | 'warn'
  | 'lie'
  | 'conceal'
  | 'accuse'
  | 'flee'
  | 'bargain'
  | 'recruit'
  | 'betray'
  | 'protect'
  | 'abandon';

export type NpcRelationship = {
  trust: number;    // -100 to 100 (toward player)
  fear: number;     // 0 to 100
  greed: number;    // 0 to 100
  loyalty: number;  // 0 to 100 (to faction, not player)
};

export type NpcGoal = {
  id: string;
  label: string;
  priority: number;   // 0-1, derived from state
  verb: NpcActionVerb;
  targetEntityId?: string;
  reason: string;
};

export type LoyaltyBreakpoint = 'allied' | 'favorable' | 'wavering' | 'hostile' | 'compromised';

export type NpcProfile = {
  npcId: string;
  name: string;
  factionId: string | null;
  goals: NpcGoal[];
  relationship: NpcRelationship;
  breakpoint: LoyaltyBreakpoint;
  dominantAxis: 'trust' | 'fear' | 'greed' | 'loyalty';
  leverageAngle: string;
  knownRumors: string[];
  underPressure: boolean;
};

export type NpcAction = {
  npcId: string;
  verb: NpcActionVerb;
  targetEntityId?: string;
  description: string;
};

export type NpcEffect =
  | { type: 'belief'; entityId: string; subject: string; key: string; value: ScalarValue; confidence: number }
  | { type: 'memory'; entityId: string; memType: string; data: Record<string, ScalarValue> }
  | { type: 'morale'; entityId: string; delta: number }
  | { type: 'suspicion'; entityId: string; delta: number }
  | { type: 'reputation'; factionId: string; delta: number }
  | { type: 'rumor'; claim: string; valence: RumorValence; targetFactionIds: string[] }
  | { type: 'zone-change'; entityId: string; toZoneId: string }
  | { type: 'alert'; factionId: string; delta: number }
  | { type: 'pressure'; kind: PressureKind; sourceFactionId: string; description: string; urgency: number; sourceNpcId?: string }
  | { type: 'obligation'; kind: ObligationKind; direction: ObligationDirection;
      npcId: string; counterpartyId: string; magnitude: number;
      sourceTag: string; decayTurns: number | null }
  | { type: 'npc-rumor'; claim: string; valence: RumorValence;
      sourceEvent: string; originNpcId: string; targetFactionIds: string[] }
  | { type: 'companion-departure'; npcId: string; reason: string };

export type NpcActionResult = {
  action: NpcAction;
  effects: NpcEffect[];
  narratorHint: string;
  dialogueHint?: string;
};

// --- Constants ---

const MAX_GOALS = 3;
const MAX_GLOBAL_ACTIONS = 2;
const BASE_STAGGER_MODULUS = 4;

// --- Named NPC Filter ---

/** An NPC is eligible for agency if it has AI state, is alive, and is tagged 'named'. */
export function isNamedNpc(entity: EntityState, playerId: string): boolean {
  if (entity.id === playerId) return false;
  if (!entity.ai) return false;
  // Must be alive (hp > 0, or no hp stat means alive)
  const hp = entity.resources.hp ?? entity.resources.health;
  if (hp !== undefined && hp <= 0) return false;
  // Must be tagged 'named' or be of type 'npc' with a name
  return entity.tags.includes('named') || (entity.type === 'npc' && entity.name.length > 0);
}

// --- Relationship Derivation ---

/**
 * Derive an NPC's relationship axes toward the player from simulation state.
 * Pure derivation — not stored.
 */
export function deriveNpcRelationship(
  world: WorldState,
  npcId: string,
  playerId: string,
): NpcRelationship {
  const entity = world.entities[npcId];
  const cognition = getCognition(world, npcId);
  const factionId = getEntityFaction(world, npcId);

  // --- Trust ---
  // Base: from entity.relations if set, otherwise neutral
  let trust = 0;
  if (entity?.relations?.['player-trust'] !== undefined) {
    trust = Number(entity.relations['player-trust']);
  }
  // Beliefs about player hostility lower trust
  if (believes(cognition, playerId, 'hostile', true)) {
    trust = Math.min(trust, -40);
  }
  // Recent positive interaction memory boosts trust
  const recentMems = getRecentMemories(cognition, 10, world.meta.tick);
  const helpMemory = recentMems.find(
    (m) => m.type === 'was-helped' && m.data.helperId === playerId,
  );
  if (helpMemory) trust = Math.min(100, trust + 30);
  // Recent attack memory tanks trust
  const attackMemory = recentMems.find(
    (m) => m.type === 'was-attacked' && m.data.attackerId === playerId,
  );
  if (attackMemory) trust = Math.max(-100, trust - 50);

  // --- Fear ---
  let fear = 0;
  // Low morale + combat memories = fear
  if (cognition.morale < 40) {
    fear += Math.floor((40 - cognition.morale) * 1.5);
  }
  // Player is known hostile and nearby
  if (believes(cognition, playerId, 'hostile', true)) {
    const playerEntity = world.entities[playerId];
    if (playerEntity?.zoneId === entity?.zoneId) {
      fear += 30;
    }
  }
  // Recent combat in same zone
  const combatMemory = recentMems.find(
    (m) => m.type === 'heard-combat' || m.type === 'was-attacked',
  );
  if (combatMemory) fear += 20;
  fear = Math.min(100, Math.max(0, fear));

  // --- Greed ---
  let greed = 30; // Base moderate greed
  if (entity?.tags.includes('merchant')) greed = 70;
  if (entity?.tags.includes('thief')) greed = 80;
  if (entity?.tags.includes('guard')) greed = 20;
  if (entity?.tags.includes('noble')) greed = 50;
  // Custom override
  if (entity?.custom?.greed !== undefined) {
    greed = Number(entity.custom.greed);
  }
  greed = Math.min(100, Math.max(0, greed));

  // --- Loyalty (to faction) ---
  let loyalty = 60; // Default moderate loyalty
  if (factionId) {
    const fcog = getFactionCognition(world, factionId);
    // High faction cohesion → higher loyalty
    loyalty = Math.floor(fcog.cohesion * 80 + 20);
    // Low morale erodes loyalty
    if (cognition.morale < 30) {
      loyalty = Math.max(0, loyalty - 20);
    }
  } else {
    loyalty = 0; // No faction = no faction loyalty
  }
  loyalty = Math.min(100, Math.max(0, loyalty));

  return {
    trust: Math.min(100, Math.max(-100, trust)),
    fear,
    greed,
    loyalty,
  };
}

// --- Loyalty Breakpoints ---

/**
 * Derive an NPC's loyalty breakpoint from relationship axes and obligations.
 * Evaluated top-to-bottom — first match wins.
 */
export function deriveLoyaltyBreakpoint(
  rel: NpcRelationship,
  obligations?: NpcObligationLedger,
  playerId?: string,
): LoyaltyBreakpoint {
  const netOblWeight = obligations && playerId
    ? getNetObligationWeight(obligations, playerId)
    : 0;

  // 1. Allied: high trust + loyalty + not in debt to NPC
  if (rel.trust >= 60 && rel.loyalty >= 50 && netOblWeight >= 0) return 'allied';
  // 2. Favorable: moderate trust, low fear/greed
  if (rel.trust >= 30 && rel.fear < 40 && rel.greed < 50) return 'favorable';
  // 3. Compromised: extreme fear or extreme greed with low trust
  if (rel.fear >= 70 || (rel.greed >= 70 && rel.trust < 20)) return 'compromised';
  // 4. Hostile: deep distrust or no loyalty + negative trust
  if (rel.trust <= -30 || (rel.loyalty < 20 && rel.trust < 0)) return 'hostile';
  // 5. Default
  return 'wavering';
}

/**
 * Derive the dominant relationship axis (highest magnitude).
 * Trust uses absolute value for comparison since it ranges -100 to 100.
 */
export function deriveDominantAxis(
  rel: NpcRelationship,
): 'trust' | 'fear' | 'greed' | 'loyalty' {
  const axes: Array<{ axis: 'trust' | 'fear' | 'greed' | 'loyalty'; magnitude: number }> = [
    { axis: 'trust', magnitude: Math.abs(rel.trust) },
    { axis: 'fear', magnitude: rel.fear },
    { axis: 'greed', magnitude: rel.greed },
    { axis: 'loyalty', magnitude: rel.loyalty },
  ];
  axes.sort((a, b) => b.magnitude - a.magnitude);
  return axes[0].axis;
}

const LEVERAGE_ANGLE_TABLE: Record<LoyaltyBreakpoint, string> = {
  allied: 'Reliable ally; may warn of danger',
  favorable: 'Open to deals; responds to respect',
  wavering: 'Unpredictable; watch for shifts',
  hostile: 'Dangerous; expect retaliation',
  compromised: 'Acting under duress; may be leveraged',
};

/**
 * Derive a compact tactical hint about how to interact with this NPC.
 * Keyed by loyalty breakpoint.
 */
export function deriveBestLeverageAngle(breakpoint: LoyaltyBreakpoint): string {
  return LEVERAGE_ANGLE_TABLE[breakpoint];
}

// --- Profile Building ---

/**
 * Build an NPC's agency profile from world state.
 * Goals are derived fresh — not stored.
 */
export function buildNpcProfile(
  world: WorldState,
  npcId: string,
  playerId: string,
  activePressures: WorldPressure[],
  playerRumors?: PlayerRumor[],
  obligations?: NpcObligationLedger,
): NpcProfile {
  const entity = world.entities[npcId];
  const factionId = getEntityFaction(world, npcId);
  const relationship = deriveNpcRelationship(world, npcId, playerId);

  // Gather rumors this NPC knows about
  const knownRumors: string[] = [];
  if (playerRumors && factionId) {
    const factionRumors = getRumorsKnownToFaction(playerRumors, factionId);
    for (const r of factionRumors.slice(0, 5)) {
      knownRumors.push(r.claim);
    }
  }

  // Check if NPC's faction is under pressure
  const underPressure = factionId
    ? getPressuresForFaction(activePressures, factionId).length > 0
    : false;

  const breakpoint = deriveLoyaltyBreakpoint(relationship, obligations, playerId);
  const dominantAxis = deriveDominantAxis(relationship);
  const leverageAngle = deriveBestLeverageAngle(breakpoint);

  const goals = deriveNpcGoals(
    world,
    npcId,
    entity,
    playerId,
    relationship,
    knownRumors,
    underPressure,
    obligations,
    breakpoint,
  );

  // Supply crisis: merchant NPCs prioritize bargaining with shifted urgency
  if (entity.tags.includes('merchant') && activePressures.some((p) => p.kind === 'supply-crisis')) {
    const bargainGoal = goals.find((g) => g.verb === 'bargain');
    if (bargainGoal) {
      bargainGoal.priority = Math.min(1, bargainGoal.priority + 0.25);
      bargainGoal.reason = 'supply crisis — desperate to trade';
    }
  }

  return {
    npcId,
    name: entity.name,
    factionId: factionId ?? null,
    goals,
    relationship,
    breakpoint,
    dominantAxis,
    leverageAngle,
    knownRumors,
    underPressure,
  };
}

function deriveNpcGoals(
  world: WorldState,
  npcId: string,
  entity: EntityState,
  playerId: string,
  rel: NpcRelationship,
  knownRumors: string[],
  underPressure: boolean,
  obligations?: NpcObligationLedger,
  breakpoint?: LoyaltyBreakpoint,
): NpcGoal[] {
  const goals: NpcGoal[] = [];
  const cognition = getCognition(world, npcId);
  const recentMems = getRecentMemories(cognition, 5, world.meta.tick);

  // 1. Immediate threat + high fear → flee
  if (rel.fear > 70) {
    const combatMemory = recentMems.find(
      (m) => m.type === 'was-attacked' || m.type === 'heard-combat',
    );
    if (combatMemory) {
      const zone = world.zones[entity.zoneId ?? ''];
      if (zone?.neighbors.length) {
        goals.push({
          id: `${npcId}-flee`,
          label: 'Escape danger',
          priority: 0.95,
          verb: 'flee',
          reason: 'high fear + recent threat',
        });
      }
    }
  }

  // 2. Player hostile + NPC knows damaging rumors → accuse or betray
  if (rel.trust < -30 && knownRumors.length > 0) {
    if (rel.loyalty > 60) {
      // Loyal to faction, hostile to player → accuse
      goals.push({
        id: `${npcId}-accuse`,
        label: 'Denounce the outsider',
        priority: 0.8,
        verb: 'accuse',
        targetEntityId: playerId,
        reason: 'hostile toward player + has damaging information',
      });
    } else {
      // Low loyalty → might betray faction to player for gain
      if (rel.greed > 50) {
        goals.push({
          id: `${npcId}-betray-faction`,
          label: 'Sell faction secrets',
          priority: 0.7,
          verb: 'betray',
          targetEntityId: playerId,
          reason: 'low faction loyalty + high greed',
        });
      }
    }
  }

  // 3. Player hostile + low trust → conceal or lie
  if (rel.trust < -20 && rel.fear < 50) {
    // Not scared enough to flee, but doesn't trust player
    if (cognition.suspicion > 40) {
      goals.push({
        id: `${npcId}-conceal`,
        label: 'Hide information',
        priority: 0.6,
        verb: 'conceal',
        reason: 'suspicious of player + low trust',
      });
    } else {
      goals.push({
        id: `${npcId}-lie`,
        label: 'Mislead the outsider',
        priority: 0.55,
        verb: 'lie',
        targetEntityId: playerId,
        reason: 'hostile to player + protecting interests',
      });
    }
  }

  // 4. Player friendly + faction under pressure → warn
  if (rel.trust > 20 && underPressure) {
    goals.push({
      id: `${npcId}-warn`,
      label: 'Warn an ally',
      priority: 0.75,
      verb: 'warn',
      targetEntityId: playerId,
      reason: 'trusts player + faction under pressure',
    });
  }

  // 5. High greed + player present → bargain
  if (rel.greed > 60) {
    const playerEntity = world.entities[playerId];
    if (playerEntity?.zoneId === entity.zoneId) {
      goals.push({
        id: `${npcId}-bargain`,
        label: 'Strike a deal',
        priority: 0.5 + (rel.greed - 60) * 0.01,
        verb: 'bargain',
        targetEntityId: playerId,
        reason: 'high greed + opportunity',
      });
    }
  }

  // 6. Low faction loyalty + player is powerful/friendly → recruit (defect)
  if (rel.loyalty < 30 && rel.trust > 10 && rel.fear < 40) {
    goals.push({
      id: `${npcId}-recruit`,
      label: 'Seek new allegiance',
      priority: 0.45,
      verb: 'recruit',
      targetEntityId: playerId,
      reason: 'low faction loyalty + player is viable alternative',
    });
  }

  // 7. Faction directive conflict + high loyalty → betray player
  if (rel.loyalty > 70 && rel.trust > 0 && underPressure) {
    // Loyal faction member under pressure — might turn on player despite trust
    goals.push({
      id: `${npcId}-betray-player`,
      label: 'Follow faction orders',
      priority: 0.65,
      verb: 'betray',
      targetEntityId: playerId,
      reason: 'high faction loyalty overrides personal trust',
    });
  }

  // Obligation-influenced priority adjustments
  if (obligations) {
    const netWeight = getNetObligationWeight(obligations, playerId);

    // NPC owes player significantly → boost warn, suppress hostile goals
    if (netWeight >= 3) {
      for (const g of goals) {
        if (g.verb === 'warn') g.priority = Math.min(1, g.priority + 0.15);
        if (g.verb === 'accuse' || g.verb === 'betray') g.priority = Math.max(0, g.priority - 0.2);
      }
    }

    // Player owes NPC → boost bargain
    if (netWeight <= -3) {
      for (const g of goals) {
        if (g.verb === 'bargain') g.priority = Math.min(1, g.priority + 0.15);
      }
    }

    // NPC was betrayed by player → boost accuse/betray, suppress warn
    const betrayalCount = obligations.obligations.filter(
      (o) => o.kind === 'betrayed' && o.counterpartyId === playerId,
    ).length;
    if (betrayalCount > 0) {
      for (const g of goals) {
        if (g.verb === 'accuse' || g.verb === 'betray') g.priority = Math.min(1, g.priority + 0.1 * betrayalCount);
        if (g.verb === 'warn') g.priority = Math.max(0, g.priority - 0.2);
      }
    }
  }

  // Breakpoint-based goal gating
  if (breakpoint) {
    for (const g of goals) {
      switch (breakpoint) {
        case 'allied':
          // Allied NPCs never accuse or betray the player
          if (g.verb === 'accuse' || g.verb === 'betray') g.priority = 0;
          break;
        case 'hostile':
          // Hostile NPCs won't warn or recruit for the player
          if (g.verb === 'warn' || g.verb === 'recruit') g.priority = 0;
          if (g.verb === 'accuse') g.priority = Math.min(1, g.priority + 0.1);
          break;
        case 'compromised':
          // Compromised NPCs conceal more, warn less
          if (g.verb === 'conceal') g.priority = Math.min(1, g.priority + 0.2);
          if (g.verb === 'warn') g.priority = Math.max(0, g.priority - 0.1);
          break;
      }
    }
  }

  // Companion-specific goals: if entity is tagged 'companion', add protect/abandon
  if (entity?.tags.includes('companion')) {
    const companionGoals = deriveCompanionGoals(world, npcId, entity, playerId, rel, breakpoint);
    goals.push(...companionGoals);

    // Companions with allied/favorable suppress accuse, betray, flee entirely
    if (breakpoint === 'allied' || breakpoint === 'favorable') {
      for (const g of goals) {
        if (g.verb === 'accuse' || g.verb === 'betray' || g.verb === 'flee') {
          g.priority = 0;
        }
      }
    }
    // Companions with hostile suppress protect, warn
    if (breakpoint === 'hostile') {
      for (const g of goals) {
        if (g.verb === 'protect' || g.verb === 'warn') {
          g.priority = 0;
        }
      }
    }
  }

  // Sort by priority descending, take top MAX_GOALS
  goals.sort((a, b) => b.priority - a.priority);
  return goals.slice(0, MAX_GOALS);
}

// --- Companion Goal Derivation ---

/**
 * Derive companion-specific goals. Called for NPCs tagged 'companion'.
 * Adds protect (fighter shields player) and abandon (morale collapse).
 */
function deriveCompanionGoals(
  world: WorldState,
  npcId: string,
  entity: EntityState,
  playerId: string,
  rel: NpcRelationship,
  breakpoint?: LoyaltyBreakpoint,
): NpcGoal[] {
  const goals: NpcGoal[] = [];
  const playerEntity = world.entities[playerId];
  const companionRole = (entity.custom?.companionRole as string) ?? 'fighter';

  // Protect: fighter companions shield low-HP player
  if (companionRole === 'fighter' && playerEntity) {
    const playerHp = playerEntity.resources.hp ?? 0;
    const playerMaxHp = playerEntity.resources.maxHp ?? playerEntity.stats.vigor ?? 10;
    if (playerMaxHp > 0 && playerHp / playerMaxHp < 0.3) {
      goals.push({
        id: `${npcId}-protect`,
        label: 'Shield the player',
        priority: 0.9,
        verb: 'protect',
        targetEntityId: playerId,
        reason: 'player HP critical + fighter role',
      });
    }
  }

  // Boosted warn priority for companions (loyalty to player)
  if (rel.trust > 0) {
    goals.push({
      id: `${npcId}-companion-warn`,
      label: 'Alert the group',
      priority: 0.7,
      verb: 'warn',
      targetEntityId: playerId,
      reason: 'companion loyalty to player',
    });
  }

  // Abandon: companion morale too low (read from custom field set by product layer)
  const companionMorale = Number(entity.custom?.companionMorale ?? 50);
  if (companionMorale < 20 || breakpoint === 'hostile') {
    goals.push({
      id: `${npcId}-abandon`,
      label: 'Leave the party',
      priority: companionMorale < 10 ? 0.95 : 0.6,
      verb: 'abandon',
      targetEntityId: playerId,
      reason: breakpoint === 'hostile' ? 'hostile toward player' : 'morale too low to continue',
    });
  }

  return goals;
}

// --- Action Evaluation ---

/**
 * Deterministic action selection. Each NPC evaluates on staggered turns.
 * Returns at most maxGlobal actions per turn.
 */
export function evaluateNpcActions(
  profiles: NpcProfile[],
  currentTick: number,
  maxGlobal = MAX_GLOBAL_ACTIONS,
): NpcAction[] {
  const actions: NpcAction[] = [];

  for (const profile of profiles) {
    if (actions.length >= maxGlobal) break;
    if (profile.goals.length === 0) continue;

    // Stagger: deterministic hash of npcId + tick
    const hash = simpleHash(profile.npcId + currentTick);
    const modulus = getStaggerModulus(profile);
    if (hash % modulus !== 0) continue;

    // Top-priority goal becomes the action
    const goal = profile.goals[0];

    actions.push({
      npcId: profile.npcId,
      verb: goal.verb,
      targetEntityId: goal.targetEntityId,
      description: buildActionDescription(profile.name, goal),
    });
  }

  return actions;
}

/** NPCs under pressure or with high fear act more frequently. */
function getStaggerModulus(profile: NpcProfile): number {
  let mod = BASE_STAGGER_MODULUS;
  if (profile.underPressure) mod -= 1;
  if (profile.relationship.fear > 60) mod -= 1;
  return Math.max(2, mod);
}

function buildActionDescription(npcName: string, goal: NpcGoal): string {
  switch (goal.verb) {
    case 'warn': return `${npcName} tries to warn someone of danger`;
    case 'lie': return `${npcName} deliberately misleads`;
    case 'conceal': return `${npcName} hides information`;
    case 'accuse': return `${npcName} publicly accuses the outsider`;
    case 'flee': return `${npcName} flees the area`;
    case 'bargain': return `${npcName} proposes a deal`;
    case 'recruit': return `${npcName} seeks a new allegiance`;
    case 'betray': return `${npcName} betrays a trust`;
    case 'protect': return `${npcName} moves to shield an ally`;
    case 'abandon': return `${npcName} decides to leave`;
  }
}

// --- Action Resolution ---

/**
 * Resolve an NPC action into concrete effects.
 * Lookup table — each verb produces a fixed set of effects.
 */
export function resolveNpcAction(
  action: NpcAction,
  world: WorldState,
): NpcActionResult {
  const effects: NpcEffect[] = [];
  let narratorHint = '';
  let dialogueHint: string | undefined;
  const npc = world.entities[action.npcId];
  const npcName = npc?.name ?? action.npcId;
  const factionId = getEntityFaction(world, action.npcId);

  switch (action.verb) {
    case 'warn':
      // NPC warns the player — player gains awareness
      if (action.targetEntityId) {
        effects.push({
          type: 'belief',
          entityId: action.targetEntityId,
          subject: action.npcId,
          key: 'warned-player',
          value: true,
          confidence: 0.9,
        });
      }
      effects.push({
        type: 'memory',
        entityId: action.npcId,
        memType: 'warned-ally',
        data: { targetId: action.targetEntityId ?? '' },
      });
      // Obligation: NPC did the player a favor by warning
      if (action.targetEntityId) {
        effects.push({
          type: 'obligation', kind: 'favor', direction: 'npc-owes-player',
          npcId: action.npcId, counterpartyId: action.targetEntityId,
          magnitude: 2, sourceTag: 'warn', decayTurns: 20,
        });
      }
      // NPC warning leaves a social trace
      if (factionId) {
        effects.push({
          type: 'npc-rumor',
          claim: `danger stirring — ${npcName} knows something`,
          valence: 'mysterious',
          sourceEvent: 'npc-warning',
          originNpcId: action.npcId,
          targetFactionIds: [factionId],
        });
      }
      narratorHint = `${npcName} glances around nervously, wanting to speak`;
      dialogueHint = 'urgent, checking if overheard';
      break;

    case 'lie':
      // NPC gives false information — player gets wrong belief
      if (action.targetEntityId) {
        effects.push({
          type: 'belief',
          entityId: action.targetEntityId,
          subject: action.npcId,
          key: 'gave-info',
          value: 'misleading',
          confidence: 0.7,
        });
      }
      effects.push({
        type: 'memory',
        entityId: action.npcId,
        memType: 'told-lie',
        data: { targetId: action.targetEntityId ?? '' },
      });
      // Guilt slightly lowers morale
      effects.push({ type: 'morale', entityId: action.npcId, delta: -5 });
      narratorHint = `${npcName} answers a bit too smoothly`;
      dialogueHint = 'giving wrong info confidently, subtle tells';
      break;

    case 'conceal':
      // NPC hides something — suspicion increases if noticed
      effects.push({
        type: 'suspicion',
        entityId: action.npcId,
        delta: 10,
      });
      effects.push({
        type: 'memory',
        entityId: action.npcId,
        memType: 'concealed-info',
        data: {},
      });
      // NPC concealment spawns rumor only if suspicion is already high
      {
        const cog = getCognition(world, action.npcId);
        if (cog.suspicion > 50) {
          effects.push({
            type: 'npc-rumor',
            claim: `someone hiding something in ${npc?.zoneId ?? 'the area'}`,
            valence: 'mysterious',
            sourceEvent: 'npc-concealment',
            originNpcId: action.npcId,
            targetFactionIds: factionId ? [factionId] : [],
          });
        }
      }
      narratorHint = `${npcName} seems to be hiding something`;
      dialogueHint = 'evasive, deflecting, changing subject';
      break;

    case 'accuse':
      // NPC publicly accuses the player — reputation hit, faction alert
      if (factionId) {
        effects.push({ type: 'reputation', factionId, delta: -10 });
        effects.push({ type: 'alert', factionId, delta: 15 });
        effects.push({
          type: 'pressure',
          kind: 'investigation-opened',
          sourceFactionId: factionId,
          description: `${npcName} has accused the outsider publicly`,
          urgency: 0.5,
          sourceNpcId: action.npcId,
        });
      }
      effects.push({
        type: 'memory',
        entityId: action.npcId,
        memType: 'accused-player',
        data: { targetId: action.targetEntityId ?? '' },
      });
      // Accusation spawns NPC-originated rumor
      effects.push({
        type: 'npc-rumor',
        claim: `${npcName} denounced the outsider publicly`,
        valence: 'fearsome',
        sourceEvent: 'npc-accusation',
        originNpcId: action.npcId,
        targetFactionIds: factionId ? [factionId] : [],
      });
      narratorHint = `${npcName} points an accusing finger`;
      dialogueHint = 'confrontational, demanding answers';
      break;

    case 'flee':
      // NPC leaves the zone
      if (npc?.zoneId) {
        const zone = world.zones[npc.zoneId];
        const exitZone = zone?.neighbors[0];
        if (exitZone) {
          effects.push({
            type: 'zone-change',
            entityId: action.npcId,
            toZoneId: exitZone,
          });
        }
      }
      effects.push({
        type: 'memory',
        entityId: action.npcId,
        memType: 'fled-zone',
        data: { fromZoneId: npc?.zoneId ?? '' },
      });
      narratorHint = `${npcName} hurries away`;
      break;

    case 'bargain':
      // NPC proposes a deal — opens negotiation
      effects.push({
        type: 'belief',
        entityId: action.npcId,
        subject: action.targetEntityId ?? '',
        key: 'offered-deal',
        value: true,
        confidence: 0.9,
      });
      effects.push({
        type: 'memory',
        entityId: action.npcId,
        memType: 'proposed-deal',
        data: { targetId: action.targetEntityId ?? '' },
      });
      // Obligation: player now owes the NPC for the deal
      if (action.targetEntityId) {
        effects.push({
          type: 'obligation', kind: 'debt', direction: 'player-owes-npc',
          npcId: action.npcId, counterpartyId: action.targetEntityId,
          magnitude: 3, sourceTag: 'bargain', decayTurns: 15,
        });
      }
      narratorHint = `${npcName} leans in with a proposition`;
      dialogueHint = 'transactional, naming a price';
      break;

    case 'recruit':
      // NPC signals willingness to defect — faction alert if discovered
      effects.push({
        type: 'belief',
        entityId: action.npcId,
        subject: action.targetEntityId ?? '',
        key: 'seeking-allegiance',
        value: true,
        confidence: 0.8,
      });
      if (factionId) {
        effects.push({ type: 'alert', factionId, delta: 5 });
      }
      effects.push({
        type: 'memory',
        entityId: action.npcId,
        memType: 'sought-defection',
        data: { targetId: action.targetEntityId ?? '' },
      });
      // Obligation: NPC invested in recruiting player
      if (action.targetEntityId) {
        effects.push({
          type: 'obligation', kind: 'favor', direction: 'npc-owes-player',
          npcId: action.npcId, counterpartyId: action.targetEntityId,
          magnitude: 4, sourceTag: 'recruit', decayTurns: null,
        });
      }
      narratorHint = `${npcName} seems to be weighing loyalties`;
      dialogueHint = 'hushed, testing the waters, gauging reaction';
      break;

    case 'betray':
      // NPC betrays — reputation swing, NPC-originated rumor, pressure
      if (factionId) {
        effects.push({ type: 'reputation', factionId, delta: -15 });
        effects.push({
          type: 'npc-rumor',
          claim: `${npcName} broke faith`,
          valence: 'fearsome',
          sourceEvent: 'npc-betrayal',
          originNpcId: action.npcId,
          targetFactionIds: [factionId],
        });
        effects.push({
          type: 'pressure',
          kind: 'faction-summons',
          sourceFactionId: factionId,
          description: `${npcName}'s betrayal has destabilized ${factionId}`,
          urgency: 0.7,
          sourceNpcId: action.npcId,
        });
      }
      effects.push({
        type: 'memory',
        entityId: action.npcId,
        memType: 'committed-betrayal',
        data: { targetId: action.targetEntityId ?? '' },
      });
      effects.push({ type: 'morale', entityId: action.npcId, delta: -15 });
      // Obligation: permanent betrayal scar
      if (action.targetEntityId) {
        effects.push({
          type: 'obligation', kind: 'betrayed', direction: 'player-owes-npc',
          npcId: action.npcId, counterpartyId: action.targetEntityId,
          magnitude: 5, sourceTag: 'betray', decayTurns: null,
        });
      }
      narratorHint = `Something shifts in ${npcName}'s eyes`;
      dialogueHint = 'hushed, euphemistic, conflicted';
      break;

    case 'protect':
      // Companion moves to shield the player
      effects.push({
        type: 'memory',
        entityId: action.npcId,
        memType: 'protected-ally',
        data: { targetId: action.targetEntityId ?? '' },
      });
      // Obligation: player owes the companion for protection
      if (action.targetEntityId) {
        effects.push({
          type: 'obligation', kind: 'saved', direction: 'npc-owes-player',
          npcId: action.npcId, counterpartyId: action.targetEntityId,
          magnitude: 3, sourceTag: 'protect', decayTurns: null,
        });
      }
      narratorHint = `${npcName} steps forward, ready to defend`;
      break;

    case 'abandon':
      // Companion decides to leave the party
      effects.push({
        type: 'companion-departure',
        npcId: action.npcId,
        reason: 'morale too low',
      });
      effects.push({
        type: 'memory',
        entityId: action.npcId,
        memType: 'abandoned-party',
        data: { targetId: action.targetEntityId ?? '' },
      });
      narratorHint = `${npcName} turns away with finality`;
      dialogueHint = 'bitter, disappointed, or resigned';
      break;
  }

  return { action, effects, narratorHint, dialogueHint };
}

// --- Convenience Wrapper ---

/**
 * Run one full NPC agency tick.
 * Filters named NPCs → builds profiles → evaluates (staggered) → resolves.
 * Returns results for the product layer to apply.
 */
export function runNpcAgencyTick(
  world: WorldState,
  playerId: string,
  activePressures: WorldPressure[],
  currentTick: number,
  playerRumors?: PlayerRumor[],
  npcObligations?: Map<string, NpcObligationLedger>,
): NpcActionResult[] {
  // Build profiles for all named NPCs
  const profiles: NpcProfile[] = [];
  for (const entity of Object.values(world.entities)) {
    if (!isNamedNpc(entity, playerId)) continue;
    const obligations = npcObligations?.get(entity.id);
    const profile = buildNpcProfile(world, entity.id, playerId, activePressures, playerRumors, obligations);
    profiles.push(profile);
  }

  if (profiles.length === 0) return [];

  // Evaluate which NPCs act this turn (staggered, max 2 global)
  const actions = evaluateNpcActions(profiles, currentTick);

  // Resolve each action
  return actions.map((action) => resolveNpcAction(action, world));
}

/**
 * Build profiles for all named NPCs without evaluating actions.
 * Used for director views even when no actions are taken.
 */
export function buildAllNpcProfiles(
  world: WorldState,
  playerId: string,
  activePressures: WorldPressure[],
  playerRumors?: PlayerRumor[],
  npcObligations?: Map<string, NpcObligationLedger>,
): NpcProfile[] {
  const profiles: NpcProfile[] = [];
  for (const entity of Object.values(world.entities)) {
    if (!isNamedNpc(entity, playerId)) continue;
    const obligations = npcObligations?.get(entity.id);
    profiles.push(buildNpcProfile(world, entity.id, playerId, activePressures, playerRumors, obligations));
  }
  return profiles;
}

// --- Formatting ---

const DIVIDER = '─'.repeat(60);

function formatRelationship(rel: NpcRelationship): string {
  const parts: string[] = [];
  parts.push(`Trust: ${rel.trust > 0 ? '+' : ''}${rel.trust}`);
  parts.push(`Fear: ${rel.fear}`);
  parts.push(`Greed: ${rel.greed}`);
  parts.push(`Loyalty: ${rel.loyalty}`);
  return parts.join(' | ');
}

/** Derive stance label from relationship. Now delegates to loyalty breakpoint. */
function deriveStanceLabel(rel: NpcRelationship): string {
  return deriveLoyaltyBreakpoint(rel);
}

/** Format a single NPC profile for director /npc view. */
export function formatNpcProfileForDirector(
  profile: NpcProfile,
  lastAction?: NpcActionResult,
  obligations?: NpcObligationLedger,
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(DIVIDER);
  lines.push(`  NPC AGENCY — ${profile.name}`);
  lines.push(DIVIDER);
  lines.push('');
  lines.push(`  ID: ${profile.npcId}`);
  lines.push(`  Faction: ${profile.factionId ?? '(independent)'}`);
  lines.push(`  Stance: ${deriveStanceLabel(profile.relationship)}`);
  lines.push(`  Breakpoint: ${profile.breakpoint} | Dominant: ${profile.dominantAxis} | Angle: "${profile.leverageAngle}"`);
  lines.push(`  ${formatRelationship(profile.relationship)}`);
  lines.push(`  Under pressure: ${profile.underPressure ? 'yes' : 'no'}`);
  lines.push('');

  if (profile.goals.length > 0) {
    lines.push('  Goals:');
    for (const goal of profile.goals) {
      const pct = (goal.priority * 100).toFixed(0);
      const target = goal.targetEntityId ? ` → ${goal.targetEntityId}` : '';
      lines.push(`    [${pct}%] ${goal.label} (${goal.verb}${target})`);
      lines.push(`           ${goal.reason}`);
    }
  } else {
    lines.push('  Goals: (none — NPC is idle)');
  }

  if (profile.knownRumors.length > 0) {
    lines.push('');
    lines.push('  Known rumors:');
    for (const rumor of profile.knownRumors) {
      lines.push(`    - ${rumor}`);
    }
  }

  if (lastAction) {
    lines.push('');
    lines.push(`  Last action: ${lastAction.action.description}`);
    lines.push(`  Hint: ${lastAction.narratorHint}`);
  }

  if (obligations && obligations.obligations.length > 0) {
    lines.push('');
    lines.push(formatObligationsForDirector(obligations));
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push('');
  return lines.join('\n');
}

/** Format NPC overview for director /people view. */
export function formatNpcPeopleForDirector(
  profiles: NpcProfile[],
  lastActions: NpcActionResult[],
  npcObligations?: Map<string, NpcObligationLedger>,
): string {
  if (profiles.length === 0) return '  No named NPCs found.';

  const lines: string[] = [];
  lines.push('');
  lines.push(DIVIDER);
  lines.push(`  PEOPLE — ${profiles.length} named NPC${profiles.length > 1 ? 's' : ''}`);
  lines.push(DIVIDER);

  for (const profile of profiles) {
    const lastAction = lastActions.find((a) => a.action.npcId === profile.npcId);
    const actionStr = lastAction ? lastAction.action.verb : '-';

    // Obligation counts
    const oblLedger = npcObligations?.get(profile.npcId);
    let oblStr = '';
    if (oblLedger && oblLedger.obligations.length > 0) {
      const favors = oblLedger.obligations.filter((o) => o.direction === 'npc-owes-player').length;
      const debts = oblLedger.obligations.filter((o) => o.direction === 'player-owes-npc').length;
      oblStr = ` — favor×${favors}, debt×${debts}`;
    }

    // Compact enriched format
    lines.push('');
    lines.push(`  ${profile.name} [${profile.breakpoint}/${profile.dominantAxis}] — ${profile.factionId ?? 'none'}${oblStr}`);
    lines.push(`    "${profile.leverageAngle}" | Last: ${actionStr}`);
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push('');
  return lines.join('\n');
}

/** Format NPC action results for narrator prompt injection (max 2, ~15 tokens each). */
export function formatNpcAgencyForNarrator(
  results: NpcActionResult[],
): string[] {
  return results.slice(0, 2).map((r) => r.narratorHint);
}

// --- Narration Texture (Phase 2) ---

const MAX_TEXTURE_HINTS = 3;
const MAX_TEXTURE_CHARS = 80;

/**
 * Generate behavioral texture hints from NPC profiles.
 * Describes observable NPC demeanor/body language, NOT actions taken.
 * Only returns hints for NPCs in the player's current zone.
 * Cap: 3 hints, each <= 80 chars.
 */
export function generateNpcTextures(
  profiles: NpcProfile[],
  world: WorldState,
  playerId: string,
): string[] {
  const playerZone = world.entities[playerId]?.zoneId;
  if (!playerZone) return [];

  const textures: string[] = [];

  for (const profile of profiles) {
    if (textures.length >= MAX_TEXTURE_HINTS) break;
    const entity = world.entities[profile.npcId];
    if (!entity || entity.zoneId !== playerZone) continue;

    const hint = deriveTextureHint(profile, entity.name);
    if (hint) {
      textures.push(hint.slice(0, MAX_TEXTURE_CHARS));
    }
  }

  return textures;
}

function deriveTextureHint(profile: NpcProfile, npcName: string): string | null {
  const rel = profile.relationship;
  const topGoal = profile.goals[0];
  if (!topGoal) return null;

  // Fear-dominant body language
  if (rel.fear > 60) {
    switch (topGoal.verb) {
      case 'flee': return `${npcName} edging toward the exit, eyes darting`;
      case 'conceal': return `${npcName} hunched over, guarding something closely`;
      case 'warn': return `${npcName} fidgeting, glancing at you with urgency`;
      default: return `${npcName} tense, shifting weight foot to foot`;
    }
  }

  // Hostility-dominant body language
  if (rel.trust < -30) {
    switch (topGoal.verb) {
      case 'accuse': return `${npcName} watching you with narrowed eyes, jaw set`;
      case 'betray': return `${npcName} studying you with an unreadable expression`;
      case 'lie': return `${npcName} leaning against the wall, arms folded`;
      case 'conceal': return `${npcName} turning slightly away, hand near a pocket`;
      default: return `${npcName} deliberately avoiding your gaze`;
    }
  }

  // Greed-driven calculation
  if (rel.greed > 60 && topGoal.verb === 'bargain') {
    return `${npcName} eyeing your gear with a merchant's appraising look`;
  }

  // Trust + pressure: conspiratorial urgency
  if (rel.trust > 20 && profile.underPressure) {
    return `${npcName} hovering nearby, clearly wanting a private word`;
  }

  // Loyalty conflict: inner turmoil
  if (rel.loyalty > 60 && rel.trust > 0 && topGoal.verb === 'betray') {
    return `${npcName} staring at the floor, jaw clenched`;
  }

  // Defection-seeking: quiet calculation
  if (topGoal.verb === 'recruit') {
    return `${npcName} watching you with quiet calculation`;
  }

  // Companion: protective stance
  if (topGoal.verb === 'protect') {
    return `${npcName} positioning between you and danger, hand on weapon`;
  }

  // Companion: considering departure
  if (topGoal.verb === 'abandon') {
    return `${npcName} staring at the horizon, pack half-gathered`;
  }

  return null;
}

// --- Obligation Ledger (Phase 2) ---

export type ObligationKind = 'favor' | 'debt' | 'blackmail' | 'saved' | 'betrayed' | 'bribed';
export type ObligationDirection = 'npc-owes-player' | 'player-owes-npc' | 'npc-owes-npc';

export type NpcObligation = {
  id: string;
  kind: ObligationKind;
  direction: ObligationDirection;
  npcId: string;
  counterpartyId: string;
  magnitude: number;        // 1-10
  sourceTag: string;
  createdAtTick: number;
  decayTurns: number | null; // null = permanent
};

export type NpcObligationLedger = {
  obligations: NpcObligation[];
};

let obligationCounter = 0;
function nextObligationId(): string {
  return `obl-${++obligationCounter}`;
}

/** Create a new obligation. */
export function createObligation(
  kind: ObligationKind,
  direction: ObligationDirection,
  npcId: string,
  counterpartyId: string,
  magnitude: number,
  sourceTag: string,
  tick: number,
  decayTurns: number | null = null,
): NpcObligation {
  return {
    id: nextObligationId(),
    kind,
    direction,
    npcId,
    counterpartyId,
    magnitude: Math.min(10, Math.max(1, magnitude)),
    sourceTag,
    createdAtTick: tick,
    decayTurns,
  };
}

/** Add an obligation to a ledger. Returns new ledger (immutable). */
export function addObligation(
  ledger: NpcObligationLedger,
  obligation: NpcObligation,
): NpcObligationLedger {
  return { obligations: [...ledger.obligations, obligation] };
}

/** Tick decay on all obligations. Removes expired ones. Returns new ledger. */
export function tickObligations(
  ledger: NpcObligationLedger,
): NpcObligationLedger {
  const surviving = ledger.obligations
    .map((o) => {
      if (o.decayTurns === null) return o;
      return { ...o, decayTurns: o.decayTurns - 1 };
    })
    .filter((o) => o.decayTurns === null || o.decayTurns > 0);
  return { obligations: surviving };
}

/** Get obligations between an NPC and a specific counterparty. */
export function getObligationsToward(
  ledger: NpcObligationLedger,
  counterpartyId: string,
): NpcObligation[] {
  return ledger.obligations.filter((o) => o.counterpartyId === counterpartyId);
}

/** Get net obligation weight toward a counterparty (positive = NPC owes them). */
export function getNetObligationWeight(
  ledger: NpcObligationLedger,
  counterpartyId: string,
): number {
  let net = 0;
  for (const o of ledger.obligations) {
    if (o.counterpartyId !== counterpartyId) continue;
    const sign = o.direction === 'npc-owes-player' || o.direction === 'npc-owes-npc' ? 1 : -1;
    const kindWeight = o.kind === 'betrayed' ? -1 : 1;
    net += o.magnitude * sign * kindWeight;
  }
  return net;
}

/** Format obligations for director view. */
export function formatObligationsForDirector(
  ledger: NpcObligationLedger,
): string {
  if (ledger.obligations.length === 0) return '  Obligations: (none)';
  const lines = ['  Obligations:'];
  for (const o of ledger.obligations) {
    const arrow = o.direction === 'npc-owes-player' ? '\u2192 player'
      : o.direction === 'player-owes-npc' ? '\u2190 player'
      : `\u2192 ${o.counterpartyId}`;
    const decay = o.decayTurns !== null ? ` (fades in ${o.decayTurns})` : '';
    lines.push(`    [${o.kind}] ${arrow} mag:${o.magnitude} (${o.sourceTag})${decay}`);
  }
  return lines.join('\n');
}

// --- Relationship Modifiers (v1.3) ---

export type RelationshipModifiers = {
  costMultiplier: number;       // 0.5–2.0
  reputationMultiplier: number; // 0.5–2.0
  rumorHeatMultiplier: number;  // 0.5–2.0
  sideEffectChance: number;     // 0–1
};

const MODIFIER_TABLE: Record<LoyaltyBreakpoint, RelationshipModifiers> = {
  allied:      { costMultiplier: 0.7,  reputationMultiplier: 1.3,  rumorHeatMultiplier: 0.6, sideEffectChance: 0.05 },
  favorable:   { costMultiplier: 0.85, reputationMultiplier: 1.15, rumorHeatMultiplier: 0.8, sideEffectChance: 0.1 },
  wavering:    { costMultiplier: 1.0,  reputationMultiplier: 1.0,  rumorHeatMultiplier: 1.0, sideEffectChance: 0.15 },
  hostile:     { costMultiplier: 1.4,  reputationMultiplier: 0.7,  rumorHeatMultiplier: 1.4, sideEffectChance: 0.3 },
  compromised: { costMultiplier: 1.2,  reputationMultiplier: 0.8,  rumorHeatMultiplier: 1.2, sideEffectChance: 0.25 },
};

/**
 * Compute leverage resolution modifiers based on NPC relationship state.
 * Returns multipliers for cost, reputation, rumor heat, and side effect chance.
 */
export function computeRelationshipModifiers(
  breakpoint: LoyaltyBreakpoint,
  dominantAxis: 'trust' | 'fear' | 'greed' | 'loyalty',
  netObligationWeight: number,
  trust?: number,
): RelationshipModifiers {
  const base = { ...MODIFIER_TABLE[breakpoint] };

  // Axis overrides (multiplicative on cost/heat)
  if (dominantAxis === 'fear') {
    base.costMultiplier *= 0.9; // Fear makes them cheaper to push
  } else if (dominantAxis === 'greed') {
    base.costMultiplier *= 1.1; // Greedy NPCs want more
  }
  if (dominantAxis === 'trust' && (trust ?? 0) < 0) {
    base.rumorHeatMultiplier *= 1.2; // Betrayal burns hotter
  }

  // Obligation overrides
  if (netObligationWeight >= 3) {
    base.costMultiplier *= 0.8; // They owe you — cheaper
  } else if (netObligationWeight <= -3) {
    base.costMultiplier *= 1.3; // You owe them — more expensive
  }

  // Clamp to sane ranges
  base.costMultiplier = Math.min(2.0, Math.max(0.5, base.costMultiplier));
  base.reputationMultiplier = Math.min(2.0, Math.max(0.5, base.reputationMultiplier));
  base.rumorHeatMultiplier = Math.min(2.0, Math.max(0.5, base.rumorHeatMultiplier));
  base.sideEffectChance = Math.min(1, Math.max(0, base.sideEffectChance));

  return base;
}

// --- Consequence Chains (v1.3) ---

export type ConsequenceKind = 'retaliation' | 'abandonment' | 'extortion'
  | 'vendetta' | 'plea' | 'sacrifice';

export type ConsequenceStep = {
  delayTurns: number;
  verb: NpcActionVerb;
  description: string;
};

export type ConsequenceChain = {
  id: string;
  npcId: string;
  kind: ConsequenceKind;
  trigger: string;
  steps: ConsequenceStep[];
  currentStep: number;
  turnsUntilNext: number;
  resolved: boolean;
  createdAtTick: number;
};

/** Curated trigger → consequence mapping. */
const CONSEQUENCE_TRIGGERS: Array<{
  check: (profile: NpcProfile, prevBp: LoyaltyBreakpoint, obligations?: NpcObligationLedger) => boolean;
  kind: ConsequenceKind;
  triggerLabel: string;
  steps: ConsequenceStep[];
}> = [
  {
    // Breakpoint → hostile (was favorable or allied)
    check: (p, prev) =>
      p.breakpoint === 'hostile' && (prev === 'favorable' || prev === 'allied'),
    kind: 'retaliation',
    triggerLabel: 'loyalty collapsed to hostile',
    steps: [
      { delayTurns: 2, verb: 'warn', description: 'issues a final warning' },
      { delayTurns: 4, verb: 'accuse', description: 'publicly denounces' },
    ],
  },
  {
    // Breakpoint → compromised (from any prior)
    check: (p, prev) =>
      p.breakpoint === 'compromised' && prev !== 'compromised',
    kind: 'extortion',
    triggerLabel: 'fell under duress',
    steps: [
      { delayTurns: 1, verb: 'bargain', description: 'demands payment under threat' },
      { delayTurns: 3, verb: 'conceal', description: 'begins hiding assets' },
    ],
  },
  {
    // Betrayal obligation mag >= 4
    check: (_p, _prev, obl) => {
      if (!obl) return false;
      return obl.obligations.some((o) => o.kind === 'betrayed' && o.magnitude >= 4);
    },
    kind: 'vendetta',
    triggerLabel: 'deep betrayal',
    steps: [
      { delayTurns: 2, verb: 'accuse', description: 'begins gathering evidence' },
      { delayTurns: 5, verb: 'betray', description: 'strikes back decisively' },
    ],
  },
  {
    // Allied NPC + player's faction rep dropped (breakpoint shifted from allied)
    check: (p, prev) =>
      prev === 'allied' && p.breakpoint !== 'allied',
    kind: 'abandonment',
    triggerLabel: 'alliance broken',
    steps: [
      { delayTurns: 1, verb: 'warn', description: 'expresses deep disappointment' },
      { delayTurns: 3, verb: 'flee', description: 'withdraws support entirely' },
    ],
  },
  {
    // Hostile NPC with fear > 80
    check: (p) =>
      p.breakpoint === 'hostile' && p.relationship.fear > 80,
    kind: 'plea',
    triggerLabel: 'cornered and desperate',
    steps: [
      { delayTurns: 1, verb: 'bargain', description: 'begs for mercy' },
    ],
  },
  {
    // Allied NPC under pressure (sacrifice)
    check: (p) =>
      p.breakpoint === 'allied' && p.underPressure && p.relationship.trust >= 60,
    kind: 'sacrifice',
    triggerLabel: 'ally under threat',
    steps: [
      { delayTurns: 0, verb: 'warn', description: 'rushes to alert' },
      { delayTurns: 2, verb: 'recruit', description: 'rallies support' },
    ],
  },
];

let consequenceCounter = 0;

/**
 * Evaluate whether an NPC's breakpoint shift triggers a consequence chain.
 * Returns the kind if triggered, null otherwise.
 */
export function evaluateConsequenceChainTrigger(
  profile: NpcProfile,
  previousBreakpoint: LoyaltyBreakpoint,
  obligations?: NpcObligationLedger,
): ConsequenceKind | null {
  for (const trigger of CONSEQUENCE_TRIGGERS) {
    if (trigger.check(profile, previousBreakpoint, obligations)) {
      return trigger.kind;
    }
  }
  return null;
}

/**
 * Build a consequence chain for an NPC.
 */
export function buildConsequenceChain(
  npcId: string,
  kind: ConsequenceKind,
  trigger: string,
  tick: number,
): ConsequenceChain {
  const template = CONSEQUENCE_TRIGGERS.find((t) => t.kind === kind);
  const steps = template?.steps ?? [];
  return {
    id: `cc-${++consequenceCounter}`,
    npcId,
    kind,
    trigger,
    steps: steps.map((s) => ({ ...s })),
    currentStep: 0,
    turnsUntilNext: steps[0]?.delayTurns ?? 0,
    resolved: false,
    createdAtTick: tick,
  };
}

/**
 * Check if a consequence chain has a step ready to resolve.
 */
export function shouldResolveChainStep(chain: ConsequenceChain): boolean {
  return !chain.resolved && chain.turnsUntilNext <= 0 && chain.currentStep < chain.steps.length;
}

/**
 * Resolve the next step of a consequence chain.
 * Returns the updated chain + the verb/description for the forced action, or null if done.
 */
export function resolveConsequenceChainStep(
  chain: ConsequenceChain,
): { chain: ConsequenceChain; verb: NpcActionVerb; description: string } | null {
  if (chain.resolved || chain.currentStep >= chain.steps.length) return null;

  const step = chain.steps[chain.currentStep];
  const nextStep = chain.currentStep + 1;
  const resolved = nextStep >= chain.steps.length;
  const nextDelay = resolved ? 0 : chain.steps[nextStep].delayTurns;

  return {
    chain: {
      ...chain,
      currentStep: nextStep,
      turnsUntilNext: nextDelay,
      resolved,
    },
    verb: step.verb,
    description: step.description,
  };
}

/**
 * Tick a consequence chain: decrement turnsUntilNext.
 * Returns updated chain.
 */
export function tickConsequenceChain(chain: ConsequenceChain): ConsequenceChain {
  if (chain.resolved) return chain;
  return {
    ...chain,
    turnsUntilNext: Math.max(0, chain.turnsUntilNext - 1),
  };
}

// --- NPC Recap Entries (v1.3) ---

export type NpcRecapEntry = {
  npcId: string;
  name: string;
  factionId: string;
  breakpoint: LoyaltyBreakpoint;
  previousBreakpoint?: LoyaltyBreakpoint;
  shifted: boolean;
  dominantAxis: string;
  obligationSummary: string;
  activeChainKind?: ConsequenceKind;
  leverageAngle: string;
};

/**
 * Compute recap entries for NPCs that had significant changes this session.
 * Filter: shifted breakpoint, has obligations, or has active chain.
 * Sorted: shifted first, then obligation-heavy, then active chains.
 */
export function computeNpcRecapEntries(
  profiles: NpcProfile[],
  previousBreakpoints: Map<string, LoyaltyBreakpoint>,
  obligations: Map<string, NpcObligationLedger>,
  activeChains: Map<string, ConsequenceChain>,
): NpcRecapEntry[] {
  const entries: NpcRecapEntry[] = [];

  for (const profile of profiles) {
    const prevBp = previousBreakpoints.get(profile.npcId);
    const shifted = prevBp !== undefined && prevBp !== profile.breakpoint;
    const oblLedger = obligations.get(profile.npcId);
    const hasObligations = oblLedger !== undefined && oblLedger.obligations.length > 0;
    const chain = activeChains.get(profile.npcId);
    const hasActiveChain = chain !== undefined && !chain.resolved;

    if (!shifted && !hasObligations && !hasActiveChain) continue;

    // Build obligation summary
    let oblSummary = 'none';
    if (oblLedger && oblLedger.obligations.length > 0) {
      const owesYou = oblLedger.obligations.filter((o) => o.direction === 'npc-owes-player').length;
      const youOwe = oblLedger.obligations.filter((o) => o.direction === 'player-owes-npc').length;
      oblSummary = `owes you ×${owesYou}, you owe ×${youOwe}`;
    }

    entries.push({
      npcId: profile.npcId,
      name: profile.name,
      factionId: profile.factionId ?? 'none',
      breakpoint: profile.breakpoint,
      previousBreakpoint: prevBp,
      shifted,
      dominantAxis: profile.dominantAxis,
      obligationSummary: oblSummary,
      activeChainKind: hasActiveChain ? chain!.kind : undefined,
      leverageAngle: profile.leverageAngle,
    });
  }

  // Sort: shifted first, then obligation-heavy, then chains
  entries.sort((a, b) => {
    if (a.shifted !== b.shifted) return a.shifted ? -1 : 1;
    if (a.obligationSummary !== 'none' && b.obligationSummary === 'none') return -1;
    if (a.obligationSummary === 'none' && b.obligationSummary !== 'none') return 1;
    if (a.activeChainKind && !b.activeChainKind) return -1;
    if (!a.activeChainKind && b.activeChainKind) return 1;
    return 0;
  });

  return entries;
}

// --- Hash Utility ---

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
