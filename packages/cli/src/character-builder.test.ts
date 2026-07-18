// character-builder.test.ts
//
// F-2c013eff (HIGH): buildCharacter() computed `validation` but never checked
// validation.ok/validation.errors before showing the "ready" summary and
// returning the build unconditionally on confirm. The single-pass trait
// selection step makes it easy to reach an actually-invalid build (missing
// required flaw, or two mutually incompatibleWith traits picked in the same
// batch, since getAvailableTraits only excludes traits blocked by ALREADY
// selected traits — and selectedTraitIds is still [] on the first offer).
// resolveEntity() re-validates and throws `Invalid build: ...` on an invalid
// build; that throw was uncaught by runGame()/main(), crashing the whole CLI
// right after a summary screen that implied everything was fine.
//
// Fix: after computing `validation`, if !validation.ok, print the errors and
// loop back (re-prompt) instead of showing the summary/confirm/returning. This
// makes it structurally impossible for buildCharacter() to hand back a build
// that fails validateBuild(build, catalog, ruleset).ok — the exact invariant
// that was untested (F-0850a894: character-builder.ts had zero coverage).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RulesetDefinition } from '@ai-rpg-engine/core';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import { validateBuild } from '@ai-rpg-engine/character-creation';

vi.mock('./prompts.js', () => ({
  promptText: vi.fn(),
  promptMenu: vi.fn(),
  promptMultiSelect: vi.fn(),
  promptOptionalMenu: vi.fn(),
  promptConfirm: vi.fn(),
}));

import { buildCharacter } from './character-builder.js';
import * as prompts from './prompts.js';

const mockPromptText = vi.mocked(prompts.promptText);
const mockPromptMenu = vi.mocked(prompts.promptMenu);
const mockPromptMultiSelect = vi.mocked(prompts.promptMultiSelect);
const mockPromptOptionalMenu = vi.mocked(prompts.promptOptionalMenu);
const mockPromptConfirm = vi.mocked(prompts.promptConfirm);

const ruleset: RulesetDefinition = {
  id: 'test-ruleset',
  name: 'Test Ruleset',
  version: '1.0.0',
  stats: [
    { id: 'str', name: 'Strength', min: 1, max: 10, default: 3 },
    { id: 'dex', name: 'Dexterity', min: 1, max: 10, default: 3 },
  ],
  resources: [{ id: 'hp', name: 'HP', min: 0, max: 50, default: 20 }],
  verbs: [{ id: 'attack', name: 'Attack', tags: ['combat'], description: 'Attack a target' }],
  formulas: [],
  defaultModules: [],
  progressionModels: [],
};

/**
 * Trait shape mirrors the finding exactly: `brave` (perk) and `reckless`
 * (flaw) declare each other incompatible, and both are offered in the SAME
 * batch since selectedTraitIds is [] on the first (only) offer. `lucky` is a
 * flaw with no incompatibilities — the "safe" pick used to reach a valid
 * build. Item order in the interactive prompt is perks-then-flaws, so with
 * these three traits the prompt list is [brave, reckless, lucky] -> indices
 * 0, 1, 2 respectively (asserted by the "offers traits" test below).
 */
function makeCatalog(overrides: Partial<BuildCatalog> = {}): BuildCatalog {
  return {
    packId: 'test-pack',
    statBudget: 0,
    maxTraits: 3,
    requiredFlaws: 1,
    archetypes: [
      {
        id: 'fighter',
        name: 'Fighter',
        description: 'Melee combatant',
        statPriorities: { str: 5, dex: 2 },
        startingTags: [],
        progressionTreeId: 'fighter-tree',
      },
    ],
    backgrounds: [
      {
        id: 'wanderer',
        name: 'Wanderer',
        description: 'Roams the land',
        statModifiers: {},
        startingTags: [],
      },
    ],
    traits: [
      {
        id: 'brave',
        name: 'Brave',
        description: 'Fearless in battle',
        category: 'perk',
        effects: [],
        incompatibleWith: ['reckless'],
      },
      {
        id: 'reckless',
        name: 'Reckless',
        description: 'Acts before thinking',
        category: 'flaw',
        effects: [],
        incompatibleWith: ['brave'],
      },
      {
        id: 'lucky',
        name: 'Lucky',
        description: 'Fortune favors them',
        category: 'flaw',
        effects: [],
      },
    ],
    disciplines: [],
    crossTitles: [],
    entanglements: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // Only one archetype/background in the fixture catalog, so index 0 is
  // always the only valid choice; stable across every retry/attempt.
  mockPromptText.mockResolvedValue('Hero');
  mockPromptMenu.mockResolvedValue(0);
  mockPromptOptionalMenu.mockResolvedValue(-1);
});

/** Collect every string logged to console.log across the whole run. */
function loggedLines(): string[] {
  return (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) =>
    String(c[0] ?? ''),
  );
}

