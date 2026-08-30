import { describe, it, expect } from 'vitest';
import {
  getAvailableArchetypes,
  getAvailableBackgrounds,
  getAvailableTraits,
  getAvailableDisciplines,
  getStatBudgetRemaining,
  inspectStatBudgetRemaining,
} from './options.js';
import { testCatalog } from './test-fixtures.js';

describe('getAvailableArchetypes', () => {
  it('returns all archetypes', () => {
    const archetypes = getAvailableArchetypes(testCatalog);
    expect(archetypes).toHaveLength(3);
    expect(archetypes.map((a) => a.id)).toEqual(['warrior', 'mage', 'rogue']);
  });
});

describe('getAvailableBackgrounds', () => {
  it('returns all backgrounds', () => {
    const bgs = getAvailableBackgrounds(testCatalog);
    expect(bgs).toHaveLength(3);
  });
});

describe('getAvailableTraits', () => {
  it('returns all traits when none selected', () => {
    const traits = getAvailableTraits(testCatalog, []);
    expect(traits).toHaveLength(4);
  });

  it('excludes already-selected traits', () => {
    const traits = getAvailableTraits(testCatalog, ['tough']);
    expect(traits.find((t) => t.id === 'tough')).toBeUndefined();
  });

  it('excludes incompatible traits', () => {
    // frail is incompatible with tough
    const traits = getAvailableTraits(testCatalog, ['frail']);
    expect(traits.find((t) => t.id === 'tough')).toBeUndefined();
  });

  it('allows compatible traits', () => {
    const traits = getAvailableTraits(testCatalog, ['quick']);
    expect(traits.find((t) => t.id === 'tough')).toBeDefined();
    expect(traits.find((t) => t.id === 'cursed')).toBeDefined();
  });
});

describe('getAvailableDisciplines', () => {
  it('returns all disciplines when no tag requirements', () => {
    const discs = getAvailableDisciplines(testCatalog, 'warrior', ['martial']);
    expect(discs).toHaveLength(2);
  });

  it('filters by required tags', () => {
    const catalogWithTagReq = {
      ...testCatalog,
      disciplines: [
        ...testCatalog.disciplines,
        {
          id: 'sacred',
          name: 'Sacred Knight',
          description: 'Holy warrior',
          grantedVerb: 'pray',
          passive: { type: 'stat-modifier' as const, stat: 'wis', amount: 2 },
          drawback: { type: 'resource-modifier' as const, resource: 'mana', amount: -5 },
          requiredTags: ['noble'],
        },
      ],
    };
    // Without noble tag
    const without = getAvailableDisciplines(catalogWithTagReq, 'warrior', ['martial']);
    expect(without.find((d) => d.id === 'sacred')).toBeUndefined();

    // With noble tag
    const withTag = getAvailableDisciplines(catalogWithTagReq, 'warrior', ['martial', 'noble']);
    expect(withTag.find((d) => d.id === 'sacred')).toBeDefined();
  });
});

describe('getStatBudgetRemaining', () => {
  it('returns full budget when no allocations', () => {
    expect(getStatBudgetRemaining({}, testCatalog)).toBe(3);
  });

  it('subtracts spent points', () => {
    expect(getStatBudgetRemaining({ statAllocations: { str: 1, dex: 1 } }, testCatalog)).toBe(1);
  });

  it('returns zero when fully spent', () => {
    expect(getStatBudgetRemaining({ statAllocations: { str: 2, dex: 1 } }, testCatalog)).toBe(0);
  });

  // F-d86a0a70 / F-3a74d1fe: {str:-5, dex:8} sums to the budget (3) if the
  // dump is counted, so remaining used to report 0 — "spent to the penny" —
  // while validateBuild rejects the spread. Drop the negative; remaining is
  // budget - 8, not 0.
  it('does not go green on the F-3a74d1fe dump {str:-5, dex:8}', () => {
    const remaining = getStatBudgetRemaining({ statAllocations: { str: -5, dex: 8 } }, testCatalog);
    expect(remaining).not.toBe(0);
    expect(remaining).toBe(3 - 8);
    const report = inspectStatBudgetRemaining(
      { statAllocations: { str: -5, dex: 8 } },
      testCatalog,
    );
    expect(report.remaining).toBe(remaining);
    expect(report.errors.some((e) => e.includes('statAllocations.str'))).toBe(true);
    expect(report.errors.some((e) => /non-finite or negative/i.test(e))).toBe(true);
  });

  it('drops a NaN allocation by name instead of reporting remaining NaN', () => {
    const report = inspectStatBudgetRemaining(
      { statAllocations: { str: NaN } },
      testCatalog,
    );
    expect(Number.isNaN(report.remaining)).toBe(false);
    expect(report.remaining).toBe(3);
    expect(report.errors.some((e) => e.includes('statAllocations.str') && /NaN/.test(e))).toBe(true);
  });
});
