// PG-1 — the pack rubric executed against the REAL 11-pack catalog.
//
// PACK_RUBRIC.md says every pack "must pass this rubric before inclusion",
// but until this file existed validatePackRubric() only ever ran on synthetic
// fixtures (rubric.test.ts) — the "gate" was prose. This suite builds a real
// PackEntry[] from the shipping starters and runs every pack through the
// rubric, so an undifferentiated future pack (duplicate genre/tones/verbs,
// factionless topology) goes red in CI instead of shipping.
//
// Resolution note: the starter packages are resolved through the npm-workspace
// symlinks in the root node_modules (same mechanism packages/cli uses for its
// pack selector). They are test-only imports — pack-registry's published
// artifact (`files: ["dist"]`, tests excluded from the build tsconfig) gains
// no runtime dependency on any starter.

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validatePackRubric } from './rubric.js';
import type { PackEntry } from './types.js';

import * as fantasy from '@ai-rpg-engine/starter-fantasy';
import * as cyberpunk from '@ai-rpg-engine/starter-cyberpunk';
import * as detective from '@ai-rpg-engine/starter-detective';
import * as pirate from '@ai-rpg-engine/starter-pirate';
import * as zombie from '@ai-rpg-engine/starter-zombie';
import * as weirdWest from '@ai-rpg-engine/starter-weird-west';
import * as colony from '@ai-rpg-engine/starter-colony';
import * as vampire from '@ai-rpg-engine/starter-vampire';
import * as gladiator from '@ai-rpg-engine/starter-gladiator';
import * as ronin from '@ai-rpg-engine/starter-ronin';
import * as merchant from '@ai-rpg-engine/starter-merchant';

const realCatalog: PackEntry[] = [
  {
    meta: fantasy.packMeta,
    manifest: fantasy.manifest,
    ruleset: fantasy.fantasyMinimalRuleset,
    districts: fantasy.districts,
    createGame: fantasy.createGame,
  },
  {
    meta: cyberpunk.packMeta,
    manifest: cyberpunk.manifest,
    ruleset: cyberpunk.cyberpunkMinimalRuleset,
    districts: cyberpunk.districts,
    createGame: cyberpunk.createGame,
  },
  {
    meta: detective.packMeta,
    manifest: detective.manifest,
    ruleset: detective.detectiveMinimalRuleset,
    districts: detective.districts,
    createGame: detective.createGame,
  },
  {
    meta: pirate.packMeta,
    manifest: pirate.manifest,
    ruleset: pirate.pirateMinimalRuleset,
    districts: pirate.districts,
    createGame: pirate.createGame,
  },
  {
    meta: zombie.packMeta,
    manifest: zombie.manifest,
    ruleset: zombie.zombieMinimalRuleset,
    districts: zombie.districts,
    createGame: zombie.createGame,
  },
  {
    meta: weirdWest.packMeta,
    manifest: weirdWest.manifest,
    ruleset: weirdWest.weirdWestMinimalRuleset,
    districts: weirdWest.districts,
    createGame: weirdWest.createGame,
  },
  {
    meta: colony.packMeta,
    manifest: colony.manifest,
    ruleset: colony.colonyMinimalRuleset,
    districts: colony.districts,
    createGame: colony.createGame,
  },
  {
    meta: vampire.packMeta,
    manifest: vampire.manifest,
    ruleset: vampire.vampireMinimalRuleset,
    districts: vampire.districts,
    createGame: vampire.createGame,
  },
  {
    meta: gladiator.packMeta,
    manifest: gladiator.manifest,
    ruleset: gladiator.gladiatorMinimalRuleset,
    districts: gladiator.districts,
    createGame: gladiator.createGame,
  },
  {
    meta: ronin.packMeta,
    manifest: ronin.manifest,
    ruleset: ronin.roninMinimalRuleset,
    districts: ronin.districts,
    createGame: ronin.createGame,
  },
  {
    meta: merchant.packMeta,
    manifest: merchant.manifest,
    ruleset: merchant.merchantMinimalRuleset,
    districts: merchant.districts,
    createGame: merchant.createGame,
  },
];

