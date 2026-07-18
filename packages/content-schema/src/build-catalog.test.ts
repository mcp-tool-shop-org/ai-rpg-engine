// validateBuildCatalog — catalog-level self-consistency (F-2ae7c051).
//
// Before the character-builder retry gate (F-2c013eff), an unsatisfiable
// catalog crashed loudly at confirm time via resolveEntity's throw. After it,
// the same catalog traps the player in a silent, structurally un-winnable
// retry loop — every possible trait selection re-fails "Not enough flaws" or
// "Incompatible traits" forever. These tests pin the authoring-time rejection
// that makes such a catalog impossible to ship undiagnosed.

import { describe, it, expect } from 'vitest';
import { validateBuildCatalog, type BuildCatalogShape } from './build-catalog.js';

type Trait = BuildCatalogShape['traits'][number];

function trait(id: string, category: string, incompatibleWith?: string[]): Trait {
  return { id, category, ...(incompatibleWith ? { incompatibleWith } : {}) };
}

function catalog(overrides: Partial<BuildCatalogShape> = {}): BuildCatalogShape {
  return {
    requiredFlaws: 1,
    maxTraits: 3,
    traits: [
      trait('brave', 'perk', ['reckless']),
      trait('reckless', 'flaw', ['brave']),
      trait('lucky', 'flaw'),
    ],
    ...overrides,
  };
}

describe('validateBuildCatalog — satisfiable catalogs pass', () => {
  it('accepts a well-formed satisfiable catalog (the cli fixture shape)', () => {
    const r = validateBuildCatalog(catalog());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.advisories).toEqual([]);
  });

  it('accepts requiredFlaws: 0 even with zero flaw traits', () => {
    const r = validateBuildCatalog(catalog({ requiredFlaws: 0, traits: [trait('brave', 'perk')] }));
    expect(r.ok).toBe(true);
  });

  it('perk↔flaw incompatibilities do NOT count against flaw satisfiability', () => {
    // Both flaws conflict with the perk, but not with each other — a player
    // simply skips the perk.
    const r = validateBuildCatalog(catalog({
      requiredFlaws: 2,
      traits: [
        trait('shiny', 'perk', ['grim', 'dour']),
        trait('grim', 'flaw', ['shiny']),
        trait('dour', 'flaw', ['shiny']),
      ],
    }));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('finds a compatible pair inside a partially-conflicting flaw set', () => {
    // a↔b conflict, but a+c and b+c are both fine — satisfiable.
    const r = validateBuildCatalog(catalog({
      requiredFlaws: 2,
      traits: [
        trait('a', 'flaw', ['b']),
        trait('b', 'flaw', ['a']),
        trait('c', 'flaw'),
      ],
    }));
    expect(r.ok).toBe(true);
  });
});

describe('validateBuildCatalog — unsatisfiable catalogs are rejected with a specific error', () => {
  it('rejects requiredFlaws exceeding the number of flaw-category traits', () => {
    const r = validateBuildCatalog(catalog({ requiredFlaws: 2 })); // only reckless+lucky... wait: 2 flaws exist
    // fixture has exactly 2 flaws and they are compatible — bump to 3 for the failure
    const r3 = validateBuildCatalog(catalog({ requiredFlaws: 3, maxTraits: 5 }));
    expect(r.ok).toBe(true);
    expect(r3.ok).toBe(false);
    expect(r3.errors.some((e) => e.message.includes('Not enough flaws') || e.message.includes('flaw'))).toBe(true);
  });

  it('rejects requiredFlaws > maxTraits (the flaws can never fit in a build)', () => {
    const r = validateBuildCatalog(catalog({ requiredFlaws: 4, maxTraits: 3 }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('requiredFlaws') && e.message.includes('maxTraits'))).toBe(true);
  });

  it('rejects two required flaws that are mutually incompatible (declared BOTH directions)', () => {
    const r = validateBuildCatalog(catalog({
      requiredFlaws: 2,
      traits: [
        trait('grim', 'flaw', ['dour']),
        trait('dour', 'flaw', ['grim']),
      ],
    }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('mutually-compatible'))).toBe(true);
  });

  it('rejects when the conflict is declared in only ONE direction (validateBuild rejects either way)', () => {
    const r = validateBuildCatalog(catalog({
      requiredFlaws: 2,
      traits: [
        trait('grim', 'flaw', ['dour']),
        trait('dour', 'flaw'), // dour does not list grim back
      ],
    }));
    expect(r.ok).toBe(false);
  });

  it('rejects a pairwise-incompatible triangle needing any 2', () => {
    const r = validateBuildCatalog(catalog({
      requiredFlaws: 2,
      traits: [
        trait('a', 'flaw', ['b', 'c']),
        trait('b', 'flaw', ['a', 'c']),
        trait('c', 'flaw', ['a', 'b']),
      ],
    }));
    expect(r.ok).toBe(false);
  });

  it('treats a self-incompatible flaw as unselectable', () => {
    // validateBuild checks incompatibleWith against the FULL selected set —
    // which includes the trait's own id — so this flaw can never be chosen.
    const r = validateBuildCatalog(catalog({
      requiredFlaws: 1,
      traits: [trait('cursed-self', 'flaw', ['cursed-self'])],
    }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('selectable'))).toBe(true);
  });
});

describe('validateBuildCatalog — structural validation', () => {
  it('rejects a non-object catalog', () => {
    expect(validateBuildCatalog(null).ok).toBe(false);
    expect(validateBuildCatalog([]).ok).toBe(false);
    expect(validateBuildCatalog('catalog').ok).toBe(false);
  });

  it('rejects non-numeric requiredFlaws / maxTraits and non-array traits, naming the paths', () => {
    const r = validateBuildCatalog({ requiredFlaws: 'one', maxTraits: null, traits: 'nope' });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.endsWith('requiredFlaws'))).toBe(true);
    expect(r.errors.some((e) => e.path.endsWith('maxTraits'))).toBe(true);
    expect(r.errors.some((e) => e.path.endsWith('traits'))).toBe(true);
  });

  it('rejects malformed trait entries with element-level paths', () => {
    const r = validateBuildCatalog(catalog({
      traits: [trait('ok', 'flaw'), null as unknown as Trait, { id: '', category: 7, incompatibleWith: [42] } as unknown as Trait],
    }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('traits[1]'))).toBe(true);
    expect(r.errors.some((e) => e.path.includes('traits[2].id'))).toBe(true);
    expect(r.errors.some((e) => e.path.includes('traits[2].category'))).toBe(true);
    expect(r.errors.some((e) => e.path.includes('traits[2].incompatibleWith[0]'))).toBe(true);
  });

  it('rejects duplicate trait ids (they would double-count toward satisfiability)', () => {
    const r = validateBuildCatalog(catalog({
      requiredFlaws: 2,
      traits: [trait('grim', 'flaw'), trait('grim', 'flaw')],
    }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate trait id'))).toBe(true);
  });
});
