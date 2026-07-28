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
  // Exact, not `>= 10`. A floor guard cannot notice a pack falling OUT of the
  // registry — it only notices packs failing to arrive, which is the direction
  // that never actually broke. (F-merchant-H: the sibling catalog-of-record in
  // pack-registry drifted for a whole release behind an equality assertion that
  // was simply never updated; a floor here would have hidden the reverse.)
  it('registers the expected pack lineup', () => {
    expect(allPacks.map((p) => p.meta.id).sort()).toEqual([
      'ashfall-dead',
      'black-flag-requiem',
      'chapel-threshold',
      'crimson-court',
      'dust-devils-bargain',
      'gaslight-detective',
      'iron-colosseum',
      'jade-veil',
      'neon-lockbox',
      'salt-road-ledger',
      'signal-loss',
    ]);
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

// --- resourceOverrides name real resources (F-merchant-C) -----------------
//
// Character creation writes EVERY resourceOverrides key straight into
// entity.resources (validate.ts's "Apply archetype overrides" loop) without
// checking it against the ruleset, and the clamp pass immediately after
// iterates only DECLARED resources. So an override naming something that is
// not a resource mints a phantom entry that nothing bounds and nothing reads.
//
// validateBuildCatalog cannot catch this — it is handed a BuildCatalog and no
// ruleset, so it has no idea which ids are real. Here both are in hand.
//
// Found salt-road-ledger's `runner` overriding `standing`, which is a STAT and
// was already on its statPriorities line at the same value. It survived a
// release because merchant was the one starter shipping no creation proof.
describe('creation resourceOverrides name declared resources (F-merchant-C)', () => {
  const offendersIn = (pack: (typeof allPacks)[number], catalog = pack.buildCatalog): string[] => {
    const declared = new Set(pack.ruleset.resources.map((r) => r.id));
    const stats = new Set(pack.ruleset.stats.map((s) => s.id));
    const bad: string[] = [];
    for (const archetype of catalog.archetypes) {
      for (const key of Object.keys(archetype.resourceOverrides ?? {})) {
        if (!declared.has(key)) {
          bad.push(`${archetype.id}.resourceOverrides.${key}${stats.has(key) ? ' — that is a STAT, not a resource' : ''}`);
        }
      }
    }
    return bad;
  };

  for (const pack of allPacks) {
    it(`${pack.meta.id}: no archetype overrides an undeclared resource`, () => {
      expect(offendersIn(pack), `${pack.meta.id} would mint phantom, unclamped resources`).toEqual([]);
    });
  }

  it('meta: an override naming a stat is CAUGHT', () => {
    // The exact defect, replayed against live content so the check cannot go
    // vacuous if the shape of a BuildCatalog changes underneath it.
    const pack = allPacks[0];
    const statId = pack.ruleset.stats[0].id;
    const mutated = {
      ...pack.buildCatalog,
      archetypes: pack.buildCatalog.archetypes.map((a, i) =>
        i === 0 ? { ...a, resourceOverrides: { ...(a.resourceOverrides ?? {}), [statId]: 2 } } : a,
      ),
    };
    const offenders = offendersIn(pack, mutated);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain('that is a STAT');
  });
});
