// player-rumor — structured player legend propagation
// Pure functions + types for rumor lifecycle. No module registration.
// Rumors are structured claims, not prose. Claude renders them into dialogue.

import { buildPlayerDescriptor } from './social-consequence.js';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';

// --- Types ---

export type RumorValence = 'heroic' | 'fearsome' | 'tragic' | 'mysterious';

export type PlayerRumor = {
  id: string;
  /** Structured claim: "defeated the Bone Collector" */
  claim: string;
  /** From buildPlayerDescriptor — how NPCs describe the player */
  subjectDescriptor: string;
  /** Event type that spawned it */
  sourceEvent: string;
  /** Milestone label if applicable */
  sourceMilestone?: string;
  /** Faction that witnessed/originated */
  originFactionId?: string;
  /** District where it happened */
  originDistrictId?: string;
  /** 0-1, decays with hops */
  confidence: number;
  /** 0-1, increases with mutations */
  distortion: number;
  /** How many times the claim has been mutated */
  mutationCount: number;
  /** Emotional charge */
  valence: RumorValence;
  /** FactionIds that have received this rumor */
  spreadTo: string[];
  /** Engine tick when spawned */
  originTick: number;
};

export type RumorMutation = {
  type: 'exaggerate' | 'invert' | 'conflate';
  field: 'claim' | 'valence';
  before: string;
  after: string;
};

export type MilestoneHint = {
  label: string;
  description: string;
  tags: string[];
};

// --- Constants ---

const CONFIDENCE_DECAY = 0.85;
const BASE_DISTORTION_RATE = 0.08;
const MUTATION_THRESHOLD = 0.10;

const CLAIM_EXAGGERATIONS: Record<string, string> = {
  'defeated': 'slaughtered',
  'entered': 'conquered',
  'discovered': 'claimed',
  'slew': 'annihilated',
  'killed': 'massacred',
};

const VALENCE_INVERSIONS: Record<RumorValence, RumorValence> = {
  heroic: 'fearsome',
  fearsome: 'heroic',
  tragic: 'mysterious',
  mysterious: 'tragic',
};

let rumorCounter = 0;
function nextRumorId(): string {
  return `pr-${++rumorCounter}`;
}

// --- Valence Derivation ---

/** Derive emotional charge from milestone tags. */
export function deriveRumorValence(tags: string[]): RumorValence {
  const has = (t: string) => tags.includes(t);
  if (has('combat') && has('boss-kill')) return 'fearsome';
  if (has('exploration') && has('landmark')) return 'mysterious';
  if (has('combat')) return 'heroic';
  if (has('exploration') && has('boss-lair')) return 'fearsome';
  return 'mysterious';
}

// --- Spawning ---

/** Build a subject descriptor from a profile. */
function descriptorFromProfile(profile: CharacterProfile): string {
  const injuryNames = profile.injuries.map((i) => i.name);
  return buildPlayerDescriptor(
    profile.build.name,
    profile.build.archetypeId,
    profile.progression.level,
    injuryNames,
    profile.custom.title as string | undefined,
  );
}

/** Spawn a player rumor from a milestone event. */
export function spawnPlayerRumor(
  milestone: MilestoneHint,
  profile: CharacterProfile,
  originFactionId?: string,
  originDistrictId?: string,
  tick: number = 0,
): PlayerRumor {
  return {
    id: nextRumorId(),
    claim: milestone.label,
    subjectDescriptor: descriptorFromProfile(profile),
    sourceEvent: 'milestone',
    sourceMilestone: milestone.label,
    originFactionId,
    originDistrictId,
    confidence: 1.0,
    distortion: 0,
    mutationCount: 0,
    valence: deriveRumorValence(milestone.tags),
    spreadTo: originFactionId ? [originFactionId] : [],
    originTick: tick,
  };
}

