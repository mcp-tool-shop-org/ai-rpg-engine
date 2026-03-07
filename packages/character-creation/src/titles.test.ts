import { describe, it, expect } from 'vitest';
import { resolveTitle, resolveEntanglements } from './titles.js';
import { testCatalog } from './test-fixtures.js';

describe('resolveTitle', () => {
  it('resolves a known archetype + discipline combo', () => {
    expect(resolveTitle('warrior', 'occultist', testCatalog)).toBe('Grave Warden');
    expect(resolveTitle('warrior', 'smuggler', testCatalog)).toBe('Iron Fence');
    expect(resolveTitle('mage', 'occultist', testCatalog)).toBe('Doomcaller');
    expect(resolveTitle('mage', 'smuggler', testCatalog)).toBe('Relic Runner');
    expect(resolveTitle('rogue', 'occultist', testCatalog)).toBe('Ink-Seer');
    expect(resolveTitle('rogue', 'smuggler', testCatalog)).toBe('Shadow Broker');
  });

  it('returns undefined for unknown combo', () => {
    expect(resolveTitle('warrior', 'necromancer', testCatalog)).toBeUndefined();
    expect(resolveTitle('paladin', 'occultist', testCatalog)).toBeUndefined();
  });
});

describe('resolveEntanglements', () => {
  it('returns entanglements for a known combo', () => {
    const ents = resolveEntanglements('mage', 'smuggler', testCatalog);
    expect(ents).toHaveLength(1);
    expect(ents[0].id).toBe('divine-smuggler');
    expect(ents[0].effects[0]).toEqual({ type: 'grant-tag', tag: 'wanted' });
  });

  it('returns empty array for combo without entanglements', () => {
    const ents = resolveEntanglements('warrior', 'occultist', testCatalog);
    expect(ents).toHaveLength(0);
  });
});
