// pressure-system — emergent world pressure generation
// Pure functions + types for pressure lifecycle. No module registration.
// Pressures are structured objects, not prose. Claude renders them into narration.
// Most turns produce nothing — scarcity makes pressures meaningful.

import type { PlayerRumor } from './player-rumor.js';
import type { PressureResolution } from './pressure-resolution.js';

// --- Types ---

export type PressureKind =
  // Universal (all genres)
  | 'bounty-issued'
  | 'faction-summons'
  | 'merchant-blacklist'
  | 'revenge-attempt'
  | 'investigation-opened'
  // Fantasy
  | 'heresy-whisper'
  | 'chapel-sanction'
  // Mystery / Detective
  | 'case-opened'
  | 'witness-vanished'
  // Pirate
  | 'mutiny-brewing'
  | 'navy-bounty'
  // Horror / Post-Apocalyptic
  | 'infection-suspicion'
  | 'camp-panic'
  // Cyberpunk
  | 'corp-manhunt'
  | 'ice-escalation';

export type PressureVisibility = 'hidden' | 'rumored' | 'known' | 'public';

export type WorldPressure = {
  id: string;
  kind: PressureKind;
  /** Faction that generated this pressure */
  sourceFactionId: string;
  /** Structured claim about what this pressure represents */
  description: string;
  /** What triggered it — rumor id, milestone label, or event type */
  triggeredBy: string;
  /** 0-1, higher = more imminent */
  urgency: number;
  /** How widely known this pressure is */
  visibility: PressureVisibility;
  /** Turns remaining before expiry (null = permanent until resolved) */
  turnsRemaining: number | null;
  /** Possible outcomes if the player engages or ignores */
  potentialOutcomes: string[];
  /** Genre/thematic tags */
  tags: string[];
  /** Engine tick when created */
  createdAtTick: number;
  /** Set when pressure is resolved (transitions from active to resolved) */
  resolution?: PressureResolution;
  /** If this pressure was spawned by fallout from another pressure */
  chainedFrom?: string;
};

export type PressureInputs = {
  playerRumors: PlayerRumor[];
  reputation: Array<{ factionId: string; value: number }>;
  milestones: Array<{ label: string; tags: string[] }>;
  factionStates: Record<string, { alertLevel: number; cohesion: number }>;
  districtMetrics?: Record<string, { alertPressure: number; rumorDensity: number; stability: number }>;
  playerLevel: number;
  totalTurns: number;
  activePressures: WorldPressure[];
  /** From PackMetadata.genres[0], e.g. 'fantasy', 'cyberpunk' */
  genre: string;
  /** Current engine tick for timestamps */
  currentTick: number;
};

export type PressureSpawnResult = {
  pressure: WorldPressure;
  /** One-line reason for director mode */
  reason: string;
};

// --- Constants ---

const MAX_ACTIVE_PRESSURES = 3;
const MIN_TURNS_BETWEEN_SPAWNS = 3;
const VISIBILITY_ESCALATION_TICKS = 3;

let pressureCounter = 0;
function nextPressureId(): string {
  return `wp-${++pressureCounter}`;
}

// --- Lifecycle ---

export type PressureTickResult = {
  /** Pressures still active after this tick */
  active: WorldPressure[];
  /** Pressures that expired this tick (turnsRemaining hit 0) */
  expired: WorldPressure[];
};

/**
 * Tick all active pressures: decrement timers, remove expired,
 * escalate visibility over time. Returns active + expired arrays.
 */
export function tickPressures(pressures: WorldPressure[], currentTick: number): PressureTickResult {
  const active: WorldPressure[] = [];
  const expired: WorldPressure[] = [];

  for (const p of pressures) {
    // Expire if turnsRemaining hit 0
    if (p.turnsRemaining !== null && p.turnsRemaining <= 0) {
      expired.push(p);
      continue;
    }

    const updated = { ...p };

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
    }

    active.push(updated);
  }

  return { active, expired };
}