describe('buildCharacter — trait offer shape (pins the exploit precondition)', () => {
  it('offers brave (perk) and reckless (flaw) in the same batch at indices 0 and 1, lucky at 2', async () => {
    const catalog = makeCatalog();
    mockPromptMultiSelect.mockResolvedValueOnce([2]); // pick lucky only -> valid first try
    mockPromptConfirm.mockResolvedValueOnce(true);

    await buildCharacter(catalog, ruleset);

    const [items] = mockPromptMultiSelect.mock.calls[0];
    expect(items.map((i) => i.label)).toEqual(['Brave', 'Reckless (flaw)', 'Lucky (flaw)']);
  });
});

describe('buildCharacter — F-2c013eff: never returns an invalid build, never throws', () => {
  it('missing required flaw: re-prompts instead of returning, and does not show the confirm screen for the bad attempt', async () => {
    const catalog = makeCatalog();

    // Attempt 1: pick only the perk (index 0 = brave) -> 0 flaws, requiredFlaws=1 -> invalid.
    // Attempt 2: pick the safe flaw (index 2 = lucky) -> valid.
    mockPromptMultiSelect.mockResolvedValueOnce([0]).mockResolvedValueOnce([2]);
    mockPromptConfirm.mockResolvedValue(true);

    const result = await buildCharacter(catalog, ruleset);

    // Never crashes, never returns garbage: the returned build is valid.
    expect(validateBuild(result, catalog, ruleset).ok).toBe(true);
    expect(result.traitIds).toEqual(['lucky']);

    // It actually retried (proves the gate looped rather than silently
    // upgrading/dropping the bad pick).
    expect(mockPromptMultiSelect).toHaveBeenCalledTimes(2);
    expect(mockPromptText).toHaveBeenCalledTimes(2);

    // The "ready to play" confirm screen must never have been shown for the
    // invalid attempt — only once, for the valid retry.
    expect(mockPromptConfirm).toHaveBeenCalledTimes(1);

    // The errors were surfaced to the player, not swallowed.
    const lines = loggedLines();
    expect(lines.some((l) => l.includes('Not enough flaws'))).toBe(true);
  });

  it('incompatible pair picked in the same batch: re-prompts instead of returning, and does not show the confirm screen for the bad attempt', async () => {
    const catalog = makeCatalog();

    // Attempt 1: pick brave (0) AND reckless (1) together -> mutually
    // incompatible, both offered in the same batch (selectedTraitIds is [] at
    // filter time). Attempt 2: pick the safe flaw only.
    mockPromptMultiSelect.mockResolvedValueOnce([0, 1]).mockResolvedValueOnce([2]);
    mockPromptConfirm.mockResolvedValue(true);

    const result = await buildCharacter(catalog, ruleset);

    expect(validateBuild(result, catalog, ruleset).ok).toBe(true);
    expect(result.traitIds).toEqual(['lucky']);
    expect(mockPromptMultiSelect).toHaveBeenCalledTimes(2);
    expect(mockPromptConfirm).toHaveBeenCalledTimes(1);

    const lines = loggedLines();
    expect(lines.some((l) => l.includes('Incompatible traits'))).toBe(true);
  });

  it('never throws across two consecutive invalid attempts before recovering', async () => {
    const catalog = makeCatalog();

    // Two bad attempts in a row (missing flaw, then incompatible pair), then a
    // good one. resolveEntity's `throw new Error('Invalid build: ...')` must
    // never be reachable from buildCharacter's own return value, no matter how
    // many bad attempts precede the good one.
    mockPromptMultiSelect
      .mockResolvedValueOnce([0]) // missing flaw
      .mockResolvedValueOnce([0, 1]) // incompatible pair
      .mockResolvedValueOnce([2]); // valid
    mockPromptConfirm.mockResolvedValue(true);

    const result = await buildCharacter(catalog, ruleset);

    expect(validateBuild(result, catalog, ruleset).ok).toBe(true);
    expect(mockPromptMultiSelect).toHaveBeenCalledTimes(3);
    // The confirm ("ready to play") screen must only ever appear once, for
    // the one attempt that was actually valid.
    expect(mockPromptConfirm).toHaveBeenCalledTimes(1);
  });
});

