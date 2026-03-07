// Cross-discipline title resolution and entanglement lookup

import type { BuildCatalog, ClassEntanglement } from './types.js';

/**
 * Resolve the cross-discipline title for an archetype + discipline combo.
 * Returns undefined if no title is defined for this combination.
 */
export function resolveTitle(
  archetypeId: string,
  disciplineId: string,
  catalog: BuildCatalog,
): string | undefined {
  const entry = catalog.crossTitles.find(
    (ct) => ct.archetypeId === archetypeId && ct.disciplineId === disciplineId,
  );
  return entry?.title;
}

/**
 * Find all entanglements (friction effects) for an archetype + discipline combo.
 * Returns empty array if no entanglements exist.
 */
export function resolveEntanglements(
  archetypeId: string,
  disciplineId: string,
  catalog: BuildCatalog,
): ClassEntanglement[] {
  return catalog.entanglements.filter(
    (e) => e.archetypeId === archetypeId && e.disciplineId === disciplineId,
  );
}