// --- Evaluation ---

/**
 * Evaluate simulation state for new pressure. Returns at most ONE new pressure.
 * Returns null most turns — scarcity by design.
 */
export function evaluatePressures(inputs: PressureInputs): PressureSpawnResult | null {
  // Scarcity guard: max active
  if (inputs.activePressures.length >= MAX_ACTIVE_PRESSURES) return null;

  // Scarcity guard: min turns between spawns
  if (inputs.activePressures.length > 0) {
    const mostRecent = Math.max(...inputs.activePressures.map((p) => p.createdAtTick));
    if (inputs.currentTick - mostRecent < MIN_TURNS_BETWEEN_SPAWNS) return null;
  }

  // Existing kinds — no duplicates
  const activeKinds = new Set(inputs.activePressures.map((p) => p.kind));

  // Try universal rules first
  const universal = evaluateUniversalRules(inputs, activeKinds);
  if (universal) return universal;

  // Try genre-specific rules
  return evaluateGenreRules(inputs, activeKinds);
}

// --- Universal Rules ---

function evaluateUniversalRules(
  inputs: PressureInputs,
  activeKinds: Set<PressureKind>,
): PressureSpawnResult | null {
  const { reputation, factionStates, playerRumors, currentTick } = inputs;

  for (const rep of reputation) {
    const factionState = factionStates[rep.factionId];
    if (!factionState) continue;

    // Bounty: deep hostility + high alert
    if (
      !activeKinds.has('bounty-issued') &&
      rep.value <= -50 &&
      factionState.alertLevel >= 60
    ) {
      return {
        pressure: makePressure({
          kind: 'bounty-issued',
          sourceFactionId: rep.factionId,
          description: `${rep.factionId} has placed a bounty on the player`,
          triggeredBy: `reputation:${rep.value}`,
          urgency: 0.7,
          visibility: 'rumored',
          turnsRemaining: 12,
          potentialOutcomes: [
            'Hunters sent after the player',
            'Safe passage denied in faction territory',
            'Bounty can be cleared by major service to the faction',
          ],
          tags: ['hostile', 'universal'],
          currentTick,
        }),
        reason: `Faction ${rep.factionId} reputation ${rep.value} with alert ${factionState.alertLevel}`,
      };
    }

    // Investigation: moderate hostility + moderate alert
    if (
      !activeKinds.has('investigation-opened') &&
      rep.value <= -30 &&
      factionState.alertLevel >= 40
    ) {
      return {
        pressure: makePressure({
          kind: 'investigation-opened',
          sourceFactionId: rep.factionId,
          description: `${rep.factionId} has opened an investigation into the player's activities`,
          triggeredBy: `reputation:${rep.value}`,
          urgency: 0.4,
          visibility: 'hidden',
          turnsRemaining: 8,
          potentialOutcomes: [
            'NPCs withhold information during investigation',
            'Investigation may escalate to bounty if ignored',
            'Player can cooperate to clear suspicion',
          ],
          tags: ['probe', 'universal'],
          currentTick,
        }),
        reason: `Faction ${rep.factionId} reputation ${rep.value} with alert ${factionState.alertLevel}`,
      };
    }

    // Faction summons: high rep with one faction, their rival hates the player
    if (
      !activeKinds.has('faction-summons') &&
      rep.value >= 50
    ) {
      const hasRival = reputation.some(
        (other) => other.factionId !== rep.factionId && other.value <= -20,
      );
      if (hasRival) {
        return {
          pressure: makePressure({
            kind: 'faction-summons',
            sourceFactionId: rep.factionId,
            description: `${rep.factionId} summons the player to discuss a matter of importance`,
            triggeredBy: `reputation:${rep.value}`,
            urgency: 0.5,
            visibility: 'known',
            turnsRemaining: 10,
            potentialOutcomes: [
              'Faction offers a mission against their rival',
              'Refusing the summons may strain the relationship',
              'Accepting deepens alliance and rival hostility',
            ],
            tags: ['diplomatic', 'universal'],
            currentTick,
          }),
          reason: `Faction ${rep.factionId} rep ${rep.value} while rival faction hostile`,
        };
      }
    }

    // Merchant blacklist: hostility with merchant-tagged factions
    // (We check tags via faction id containing 'merchant', 'trade', 'guild', 'market')
    if (
      !activeKinds.has('merchant-blacklist') &&
      rep.value <= -40 &&
      isMerchantFaction(rep.factionId)
    ) {
      return {
        pressure: makePressure({
          kind: 'merchant-blacklist',
          sourceFactionId: rep.factionId,
          description: `${rep.factionId} has blacklisted the player from trade`,
          triggeredBy: `reputation:${rep.value}`,
          urgency: 0.5,
          visibility: 'known',
          turnsRemaining: 15,
          potentialOutcomes: [
            'Trade access revoked at faction shops',
            'Prices inflated at neutral merchants who heard',
            'Blacklist lifted after reputation repair',
          ],
          tags: ['economic', 'universal'],
          currentTick,
        }),
        reason: `Merchant faction ${rep.factionId} reputation ${rep.value}`,
      };
    }
  }

  // Revenge: fearsome rumors spread widely
  if (!activeKinds.has('revenge-attempt')) {
    const fearsomeWideRumors = playerRumors.filter(
      (r) => r.valence === 'fearsome' && r.spreadTo.length >= 3 && r.confidence > 0.3,
    );
    if (fearsomeWideRumors.length > 0) {
      const trigger = fearsomeWideRumors[0];
      const originFaction = trigger.originFactionId ?? reputation[0]?.factionId ?? 'unknown';
      return {
        pressure: makePressure({
          kind: 'revenge-attempt',
          sourceFactionId: originFaction,
          description: `allies of those the player wronged are seeking revenge`,
          triggeredBy: `rumor:${trigger.id}`,
          urgency: 0.6,
          visibility: 'hidden',
          turnsRemaining: 8,
          potentialOutcomes: [
            'Ambush attempt in the current district',
            'NPCs may betray the player to avengers',
            'Avengers can be confronted or evaded',
          ],
          tags: ['hostile', 'universal'],
          currentTick,
        }),
        reason: `Fearsome rumor "${trigger.claim}" spread to ${trigger.spreadTo.length} factions`,
      };
    }
  }

  return null;
}