/** Every `starter-*` workspace package that exists on disk, read from the
 *  filesystem rather than from a list in this file. This is the whole point of
 *  the membership guard below: a hand-maintained expected-ids literal drifts
 *  exactly the way `realCatalog` itself drifted. */
function starterPackagesOnDisk(): string[] {
  const packagesDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('starter-'))
    .map((e) => e.name)
    .sort();
}

// --- Membership guard (F-merchant-H) ------------------------------------
//
// starter-merchant shipped in v3.5.0 and never entered this file. The suite
// stayed green — it asserted a 10-pack catalog and got one — so "merchant
// scores 7/7 against the live catalog" was measured BY HAND during that cycle
// and attested nowhere, while every OTHER pack's cross-catalog distinctness
// dimensions (verbs / genres / tones) were computed against a catalog missing a
// live neighbour.
//
// Bumping the literal to 11 fixes the instance, not the class. This guard
// closes the class: the catalog-of-record is checked against the packages that
// actually exist on disk, so a twelfth starter cannot ship without either
// entering the rubric or being explicitly excluded here.
describe('catalog-of-record membership (F-merchant-H)', () => {
  // meta.id is the WORLD id ('salt-road-ledger'), not the package directory
  // ('starter-merchant'), so the two surfaces are bridged explicitly. A twelfth
  // starter must be added here as well as to realCatalog above; omitting either
  // fails one of the two assertions below.
  const PACKAGE_BY_PACK_ID: Record<string, string> = {
    'chapel-threshold': 'starter-fantasy',
    'neon-lockbox': 'starter-cyberpunk',
    'gaslight-detective': 'starter-detective',
    'black-flag-requiem': 'starter-pirate',
    'ashfall-dead': 'starter-zombie',
    'dust-devils-bargain': 'starter-weird-west',
    'signal-loss': 'starter-colony',
    'crimson-court': 'starter-vampire',
    'iron-colosseum': 'starter-gladiator',
    'jade-veil': 'starter-ronin',
    'salt-road-ledger': 'starter-merchant',
  };

  it('every catalog entry maps to a real package directory', () => {
    const onDisk = new Set(starterPackagesOnDisk());
    for (const pack of realCatalog) {
      const pkg = PACKAGE_BY_PACK_ID[pack.meta.id];
      expect(pkg, `pack '${pack.meta.id}' has no package mapping`).toBeTruthy();
      expect(onDisk.has(pkg), `mapped package '${pkg}' does not exist on disk`).toBe(true);
    }
  });

  it('every starter-* package on disk is scored by the rubric', () => {
    const onDisk = starterPackagesOnDisk();
    const inCatalog = new Set(realCatalog.map((p) => PACKAGE_BY_PACK_ID[p.meta.id]));
    expect(onDisk.length).toBeGreaterThanOrEqual(11);
    expect(
      onDisk.filter((d) => !inCatalog.has(d)),
      'these starter packages ship but are NOT scored by the pack rubric',
    ).toEqual([]);
  });

  it('meta: dropping a pack from the catalog FAILS the membership guard', () => {
    // Reproduces the actual defect: a pack on disk, absent from realCatalog.
    const onDisk = starterPackagesOnDisk();
    const mutated = new Set(realCatalog.slice(0, -1).map((p) => PACKAGE_BY_PACK_ID[p.meta.id]));
    const missing = onDisk.filter((d) => !mutated.has(d));
    expect(missing, 'the guard must notice the dropped pack').not.toEqual([]);
  });
});

