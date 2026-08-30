// Pack registry types — metadata, entries, rubric results

import type { GameManifest, RulesetDefinition } from '@ai-rpg-engine/core';
import type { Engine } from '@ai-rpg-engine/core';

// --- Genre / Difficulty / Tone enums ---

export type PackGenre =
  | 'fantasy'
  | 'sci-fi'
  | 'cyberpunk'
  | 'horror'
  | 'mystery'
  | 'western'
  | 'pirate'
  | 'post-apocalyptic'
  | 'historical'
  // Trade, debt, and obligation as the primary loop rather than as a shop menu
  // (Salt Road Ledger). A closed union, so a pack occupying a genuinely new
  // niche needs a member added here — the alternative was reusing an existing
  // genre, which passes the rubric's distinct-narrative-fantasy dimension on a
  // technicality while making the pack undiscoverable via filterPacks({ genre }).
  | 'mercantile'
  // Hunting people for money as the primary loop — the board, the informant,
  // the taking, and which half of a city will still open a door to you
  // afterward (Hue and Cry). Added for the same reason 'mercantile' was: this
  // union is closed, and reusing 'mystery' or 'historical' would satisfy the
  // rubric's distinct-narrative-fantasy dimension on a technicality while
  // making the pack undiscoverable via filterPacks({ genre: 'pursuit' }).
  | 'pursuit';

export const VALID_GENRES: PackGenre[] = [
  'fantasy', 'sci-fi', 'cyberpunk', 'horror', 'mystery',
  'western', 'pirate', 'post-apocalyptic', 'historical', 'mercantile', 'pursuit',
];

/**
 * Human listing labels for PackGenre tokens. `genres` stays the closed-union
 * filter key (`filterPacks({ genre: 'pursuit' })`); a pack-selection UI that
 * interpolates summary.genreLabels never prints the raw token.
 */
export const PACK_GENRE_LABELS: Record<PackGenre, string> = {
  fantasy: 'Fantasy',
  'sci-fi': 'Sci-fi',
  cyberpunk: 'Cyberpunk',
  horror: 'Horror',
  mystery: 'Mystery',
  western: 'Western',
  pirate: 'Pirate',
  'post-apocalyptic': 'Post-apocalyptic',
  historical: 'Historical',
  mercantile: 'Mercantile',
  pursuit: 'Pursuit / thief-taker',
};

export function genreLabel(genre: PackGenre): string {
  return PACK_GENRE_LABELS[genre];
}

export type PackDifficulty = 'beginner' | 'intermediate' | 'advanced';

export const VALID_DIFFICULTIES: PackDifficulty[] = ['beginner', 'intermediate', 'advanced'];

export type PackTone =
  | 'dark'
  | 'gritty'
  | 'heroic'
  | 'noir'
  | 'comedic'
  | 'eerie'
  | 'tense'
  | 'atmospheric';

export const VALID_TONES: PackTone[] = [
  'dark', 'gritty', 'heroic', 'noir', 'comedic', 'eerie', 'tense', 'atmospheric',
];

// --- Pack Metadata (exported by each starter pack) ---

export type PackMetadata = {
  /** Must match manifest.id */
  id: string;
  /** Human-readable name */
  name: string;
  /** One-line marketing tagline */
  tagline: string;
  /** Genre tags for filtering */
  genres: PackGenre[];
  /** Primary difficulty level */
  difficulty: PackDifficulty;
  /** Narrative tone descriptors */
  tones: PackTone[];
  /** Free-form tags for search/filtering */
  tags: string[];
  /** Minimum engine version (semver) */
  engineVersion: string;
  /** Pack version */
  version: string;
  /** Short description (1-3 sentences) */
  description: string;
  /** Tone string for claude-rpg narrator */
  narratorTone: string;
};

// --- District topology (rubric inspection surface) ---

/**
 * Structural subset of the modules package's DistrictDefinition — just the
 * fields the faction-topology rubric dimension inspects. Declared locally so
 * pack-registry does not need a dependency on @ai-rpg-engine/modules; a real
 * DistrictDefinition is directly assignable to this shape.
 */
export type PackDistrictInfo = {
  id: string;
  controllingFaction?: string;
};

// --- Pack Entry (registry-internal) ---

export type PackEntry = {
  meta: PackMetadata;
  manifest: GameManifest;
  ruleset: RulesetDefinition;
  /**
   * District topology declared by the pack (id + controllingFaction per
   * district). Inspected by the `distinct-faction-topology` rubric dimension:
   * a pack with no faction-controlled district fails that dimension.
   */
  districts?: PackDistrictInfo[];
  createGame: (seed?: number) => Engine;
};

// --- Pack Summary (for display) ---

export type PackSummary = {
  id: string;
  name: string;
  /** One-line listing title */
  tagline: string;
  /** Short description (1-3 sentences) — listing subtitle */
  description: string;
  /** Pack version, lockstep with the package.json version */
  version: string;
  genres: PackGenre[];
  /** Human labels parallel to `genres` (e.g. pursuit → 'Pursuit / thief-taker') */
  genreLabels: string[];
  difficulty: PackDifficulty;
  /** Tone chips for the listing */
  tones: PackTone[];
};

// --- Filter ---

export type PackFilter = {
  genre?: PackGenre;
  difficulty?: PackDifficulty;
  tone?: PackTone;
  tag?: string;
};

// --- Rubric Types ---

export type RubricDimension =
  | 'distinct-verbs'
  | 'distinct-resource-pressure'
  | 'distinct-faction-topology'
  | 'distinct-presentation-rule'
  | 'distinct-audio-palette'
  | 'distinct-failure-mode'
  | 'distinct-narrative-fantasy';

export const RUBRIC_DIMENSIONS: RubricDimension[] = [
  'distinct-verbs',
  'distinct-resource-pressure',
  'distinct-faction-topology',
  'distinct-presentation-rule',
  'distinct-audio-palette',
  'distinct-failure-mode',
  'distinct-narrative-fantasy',
];

export type RubricCheck = {
  dimension: RubricDimension;
  passed: boolean;
  detail: string;
};

export type RubricResult = {
  packId: string;
  ok: boolean;
  checks: RubricCheck[];
  score: number;
};