// --- Genre Rules ---

function evaluateGenreRules(
  inputs: PressureInputs,
  activeKinds: Set<PressureKind>,
): PressureSpawnResult | null {
  const { genre } = inputs;

  switch (genre) {
    case 'fantasy':
      return evaluateFantasyRules(inputs, activeKinds);
    case 'mystery':
      return evaluateMysteryRules(inputs, activeKinds);
    case 'pirate':
      return evaluatePirateRules(inputs, activeKinds);
    case 'horror':
    case 'post-apocalyptic':
      return evaluateHorrorRules(inputs, activeKinds);
    case 'cyberpunk':
      return evaluateCyberpunkRules(inputs, activeKinds);
    default:
      return null;
  }
}

function evaluateFantasyRules(
  inputs: PressureInputs,
  activeKinds: Set<PressureKind>,
): PressureSpawnResult | null {
  const { reputation, factionStates, currentTick, milestones } = inputs;

  // Heresy whisper: religious faction + negative rep + religious milestones
  if (!activeKinds.has('heresy-whisper')) {
    const chapelFaction = findFactionByHint(reputation, ['chapel', 'church', 'temple', 'clergy', 'faith']);
    if (chapelFaction && chapelFaction.value < -20) {
      const hasReligiousMilestone = milestones.some(
        (m) => m.tags.some((t) => ['faith', 'chapel', 'heresy', 'divine', 'sacrilege'].includes(t)),
      );
      if (hasReligiousMilestone || (factionStates[chapelFaction.factionId]?.alertLevel ?? 0) >= 40) {
        return {
          pressure: makePressure({
            kind: 'heresy-whisper',
            sourceFactionId: chapelFaction.factionId,
            description: `the ${chapelFaction.factionId} whispers of heresy against the player`,
            triggeredBy: `reputation:${chapelFaction.value}`,
            urgency: 0.4,
            visibility: 'rumored',
            turnsRemaining: 10,
            potentialOutcomes: [
              'Religious NPCs become suspicious and uncooperative',
              'May escalate to formal chapel sanction if unaddressed',
              'Can be defused through piety or atonement',
            ],
            tags: ['religious', 'fantasy'],
            currentTick,
          }),
          reason: `Chapel faction ${chapelFaction.factionId} rep ${chapelFaction.value}`,
        };
      }
    }
  }

  // Chapel sanction: heresy-whisper expired (not currently active but was recently)
  if (!activeKinds.has('chapel-sanction') && !activeKinds.has('heresy-whisper')) {
    const chapelFaction = findFactionByHint(reputation, ['chapel', 'church', 'temple', 'clergy', 'faith']);
    if (chapelFaction && chapelFaction.value < -40) {
      return {
        pressure: makePressure({
          kind: 'chapel-sanction',
          sourceFactionId: chapelFaction.factionId,
          description: `the ${chapelFaction.factionId} has formally sanctioned the player`,
          triggeredBy: `reputation:${chapelFaction.value}`,
          urgency: 0.7,
          visibility: 'public',
          turnsRemaining: 20,
          potentialOutcomes: [
            'Healing and blessing services denied',
            'Faithful NPCs refuse all aid',
            'Sanction can be lifted through a major act of devotion',
          ],
          tags: ['religious', 'fantasy', 'escalation'],
          currentTick,
        }),
        reason: `Chapel faction ${chapelFaction.factionId} rep ${chapelFaction.value}, heresy unresolved`,
      };
    }
  }

  return null;
}

