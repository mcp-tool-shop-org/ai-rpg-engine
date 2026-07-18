// Authoring-time gate for BuildCatalog self-consistency (F-2ae7c051).
//
// Every pack registered in allPacks ships a BuildCatalog that character
// creation trusts. An unsatisfiable catalog no longer crashes at confirm time
// (the F-2c013eff retry gate swallows the throw) — it traps the player in an
// un-winnable retry loop instead. buildCharacter() now rejects such a catalog
// at runtime; THIS test rejects it at authoring time: adding a new starter to
// the registry with an unsatisfiable catalog fails CI here, with the
// validator's specific diagnosis, before any player ever sees it.

import { describe, it, expect } from 'vitest';
import { validateBuildCatalog, formatErrors } from '@ai-rpg-engine/content-schema';
import { allPacks } from './packs.js';

describe('pack registry — every shipping BuildCatalog is self-consistent (F-2ae7c051)', () => {
  it('registers the expected pack lineup', () => {
    expect(allPacks.length).toBeGreaterThanOrEqual(10);
  });

  for (const pack of allPacks) {
    it(`${pack.meta.id}: buildCatalog satisfies its own flaw requirement`, () => {
      const result = validateBuildCatalog(pack.buildCatalog, `${pack.meta.id}.buildCatalog`);
      expect(result.errors, formatErrors(result)).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.advisories).toEqual([]);
    });
  }
});
