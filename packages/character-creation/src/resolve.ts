// Build resolution — converts a validated CharacterBuild into an EntityState

import type { EntityState, RulesetDefinition } from '@ai-rpg-engine/core';
import type { CharacterBuild, BuildCatalog } from './types.js';
import { validateBuild } from './validate.js';

/**
 * Resolve a character build into a playable EntityState.
 * Throws if the build is invalid.
 */
export function resolveEntity(
  build: CharacterBuild,
  catalog: BuildCatalog,
  ruleset: RulesetDefinition,
): EntityState {
  const result = validateBuild(build, catalog, ruleset);

  if (!result.ok) {
    throw new Error(`Invalid build: ${result.errors.join('; ')}`);
  }

  const archetype = catalog.archetypes.find((a) => a.id === build.archetypeId)!;
  const background = catalog.backgrounds.find((b) => b.id === build.backgroundId)!;

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