function evaluateMysteryRules(
  inputs: PressureInputs,
  activeKinds: Set<PressureKind>,
): PressureSpawnResult | null {
  const { reputation, factionStates, milestones, currentTick } = inputs;

  // Case opened: law faction alert + investigation milestones
  if (!activeKinds.has('case-opened')) {
    const lawFaction = findFactionByHint(reputation, ['police', 'law', 'detective', 'constable', 'precinct']);
    if (lawFaction) {
      const alert = factionStates[lawFaction.factionId]?.alertLevel ?? 0;
      const hasInvestigationMilestone = milestones.some(
        (m) => m.tags.some((t) => ['investigation', 'crime', 'evidence', 'witness'].includes(t)),
      );
      if (alert >= 50 || hasInvestigationMilestone) {
        return {
          pressure: makePressure({
            kind: 'case-opened',
            sourceFactionId: lawFaction.factionId,
            description: `${lawFaction.factionId} has opened a case involving the player`,
            triggeredBy: hasInvestigationMilestone ? 'milestone:investigation' : `alert:${alert}`,
            urgency: 0.5,
            visibility: 'hidden',
            turnsRemaining: 10,
            potentialOutcomes: [
              'Investigators shadow the player',
              'Evidence may implicate or exonerate',
              'Player can cooperate, obstruct, or flee',
            ],
            tags: ['investigation', 'mystery'],
            currentTick,
          }),
          reason: `Law faction alert ${alert}, investigation milestones present`,
        };
      }
    }
  }

  // Witness vanished: active investigation + high suspicion environment
  if (!activeKinds.has('witness-vanished') && activeKinds.has('case-opened')) {
    const lawFaction = findFactionByHint(reputation, ['police', 'law', 'detective', 'constable', 'precinct']);
    if (lawFaction) {
      const alert = factionStates[lawFaction.factionId]?.alertLevel ?? 0;
      if (alert >= 70) {
        return {
          pressure: makePressure({
            kind: 'witness-vanished',
            sourceFactionId: lawFaction.factionId,
            description: `a key witness in the investigation has disappeared`,
            triggeredBy: 'case-opened:escalation',
            urgency: 0.7,
            visibility: 'rumored',
            turnsRemaining: 6,
            potentialOutcomes: [
              'Suspicion falls on the player',
              'Finding the witness may clear the player',
              'The witness may have been silenced by a third party',
            ],
            tags: ['investigation', 'mystery', 'escalation'],
            currentTick,
          }),
          reason: `Active case with law faction alert ${alert}`,
        };
      }
    }
  }

  return null;
}