describe('pack rubric × real catalog (PG-1)', () => {
  it('catalog sanity: 11 packs with unique ids, each declaring district topology', () => {
    expect(realCatalog).toHaveLength(11);
    const ids = realCatalog.map((p) => p.meta.id);
    expect(new Set(ids).size).toBe(11);
    for (const pack of realCatalog) {
      expect(pack.meta.id, 'meta.id must match manifest.id').toBe(pack.manifest.id);
      expect(
        Array.isArray(pack.districts) && pack.districts.length >= 1,
        `${pack.meta.id} must export a non-empty districts array`,
      ).toBe(true);
    }
  });

  // PACK_RUBRIC.md: "must pass this rubric before inclusion" — executed here
  // for every shipping pack, against the full catalog (the cross-catalog
  // dimensions — verbs / failure-mode / genres / tones — are only meaningful
  // with the real neighbours present).
  for (const pack of realCatalog) {
    it(`${pack.meta.id} passes the rubric against the real catalog (score >= 5/7)`, () => {
      const result = validatePackRubric(pack, realCatalog);
      const failing = result.checks
        .filter((c) => !c.passed)
        .map((c) => `  ${c.dimension}: ${c.detail}`)
        .join('\n');
      expect(
        result.score,
        `${pack.meta.id} scored ${result.score}/7 — failing dimensions:\n${failing}`,
      ).toBeGreaterThanOrEqual(5);
      expect(result.ok).toBe(true);
    });
  }

  // v3.5.0's release record claimed "starter-merchant scores 7/7 against the
  // live catalog". That was true, and it was measured by hand during the cycle
  // — enforced nowhere, against a catalog that did not contain merchant. It is
  // an assertion now. It is also the catalog's only 7/7: every other pack
  // fails `distinct-verbs` (they share the world-stack surface), which merchant
  // clears on its five pack-native commerce verbs.
  it('salt-road-ledger scores a full 7/7 against the real catalog', () => {
    const merchantEntry = realCatalog.find((p) => p.meta.id === 'salt-road-ledger');
    expect(merchantEntry, 'merchant missing from the catalog-of-record').toBeDefined();
    const result = validatePackRubric(merchantEntry!, realCatalog);
    const failing = result.checks
      .filter((c) => !c.passed)
      .map((c) => `  ${c.dimension}: ${c.detail}`)
      .join('\n');
    expect(result.score, `merchant dropped a dimension:\n${failing}`).toBe(7);
  });

  it('every real pack passes distinct-faction-topology (Stage A district data)', () => {
    for (const pack of realCatalog) {
      const check = validatePackRubric(pack, realCatalog).checks.find(
        (c) => c.dimension === 'distinct-faction-topology',
      );
      expect(check?.passed, `${pack.meta.id}: ${check?.detail}`).toBe(true);
    }
  });

  // --- Mutation meta-tests: prove the gate FIRES on real data. Without these
  // --- the suite above could go vacuous (e.g. a refactor that silently feeds
  // --- the rubric empty districts would still "pass" every pack).

  it('meta: stripping a real pack\'s districts makes distinct-faction-topology FAIL', () => {
    const original = realCatalog[0];
    const mutated: PackEntry = { ...original, districts: undefined };
    const result = validatePackRubric(mutated, realCatalog);
    const check = result.checks.find((c) => c.dimension === 'distinct-faction-topology');
    expect(check?.passed).toBe(false);
    // And the mutation must actually cost the pack its point.
    const originalScore = validatePackRubric(original, realCatalog).score;
    expect(result.score).toBe(originalScore - 1);
  });

  it('meta: duplicating another real pack\'s genre set makes distinct-narrative-fantasy FAIL', () => {
    const source = realCatalog[0]; // fantasy
    const target = realCatalog[1]; // cyberpunk
    const mutated: PackEntry = {
      ...target,
      meta: { ...target.meta, genres: [...source.meta.genres] },
    };
    const result = validatePackRubric(mutated, realCatalog);
    const check = result.checks.find((c) => c.dimension === 'distinct-narrative-fantasy');
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain('duplicates another pack');
  });
});
