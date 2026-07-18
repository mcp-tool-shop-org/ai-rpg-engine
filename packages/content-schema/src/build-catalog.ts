// BuildCatalog self-consistency validation (F-2ae7c051)
//
// Nothing in the pipeline validated that a BuildCatalog is actually
// SATISFIABLE — that a player can, in principle, assemble a valid build from
// it. An unsatisfiable catalog (requiredFlaws exceeding the pack's actual
// flaw-tagged traits, requiredFlaws > maxTraits, or every flaw mutually
// incompatibleWith every other flaw) used to crash loudly at confirm time via
// resolveEntity's throw; since the character-builder retry gate (F-2c013eff)
// it instead traps the player in a structurally un-winnable retry loop with
// zero diagnosis. No shipped starter is affected — this exists to reject a
// future/third-party/hand-authored catalog at authoring time with a specific
// error instead of a runtime soft-lock.
//
// The structural type mirrors character-creation's BuildCatalog minimally
// (same pattern as AbilityPackRuleset in validate.ts) — content-schema sits
// BELOW character-creation in the dependency graph, so importing the real
// type would invert the layering.

import type { ValidationError, ValidationResult } from './validate.js';

/** Minimal trait shape needed for catalog-level consistency checks. */
export type BuildCatalogTraitShape = {
  id: string;
  category: string;
  incompatibleWith?: string[];
};