function evaluatePirateRules(
  inputs: PressureInputs,
  activeKinds: Set<PressureKind>,
): PressureSpawnResult | null {
  const { reputation, factionStates, playerRumors, currentTick } = inputs;

  // Mutiny brewing: crew faction low cohesion
  if (!activeKinds.has('mutiny-brewing')) {
    const crewFaction = findFactionByHint(reputation, ['crew', 'pirate', 'sailor', 'buccaneer']);
    if (crewFaction) {
      const cohesion = factionStates[crewFaction.factionId]?.cohesion ?? 1;
      if (cohesion < 0.4) {
        return {
          pressure: makePressure({
            kind: 'mutiny-brewing',
            sourceFactionId: crewFaction.factionId,
            description: `discontent festers among the ${crewFaction.factionId}`,
            triggeredBy: `cohesion:${cohesion}`,
            urgency: 0.6,
            visibility: 'rumored',
            turnsRemaining: 8,
            potentialOutcomes: [
              'Crew members may refuse orders',
              'A ringleader emerges to challenge the player',
              'Sharing plunder or winning a battle may restore loyalty',
            ],
            tags: ['social', 'pirate'],
            currentTick,
          }),
          reason: `Crew faction ${crewFaction.factionId} cohesion ${cohesion}`,
        };
      }
    }
  }

  // Navy bounty: fearsome rumors spread widely
  if (!activeKinds.has('navy-bounty')) {
    const fearsomeRumors = playerRumors.filter(
      (r) => r.valence === 'fearsome' && r.spreadTo.length >= 2 && r.confidence > 0.4,
    );
    if (fearsomeRumors.length > 0) {
      const navyFaction = findFactionByHint(reputation, ['navy', 'admiralty', 'crown', 'port-authority']);
      const factionId = navyFaction?.factionId ?? 'navy';
      return {
        pressure: makePressure({
          kind: 'navy-bounty',
          sourceFactionId: factionId,
          description: `naval forces have posted a bounty for the player's capture`,
          triggeredBy: `rumor:${fearsomeRumors[0].id}`,
          urgency: 0.7,
          visibility: 'known',
          turnsRemaining: 15,
          potentialOutcomes: [
            'Naval patrols hunt the player at sea',
            'Port access may be restricted',
            'Privateers may seek the bounty reward',
          ],
          tags: ['hostile', 'pirate', 'naval'],
          currentTick,
        }),
        reason: `Fearsome rumors spread to ${fearsomeRumors[0].spreadTo.length} factions`,
      };
    }
  }

  return null;
}

