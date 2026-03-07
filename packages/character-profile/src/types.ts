// Character profile types — persistent identity across sessions

import type { CharacterBuild } from '@ai-rpg-engine/character-creation';
import type { Loadout } from '@ai-rpg-engine/equipment';

// --- Progression ---

/** XP thresholds and current state. */
export type ProgressionState = {
  xp: number;
  level: number;
  archetypeRank: number;
  disciplineRank: number;
  /** Traits that have evolved (original → upgraded ID). */
  traitEvolutions: TraitEvolution[];
};

/** A trait that upgraded during play. */
export type TraitEvolution = {
  originalTraitId: string;
  evolvedTraitId: string;
  /** When (in-game turn or event) the evolution happened. */
  evolvedAt: string;
};

// --- Injuries ---

/** An injury sustained during play. */
export type Injury = {
  id: string;
  name: string;
  description: string;
  /** Stat penalties while active. */
  statPenalties: Record<string, number>;
  /** Resource penalties while active. */
  resourcePenalties: Record<string, number>;
  /** Tags granted while injured (e.g. 'limping'). */
  grantedTags: string[];
  /** Whether this injury has been healed. */
  healed: boolean;
  /** When the injury was sustained. */
  sustainedAt: string;
  /** When the injury was healed (if healed). */
  healedAt?: string;
};

// --- Milestones ---

/** A notable event recorded in the character's history. */
export type Milestone = {
  id: string;
  label: string;
  description: string;
  /** Turn number or timestamp. */
  at: string;
  /** Tags associated with this milestone. */
  tags: string[];
};

// --- Reputation ---

/** Faction reputation state. */
export type ReputationEntry = {
  factionId: string;
  value: number;
};

// --- Character Profile ---

/** Full persistent character profile. */
export type CharacterProfile = {
  /** Unique profile ID. */
  id: string;
  /** Schema version for migration. */
  version: number;
  /** Original character build choices. */
  build: CharacterBuild;
  /** Current stats snapshot. */
  stats: Record<string, number>;
  /** Current resource values. */
  resources: Record<string, number>;
  /** Active tags. */
  tags: string[];
  /** Equipment and inventory state. */
  loadout: Loadout;
  /** Progression (XP, level, ranks). */
  progression: ProgressionState;
  /** Active and healed injuries. */
  injuries: Injury[];
  /** Recorded milestones. */
  milestones: Milestone[];
  /** Faction reputation. */
  reputation: ReputationEntry[];
  /** Portrait asset hash (from asset-registry). */
  portraitRef?: string;
  /** Pack ID this profile was created with. */
  packId: string;
  /** ISO timestamp of profile creation. */
  createdAt: string;
  /** ISO timestamp of last save. */
  updatedAt: string;
  /** Total play turns. */
  totalTurns: number;
  /** Custom metadata. */
  custom: Record<string, string | number | boolean>;
};

/** Current schema version. */
export const PROFILE_VERSION = 1;

/** XP required to reach a given level. */
export const XP_THRESHOLDS: readonly number[] = [
  0,     // level 1 (starting)
  100,   // level 2
  250,   // level 3
  500,   // level 4
  1000,  // level 5
  2000,  // level 6
  4000,  // level 7
  7000,  // level 8
  11000, // level 9
  16000, // level 10
];

/** Max archetype rank. */
export const MAX_ARCHETYPE_RANK = 5;

/** Max discipline rank. */
export const MAX_DISCIPLINE_RANK = 3;
