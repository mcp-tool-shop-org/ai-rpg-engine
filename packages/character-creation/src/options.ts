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

export type StatBudgetRemainingResult = {
  remaining: number;
  /** Named fields that were dropped (non-finite or negative) rather than summed. */
  errors: string[];
};

/**
 * Remaining budget plus named drop errors. Reuses validateBuild's per-stat
 * rule (F-d86a0a70 / F-3a74d1fe): a non-finite or negative allocation is not
 * spent — it is dropped, and the error names the field.
 */
export function inspectStatBudgetRemaining(
  build: Pick<CharacterBuild, 'statAllocations'>,
  catalog: BuildCatalog,
): StatBudgetRemainingResult {
  if (!build.statAllocations) return { remaining: catalog.statBudget, errors: [] };
  let spent = 0;
  const errors: string[] = [];
  for (const [stat, amount] of Object.entries(build.statAllocations)) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      const got =
        typeof amount !== 'number'
          ? typeof amount
          : Number.isNaN(amount)
            ? 'NaN'
            : amount === Infinity
              ? 'Infinity'
              : amount === -Infinity
                ? '-Infinity'
                : String(amount);
      errors.push(
        `statAllocations.${stat} is non-finite or negative (${got}) — dropped from remaining`,
      );
      continue;
    }
    spent += amount;
  }
  return { remaining: catalog.statBudget - spent, errors };
}

/**
 * How many stat points remain in the budget given current allocations.
 * Invalid (non-finite or negative) allocations are dropped, not summed.
 */
export function getStatBudgetRemaining(
  build: Pick<CharacterBuild, 'statAllocations'>,
  catalog: BuildCatalog,
): number {
  return inspectStatBudgetRemaining(build, catalog).remaining;
}
