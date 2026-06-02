// Weird-West content integrity tests
//
// ST-01: archetypes referenced a progression tree id with a "-path" suffix
// ("gunslinger-path") that did not match the actual tree id ("gunslinger"). The
// reference must resolve to a real tree, otherwise character creation hands the
// player a build pointing at a non-existent progression tree.

import { describe, it, expect } from 'vitest';
import { buildCatalog, gunslingerTree } from './content.js';

describe('weird-west content — progression tree references', () => {
  it('every archetype.progressionTreeId resolves to a defined tree', () => {
    const treeIds = new Set([gunslingerTree.id]);
    for (const archetype of buildCatalog.archetypes) {
      if (archetype.progressionTreeId === undefined) continue;
      expect(
        treeIds.has(archetype.progressionTreeId),
        `archetype "${archetype.id}" references missing tree "${archetype.progressionTreeId}" (known: ${[...treeIds].join(', ')})`,
      ).toBe(true);
    }
  });

  it('the gunslinger tree id is "gunslinger"', () => {
    expect(gunslingerTree.id).toBe('gunslinger');
  });
});
