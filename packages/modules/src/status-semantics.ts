// status-semantics — semantic tag vocabulary, status definition registry,
// and resistance-checking logic for the ability system.
//
// Pure functions + module-level registry. No EngineModule needed.
// Designed for ability-effects integration, AI scoring, and pack validation.

import type { StatusDefinition } from '@ai-rpg-engine/content-schema';
import type { EntityState, ResistanceLevel } from '@ai-rpg-engine/core';

// ---------------------------------------------------------------------------
// Semantic Tag Vocabulary
// ---------------------------------------------------------------------------

/** Fixed vocabulary of semantic status tags. All StatusDefinitions should use only these. */
export const STATUS_SEMANTIC_TAGS = [
  'buff',
  'debuff',
  'fear',
  'control',
  'blind',
  'stance',
  'holy',
  'breach',
  'poison',
  'supernatural',
  'wound',
] as const;

export type StatusSemanticTag = (typeof STATUS_SEMANTIC_TAGS)[number];

/** Check whether a string is a known semantic tag */
export function isKnownStatusTag(tag: string): tag is StatusSemanticTag {
  return (STATUS_SEMANTIC_TAGS as readonly string[]).includes(tag);
}

// ---------------------------------------------------------------------------
// Status Definition Registry
// ---------------------------------------------------------------------------
//
// MC-04 assessment: this is a PROCESS-GLOBAL, append-only *definition* registry
// (statusId → its semantic tags), not per-game world state. The mapping is
// content metadata — "poisoned" carries the same semantic tags wherever it is
// defined — so sharing it across Engine instances in one process is intentional,
// not a leak of mutable game state. Registration is idempotent (keyed by id;
// last write wins), so re-registering a pack is safe and never accumulates
// duplicates. Callers that need a clean slate between unrelated packs (tests,
// multi-pack tooling) call `clearStatusRegistry()`; that is the supported
// isolation mechanism. (Threading a per-instance registry would require changing
// every starter pack's free-function call site — out of scope here — and buys
// nothing for content metadata that is definitionally global.)

const statusRegistry = new Map<string, StatusDefinition>();

/** Register one or more StatusDefinitions into the global registry. Idempotent — re-registering same ID overwrites, never duplicates. */
export function registerStatusDefinitions(defs: StatusDefinition[]): void {
  for (const def of defs) {
    statusRegistry.set(def.id, def);
  }
}

/** Look up a StatusDefinition by ID. Returns undefined if not registered. */
export function getStatusDefinition(statusId: string): StatusDefinition | undefined {
  return statusRegistry.get(statusId);
}

/** Get semantic tags for a status ID. Returns empty array if not registered. */
export function getStatusTags(statusId: string): string[] {
  return statusRegistry.get(statusId)?.tags ?? [];
}

/** Get all registered status IDs (for testing/inspection). */
export function getRegisteredStatusIds(): string[] {
  return [...statusRegistry.keys()];
}

/** Clear the registry (for testing only). */
export function clearStatusRegistry(): void {
  statusRegistry.clear();
}

// ---------------------------------------------------------------------------
// Resistance Checking
// ---------------------------------------------------------------------------

/**
 * Check an entity's resistance to a given status.
 *
 * For each semantic tag on the status, checks `entity.resistances[tag]`.
 * Priority: immune > resistant > vulnerable > null.
 *
 * Returns the strongest applicable resistance level, or null if none.
 */
export function checkResistance(
  entity: EntityState,
  statusId: string,
): ResistanceLevel | null {
  if (!entity.resistances) return null;

  const tags = getStatusTags(statusId);
  if (tags.length === 0) return null;

  let hasResistant = false;
  let hasVulnerable = false;

  for (const tag of tags) {
    const level = entity.resistances[tag];
    if (level === 'immune') return 'immune'; // Highest priority — return immediately
    if (level === 'resistant') hasResistant = true;
    if (level === 'vulnerable') hasVulnerable = true;
  }

  // resistant > vulnerable when both present (defensive bias)
  if (hasResistant) return 'resistant';
  if (hasVulnerable) return 'vulnerable';
  return null;
}

/**
 * Adjust a duration based on resistance level.
 *
 * - immune: returns 0 (caller should block application entirely)
 * - resistant: halves duration (minimum 1)
 * - vulnerable: doubles duration
 * - null: returns original duration unchanged
 */
export function applyResistanceToDuration(
  duration: number | undefined,
  level: ResistanceLevel | null,
): number | undefined {
  if (level === null || duration === undefined) return duration;

  switch (level) {
    case 'immune':
      return 0;
    case 'resistant':
      return Math.max(1, Math.floor(duration / 2));
    case 'vulnerable':
      return duration * 2;
    default:
      return duration;
  }
}
