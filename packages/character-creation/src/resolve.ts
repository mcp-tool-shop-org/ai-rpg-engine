// Build resolution — converts a validated CharacterBuild into an EntityState

import type { EntityState, RulesetDefinition } from '@ai-rpg-engine/core';
import type { CharacterBuild, BuildCatalog } from './types.js';
import { validateBuild } from './validate.js';

// --- Structured resolution error (F-6c1a8f3d) ---
//
// resolveEntity previously threw a plain `Error` — the one unstructured error
// boundary in a domain where every sibling carries a machine-readable code +
// hint (core's SaveLoadError/ManifestError, this package's own BuildLoadError
// in serialize.ts, cli's [CODE]-prefixed messages). Callers other than the
// already-hardened CLI (a GUI, test harness, or programmatic build pipeline)
// could only pattern-match the message string. The message format is
// unchanged (`Invalid build: ...`) so existing string-matching callers keep
// working; the class adds `code`, `hint`, and the raw validation errors as
// structured `details`.

/** Structured error thrown when a build cannot be resolved into an entity. */
export type BuildResolutionErrorShape = {
  code: 'BUILD_INVALID';
  message: string;
  hint: string;
  /** The raw validation errors, individually (not just a joined string). */
  details: string[];
};

export class BuildResolutionError extends Error {
  readonly code: BuildResolutionErrorShape['code'] = 'BUILD_INVALID';
  readonly hint: string;
  readonly details: string[];
  constructor(details: string[], message?: string) {
    super(message ?? `Invalid build: ${details.join('; ')}`);
    this.name = 'BuildResolutionError';
    this.hint = 'Fix the listed problems in the CharacterBuild (or validate with validateBuild first) and retry.';
    this.details = details;
  }
}

/**
 * Resolve a character build into a playable EntityState.
 * Throws a structured BuildResolutionError (code BUILD_INVALID) if the build
 * fails validation against the catalog + ruleset.
 */
export function resolveEntity(
  build: CharacterBuild,
  catalog: BuildCatalog,
  ruleset: RulesetDefinition,
): EntityState {
  const result = validateBuild(build, catalog, ruleset);

  if (!result.ok) {
    throw new BuildResolutionError(result.errors);
  }

  // Defensive: unreachable after a passing validateBuild (which already
  // rejects unknown archetype/background ids), but kept structured for the
  // same machine-readable contract.
  const archetype = catalog.archetypes.find((a) => a.id === build.archetypeId);
  if (!archetype) {
    throw new BuildResolutionError(
      [`Unknown archetype: ${build.archetypeId}`],
      'Archetype not found: ' + build.archetypeId,
    );
  }
  const background = catalog.backgrounds.find((b) => b.id === build.backgroundId);
  if (!background) {
    throw new BuildResolutionError(
      [`Unknown background: ${build.backgroundId}`],
      'Background not found: ' + build.backgroundId,
    );
  }

  // Collect starting inventory
  const inventory: string[] = [];
  if (archetype.startingInventory) inventory.push(...archetype.startingInventory);
  if (background.startingInventory) inventory.push(...background.startingInventory);

  // Build custom metadata
  const custom: Record<string, string | number | boolean> = {
    archetypeId: build.archetypeId,
    backgroundId: build.backgroundId,
  };
  if (build.disciplineId) custom.disciplineId = build.disciplineId;
  if (build.portraitRef) custom.portraitRef = build.portraitRef;
  if (result.resolvedTitle) custom.title = result.resolvedTitle;

  return {
    id: 'player',
    blueprintId: build.archetypeId,
    type: 'player',
    name: build.name,
    tags: result.resolvedTags,
    stats: result.finalStats,
    resources: result.finalResources,
    statuses: [],
    inventory,
    custom,
  };
}
