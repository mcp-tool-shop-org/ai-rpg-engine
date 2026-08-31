// suggestBuild — seeded legal CharacterBuild generator (F-6c97c2dc).
//
// Pin: for a fixed seed, two calls are deep-equal and
// validateBuild(result, catalog, ruleset).ok is true on every starter catalog.

import { describe, it, expect, vi } from 'vitest';
import { SeededRNG } from '@ai-rpg-engine/core';
import { suggestBuild } from './options.js';
import { validateBuild } from './validate.js';
import { testCatalog, testRuleset } from './test-fixtures.js';
import { buildCatalog as fantasyCatalog, fantasyMinimalRuleset } from '@ai-rpg-engine/starter-fantasy';
import { buildCatalog as cyberpunkCatalog, cyberpunkMinimalRuleset } from '@ai-rpg-engine/starter-cyberpunk';
import { buildCatalog as gladiatorCatalog, gladiatorMinimalRuleset } from '@ai-rpg-engine/starter-gladiator';
import { buildCatalog as detectiveCatalog, detectiveMinimalRuleset } from '@ai-rpg-engine/starter-detective';
import { buildCatalog as pirateCatalog, pirateMinimalRuleset } from '@ai-rpg-engine/starter-pirate';
import { buildCatalog as zombieCatalog, zombieMinimalRuleset } from '@ai-rpg-engine/starter-zombie';
import { buildCatalog as vampireCatalog, vampireMinimalRuleset } from '@ai-rpg-engine/starter-vampire';
import { buildCatalog as roninCatalog, roninMinimalRuleset } from '@ai-rpg-engine/starter-ronin';
import { buildCatalog as merchantCatalog, merchantMinimalRuleset } from '@ai-rpg-engine/starter-merchant';
import { buildCatalog as bountyCatalog, bountyHunterMinimalRuleset } from '@ai-rpg-engine/starter-bounty-hunter';
import { buildCatalog as colonyCatalog, colonyMinimalRuleset } from '@ai-rpg-engine/starter-colony';
import { buildCatalog as westCatalog, weirdWestMinimalRuleset } from '@ai-rpg-engine/starter-weird-west';
import type { BuildCatalog } from './types.js';
import type { RulesetDefinition } from '@ai-rpg-engine/core';

const STARTERS: Array<{ name: string; catalog: BuildCatalog; ruleset: RulesetDefinition }> = [
  { name: 'test-pack', catalog: testCatalog, ruleset: testRuleset },
  { name: 'chapel-threshold', catalog: fantasyCatalog, ruleset: fantasyMinimalRuleset },
  { name: 'neon-lockbox', catalog: cyberpunkCatalog, ruleset: cyberpunkMinimalRuleset },
  { name: 'iron-colosseum', catalog: gladiatorCatalog, ruleset: gladiatorMinimalRuleset },
  { name: 'gaslight-detective', catalog: detectiveCatalog, ruleset: detectiveMinimalRuleset },
  { name: 'black-flag', catalog: pirateCatalog, ruleset: pirateMinimalRuleset },
  { name: 'ashfall', catalog: zombieCatalog, ruleset: zombieMinimalRuleset },
  { name: 'crimson-court', catalog: vampireCatalog, ruleset: vampireMinimalRuleset },
  { name: 'jade-veil', catalog: roninCatalog, ruleset: roninMinimalRuleset },
  { name: 'salt-road', catalog: merchantCatalog, ruleset: merchantMinimalRuleset },
  { name: 'bounty-hunter', catalog: bountyCatalog, ruleset: bountyHunterMinimalRuleset },
  { name: 'colony', catalog: colonyCatalog, ruleset: colonyMinimalRuleset },
  { name: 'weird-west', catalog: westCatalog, ruleset: weirdWestMinimalRuleset },
];

describe('suggestBuild (F-6c97c2dc)', () => {
  it('two calls with the same seed are deep-equal', () => {
    const a = suggestBuild(testCatalog, new SeededRNG(42));
    const b = suggestBuild(testCatalog, new SeededRNG(42));
    expect(a).toEqual(b);
  });

  it('different seeds can diverge', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      seen.add(JSON.stringify(suggestBuild(testCatalog, new SeededRNG(seed))));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('validateBuild.ok is true on the in-package catalog', () => {
    const build = suggestBuild(testCatalog, new SeededRNG(7));
    const result = validateBuild(build, testCatalog, testRuleset);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('consumes only the caller-supplied rng (no Math.random)', () => {
    const spy = vi.spyOn(Math, 'random');
    suggestBuild(testCatalog, new SeededRNG(11));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('honors opts.name / archetypeId / backgroundId', () => {
    const build = suggestBuild(testCatalog, new SeededRNG(1), {
      name: 'Morrigan',
      archetypeId: 'mage',
      backgroundId: 'noble',
    });
    expect(build.name).toBe('Morrigan');
    expect(build.archetypeId).toBe('mage');
    expect(build.backgroundId).toBe('noble');
    expect(validateBuild(build, testCatalog, testRuleset).ok).toBe(true);
  });

  it('picks the required flaw and stays within maxTraits', () => {
    const build = suggestBuild(testCatalog, new SeededRNG(3));
    expect(build.traitIds.length).toBeLessThanOrEqual(testCatalog.maxTraits);
    const flaws = build.traitIds.filter((id) => testCatalog.traits.find((t) => t.id === id)?.category === 'flaw');
    expect(flaws.length).toBeGreaterThanOrEqual(testCatalog.requiredFlaws);
  });

  it('respects both incompatibility directions (does not wait on F-3919d5ec)', () => {
    // frail.incompatibleWith includes tough; the reverse listing is absent.
    for (let seed = 1; seed <= 40; seed++) {
      const build = suggestBuild(testCatalog, new SeededRNG(seed));
      const set = new Set(build.traitIds);
      expect(set.has('tough') && set.has('frail')).toBe(false);
    }
  });

  it('spends the stat budget on the archetype\'s stats', () => {
    const build = suggestBuild(testCatalog, new SeededRNG(5));
    const spent = Object.values(build.statAllocations ?? {}).reduce((a, b) => a + b, 0);
    expect(spent).toBe(testCatalog.statBudget);
  });
});

describe('suggestBuild — every starter catalog (F-6c97c2dc)', () => {
  it.each(STARTERS)('$name validateBuild.ok for a fixed seed, and two calls match', ({ catalog, ruleset }) => {
    const a = suggestBuild(catalog, new SeededRNG(99));
    const b = suggestBuild(catalog, new SeededRNG(99));
    expect(a).toEqual(b);
    const result = validateBuild(a, catalog, ruleset);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });
});