/** Spawn a player rumor from a reputation change event. */
export function spawnReputationRumor(
  factionId: string,
  delta: number,
  factionName: string,
  profile: CharacterProfile,
  districtId?: string,
  tick: number = 0,
): PlayerRumor {
  const claim = delta < 0
    ? `angered the ${factionName}`
    : `honored by the ${factionName}`;
  const valence: RumorValence = delta < 0 ? 'fearsome' : 'heroic';

  return {
    id: nextRumorId(),
    claim,
    subjectDescriptor: descriptorFromProfile(profile),
    sourceEvent: 'reputation',
    originFactionId: factionId,
    originDistrictId: districtId,
    confidence: 0.9,
    distortion: 0,
    mutationCount: 0,
    valence,
    spreadTo: [factionId],
    originTick: tick,
  };
}

// --- Propagation ---

/**
 * Propagate a rumor to a new faction.
 * Returns a new rumor with the target added to spreadTo, confidence decayed,
 * and possible mutation applied.
 */
export function propagateRumor(
  rumor: PlayerRumor,
  targetFactionId: string,
  distortionRate: number = BASE_DISTORTION_RATE,
): PlayerRumor {
  const newConfidence = rumor.confidence * CONFIDENCE_DECAY;
  const newDistortion = Math.min(1, rumor.distortion + distortionRate);

  let propagated: PlayerRumor = {
    ...rumor,
    confidence: newConfidence,
    distortion: newDistortion,
    spreadTo: [...rumor.spreadTo, targetFactionId],
  };

  // Mutation chance based on distortion level
  if (shouldMutate(propagated)) {
    const result = mutateRumorClaim(propagated);
    propagated = result.rumor;
  }

  return propagated;
}

/** Determine if a rumor should mutate during propagation. */
export function shouldMutate(rumor: PlayerRumor): boolean {
  // Higher distortion = higher mutation chance
  // Base 10% + distortion bonus
  const chance = MUTATION_THRESHOLD + rumor.distortion * 0.15;
  // Deterministic based on mutation count + confidence for reproducibility
  const seed = (rumor.mutationCount * 7 + Math.round(rumor.confidence * 100)) % 100;
  return seed < chance * 100;
}

// --- Mutation ---

/**
 * Apply a structured mutation to a rumor's claim.
 * Returns the mutated rumor and a record of what changed.
 */
export function mutateRumorClaim(rumor: PlayerRumor): { rumor: PlayerRumor; mutation: RumorMutation } {
  // Alternate between mutation types based on mutation count
  const mutationType = rumor.mutationCount % 3;

  if (mutationType === 0) {
    // Exaggerate: replace a verb in the claim
    const exaggerated = exaggerateClaim(rumor.claim);
    if (exaggerated !== rumor.claim) {
      return {
        rumor: { ...rumor, claim: exaggerated, mutationCount: rumor.mutationCount + 1 },
        mutation: { type: 'exaggerate', field: 'claim', before: rumor.claim, after: exaggerated },
      };
    }
  }

  if (mutationType === 1) {
    // Invert valence
    const newValence = VALENCE_INVERSIONS[rumor.valence];
    return {
      rumor: { ...rumor, valence: newValence, mutationCount: rumor.mutationCount + 1 },
      mutation: { type: 'invert', field: 'valence', before: rumor.valence, after: newValence },
    };
  }

  // Conflate: modify the descriptor
  const newDescriptor = `${rumor.subjectDescriptor}, whose deeds grow stranger in the telling`;
  return {
    rumor: { ...rumor, subjectDescriptor: newDescriptor, mutationCount: rumor.mutationCount + 1 },
    mutation: { type: 'conflate', field: 'claim', before: rumor.subjectDescriptor, after: newDescriptor },
  };
}

function exaggerateClaim(claim: string): string {
  const lower = claim.toLowerCase();
  for (const [original, exaggerated] of Object.entries(CLAIM_EXAGGERATIONS)) {
    if (lower.includes(original)) {
      return claim.replace(new RegExp(original, 'i'), exaggerated);
    }
  }
  return claim;
}

// --- NPC-Originated Rumors ---