function evaluateHorrorRules(
  inputs: PressureInputs,
  activeKinds: Set<PressureKind>,
): PressureSpawnResult | null {
  const { reputation, factionStates, playerRumors, currentTick, milestones } = inputs;

  // Infection suspicion: community on high alert + injury-related milestones
  if (!activeKinds.has('infection-suspicion')) {
    const communityFaction = findFactionByHint(reputation, ['camp', 'settlement', 'survivors', 'community', 'haven']);
    if (communityFaction) {
      const alert = factionStates[communityFaction.factionId]?.alertLevel ?? 0;
      const hasInjury = milestones.some(
        (m) => m.tags.some((t) => ['injury', 'wound', 'infection', 'bite', 'exposure'].includes(t)),
      );
      if (alert >= 60 && hasInjury) {
        return {
          pressure: makePressure({
            kind: 'infection-suspicion',
            sourceFactionId: communityFaction.factionId,
            description: `the ${communityFaction.factionId} suspects the player may be infected`,
            triggeredBy: 'injury+alert',
            urgency: 0.6,
            visibility: 'rumored',
            turnsRemaining: 6,
            potentialOutcomes: [
              'NPCs demand the player submit to examination',
              'Access to safe zones restricted',
              'Player may be quarantined or expelled',
            ],
            tags: ['social', 'horror', 'medical'],
            currentTick,
          }),
          reason: `Community alert ${alert} with injury milestones`,
        };
      }
    }
  }

  // Camp panic: multiple fearsome rumors in circulation
  if (!activeKinds.has('camp-panic')) {
    const fearsomeRumors = playerRumors.filter(
      (r) => r.valence === 'fearsome' && r.confidence > 0.3,
    );
    if (fearsomeRumors.length >= 2) {
      const communityFaction = findFactionByHint(reputation, ['camp', 'settlement', 'survivors', 'community', 'haven']);
      const factionId = communityFaction?.factionId ?? reputation[0]?.factionId ?? 'community';
      return {
        pressure: makePressure({
          kind: 'camp-panic',
          sourceFactionId: factionId,
          description: `fear spreads through the settlement — the player's reputation precedes them`,
          triggeredBy: `rumors:fearsome:${fearsomeRumors.length}`,
          urgency: 0.5,
          visibility: 'known',
          turnsRemaining: 8,
          potentialOutcomes: [
            'NPCs hoard resources and refuse to share',
            'Some NPCs flee the settlement entirely',
            'A leader may demand the player leave',
          ],
          tags: ['social', 'horror', 'panic'],
          currentTick,
        }),
        reason: `${fearsomeRumors.length} fearsome rumors in circulation`,
      };
    }
  }

  return null;
}

function evaluateCyberpunkRules(
  inputs: PressureInputs,
  activeKinds: Set<PressureKind>,
): PressureSpawnResult | null {
  const { reputation, factionStates, currentTick } = inputs;

  // Corp manhunt: corporate faction hostile + high alert
  if (!activeKinds.has('corp-manhunt')) {
    const corpFaction = findFactionByHint(reputation, ['corp', 'corporation', 'corporate', 'zaibatsu', 'syndicate']);
    if (corpFaction && corpFaction.value <= -40) {
      const alert = factionStates[corpFaction.factionId]?.alertLevel ?? 0;
      if (alert >= 50) {
        return {
          pressure: makePressure({
            kind: 'corp-manhunt',
            sourceFactionId: corpFaction.factionId,
            description: `${corpFaction.factionId} security division has authorized a manhunt`,
            triggeredBy: `reputation:${corpFaction.value}`,
            urgency: 0.8,
            visibility: 'rumored',
            turnsRemaining: 10,
            potentialOutcomes: [
              'Corporate operatives deployed to player location',
              'Surveillance systems track player movement',
              'A fixer may offer to broker a truce — for a price',
            ],
            tags: ['hostile', 'cyberpunk', 'corporate'],
            currentTick,
          }),
          reason: `Corp faction ${corpFaction.factionId} rep ${corpFaction.value} alert ${alert}`,
        };
      }
    }
  }

  // ICE escalation: investigation expired or failed + digital presence
  if (!activeKinds.has('ice-escalation') && !activeKinds.has('investigation-opened')) {
    const corpFaction = findFactionByHint(reputation, ['corp', 'corporation', 'corporate', 'zaibatsu', 'syndicate', 'net']);
    if (corpFaction && corpFaction.value <= -30) {
      const alert = factionStates[corpFaction.factionId]?.alertLevel ?? 0;
      if (alert >= 60) {
        return {
          pressure: makePressure({
            kind: 'ice-escalation',
            sourceFactionId: corpFaction.factionId,
            description: `${corpFaction.factionId} has upgraded its ICE against the player`,
            triggeredBy: `alert:${alert}`,
            urgency: 0.5,
            visibility: 'hidden',
            turnsRemaining: 12,
            potentialOutcomes: [
              'Digital zones become more dangerous',
              'Hacking attempts face increased resistance',
              'A netrunner contact may offer countermeasures',
            ],
            tags: ['digital', 'cyberpunk', 'escalation'],
            currentTick,
          }),
          reason: `Corp faction ${corpFaction.factionId} alert ${alert} after investigation`,
        };
      }
    }
  }

  return null;
}

