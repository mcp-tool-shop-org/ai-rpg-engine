// Build options — expose available choices given partial build state

import type {
  BuildCatalog,
  ArchetypeDefinition,
  BackgroundDefinition,
  TraitDefinition,
  DisciplineDefinition,
  CharacterBuild,
} from './types.js';

/** All archetypes available in this catalog. */
export function getAvailableArchetypes(catalog: BuildCatalog): ArchetypeDefinition[] {
  return catalog.archetypes;
}

/** All backgrounds available in this catalog. */
export function getAvailableBackgrounds(catalog: BuildCatalog): BackgroundDefinition[] {
  return catalog.backgrounds;
}

/**
 * Traits available given currently selected trait IDs.
 * Filters out already-selected and incompatible traits.
 */
export function getAvailableTraits(
  catalog: BuildCatalog,
  selectedTraitIds: string[],
): TraitDefinition[] {
  const selected = new Set(selectedTraitIds);

  // Collect all incompatible IDs from selected traits
  const blocked = new Set<string>();
  for (const tid of selectedTraitIds) {
    const trait = catalog.traits.find((t) => t.id === tid);
    if (trait?.incompatibleWith) {
      for (const incompat of trait.incompatibleWith) {
        blocked.add(incompat);
      }
    }
  }

  return catalog.traits.filter((t) => !selected.has(t.id) && !blocked.has(t.id));
}

/**
 * Disciplines available given the archetype and current tags.
 * Filters by requiredTags if the discipline has them.
 */
export function getAvailableDisciplines(
  catalog: BuildCatalog,
  _archetypeId: string,
  currentTags: string[],
): DisciplineDefinition[] {
  const tagSet = new Set(currentTags);
  return catalog.disciplines.filter((d) => {
    if (!d.requiredTags) return true;
    return d.requiredTags.every((tag) => tagSet.has(tag));
  });
}

/**
 * How many stat points remain in the budget given current allocations.
 */
export function getStatBudgetRemaining(
  build: Pick<CharacterBuild, 'statAllocations'>,
  catalog: BuildCatalog,
): number {
  if (!build.statAllocations) return catalog.statBudget;
  const spent = Object.values(build.statAllocations).reduce((sum, v) => sum + v, 0);
  return catalog.statBudget - spent;
}
