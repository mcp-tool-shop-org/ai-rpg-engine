// Build options — expose available choices given partial build state

import type {
  BuildCatalog,
  ArchetypeDefinition,
  BackgroundDefinition,
  TraitDefinition,
  DisciplineDefinition,
  CharacterBuild,
  BuildRng,
  SuggestBuildOptions,
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

function pickOne<T>(rng: BuildRng, arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error('suggestBuild: cannot pick from an empty list');
  }
  if (rng.pick) return rng.pick(arr);
  const index = Math.min(arr.length - 1, Math.floor(rng.next() * arr.length));
  return arr[index]!;
}

/**
 * Both incompatibility directions (do not wait on F-3919d5ec): a candidate
 * is blocked if it lists a selected trait OR a selected trait lists it.
 */
function isBidirectionalCompatible(
  catalog: BuildCatalog,
  selectedIds: readonly string[],
  candidate: TraitDefinition,
): boolean {
  const selected = new Set(selectedIds);
  if (candidate.incompatibleWith?.some((id) => selected.has(id))) return false;
  for (const id of selectedIds) {
    const trait = catalog.traits.find((t) => t.id === id);
    if (trait?.incompatibleWith?.includes(candidate.id)) return false;
  }
  return true;
}

function availableTraitsBothWays(
  catalog: BuildCatalog,
  selectedIds: readonly string[],
): TraitDefinition[] {
  return getAvailableTraits(catalog, [...selectedIds]).filter((t) =>
    isBidirectionalCompatible(catalog, selectedIds, t),
  );
}

function collectedTags(
  catalog: BuildCatalog,
  archetypeId: string,
  backgroundId: string,
  traitIds: readonly string[],
): string[] {
  const tags: string[] = [];
  const archetype = catalog.archetypes.find((a) => a.id === archetypeId);
  const background = catalog.backgrounds.find((b) => b.id === backgroundId);
  if (archetype) tags.push(...archetype.startingTags);
  if (background) tags.push(...background.startingTags);
  for (const tid of traitIds) {
    const trait = catalog.traits.find((t) => t.id === tid);
    if (!trait) continue;
    for (const eff of trait.effects) {
      if (eff.type === 'grant-tag') tags.push(eff.tag);
    }
  }
  return tags;
}

function spendBudget(catalog: BuildCatalog, archetype: ArchetypeDefinition, rng: BuildRng): Record<string, number> | undefined {
  if (catalog.statBudget <= 0) return undefined;
  const stats = Object.keys(archetype.statPriorities).sort();
  if (stats.length === 0) return undefined;
  const allocations: Record<string, number> = {};
  for (let i = 0; i < catalog.statBudget; i++) {
    const stat = pickOne(rng, stats);
    allocations[stat] = (allocations[stat] ?? 0) + 1;
  }
  return allocations;
}

const NAME_SYLLABLES = ['al', 'dor', 'ken', 'mir', 'ra', 'ven', 'tor', 'sia', 'hal', 'wyn'] as const;

function suggestName(rng: BuildRng): string {
  const a = pickOne(rng, NAME_SYLLABLES);
  const b = pickOne(rng, NAME_SYLLABLES);
  return a.charAt(0).toUpperCase() + a.slice(1) + b;
}

/**
 * Seeded generator that returns a CharacterBuild `validateBuild` will accept
 * (F-6c97c2dc). Consumes only the caller-supplied rng — never Math.random.
 * Two calls with the same rng seed are deep-equal.
 */
export function suggestBuild(
  catalog: BuildCatalog,
  rng: BuildRng,
  opts: SuggestBuildOptions = {},
): CharacterBuild {
  if (catalog.archetypes.length === 0) {
    throw new Error('suggestBuild: catalog has no archetypes');
  }
  if (catalog.backgrounds.length === 0) {
    throw new Error('suggestBuild: catalog has no backgrounds');
  }

  const archetype = opts.archetypeId
    ? (catalog.archetypes.find((a) => a.id === opts.archetypeId) ?? pickOne(rng, catalog.archetypes))
    : pickOne(rng, catalog.archetypes);
  const background = opts.backgroundId
    ? (catalog.backgrounds.find((b) => b.id === opts.backgroundId) ?? pickOne(rng, catalog.backgrounds))
    : pickOne(rng, catalog.backgrounds);

  const traitIds: string[] = [];

  const take = (category: TraitDefinition['category'], count: number) => {
    for (let n = 0; n < count; n++) {
      const pool = availableTraitsBothWays(catalog, traitIds).filter((t) => t.category === category);
      if (pool.length === 0) break;
      traitIds.push(pickOne(rng, pool).id);
    }
  };

  take('flaw', catalog.requiredFlaws);
  const remainingSlots = Math.max(0, catalog.maxTraits - traitIds.length);
  take('perk', remainingSlots);

  const tags = collectedTags(catalog, archetype.id, background.id, traitIds);
  let disciplineId: string | undefined;
  if (opts.disciplineId === null) {
    disciplineId = undefined;
  } else if (opts.disciplineId) {
    const legal = getAvailableDisciplines(catalog, archetype.id, tags);
    disciplineId = legal.some((d) => d.id === opts.disciplineId) ? opts.disciplineId : legal[0]?.id;
  } else {
    const legal = getAvailableDisciplines(catalog, archetype.id, tags);
    if (legal.length > 0) disciplineId = pickOne(rng, legal).id;
  }

  const statAllocations = spendBudget(catalog, archetype, rng);

  const build: CharacterBuild = {
    name: opts.name ?? suggestName(rng),
    archetypeId: archetype.id,
    backgroundId: background.id,
    traitIds,
  };
  if (disciplineId) build.disciplineId = disciplineId;
  if (statAllocations) build.statAllocations = statAllocations;
  return build;
}
