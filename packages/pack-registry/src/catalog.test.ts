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
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validatePackRubric } from './rubric.js';
import type { PackEntry } from './types.js';
import { satisfiesRange, isBareVersion } from '@ai-rpg-engine/content-schema';

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
import * as bountyHunter from '@ai-rpg-engine/starter-bounty-hunter';

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
  {
    meta: bountyHunter.packMeta,
    manifest: bountyHunter.manifest,
    ruleset: bountyHunter.bountyHunterMinimalRuleset,
    districts: bountyHunter.districts,
    createGame: bountyHunter.createGame,
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
    'hue-and-cry': 'starter-bounty-hunter',
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
    expect(onDisk.length).toBeGreaterThanOrEqual(12);
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
  it('catalog sanity: 12 packs with unique ids, each declaring district topology', () => {
    expect(realCatalog).toHaveLength(12);
    const ids = realCatalog.map((p) => p.meta.id);
    expect(new Set(ids).size).toBe(12);
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
  it('hue-and-cry scores against the real catalog — the number, reported', () => {
    // The twelfth pack, scored rather than asserted. v3.5.0's release record
    // claimed merchant scored 7/7 and had measured it BY HAND; this file exists
    // because that claim was unattested. The same discipline applies to the
    // newcomer on its first commit: the score is COMPUTED here, against the
    // live 12-pack catalog, and every failing dimension is named in the message
    // so a drop says which one rather than only that one happened.
    const entry = realCatalog.find((p) => p.meta.id === 'hue-and-cry');
    expect(entry, 'hue-and-cry is missing from the catalog-of-record').toBeDefined();
    const result = validatePackRubric(entry!, realCatalog);
    const failing = result.checks
      .filter((c) => !c.passed)
      .map((c) => `${c.dimension}: ${c.detail}`)
      .join(' | ');
    // 7/7 — the catalog's SECOND perfect score, and pinned as an assertion
    // rather than as the >= 5 floor for the reason the merchant row above
    // gives: a number measured by hand and attested nowhere is a number that
    // silently stops being true.
    //
    // It took the gate to get here. The first tone set was ['gritty','tense'],
    // identical as a SET to ashfall-dead's, and the rubric named the collision
    // and cost a point for it. The fix was `noir`, which is the truer answer
    // anyway — a man running informants for the office and fencing for the
    // ward is proto-noir a century before the word.
    expect(
      result.score,
      `hue-and-cry scored ${result.score}/7 — failing: ${failing}`,
    ).toBe(7);
  });

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

  it('F-abed87fc: every catalog pack stamps a real engineVersion range that satisfies the workspace engine and locksteps packMeta', () => {
    const rootPkg = JSON.parse(
      readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json'), 'utf8'),
    ) as { version: string };
    const workspaceEngine = rootPkg.version;
    expect(workspaceEngine).toMatch(/^\d+\.\d+\.\d+/);

    for (const pack of realCatalog) {
      const claimed = pack.manifest.engineVersion;
      expect(typeof claimed, `${pack.meta.id} manifest.engineVersion must be a string`).toBe('string');
      expect(
        isBareVersion(claimed),
        `${pack.meta.id} manifest.engineVersion "${claimed}" is a bare version; stamp a range like ">=${workspaceEngine} <4.0.0"`,
      ).toBe(false);
      expect(
        satisfiesRange(workspaceEngine, claimed),
        `${pack.meta.id} manifest.engineVersion "${claimed}" does not satisfy workspace engine ${workspaceEngine} — set manifest.engineVersion to a range such as ">=${workspaceEngine} <4.0.0"`,
      ).toBe(true);
      const metaVer = pack.meta.engineVersion;
      const lockstep =
        metaVer === claimed ||
        (typeof metaVer === 'string' && isBareVersion(metaVer) && satisfiesRange(metaVer, claimed));
      expect(
        lockstep,
        `${pack.meta.id} packMeta.engineVersion "${metaVer}" must equal or fall inside manifest.engineVersion "${claimed}"`,
      ).toBe(true);
    }
  });
});