/** Minimal catalog shape (compatible with character-creation's BuildCatalog). */
export type BuildCatalogShape = {
  requiredFlaws: number;
  maxTraits: number;
  traits: BuildCatalogTraitShape[];
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Search for a mutually-compatible subset of `k` flaws via backtracking with
 * the standard "not enough candidates left" prune. Catalogs are hand-authored
 * and small, so this terminates instantly in practice; `budget` bounds the
 * node count so a pathological machine-generated graph degrades to
 * 'inconclusive' (surfaced as an advisory) rather than hanging the validator.
 */
function findCompatibleFlawSubset(
  n: number,
  incompatible: boolean[][],
  k: number,
  budget: { steps: number },
): 'found' | 'not-found' | 'inconclusive' {
  const chosen: number[] = [];
  let inconclusive = false;

  const pick = (start: number): boolean => {
    if (chosen.length === k) return true;
    if (n - start < k - chosen.length) return false; // prune: cannot reach k
    if (--budget.steps <= 0) {
      inconclusive = true;
      return false;
    }
    for (let i = start; i < n; i++) {
      if (chosen.every((c) => !incompatible[c][i])) {
        chosen.push(i);
        if (pick(i + 1)) return true;
        chosen.pop();
        if (inconclusive) return false;
      }
    }
    return false;
  };

  if (pick(0)) return 'found';
  return inconclusive ? 'inconclusive' : 'not-found';
}

/**
 * Validate a BuildCatalog's internal self-consistency: the flaw requirement
 * must be achievable given the catalog's own traits.
 *
 * Errors (blocking):
 * - structural: requiredFlaws/maxTraits not numbers, traits not an array,
 *   malformed trait entries, duplicate trait ids
 * - `requiredFlaws` > `maxTraits` (the required flaws can never fit)
 * - fewer selectable flaw-category traits than `requiredFlaws`
 * - no mutually-compatible subset of flaws of size `requiredFlaws` exists
 *   (satisfiability over the incompatibleWith graph, edges counted in either
 *   declared direction — validateBuild rejects a pair if EITHER side lists
 *   the other)
 *
 * Advisories (non-blocking): satisfiability search budget exhausted.
 */
export function validateBuildCatalog(
  catalog: unknown,
  path = 'BuildCatalog',
): ValidationResult & { advisories: ValidationError[] } {
  const errors: ValidationError[] = [];
  const advisories: ValidationError[] = [];

  if (!isObj(catalog)) {
    return {
      ok: false,
      errors: [{ path, message: `must be an object (got ${catalog === null ? 'null' : Array.isArray(catalog) ? 'array' : typeof catalog})` }],
      advisories,
    };
  }

  const requiredFlaws = catalog.requiredFlaws;
  const maxTraits = catalog.maxTraits;
  const traits = catalog.traits;

  if (typeof requiredFlaws !== 'number' || !Number.isFinite(requiredFlaws) || requiredFlaws < 0) {
    errors.push({ path: `${path}.requiredFlaws`, message: 'required non-negative number' });
  }
  if (typeof maxTraits !== 'number' || !Number.isFinite(maxTraits)) {
    errors.push({ path: `${path}.maxTraits`, message: 'required number' });
  }
  if (!Array.isArray(traits)) {
    errors.push({ path: `${path}.traits`, message: 'required array of TraitDefinition' });
  } else {
    const seenIds = new Set<string>();
    for (let i = 0; i < traits.length; i++) {
      const t: unknown = traits[i];
      const tp = `${path}.traits[${i}]`;
      if (!isObj(t)) {
        errors.push({ path: tp, message: 'must be an object' });
        continue;
      }
      if (typeof t.id !== 'string' || t.id.length === 0) {
        errors.push({ path: `${tp}.id`, message: 'required non-empty string' });
      } else {
        if (seenIds.has(t.id)) {
          errors.push({ path: `${tp}.id`, message: `duplicate trait id "${t.id}"` });
        }
        seenIds.add(t.id);
      }
      if (typeof t.category !== 'string') {
        errors.push({ path: `${tp}.category`, message: 'required string' });
      }
      if (t.incompatibleWith !== undefined) {
        if (!Array.isArray(t.incompatibleWith)) {
          errors.push({ path: `${tp}.incompatibleWith`, message: 'must be an array if provided' });
        } else {
          for (let j = 0; j < t.incompatibleWith.length; j++) {
            if (typeof t.incompatibleWith[j] !== 'string') {
              errors.push({ path: `${tp}.incompatibleWith[${j}]`, message: 'must be a string' });
            }
          }
        }
      }
    }
  }

  // Cannot reason about satisfiability over a structurally-broken catalog.
  if (errors.length > 0) return { ok: false, errors, advisories };

  const rf = requiredFlaws as number;
  const mt = maxTraits as number;
  const traitList = traits as BuildCatalogTraitShape[];

  if (rf === 0) return { ok: true, errors, advisories };

  if (rf > mt) {
    errors.push({
      path: `${path}.requiredFlaws`,
      message: `requiredFlaws (${rf}) exceeds maxTraits (${mt}) — the required flaws can never fit in a build, so every possible selection fails validation`,
    });
    return { ok: false, errors, advisories };
  }

  // A flaw that lists ITSELF as incompatible is unselectable (validateBuild
  // checks each trait's incompatibleWith against the full selected set, which
  // includes the trait's own id) — exclude it from the candidate pool.
  const flaws = traitList.filter(
    (t) => t.category === 'flaw' && !(t.incompatibleWith ?? []).includes(t.id),
  );

  if (flaws.length < rf) {
    errors.push({
      path: `${path}.traits`,
      message: `catalog requires ${rf} flaw${rf === 1 ? '' : 's'} but only ${flaws.length} selectable flaw-category trait${flaws.length === 1 ? ' is' : 's are'} defined — every possible selection fails "Not enough flaws"`,
    });
    return { ok: false, errors, advisories };
  }

  // Mutual-exclusion graph over the flaw candidates. validateBuild rejects a
  // selected pair when EITHER trait lists the other, so an edge exists if the
  // declaration appears in either direction.
  const byId = new Map(flaws.map((f, i) => [f.id, i]));
  const incompatible: boolean[][] = flaws.map(() => flaws.map(() => false));
  for (let i = 0; i < flaws.length; i++) {
    for (const otherId of flaws[i].incompatibleWith ?? []) {
      const j = byId.get(otherId);
      if (j !== undefined && j !== i) {
        incompatible[i][j] = true;
        incompatible[j][i] = true;
      }
    }
  }

  const verdict = findCompatibleFlawSubset(flaws.length, incompatible, rf, { steps: 100_000 });

  if (verdict === 'not-found') {
    errors.push({
      path: `${path}.traits`,
      message: `no mutually-compatible set of ${rf} flaw${rf === 1 ? '' : 's'} exists — the incompatibleWith graph makes the flaw requirement unsatisfiable, so every possible selection fails validation`,
    });
  } else if (verdict === 'inconclusive') {
    advisories.push({
      path: `${path}.traits`,
      message: `flaw-satisfiability search exhausted its budget on an unusually large/dense incompatibleWith graph — verify manually that ${rf} mutually-compatible flaws exist`,
    });
  }

  return { ok: errors.length === 0, errors, advisories };
}