// --- Queries ---

/** Get pressures originating from a specific faction. */
export function getPressuresForFaction(pressures: WorldPressure[], factionId: string): WorldPressure[] {
  return pressures.filter((p) => p.sourceFactionId === factionId);
}

/** Get pressures the player would be aware of (not hidden). */
export function getVisiblePressures(pressures: WorldPressure[]): WorldPressure[] {
  return pressures.filter((p) => p.visibility !== 'hidden');
}

// --- Formatting ---

/** Format a single pressure for the director /pressures view. */
export function formatPressureForDirector(pressure: WorldPressure): string {
  const urgencyPct = Math.round(pressure.urgency * 100);
  const turns = pressure.turnsRemaining !== null ? `${pressure.turnsRemaining} turns` : 'permanent';
  const parts = [
    `  [${pressure.kind}] ${pressure.description}`,
    `    Source: ${pressure.sourceFactionId} | Urgency: ${urgencyPct}% | Visibility: ${pressure.visibility}`,
    `    Expires: ${turns} | Triggered by: ${pressure.triggeredBy}`,
    `    Tags: ${pressure.tags.join(', ')}`,
    `    Outcomes:`,
    ...pressure.potentialOutcomes.map((o) => `      - ${o}`),
  ];
  return parts.join('\n');
}

/** Compact summary for narrator prompt injection (~15 tokens). */
export function formatPressureForNarrator(pressure: WorldPressure): string {
  const urgency = pressure.urgency >= 0.7 ? 'urgent' : pressure.urgency >= 0.4 ? 'growing' : 'distant';
  return `${pressure.kind}: ${pressure.description} (${urgency})`;
}

/** NPC-facing description for dialogue context. */
export function formatPressureForDialogue(pressure: WorldPressure): string {
  const urgency = pressure.urgency >= 0.7 ? 'imminent' : pressure.urgency >= 0.4 ? 'developing' : 'emerging';
  return `${pressure.kind} (${urgency}): ${pressure.description}`;
}

// --- Helpers ---

export function makePressure(opts: {
  kind: PressureKind;
  sourceFactionId: string;
  description: string;
  triggeredBy: string;
  urgency: number;
  visibility: PressureVisibility;
  turnsRemaining: number | null;
  potentialOutcomes: string[];
  tags: string[];
  currentTick: number;
}): WorldPressure {
  return {
    id: nextPressureId(),
    kind: opts.kind,
    sourceFactionId: opts.sourceFactionId,
    description: opts.description,
    triggeredBy: opts.triggeredBy,
    urgency: opts.urgency,
    visibility: opts.visibility,
    turnsRemaining: opts.turnsRemaining,
    potentialOutcomes: opts.potentialOutcomes,
    tags: opts.tags,
    createdAtTick: opts.currentTick,
  };
}

function isMerchantFaction(factionId: string): boolean {
  const lower = factionId.toLowerCase();
  return ['merchant', 'trade', 'guild', 'market', 'bazaar', 'shop', 'vendor'].some(
    (hint) => lower.includes(hint),
  );
}

function findFactionByHint(
  reputation: Array<{ factionId: string; value: number }>,
  hints: string[],
): { factionId: string; value: number } | undefined {
  return reputation.find((r) => {
    const lower = r.factionId.toLowerCase();
    return hints.some((h) => lower.includes(h));
  });
}