// F-2ae7c051: the retry gate above (F-2c013eff) `continue`s on ANY validation
// failure — a strict improvement for every satisfiable catalog, but for a
// HYPOTHETICALLY unsatisfiable one (requiredFlaws exceeding the pack's actual
// flaw traits, or every flaw mutually incompatible) every possible selection
// re-fails forever: the player is trapped in a silent, structurally
// un-winnable retry loop instead of getting a diagnosable failure. The
// catalog must be checked for self-consistency BEFORE the loop, failing loud
// with a structured [CATALOG_UNSATISFIABLE] error naming the defect.
describe('buildCharacter — F-2ae7c051: unsatisfiable catalog fails loud up front, never loops', () => {
  it('rejects a catalog demanding more flaws than it defines, before any prompting', async () => {
    const catalog = makeCatalog({
      requiredFlaws: 2,
      traits: [
        { id: 'brave', name: 'Brave', description: 'Fearless', category: 'perk', effects: [] },
        { id: 'lucky', name: 'Lucky', description: 'Fortunate', category: 'flaw', effects: [] },
      ],
    });

    await expect(buildCharacter(catalog, ruleset)).rejects.toThrow('[CATALOG_UNSATISFIABLE]');
    // Failed at the gate — the player was never dragged into the doomed flow.
    expect(mockPromptText).not.toHaveBeenCalled();
    expect(mockPromptMultiSelect).not.toHaveBeenCalled();
  });

  it('rejects a catalog whose two required flaws are mutually incompatible', async () => {
    const catalog = makeCatalog({
      requiredFlaws: 2,
      traits: [
        { id: 'grim', name: 'Grim', description: 'Never smiles', category: 'flaw', effects: [], incompatibleWith: ['dour'] },
        { id: 'dour', name: 'Dour', description: 'Never laughs', category: 'flaw', effects: [], incompatibleWith: ['grim'] },
      ],
    });

    await expect(buildCharacter(catalog, ruleset)).rejects.toThrow('[CATALOG_UNSATISFIABLE]');
    expect(mockPromptText).not.toHaveBeenCalled();
  });

  it('control — the standard satisfiable fixture still passes the gate and completes', async () => {
    const catalog = makeCatalog();
    mockPromptMultiSelect.mockResolvedValueOnce([2]);
    mockPromptConfirm.mockResolvedValueOnce(true);

    const result = await buildCharacter(catalog, ruleset);
    expect(validateBuild(result, catalog, ruleset).ok).toBe(true);
  });
});

describe('buildCharacter — baseline coverage (F-0850a894: previously zero test coverage)', () => {
  it('returns a valid build immediately on a clean single-pass run', async () => {
    const catalog = makeCatalog();
    mockPromptMultiSelect.mockResolvedValueOnce([2]); // lucky: satisfies requiredFlaws=1
    mockPromptConfirm.mockResolvedValueOnce(true);

    const result = await buildCharacter(catalog, ruleset);

    expect(result.name).toBe('Hero');
    expect(result.archetypeId).toBe('fighter');
    expect(result.backgroundId).toBe('wanderer');
    expect(result.traitIds).toEqual(['lucky']);
    expect(result.disciplineId).toBeUndefined();
    expect(validateBuild(result, catalog, ruleset).ok).toBe(true);

    expect(mockPromptText).toHaveBeenCalledTimes(1);
    expect(mockPromptConfirm).toHaveBeenCalledTimes(1);
    // No disciplines in this catalog -> optional menu must never be shown.
    expect(mockPromptOptionalMenu).not.toHaveBeenCalled();
  });

  it('declining the confirm screen on a VALID build restarts character creation (pre-existing behavior, now covered)', async () => {
    const catalog = makeCatalog();
    mockPromptMultiSelect.mockResolvedValueOnce([2]).mockResolvedValueOnce([2]);
    mockPromptConfirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await buildCharacter(catalog, ruleset);

    expect(validateBuild(result, catalog, ruleset).ok).toBe(true);
    expect(mockPromptConfirm).toHaveBeenCalledTimes(2);
    expect(mockPromptText).toHaveBeenCalledTimes(2);
    const lines = loggedLines();
    expect(lines.some((l) => l.includes('Starting over'))).toBe(true);
  });

  it('exercises discipline selection and stat-point allocation', async () => {
    const catalog = makeCatalog({
      statBudget: 2,
      disciplines: [
        {
          id: 'duelist',
          name: 'Duelist',
          description: 'Master of blades',
          grantedVerb: 'attack',
          passive: { type: 'stat-modifier', stat: 'dex', amount: 1 },
          drawback: { type: 'resource-modifier', resource: 'hp', amount: -2 },
        },
      ],
    });
    mockPromptMultiSelect.mockResolvedValueOnce([2]); // lucky
    mockPromptOptionalMenu.mockResolvedValueOnce(0); // pick the duelist discipline
    mockPromptMenu
      .mockResolvedValueOnce(0) // archetype
      .mockResolvedValueOnce(0) // background
      .mockResolvedValueOnce(0) // stat point 1 -> str
      .mockResolvedValueOnce(1); // stat point 2 -> dex
    mockPromptConfirm.mockResolvedValueOnce(true);

    const result = await buildCharacter(catalog, ruleset);

    expect(result.disciplineId).toBe('duelist');
    expect(result.statAllocations).toEqual({ str: 1, dex: 1 });
    expect(validateBuild(result, catalog, ruleset).ok).toBe(true);
  });
});
