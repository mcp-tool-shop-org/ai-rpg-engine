// Colony content integrity tests
//
// ST-01: archetypes referenced a progression tree id with a "-path" suffix
// ("commander-path") that did not match the actual tree id ("commander"). The
// reference must resolve to a real tree, otherwise character creation hands the
// player a build pointing at a non-existent progression tree.

import { describe, it, expect } from 'vitest';
import { buildCatalog, commanderTree } from './content.js';

describe('colony content — progression tree references', () => {
  it('every archetype.progressionTreeId resolves to a defined tree', () => {
    const treeIds = new Set([commanderTree.id]);
    for (const archetype of buildCatalog.archetypes) {
      if (archetype.progressionTreeId === undefined) continue;
      expect(
        treeIds.has(archetype.progressionTreeId),
        `archetype "${archetype.id}" references missing tree "${archetype.progressionTreeId}" (known: ${[...treeIds].join(', ')})`,
      ).toBe(true);
    }
  });

  it('the commander tree id is "commander"', () => {
    expect(commanderTree.id).toBe('commander');
  });
});
