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
  | 'historical';

export const VALID_GENRES: PackGenre[] = [
  'fantasy', 'sci-fi', 'cyberpunk', 'horror', 'mystery',
  'western', 'pirate', 'post-apocalyptic', 'historical',
];

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

// --- Pack Entry (registry-internal) ---

export type PackEntry = {
  meta: PackMetadata;
  manifest: GameManifest;
  ruleset: RulesetDefinition;
  createGame: (seed?: number) => Engine;
};

// --- Pack Summary (for display) ---

export type PackSummary = {
  id: string;
  name: string;
  tagline: string;
  genres: PackGenre[];
  difficulty: PackDifficulty;
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