export type NpcRumorSource = 'npc-accusation' | 'npc-betrayal' | 'npc-warning'
  | 'npc-concealment' | 'npc-gossip';

/**
 * Spawn a rumor originating from an NPC action (not player-initiated).
 * Lower initial confidence than player-spawned rumors; slight NPC perspective bias.
 */
export function spawnNpcOriginatedRumor(
  claim: string,
  valence: RumorValence,
  sourceEvent: NpcRumorSource,
  originNpcId: string,
  originFactionId: string | undefined,
  originDistrictId: string | undefined,
  tick: number,
  confidence: number = 0.75,
): PlayerRumor {
  return {
    id: nextRumorId(),
    claim,
    subjectDescriptor: `word from ${originNpcId}`,
    sourceEvent,
    originFactionId,
    originDistrictId,
    confidence,
    distortion: 0.05,
    mutationCount: 0,
    valence,
    spreadTo: originFactionId ? [originFactionId] : [],
    originTick: tick,
  };
}

// --- Player-Initiated Rumor Manipulation ---

/**
 * Spawn a rumor from player intent (not a milestone/event trigger).
 * Used by leverage system seed/frame/leak-truth sub-actions.
 */
export function spawnIntentionalRumor(
  claim: string,
  valence: RumorValence,
  originFactionId: string | undefined,
  originDistrictId: string | undefined,
  tick: number,
  confidence: number = 0.8,
): PlayerRumor {
  return {
    id: nextRumorId(),
    claim,
    subjectDescriptor: 'the outsider',
    sourceEvent: 'player-leverage',
    originFactionId,
    originDistrictId,
    confidence,
    distortion: 0,
    mutationCount: 0,
    valence,
    spreadTo: originFactionId ? [originFactionId] : [],
    originTick: tick,
  };
}

/**
 * Deny a rumor: reduce its confidence by 0.3.
 * Returns a new rumor with reduced confidence.
 */
export function denyRumor(rumor: PlayerRumor): PlayerRumor {
  return {
    ...rumor,
    confidence: Math.max(0, rumor.confidence - 0.3),
  };
}

/**
 * Bury a rumor: double its distortion, accelerating decay and mutation.
 * Returns a new rumor with increased distortion.
 */
export function buryRumor(rumor: PlayerRumor): PlayerRumor {
  return {
    ...rumor,
    distortion: Math.min(1, rumor.distortion * 2 + 0.2),
    confidence: Math.max(0, rumor.confidence - 0.15),
  };
}

// --- Queries ---

/** Get all rumors known to a specific faction (originated or spread to). */
export function getRumorsKnownToFaction(rumors: PlayerRumor[], factionId: string): PlayerRumor[] {
  return rumors.filter(
    (r) => r.originFactionId === factionId || r.spreadTo.includes(factionId),
  );
}

/** Get all rumors that originated in a specific district. */
export function getRumorsInDistrict(rumors: PlayerRumor[], districtId: string): PlayerRumor[] {
  return rumors.filter((r) => r.originDistrictId === districtId);
}

// --- Director Display ---

/** Format a single rumor for the director /rumors view. */
export function formatRumorForDirector(rumor: PlayerRumor): string {
  const conf = Math.round(rumor.confidence * 100);
  const dist = Math.round(rumor.distortion * 100);
  const spread = rumor.spreadTo.length > 0 ? rumor.spreadTo.join(' → ') : 'none';
  const parts = [
    `  "${rumor.claim}"`,
    `    Subject: ${rumor.subjectDescriptor}`,
    `    Valence: ${rumor.valence} | Confidence: ${conf}% | Distortion: ${dist}%`,
    `    Origin: ${rumor.originFactionId ?? '?'} / ${rumor.originDistrictId ?? '?'} (tick ${rumor.originTick})`,
    `    Spread: ${spread}`,
    `    Mutations: ${rumor.mutationCount}`,
  ];
  if (rumor.sourceMilestone) {
    parts.splice(2, 0, `    Source: milestone "${rumor.sourceMilestone}"`);
  }
  return parts.join('\n');
}
